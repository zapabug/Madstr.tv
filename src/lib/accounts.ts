import { useSyncExternalStore } from 'react';
import { ActionRunner } from 'applesauce-actions';
import { retry } from 'rxjs';
import { AmberClipboardSigner, ExtensionSigner, NostrConnectSigner, PrivateKeySigner, type ISigner } from 'applesauce-signers';
import type { EventTemplate, NostrEvent } from 'applesauce-core/helpers';
import { RELAYS, eventStore, pool } from './applesauce.ts';
import { isNativeApp } from './platform.ts';
import { publishToFirst } from './publishFirst.ts';
import { RETURN_KEY, loginLink, readAnswer, safeReturn } from './signerCallback.ts';
import { askForKeyUntilAnswered, reconnect, withTimeout } from './reconnect.ts';
import { SIGNER_RELAYS } from './relays.ts';
import { clearSession, loadSession, parseCredential, saveSession } from './session.ts';

// Logging in, and the one thing a login is for here: following people. Ways in: Open signer (a NIP-07
// extension, the phone's signer app over NIP-55, or Amber's web link; feat-phone-inline §P21),
// a NIP-46 `bunker://` link or `nbunksec` (Amber and other remote signers), or scanning a nostrconnect:// QR code.
// The app never holds a private key. Built on the pattern that works in the Madeira Livre app
// (madeira-app/src/lib/signer.ts + account.ts): the signer is built directly, the stored session is kept by
// this app, and Amber's "already connected" reply on a reconnect is treated as success.

export const APP_NAME = 'Juke⚡tr';
// The NIP-46 relays for the signer connection are SIGNER_RELAYS (relays.ts): never relay.nsec.app, which needs
// NIP-42 auth, so a connect request there silently gets nothing.
export const NIP46_RELAYS = [...SIGNER_RELAYS];
// Kinds the app asks a signer for up front, so Amber can remember them: 3 = the contact list (follow),
// 7 = a like (up vote) and 5 = taking a like back (feat-taste-cache §T2).
export const SIGN_KINDS = [3, 7, 5];
const PERMISSIONS = [...new Set(['get_public_key', ...NostrConnectSigner.buildSigningPermissions(SIGN_KINDS)])];

// The explicit method bindings are what actually works (setting `NostrConnectSigner.pool` alone does not), and
// both are written so ONE bad relay cannot hold the login up:
//  - publish resolves at the first relay that accepts (the library would otherwise wait for every relay to
//    answer or time out before it even listens for the signer's reply);
//  - subscribe retries a failed connection after a pause (the library's own retry has no delay).
NostrConnectSigner.subscriptionMethod = (relays, filters) => pool.subscription(relays, filters).pipe(retry({ delay: 3000, resetOnSuccess: true }));
NostrConnectSigner.publishMethod = (relays, event) => publishEvent(relays, event);

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

// --- Open signer: the phone's signer app, used directly (feat-phone-inline §P21) -------------------------
// In the Android app: NIP-55 through Applesauce's AndroidNativeSigner (intents, no relay). In a phone's browser
// or the PWA: NIP-55's web link; the login comes back on a callback address (signerCallback.ts), and later
// signatures come back on the clipboard, so the page does not reload for each one. Only which app and the
// public key are kept; no secret exists.

const AMBER = 'com.greenart7c3.nostrsigner';

/** Is there a signer to open on this device? (An app's signer is looked for when the button is pressed.) */
export function signerAvailable(): boolean {
  return hasExtension() || isNativeApp() || !!AmberClipboardSigner.SUPPORTED;
}

interface PlainSigner { getPublicKey(): Promise<string>; signEvent(_t: EventTemplate): Promise<NostrEvent> }
function wrapPlain(signer: PlainSigner): Signer {
  return { getPublicKey: () => signer.getPublicKey(), signEvent: t => signer.signEvent(t), close: async () => {} };
}

async function nativeSigner(packageName: string, pubkey?: string): Promise<PlainSigner> {
  // Loaded only inside the app: it needs the Capacitor plugin, which the web build does not have.
  const { AndroidNativeSigner } = await import('applesauce-signers/signers/android-native-signer');
  const signer = new AndroidNativeSigner(packageName, pubkey);
  signer.permissions = [{ type: 'get_public_key' }, ...SIGN_KINDS.map(kind => ({ type: 'sign_event' as const, kind }))];
  return signer;
}

async function connectNative(): Promise<Signer> {
  const { AndroidNativeSigner } = await import('applesauce-signers/signers/android-native-signer');
  const apps = await AndroidNativeSigner.getSignerApps();
  const app = apps.find(a => a.packageName === AMBER) ?? apps[0];
  if (!app) throw new Error('No signer app found on this phone. Install Amber (or another NIP-55 signer), or use the QR code.');
  const signer = await nativeSigner(app.packageName);
  const pubkey = await signer.getPublicKey();
  saveSession({ type: 'nip55', packageName: app.packageName, pubkey });
  return wrapPlain(signer);
}

/** Leave for Amber; it comes back to this page with the public key (handled by takeSignerAnswer). If the page
 *  is still in front after a few seconds, no signer app took the link. */
function connectAmberWeb(): Promise<Signer> {
  try { localStorage.setItem(RETURN_KEY, location.hash || '#/'); } catch { /* back to the board then */ }
  window.location.href = loginLink(`${location.origin}${location.pathname}`);
  return new Promise((_resolve, reject) => {
    window.setTimeout(() => {
      if (document.visibilityState === 'visible') reject(new Error('No signer app opened. Install Amber, or use the QR code.'));
    }, 4000);
  });
}

/** Coming back from Amber's login: keep the key it sent, tidy the address and go back to where the page was.
 *  Runs before the first render, so the router reads the right place. */
function takeSignerAnswer(): void {
  const pubkey = readAnswer(location.search);
  if (!pubkey) return;
  saveSession({ type: 'amber-web', pubkey });
  let back: string | null = null;
  try { back = localStorage.getItem(RETURN_KEY); localStorage.removeItem(RETURN_KEY); } catch { /* fine */ }
  history.replaceState(null, '', `${location.pathname}${safeReturn(back)}`);
}

async function connectSigner(): Promise<Signer> {
  if (await waitForExtension(300)) return connectExtension();
  if (isNativeApp()) return connectNative();
  if (AmberClipboardSigner.SUPPORTED) return connectAmberWeb();
  throw new Error('No signer found on this device. Use the QR code or a bunker link.');
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
      autoSwitchRelays: true,
    });
  } else {
    const p = NostrConnectSigner.parseBunkerURI(parsed.value);
    remote = new NostrConnectSigner({ relays: p.relays.length ? p.relays : NIP46_RELAYS, remote: p.remote, bunkerSecret: p.bunkerSecret, autoSwitchRelays: true });
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

export function isLoggedIn(): boolean {
  return state.status === 'in' && !!state.signer;
}

function currentSigner(): Signer {
  if (!state.signer) throw new Error('Log in first');
  return state.signer;
}

// Actions (follow, unfollow) are signed by whoever is logged in and published to the relays; they fail loudly
// if no relay accepts the event.
const signerProxy: ISigner = { getPublicKey: () => currentSigner().getPublicKey(), signEvent: t => currentSigner().signEvent(t) };
// Publish an event so that ONE relay accepting it is enough (the others carry on in the background). Used for
// the signer's requests and for follow updates; it fails loudly if no relay accepts.
async function publishEvent(relays: readonly string[], event: NostrEvent): Promise<void> {
  await publishToFirst(relays, async url => {
    const result = await pool.relay(url).publish(event);
    return { ok: result.ok, message: result.message };
  });
}

/** Sign an event with whoever is logged in and publish it to the content relays (one accepting is enough).
 *  Returns the signed event. Throws when nobody is logged in or no relay accepts it. */
export async function signAndPublish(template: EventTemplate): Promise<NostrEvent> {
  const event = await currentSigner().signEvent(template);
  await publishEvent(RELAYS, event);
  eventStore.add(event);
  return event;
}

export const actions = new ActionRunner(eventStore, signerProxy, async (event, relays) => {
  await publishEvent(relays?.length ? relays : RELAYS, event);
});

export async function loginWithExtension(): Promise<void> {
  await complete(await connectExtension());
}

/** Open signer (§P21): window.nostr, else the phone's signer app, else Amber from the browser. */
export async function loginWithSigner(): Promise<void> {
  await complete(await connectSigner());
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
  takeSignerAnswer();
  restoring = (async () => {
    try {
      // Logins saved by the earlier version of this app (a different format) cannot be restored.
      try { localStorage.removeItem('madstr:accounts'); localStorage.removeItem('madstr:active'); } catch { /* fine */ }
      const session = loadSession();
      if (!session) { set({ status: 'out' }); return; }
      if (session.type === 'extension') {
        if (!(await waitForExtension())) { set({ status: 'out' }); return; }
        await complete(wrapExtension(new ExtensionSigner()));
      } else if (session.type === 'nip55') {
        if (!isNativeApp()) { set({ status: 'out' }); return; }
        await complete(wrapPlain(await nativeSigner(session.packageName, session.pubkey)));
      } else if (session.type === 'amber-web') {
        const signer = new AmberClipboardSigner();
        signer.pubkey = session.pubkey;
        await complete(wrapPlain(signer));
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
// 240 s: a background tab throttles the retry interval to about once a minute (Chromium intensive
// throttling), so the give-up limit must survive a couple of throttled ticks. Madeira Livre uses
// the same value; about 20 s of retrying is the normal case.
const QR_TIMEOUT_MS = 240_000;

export interface QrLogin {
  uri: string;
  connected: Promise<void>;
  cancel: () => void;
}

export function startQrLogin(): QrLogin {
  // - autoSwitchRelays: NIP-46 says the client should send `switch_relays` right after connect — Amber answers
  //   with its own relays and moves the session there, so requests flow on relays Amber actually listens on.
  // - timeout: the library's own per-request timer; it must not fire before the app's total wait (QR_TIMEOUT_MS).
  const remote = new NostrConnectSigner({ relays: NIP46_RELAYS, autoSwitchRelays: true, timeout: QR_TIMEOUT_MS });
  const uri = remote.getNostrConnectURI({ name: APP_NAME, permissions: PERMISSIONS });
  const controller = new AbortController();
  let cancelled = false;
  const timer = window.setTimeout(() => controller.abort(), QR_TIMEOUT_MS);
  const connected = (async () => {
    try {
      await remote.waitForSigner(controller.signal);
      // The first get_public_key is usually lost (the signer is not listening yet — see
      // nostrconnect-first-request-lost-before-signer-listens): repeat it every 5 s until an answer arrives.
      await askForKeyUntilAnswered(remote, QR_TIMEOUT_MS);
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
