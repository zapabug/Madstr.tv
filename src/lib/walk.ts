// Reaching back in time for older music and videos (spec feat-taste-cache §T4): one older batch when a list
// opens and one more for every 30 items the list drops (zapa: "refetch for every 30 we drop"). Where each
// request got to is kept on the device so the next visit carries on. Pure; the fetching is data/older.ts.

export const DROPS_PER_BATCH = 30;

export function batchesWanted(dropped: number, per = DROPS_PER_BATCH): number {
  return 1 + Math.floor(Math.max(0, dropped) / per);
}

// One place in time per relay request: older than `until` (seconds), or finished when nothing older came back.
export interface WalkState {
  key: string; // who and what the walk is for; a change starts over
  until: (number | null)[];
  finished: boolean[];
}

// A short fingerprint of a long key (a follow list can be thousands of characters). FNV-1a, 32 bit, hex.
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${text.length.toString(36)}-${h.toString(16)}`;
}

export function freshWalk(key: string, n: number): WalkState {
  return { key, until: Array.from({ length: n }, () => null), finished: Array.from({ length: n }, () => false) };
}

// A stored walk read back as untrusted; one for different people / filters, or malformed, starts over.
export function parseWalk(raw: unknown, key: string, n: number): WalkState {
  if (!raw || typeof raw !== 'object') return freshWalk(key, n);
  const r = raw as Record<string, unknown>;
  if (r.key !== key || !Array.isArray(r.until) || !Array.isArray(r.finished) || r.until.length !== n || r.finished.length !== n) return freshWalk(key, n);
  const until = r.until.map(u => (typeof u === 'number' && Number.isInteger(u) && u > 0 ? u : null));
  const finished = r.finished.map(f => f === true);
  return { key, until, finished };
}

// After a batch: each request moves to just before the oldest event it returned, or is finished when it
// returned nothing.
export function advanceWalk(walk: WalkState, oldest: (number | null)[], asked: readonly number[]): WalkState {
  const until = [...walk.until];
  const finished = [...walk.finished];
  for (const i of asked) {
    const o = oldest[i];
    if (o === null || o === undefined) finished[i] = true;
    else until[i] = o - 1;
  }
  return { key: walk.key, until, finished };
}

export function openRequests(walk: WalkState): number[] {
  return walk.finished.map((f, i) => (f ? -1 : i)).filter(i => i >= 0);
}

// Several walks are kept, one per follow list (the TV's before a login lands, yours after), so one never
// overwrites another; the most recently used few.
export const WALKS_KEPT = 4;

// "Reached the start" holds for one visit only: an empty answer may have been a slow relay, so a new visit asks
// once more from where the walk got to.
export function pickWalk(rawMap: unknown, key: string, n: number): WalkState {
  const map = rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap) ? (rawMap as Record<string, unknown>) : {};
  const walk = parseWalk(map[key], key, n);
  return { ...walk, finished: walk.finished.map(() => false) };
}

export function storeWalk(rawMap: unknown, walk: WalkState, now: number, kept = WALKS_KEPT): Record<string, WalkState & { used: number }> {
  const map = rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap) ? (rawMap as Record<string, unknown>) : {};
  const others = Object.entries(map)
    .filter(([k, v]) => k !== walk.key && v && typeof v === 'object')
    .map(([k, v]) => [k, v as WalkState & { used: number }] as const)
    .sort((a, b) => (Number(b[1].used) || 0) - (Number(a[1].used) || 0))
    .slice(0, kept - 1);
  return { ...Object.fromEntries(others), [walk.key]: { ...walk, used: now } };
}
