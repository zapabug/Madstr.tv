// Arrow-key focus for a board of cards. Browsers only move focus with Tab; a
// remote-style UI wants Up/Down/Left/Right to jump to the nearest card in that
// direction. Pure geometry, so it is unit-tested without a browser.

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

function center(b: Box): { x: number; y: number } {
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}

// Index of the best box to move to from `from`, or null when nothing lies that way.
// Grid rule, like a TV remote: go to the nearest row (or column) in that direction,
// then pick the card in it that is closest across. "Ahead" must be a real step, not
// a pixel of jitter: cards in one row are never exactly level (tilt, rounding), and
// must not count as above or below each other.
export function pickNext(boxes: Box[], from: number, direction: Direction): number | null {
  const origin = boxes[from];
  if (!origin) return null;
  const o = center(origin);
  const vertical = direction === 'down' || direction === 'up';

  const ahead: { index: number; along: number; across: number; extent: number }[] = [];
  boxes.forEach((box, index) => {
    if (index === from) return;
    const c = center(box);
    const dx = c.x - o.x;
    const dy = c.y - o.y;
    const along = direction === 'down' ? dy : direction === 'up' ? -dy : direction === 'right' ? dx : -dx;
    const across = vertical ? Math.abs(dx) : Math.abs(dy);
    const extent = vertical ? Math.min(origin.height, box.height) : Math.min(origin.width, box.width);
    if (along > extent * 0.5) ahead.push({ index, along, across, extent });
  });
  if (ahead.length === 0) return null;

  // Left / Right stay in the row you are on: a chip above-right is not "right of" a card.
  if (!vertical) {
    const sameRow = ahead.filter(c => c.across <= Math.min(origin.height, boxes[c.index].height) * 0.5);
    if (sameRow.length === 0) return null;
    return sameRow.reduce((a, b) => (b.along < a.along ? b : a)).index;
  }

  // Up / Down: the nearest row: everything within half a card of the closest one in line.
  const nearest = ahead.reduce((a, b) => (b.along < a.along ? b : a));
  const row = ahead.filter(c => c.along <= nearest.along + nearest.extent * 0.5);
  return row.reduce((a, b) => (b.across < a.across ? b : a)).index;
}

export function directionForKey(key: string): Direction | null {
  switch (key) {
    case 'ArrowUp': return 'up';
    case 'ArrowDown': return 'down';
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    default: return null;
  }
}

// --- leaving a form field with the arrows (spec R8, the remote pass) ------------------------------
// A remote has no Tab key, so arrows must also get out of text boxes and sliders, without taking
// away the keys those fields need: a text box keeps Left / Right for its caret until the caret is at
// that end; a slider keeps Left / Right for its value. Up / Down always move on from either.
export type Field =
  | { kind: 'none' } // not a form field: arrows always move focus
  | { kind: 'text'; start: number | null; end: number | null; length: number }
  | { kind: 'range' }
  | { kind: 'other' }; // a textarea, select or editable area: arrows stay inside

export function arrowLeavesField(direction: Direction, field: Field): boolean {
  switch (field.kind) {
    case 'none': return true;
    case 'range': return direction === 'up' || direction === 'down';
    case 'other': return false;
    case 'text': {
      if (direction === 'up' || direction === 'down') return true;
      // No caret information (some input types): leave, rather than trap the remote.
      if (field.start === null || field.end === null) return true;
      if (field.start !== field.end) return false; // text is selected: arrows collapse it first
      return direction === 'left' ? field.start === 0 : field.end === field.length;
    }
  }
}

// --- where focus goes when it has nowhere to be (feat-tv-remote TV1) ---------------------------------
// A remote has no mouse to click focus back into the page, so focus must never be lost (TVR-R3).
export interface Candidate {
  box: Box;
  start: number | null; // the screen's start mark (data-nav-start), lowest number first; null when unmarked
  noFallback: boolean; // never chosen by a fallback: Log in / Log out (TV1-3), text boxes
}

function distance(a: Box, b: Box): number {
  const ca = center(a);
  const cb = center(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}

// A screen's start point (TV1-1): the marked start with the lowest number (page order breaks ties), else the
// first control in page order that a fallback may choose.
export function startIndex(candidates: Candidate[]): number | null {
  let best: number | null = null;
  candidates.forEach((c, i) => {
    if (c.start === null) return;
    if (best === null || c.start < (candidates[best].start as number)) best = i;
  });
  if (best !== null) return best;
  const first = candidates.findIndex(c => !c.noFallback);
  return first < 0 ? null : first;
}

// The focused control vanished (TV1-2): the control nearest where it was, those in `prefer` (its own area) first.
// Never a control a fallback may not choose; null when there is none.
export function handOver(candidates: Candidate[], was: Box, prefer: readonly number[]): number | null {
  const nearest = (pool: number[]): number | null =>
    pool.reduce<number | null>((best, i) => (best === null || distance(candidates[i].box, was) < distance(candidates[best].box, was) ? i : best), null);
  const allowed = (i: number) => i >= 0 && i < candidates.length && !candidates[i].noFallback;
  return nearest(prefer.filter(allowed)) ?? nearest(candidates.map((_, i) => i).filter(allowed));
}
