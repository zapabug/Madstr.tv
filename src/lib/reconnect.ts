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

// --- the nostrconnect:// first-request race ------------------------------------------------
// After the connect reply, the signer may not be listening for requests on its new per-connection key yet,
// and relays drop ephemeral kind 24133 events with no subscriber: the first `get_public_key` is lost. The
// library sends it once and never repeats it. Amber answers a request it did see in about 1 s, so silence
// means lost, not slow — asking again every 5 s until any answer arrives is harmless and fixes it.
// From madeira-app's `askForKeyUntilAnswered` (snippet: nostrconnect-first-request-lost-before-signer-listens).

export interface KeyAsker {
  getPublicKey(): Promise<string>;
}

export function askForKeyUntilAnswered(ask: KeyAsker, totalMs: number, intervalMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    let done = false;
    const askOnce = () => {
      if (done) return;
      void ask.getPublicKey().then(
        key => {
          if (!done) { done = true; clearInterval(timer); clearTimeout(total); resolve(key); }
        },
        () => {}, // one request failing or timing out: the next repeat tries again
      );
    };
    const tick = () => {
      if (done) return;
      if (Date.now() - start > totalMs) {
        done = true;
        clearInterval(timer);
        clearTimeout(total);
        reject(new Error('The signer did not answer the key request in time'));
      } else {
        askOnce();
      }
    };
    const start = Date.now();
    const timer = setInterval(tick, intervalMs);
    const total = setTimeout(tick, totalMs);
    askOnce();
  });
}
