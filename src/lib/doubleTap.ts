// Telling a single tap from a double tap on the picture (spec feat-taste-cache §T6). A double tap is two taps
// within 300 ms close to each other; a single tap fires only once that time has passed with no second tap,
// so a double tap never also does the single tap's job (pause a video, bring the panel back).

export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_PX = 60;

// Left half goes back 10 s, right half forward 30 s (the remote's rewind / fast-forward steps).
export const BACK_S = 10;
export const FORWARD_S = 30;

export interface Tap { x: number; y: number; t: number }

export function seekForSide(x: number, left: number, width: number): number {
  return x < left + width / 2 ? -BACK_S : FORWARD_S;
}

export interface TapperDeps {
  onSingle: (_tap: Tap) => void;
  onDouble: (_tap: Tap) => void;
  setTimer: (_fn: () => void, _ms: number) => unknown;
  clearTimer: (_handle: unknown) => void;
}

export function createTapper({ onSingle, onDouble, setTimer, clearTimer }: TapperDeps): { tap: (_t: Tap) => void; cancel: () => void } {
  let first: Tap | null = null;
  let timer: unknown = null;
  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    first = null;
  };
  const tap = (t: Tap) => {
    if (first && t.t - first.t <= DOUBLE_TAP_MS && Math.hypot(t.x - first.x, t.y - first.y) <= DOUBLE_TAP_PX) {
      cancel();
      onDouble(t);
      return;
    }
    // A tap still waiting that this one is not the double of: it was a single tap after all.
    const waiting = first;
    cancel();
    if (waiting) onSingle(waiting);
    first = t;
    timer = setTimer(() => {
      const single = first;
      timer = null;
      first = null;
      if (single) onSingle(single);
    }, DOUBLE_TAP_MS);
  };
  return { tap, cancel };
}
