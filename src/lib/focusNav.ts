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
