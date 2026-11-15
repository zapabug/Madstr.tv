import { useSyncExternalStore } from 'react';
import { ActionRunner } from 'applesauce-actions';
import { ExtensionSigner, NostrConnectSigner, PrivateKeySigner, type ISigner } from 'applesauce-signers';
import type { EventTemplate, NostrEvent } from 'applesauce-core/helpers';
import { RELAYS, eventStore, pool } from './applesauce.ts';
import { reconnect, withTimeout } from './reconnect.ts';
import { clearSession, loadSession, parseCredential, saveSession } from './session.ts';

// Logging in, and the one thing a login is for here: following people. Ways in: a NIP-07 browser extension,
// a NIP-46 `bunker://` link or `nbunksec` (Amber and other remote signers), or scanning a nostrconnect:// QR code.
// The app never holds a private key. Built on the pattern that works in the Madeira Livre app
// (madeira-app/src/lib/signer.ts + account.ts): the signer is built directly, the stored session is kept by
// this app, and Amber's "already connected" reply on a reconnect is treated as success.

export const APP_NAME = 'Mad⚡tr.tv';
// NIP-46 relays for the signer connection. Not relay.nsec.app: it needs NIP-42 auth, and the connect
// subscription there silently gets nothing.
export const NIP46_RELAYS = ['wss://nos.lol', 'wss://nostr.mom', 'wss://relay.primal.net'];
// Kinds the app asks a signer for up front, so Amber can remember them: 3 = the contact list (follow).
export const SIGN_KINDS = [3];
const PERMISSIONS = [...new Set(['get_public_key', ...NostrConnectSigner.buildSigningPermissions(SIGN_KINDS)])];

// The explicit method bindings are what actually works (setting `NostrConnectSigner.pool` alone does not).
NostrConnectSigner.subscriptionMethod = pool.subscription.bind(pool);
NostrConnectSigner.publishMethod = pool.publish.bind(pool);

export interface Signer {
  getPublicKey(): Promise<string>;
  signEvent(_template: EventTemplate): Promise<NostrEvent>;
  close(): Promise<void>;
}

const hexToBytes = (hex: string): Uint8Array => Uint8Array.from(hex.match(/../g) ?? [], pair => parseInt(pair, 16));

// --- NIP-07 ------------------------------------------------------------------------------

export function hasExtension(): boolean {
  return typeof window !== 'undefined' && 'nostr' in window;
}

/** Extensions can inject `window.nostr` a moment after the page loads: wait briefly before giving up. */
async function waitForExtension(ms = 1500): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (hasExtension()) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return hasExtension();
}

function wrapExtension(extension: ExtensionSigner): Signer {
  return { getPublicKey: () => extension.getPublicKey(), signEvent: t => extension.signEvent(t), close: async () => {} };
}

async function connectExtension(): Promise<Signer> {
  const signer = wrapExtension(new ExtensionSigner());
  await signer.getPublicKey();
  saveSession({ type: 'extension' });
  return signer;
}

// --- NIP-46 ------------------------------------------------------------------------------

function wrapRemote(remote: NostrConnectSigner): Signer {
  return {
    getPublicKey: () => remote.getPublicKey(),
    // A reply can get lost while this app is in the background (you are in Amber): do not wait forever.
    signEvent: t => withTimeout(remote.signEvent(t), 90_000, 'Signer').catch((e: unknown) => {
      throw new Error(`${e instanceof Error ? e.message : String(e)}. Open your signer, approve the request, then try again.`);
    }),
    close: async () => {
      try { await withTimeout(remote.logout(), 3000, 'logout'); } catch { await remote.close(); }
    },
  };
}

/** Paste path (and restore): a `bunker://` URI or an `nbunksec` session. */
async function connectBunker(credential: string): Promise<Signer> {
  const parsed = parseCredential(credential);
  if (!parsed) throw new Error('Paste a bunker:// link or an nbunksec.');
  let remote: NostrConnectSigner;
  if (parsed.kind === 'nbunksec') {
    const p = NostrConnectSigner.parseNbunksec(parsed.value);
    remote = new NostrConnectSigner({
      relays: p.relays.length ? p.relays : NIP46_RELAYS,
      remote: p.remote,
      signer: new PrivateKeySigner(hexToBytes(p.clientKey)),
      bunkerSecret: p.bunkerSecret,
    });
  } else {
    const p = NostrConnectSigner.parseBunkerURI(parsed.value);
    remote = new NostrConnectSigner({ relays: p.relays.length ? p.relays : NIP46_RELAYS, remote: p.remote, bunkerSecret: p.bunkerSecret });
  }
  await reconnect(remote, PERMISSIONS);
  await remote.getPublicKey();
  saveSession({ type: 'nip46', nbunksec: remote.getNbunksec() });
  return wrapRemote(remote);
}

// --- the account: who is signed in, and the one place that signs ---------------------------------

export type AccountStatus = 'restoring' | 'out' | 'in';
interface AccountState { status: AccountStatus; pubkey?: string; signer?: Signer }

let state: AccountState = { status: 'restoring' };
const listeners = new Set<() => void>();

function set(next: AccountState): void {
  state = next;
  listeners.forEach(fn => fn());
}

export function useAccountState(): AccountState {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state, () => state);
}

async function complete(signer: Signer): Promise<void> {
  const pubkey = await signer.getPublicKey();
  set({ status: 'in', pubkey, signer });
}

function currentSigner(): Signer {
  if (!state.signer) throw new Error('Log in first');
  return state.signer;
}

// Actions (follow, unfollow) are signed by whoever is logged in and published to the relays; they fail loudly
// if no relay accepts the event.
const signerProxy: ISigner = { getPublicKey: () => currentSigner().getPublicKey(), signEvent: t => currentSigner().signEvent(t) };
export const actions = new ActionRunner(eventStore, signerProxy, async (event, relays) => {
  const responses = await pool.publish(relays?.length ? relays : RELAYS, event);
  if (!responses.some(r => r.ok)) throw new Error('No relay accepted the update');
});

export async function loginWithExtension(): Promise<void> {
  await complete(await connectExtension());
}

export async function loginWithBunker(credential: string): Promise<void> {
  await complete(await connectBunker(credential));
}

export async function logout(): Promise<void> {
  const signer = state.signer;
  set({ status: 'out' });
  clearSession();
  try { await signer?.close(); } catch { /* the session is gone either way */ }
}

let restoring: Promise<void> | null = null;

/** Bring back a saved login in the background. Safe to call more than once. A failure keeps the saved session
 *  (only Log out clears it), so the next launch tries again. */
export function restoreAccounts(): Promise<void> {
  if (restoring) return restoring;
  restoring = (async () => {
    try {
      // Logins saved by the earlier version of this app (a different format) cannot be restored.
      try { localStorage.removeItem('madstr:accounts'); localStorage.removeItem('madstr:active'); } catch { /* fine */ }
      const session = loadSession();
      if (!session) { set({ status: 'out' }); return; }
      if (session.type === 'extension') {
        if (!(await waitForExtension())) { set({ status: 'out' }); return; }
        await complete(wrapExtension(new ExtensionSigner()));
      } else {
        await complete(await connectBunker(session.nbunksec));
      }
    } catch (error) {
      console.error('[accounts] Could not restore the saved login:', error);
      set({ status: 'out' });
    }
  })();
  return restoring;
}

// --- log in by scanning -----------------------------------------------------------------------
// The app shows a nostrconnect:// QR code, the signer app (Amber and others) scans it and answers over the relays.
// `uri` goes in the QR (and in a tap-to-open link); `connected` resolves once the signer has answered and the
// account is active; `cancel` stops waiting (an approval that arrives later is ignored).
const QR_TIMEOUT_MS = 120_000;

export interface QrLogin {
  uri: string;
  connected: Promise<void>;
  cancel: () => void;
}

export function startQrLogin(): QrLogin {
  const remote = new NostrConnectSigner({ relays: NIP46_RELAYS });
  const uri = remote.getNostrConnectURI({ name: APP_NAME, permissions: PERMISSIONS });
  const controller = new AbortController();
  let cancelled = false;
  const timer = window.setTimeout(() => controller.abort(), QR_TIMEOUT_MS);
  const connected = (async () => {
    try {
      await remote.waitForSigner(controller.signal);
      await remote.getPublicKey();
      saveSession({ type: 'nip46', nbunksec: remote.getNbunksec() });
      if (cancelled) { void remote.close(); return; }
      await complete(wrapRemote(remote));
    } catch (error) {
      void remote.close();
      if (cancelled) return; // you pressed Cancel: not an error
      throw controller.signal.aborted ? new Error('The signer did not answer in time') : error;
    } finally {
      window.clearTimeout(timer);
    }
  })();
  return { uri, connected, cancel: () => { cancelled = true; controller.abort(); } };
}
