// The stored login, on this device only. For a remote signer it holds the nbunksec, a session credential
// (the client key + the bunker secret), not the person's private key. Storage can be blocked or throw, so
// every access is wrapped. Pattern from the Madeira Livre app (madeira-app/src/lib/session.ts).

export type Session = { type: 'extension' } | { type: 'nip46'; nbunksec: string };

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
    const value = JSON.parse(raw) as Partial<Session> & { nbunksec?: unknown };
    if (value.type === 'extension') return { type: 'extension' };
    if (value.type === 'nip46' && typeof value.nbunksec === 'string' && value.nbunksec.startsWith('nbunksec')) return { type: 'nip46', nbunksec: value.nbunksec };
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
