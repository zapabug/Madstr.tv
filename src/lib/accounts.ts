import { AccountManager } from 'applesauce-accounts';
import { ExtensionAccount, NostrConnectAccount, registerCommonAccountTypes } from 'applesauce-accounts/accounts';
import { ActionRunner } from 'applesauce-actions';
import { NostrConnectSigner } from 'applesauce-signers';
import { RELAYS, eventStore, pool } from './applesauce.ts';

// Logging in, and the one thing a login is for here: following people. Both ways in
// are Applesauce's own: a NIP-07 browser extension, or a NIP-46 `bunker://` link (Amber
// and other remote signers). No QR codes: paste the link.
//
// Saved logins are stored by Applesauce in localStorage. For a bunker login that holds
// the session's client key, which is a credential: this page's scripts can read it.

const ACCOUNTS_KEY = 'madstr:accounts';
const ACTIVE_KEY = 'madstr:active';
const BUNKER_TIMEOUT_MS = 30_000;

NostrConnectSigner.subscriptionMethod = pool.subscription.bind(pool);
NostrConnectSigner.publishMethod = pool.publish.bind(pool);

export const accounts = new AccountManager();
registerCommonAccountTypes(accounts);

// Actions (follow, unfollow) are signed by whichever account is active and published to
// the relays; they fail loudly if no relay accepts the event.
export const actions = new ActionRunner(eventStore, accounts.signer, async (event, relays) => {
  const responses = await pool.publish(relays?.length ? relays : RELAYS, event);
  if (!responses.some(r => r.ok)) throw new Error('No relay accepted the update');
});

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null): void {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* login still works for this session */ }
}

let restored = false;

// Bring back saved logins, then keep saving changes. Safe to call more than once.
export async function restoreAccounts(): Promise<void> {
  if (restored) return;
  restored = true;
  try {
    const saved: unknown = JSON.parse(read(ACCOUNTS_KEY) || '[]');
    if (Array.isArray(saved)) await accounts.fromJSON(saved);
  } catch (error) {
    console.error('[accounts] Could not restore saved logins:', error);
  }
  const active = read(ACTIVE_KEY);
  if (active && accounts.getAccount(active)) accounts.setActive(active);
  accounts.accounts$.subscribe(() => write(ACCOUNTS_KEY, JSON.stringify(accounts.toJSON())));
  accounts.active$.subscribe(account => write(ACTIVE_KEY, account ? account.id : null));
}

export function hasExtension(): boolean {
  return typeof window !== 'undefined' && 'nostr' in window;
}

export async function loginWithExtension(): Promise<void> {
  const account = await ExtensionAccount.fromExtension();
  accounts.addAccount(account);
  accounts.setActive(account);
}

export function isBunkerUri(text: string): boolean {
  return /^bunker:\/\/[0-9a-f]{64}\?/i.test(text.trim());
}

export async function loginWithBunker(uri: string): Promise<void> {
  const text = uri.trim();
  if (!isBunkerUri(text)) throw new Error('That is not a bunker:// link');
  const connect = async () => {
    // Only ask the signer for what this app does: sign contact-list updates.
    const signer = await NostrConnectSigner.fromBunkerURI(text, { permissions: NostrConnectSigner.buildSigningPermissions([3]) });
    return new NostrConnectAccount(await signer.getPublicKey(), signer);
  };
  const account = await Promise.race([
    connect(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('The signer did not answer in time')), BUNKER_TIMEOUT_MS)),
  ]);
  accounts.addAccount(account);
  accounts.setActive(account);
}

export function logout(): void {
  const active = accounts.active;
  if (active) accounts.removeAccount(active);
}

// Log in by scanning: the app shows a nostrconnect:// QR code, the signer app (Amber and others)
// scans it and answers over the relays. `uri` is what goes in the QR (and in a tap-to-open link);
// `connected` resolves once the signer has answered and the account is active; `cancel` stops waiting.
const QR_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
const QR_TIMEOUT_MS = 120_000;

export interface QrLogin {
  uri: string;
  connected: Promise<void>;
  cancel: () => void;
}

export function startQrLogin(): QrLogin {
  const signer = new NostrConnectSigner({ relays: QR_RELAYS });
  const uri = signer.getNostrConnectURI({ name: 'Mad\u26a1tr.tv', permissions: NostrConnectSigner.buildSigningPermissions([3]) });
  const controller = new AbortController();
  let cancelled = false;
  const timer = window.setTimeout(() => controller.abort(), QR_TIMEOUT_MS);
  const connected = (async () => {
    try {
      await signer.waitForSigner(controller.signal);
      const account = new NostrConnectAccount(await signer.getPublicKey(), signer);
      accounts.addAccount(account);
      accounts.setActive(account);
    } catch (error) {
      void signer.close();
      if (cancelled) return; // you pressed Cancel: not an error
      throw controller.signal.aborted ? new Error('The signer did not answer in time') : error;
    } finally {
      window.clearTimeout(timer);
    }
  })();
  return { uri, connected, cancel: () => { cancelled = true; controller.abort(); } };
}
