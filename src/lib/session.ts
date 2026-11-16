// The stored login, on this device only. For a remote signer it holds the nbunksec, a session credential
// (the client key + the bunker secret), not the person's private key. Storage can be blocked or throw, so
// every access is wrapped. Pattern from the Madeira Livre app (madeira-app/src/lib/session.ts).

export type Session =
  | { type: 'extension' }
  | { type: 'nip46'; nbunksec: string }
  // a signer app on the phone, used directly (NIP-55, the Android app; feat-phone-inline §P21): no secret, only
  // which app and whose key
  | { type: 'nip55'; packageName: string; pubkey: string }
  // Amber from a phone's browser, answering on the clipboard (§P21): only whose key
  | { type: 'amber-web'; pubkey: string };

const HEX64 = /^[0-9a-f]{64}$/;
const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

export interface KV {
  getItem(_key: string): string | null;
  setItem(_key: string, _value: string): void;
  removeItem(_key: string): void;
}

export const SESSION_KEY = 'madstr:session';

const local = (): KV | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export function saveSession(session: Session, storage: KV | null = local()): void {
  try {
    storage?.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage blocked: the login just will not survive a reload */
  }
}

export function loadSession(storage: KV | null = local()): Session | null {
  try {
    const raw = storage?.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { type?: unknown; nbunksec?: unknown; packageName?: unknown; pubkey?: unknown };
    if (value.type === 'extension') return { type: 'extension' };
    if (value.type === 'nip46' && typeof value.nbunksec === 'string' && value.nbunksec.startsWith('nbunksec')) return { type: 'nip46', nbunksec: value.nbunksec };
    const pubkey = typeof value.pubkey === 'string' && HEX64.test(value.pubkey) ? value.pubkey : null;
    if (value.type === 'nip55' && pubkey && typeof value.packageName === 'string' && value.packageName.length <= 200 && PACKAGE.test(value.packageName)) {
      return { type: 'nip55', packageName: value.packageName, pubkey };
    }
    if (value.type === 'amber-web' && pubkey) return { type: 'amber-web', pubkey };
    return null;
  } catch {
    return null;
  }
}

export function clearSession(storage: KV | null = local()): void {
  try {
    storage?.removeItem(SESSION_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** A pasted signer credential: `bunker://...` or an `nbunksec...` session string. */
export function parseCredential(text: string): { kind: 'bunker' | 'nbunksec'; value: string } | null {
  const value = text.trim();
  if (value.startsWith('bunker://')) return { kind: 'bunker', value };
  if (value.startsWith('nbunksec')) return { kind: 'nbunksec', value };
  return null;
}
