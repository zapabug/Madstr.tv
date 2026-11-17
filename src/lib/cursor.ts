// The D-pad pointer (spec feat-tv-remote TV7): hold OK for a pointer the arrows move, for whatever the arrows
// cannot reach. Pure movement rules, tested without a browser; Cursor.tsx draws it and feeds it the keys.
export const CURSOR = {
  stepPx: 24, // TV7-2: a tap moves it 24 px
  startPxPerS: 300, // TV7-2: held, it moves at 300 px/s …
  maxPxPerS: 1200, // … rising to 1200 px/s …
  rampMs: 1000, // … over 1 s
  holdDelayMs: 200, // a press longer than this is a hold (it starts moving on its own; logged in planning.md)
  edgePx: 48, // TV7-4: inside 48 px of the screen edge it scrolls what is there
  scrollPxPerS: 600, // how fast the edge scrolls (logged in planning.md)
} as const;

export type Dir = 'up' | 'down' | 'left' | 'right';
export interface Point { x: number; y: number }
export interface Size { width: number; height: number }

// Speed while an arrow has been held heldMs (after the hold delay): a straight ramp from start to max.
export function speedAt(heldMs: number): number {
  const t = Math.min(Math.max(heldMs - CURSOR.holdDelayMs, 0) / CURSOR.rampMs, 1);
  return CURSOR.startPxPerS + (CURSOR.maxPxPerS - CURSOR.startPxPerS) * t;
}

const UNIT: Record<Dir, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

// Move by px in each held direction (several at once move diagonally); the pointer stays on screen.
export function moveBy(at: Point, dirs: Iterable<Dir>, px: number, screen: Size): Point {
  let { x, y } = at;
  for (const d of dirs) { x += UNIT[d].x * px; y += UNIT[d].y * px; }
  return { x: Math.min(Math.max(x, 0), screen.width - 1), y: Math.min(Math.max(y, 0), screen.height - 1) };
}

// Which way to scroll when the pointer is in an edge zone: -1, 0 or 1 on each axis.
export function edgePush(at: Point, screen: Size): Point {
  const e = CURSOR.edgePx;
  const x = at.x < e ? -1 : at.x > screen.width - 1 - e ? 1 : 0;
  const y = at.y < e ? -1 : at.y > screen.height - 1 - e ? 1 : 0;
  return { x, y };
}
