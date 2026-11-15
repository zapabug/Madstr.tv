// Publish to several relays but do not wait for all of them: resolve as soon as ONE relay accepts. The rest
// carry on in the background. Only if every relay refuses, fails or runs out of time does it reject.
//
// Why: the signer library sends a request and waits for the publish to finish before it listens for the
// signer's reply. RelayPool.publish finishes only when every relay has answered or timed out, so a single
// slow, dead or auth-requiring relay (relay.nsec.app) stalled the whole login.

export interface PublishResult {
  ok: boolean;
  message?: string;
}

export function publishToFirst(relays: readonly string[], publishOne: (_url: string) => Promise<PublishResult>, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (relays.length === 0) { reject(new Error('No relays to publish to')); return; }
    let settled = false;
    let remaining = relays.length;
    const problems: string[] = [];

    const failed = (url: string, why: string) => {
      problems.push(`${url}: ${why}`);
      remaining -= 1;
      if (remaining === 0 && !settled) { settled = true; reject(new Error(`No relay accepted it (${problems.join('; ')})`)); }
    };

    for (const url of relays) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const slow = new Promise<PublishResult>(res => { timer = setTimeout(() => res({ ok: false, message: 'timed out' }), timeoutMs); });
      Promise.race([publishOne(url).catch((e: unknown): PublishResult => ({ ok: false, message: e instanceof Error ? e.message : String(e) })), slow])
        .then(result => {
          clearTimeout(timer);
          if (result.ok) {
            if (!settled) { settled = true; resolve(url); }
            remaining -= 1;
          } else {
            failed(url, result.message || 'refused');
          }
        });
    }
  });
}
