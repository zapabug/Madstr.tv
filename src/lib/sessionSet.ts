// A set of strings kept for this browser tab only (sessionStorage): closing the tab starts fresh, a reload
// keeps it. Used for what has played this session and which pictures have been on screen. Storage can be
// blocked or throw, so every access is wrapped; without it the set simply lives in memory.

export interface SessionKV {
  getItem(_key: string): string | null;
  setItem(_key: string, _value: string): void;
}

const session = (): SessionKV | null => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
};

export interface SessionSet {
  has(_value: string): boolean;
  add(_value: string): void;
  removeAll(_values: Iterable<string>): void;
  snapshot(): ReadonlySet<string>;
  readonly size: number;
}

// `cap`: the oldest entries drop out first, so the stored list never grows without bound.
export function createSessionSet(key: string, cap: number, storage: SessionKV | null = session()): SessionSet {
  let values: string[] = [];
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(key) ?? '[]');
    if (Array.isArray(parsed)) values = parsed.filter((v): v is string => typeof v === 'string').slice(-cap);
  } catch { /* unreadable: start empty */ }
  const set = new Set(values);
  const save = () => {
    try { storage?.setItem(key, JSON.stringify([...set])); } catch { /* full or blocked: memory only */ }
  };
  return {
    has: v => set.has(v),
    add: v => {
      if (set.has(v)) return;
      set.add(v);
      while (set.size > cap) set.delete(set.values().next().value as string);
      save();
    },
    removeAll: vs => {
      let changed = false;
      for (const v of vs) changed = set.delete(v) || changed;
      if (changed) save();
    },
    snapshot: () => new Set(set),
    get size() { return set.size; },
  };
}
