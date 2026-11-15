// Re-handshake a stored remote-signer session. Amber answers a repeat `connect` with "already connected" and
// the signer library rethrows it (and closes): that reply means the session is fine, so mark it connected,
// reopen the subscription and carry on. Any other failure, or no answer in time, is a real failure.
// Pattern from the Madeira Livre app (madeira-app/src/lib/signer.ts).

export interface RemoteLike {
  connect(_bunkerSecret?: string, _permissions?: string[]): Promise<unknown>;
  isConnected: boolean;
  open(): Promise<void>;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function reconnect(remote: RemoteLike, permissions: string[], ms = 20_000): Promise<void> {
  try {
    await withTimeout(remote.connect(undefined, permissions), ms, 'Signer connect');
  } catch (error) {
    if (!/already connected/i.test(String(error))) throw error;
    remote.isConnected = true;
    await remote.open();
  }
}
