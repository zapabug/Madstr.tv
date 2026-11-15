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
