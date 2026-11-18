// Which hosts let the app read the sound of what they serve (spec feat-lava-lamp LL1). A web page may only look at
// the sound of a file from another site when that site sends CORS headers; asking with crossOrigin="anonymous" on
// a site that does not makes the file fail to load. So the player asks, falls back once without asking when it
// fails, and remembers the answer per host. Everything here is pure; the player owns the storage.

export const READABLE_KEY = 'madstr:readable-hosts';
export const MAX_HOSTS = 300;

// host → whether it allowed reading. A Map keeps insertion order, so the first key is the oldest answer.
export type HostMemory = Map<string, boolean>;

// The host a CORS question is about, or null when there is nothing to ask: not http(s), or the page's own origin
// (blob:, data: and same-origin files can always be read).
export function crossHost(url: string, pageOrigin: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.origin === pageOrigin) return null;
  return u.host;
}

// Whether to load this URL with crossOrigin="anonymous": yes for another site's http(s) file unless its host is
// remembered as refusing.
export function askToRead(url: string, pageOrigin: string, memory: HostMemory): boolean {
  const host = crossHost(url, pageOrigin);
  return host !== null && memory.get(host) !== false;
}

// The memory with one more answer, newest last, at most `max` hosts (the oldest dropped).
export function remember(memory: HostMemory, host: string, readable: boolean, max = MAX_HOSTS): HostMemory {
  const next = new Map(memory);
  next.delete(host);
  next.set(host, readable);
  while (next.size > max) next.delete(next.keys().next().value as string);
  return next;
}

// From storage: a JSON array of [host, boolean] pairs; anything else is ignored (storage is untrusted).
export function parseMemory(raw: string | null): HostMemory {
  const out: HostMemory = new Map();
  if (!raw) return out;
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return out;
    for (const pair of list.slice(-MAX_HOSTS)) {
      if (Array.isArray(pair) && typeof pair[0] === 'string' && pair[0].length <= 255 && typeof pair[1] === 'boolean') out.set(pair[0], pair[1]);
    }
  } catch { /* not ours: start empty */ }
  return out;
}

export function serializeMemory(memory: HostMemory): string {
  return JSON.stringify([...memory]);
}
