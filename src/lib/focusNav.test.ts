import test from 'node:test';
import assert from 'node:assert/strict';
import { pickNext, directionForKey, type Box } from './focusNav.ts';

// Two rows of three cards:   0 1 2
//                            3 4 5
const grid: Box[] = [0, 1, 2, 3, 4, 5].map(i => ({
  left: (i % 3) * 200,
  top: Math.floor(i / 3) * 150,
  width: 180,
  height: 130,
}));

test('moves to the neighbour in the pressed direction', () => {
  assert.equal(pickNext(grid, 0, 'right'), 1);
  assert.equal(pickNext(grid, 1, 'right'), 2);
  assert.equal(pickNext(grid, 2, 'left'), 1);
  assert.equal(pickNext(grid, 0, 'down'), 3);
  assert.equal(pickNext(grid, 4, 'up'), 1);
});

test('returns null at an edge instead of wrapping', () => {
  assert.equal(pickNext(grid, 0, 'left'), null);
  assert.equal(pickNext(grid, 0, 'up'), null);
  assert.equal(pickNext(grid, 2, 'right'), null);
  assert.equal(pickNext(grid, 5, 'down'), null);
});

test('down prefers the card below over one far to the side', () => {
  assert.equal(pickNext(grid, 2, 'down'), 5);
  assert.equal(pickNext(grid, 1, 'down'), 4);
});

test('a short last row still lets Down land on the nearest card', () => {
  // 0 1 2
  // 3
  const boxes = grid.slice(0, 4);
  assert.equal(pickNext(boxes, 2, 'down'), 3);
  assert.equal(pickNext(boxes, 1, 'down'), 3);
});

test('bad input is harmless', () => {
  assert.equal(pickNext([], 0, 'down'), null);
  assert.equal(pickNext(grid, 99, 'down'), null);
  assert.equal(pickNext([grid[0]], 0, 'down'), null);
});

test('only arrow keys map to a direction', () => {
  assert.equal(directionForKey('ArrowUp'), 'up');
  assert.equal(directionForKey('ArrowRight'), 'right');
  assert.equal(directionForKey('Enter'), null);
  assert.equal(directionForKey('w'), null);
});

test('cards in the same row, a pixel off level, are not above or below each other', () => {
  // Real board: tilted cards sit 1-2px apart vertically within a row.
  //   0 (top 417)  1 (top 418)
  //   2 (top 761)
  const boxes: Box[] = [
    { left: 91, top: 417, width: 281, height: 300 },
    { left: 383, top: 418, width: 279, height: 300 },
    { left: 94, top: 761, width: 276, height: 300 },
  ];
  assert.equal(pickNext(boxes, 1, 'down'), 2, 'Down from the right card goes to the row below');
  assert.equal(pickNext(boxes, 0, 'down'), 2);
  assert.equal(pickNext(boxes, 0, 'right'), 1);
  assert.equal(pickNext(boxes, 1, 'up'), null, 'the neighbour in the same row is not "up"');
});

test('a narrow chip row above is not "left" of a card below it', () => {
  const chip: Box = { left: 150, top: 300, width: 100, height: 44 };
  const card: Box = { left: 91, top: 417, width: 281, height: 300 };
  assert.equal(pickNext([chip, card], 1, 'left'), null);
});

test('Down goes to the next row first, even when a card in a later row is straighter below', () => {
  // Real board, Listen lane:   0 1        and below it the People row:  3 4
  //                            2                                        (3 sits under 2, 4 under 1)
  const boxes: Box[] = [
    { left: 91, top: 417, width: 281, height: 300 },   // 0 Music
    { left: 383, top: 418, width: 279, height: 300 },  // 1 Podcasts
    { left: 94, top: 761, width: 276, height: 300 },   // 2 Local
    { left: 91, top: 1184, width: 234, height: 300 },  // 3
    { left: 335, top: 1185, width: 231, height: 300 }, // 4 (nearly straight below 1)
  ];
  assert.equal(pickNext(boxes, 1, 'down'), 2, 'Local is the next row, not the far one');
  assert.equal(pickNext(boxes, 2, 'down'), 3);
  assert.equal(pickNext(boxes, 4, 'up'), 2, 'Up from the lower row lands in the row above');
});

test('Left and Right stay in the current row', () => {
  const chip: Box = { left: 260, top: 330, width: 90, height: 44 };    // a chip above-right
  const music: Box = { left: 91, top: 417, width: 281, height: 300 };
  const podcasts: Box = { left: 383, top: 418, width: 279, height: 300 };
  assert.equal(pickNext([music, chip, podcasts], 0, 'right'), 2, 'Right goes across to Podcasts, not up to the chip');
  assert.equal(pickNext([music, chip], 0, 'right'), null, 'nothing in this row to the right');
  assert.equal(pickNext([music, podcasts], 1, 'left'), 0);
});

// --- leaving form fields (R8) ----------------------------------------------------------------------
import { arrowLeavesField } from './focusNav.ts';

test('outside a form field every arrow moves focus', () => {
  for (const d of ['up', 'down', 'left', 'right'] as const) assert.equal(arrowLeavesField(d, { kind: 'none' }), true);
});

test('a text box: Up / Down move on; Left / Right only from the matching end of the text', () => {
  const at = (start: number, end = start) => ({ kind: 'text' as const, start, end, length: 5 });
  assert.equal(arrowLeavesField('up', at(2)), true);
  assert.equal(arrowLeavesField('down', at(2)), true);
  assert.equal(arrowLeavesField('left', at(2)), false, 'mid-text Left moves the caret');
  assert.equal(arrowLeavesField('right', at(2)), false);
  assert.equal(arrowLeavesField('left', at(0)), true, 'at the start Left moves on');
  assert.equal(arrowLeavesField('right', at(5)), true, 'at the end Right moves on');
  assert.equal(arrowLeavesField('left', at(0, 3)), false, 'a selection collapses first');
  assert.equal(arrowLeavesField('right', { kind: 'text', start: 0, end: 0, length: 0 }), true, 'an empty box lets go both ways');
  assert.equal(arrowLeavesField('left', { kind: 'text', start: null, end: null, length: 3 }), true, 'no caret info: never trap');
});

test('a slider keeps Left / Right for its value; Up / Down move on', () => {
  assert.equal(arrowLeavesField('left', { kind: 'range' }), false);
  assert.equal(arrowLeavesField('right', { kind: 'range' }), false);
  assert.equal(arrowLeavesField('up', { kind: 'range' }), true);
  assert.equal(arrowLeavesField('down', { kind: 'range' }), true);
});

test('textareas and selects keep their arrows', () => {
  assert.equal(arrowLeavesField('down', { kind: 'other' }), false);
});

// --- feat-tv-remote TV1: focus is never lost -------------------------------------------------------
import { handOver, startIndex, type Candidate } from './focusNav.ts';

const at = (left: number, top: number, extra: Partial<Candidate> = {}): Candidate => ({
  box: { left, top, width: 80, height: 40 }, start: null, noFallback: false, ...extra,
});

test('start point: the lowest start mark wins, wherever it sits on the page', () => {
  const screen = [at(0, 0, { noFallback: true }), at(0, 100), at(500, 400, { start: 2 }), at(600, 400, { start: 1 })];
  assert.equal(startIndex(screen), 3, 'Play/Pause (1) before the first tile (2)');
  const tied = [at(0, 0), at(0, 100, { start: 1 }), at(0, 200, { start: 1 })];
  assert.equal(startIndex(tied), 1, 'a tie goes to the first in page order');
});

test('start point without marks: the first control a fallback may take, never Log out', () => {
  const board = [at(800, 10, { noFallback: true }), at(20, 300), at(300, 300)];
  assert.equal(startIndex(board), 1, 'Log out comes first on the page but is skipped');
  assert.equal(startIndex([at(0, 0, { noFallback: true })]), null, 'nothing allowed: no start');
  assert.equal(startIndex([]), null);
});

test('hand over: the nearest control in the same area first, then anywhere', () => {
  // A row of Follow buttons; the middle one (was at 300,500) vanished after Follow.
  const screen = [at(800, 10, { noFallback: true }), at(100, 500), at(500, 500), at(320, 900), at(300, 200)];
  const was = { left: 300, top: 500, width: 80, height: 40 };
  assert.equal(handOver(screen, was, [3]), 3, 'its own area wins even when a control elsewhere is nearer');
  assert.equal(handOver(screen, was, [2, 3]), 2, 'nearest inside the area');
  assert.equal(handOver(screen, was, []), 1, 'no area: nearest anywhere (a tie goes to page order)');
});

test('hand over never lands on Log out, even when it is nearest', () => {
  const screen = [at(800, 10, { noFallback: true }), at(100, 500)];
  assert.equal(handOver(screen, { left: 790, top: 20, width: 80, height: 40 }, [0]), 1);
  assert.equal(handOver([at(0, 0, { noFallback: true })], { left: 0, top: 0, width: 1, height: 1 }, []), null);
  assert.equal(handOver(screen, { left: 0, top: 0, width: 1, height: 1 }, [7, -1]), 1, 'bad indices are ignored');
});

// --- feat-tv-remote TV2: crossing into another area ---------------------------------------------------
import { pickArea } from './focusNav.ts';

test('pickArea: a playlist tile low in the picker reaches the player panel to its right', () => {
  // the bottom panel at 960x540: picker 0..640, player panel 650..950, both from y 270 to 530
  const picker = { left: 10, top: 270, width: 630, height: 260 };
  const controls = { left: 650, top: 270, width: 300, height: 260 };
  const tile = { left: 500, top: 440, width: 110, height: 80 }; // not level with any button
  assert.equal(pickArea([picker, controls], tile, 'right'), 1);
  assert.equal(pickArea([picker, controls], tile, 'left'), null, 'its own area is not ahead of it');
  assert.equal(pickArea([controls], tile, 'up'), null, 'nothing above');
});

test('pickArea: the nearest area ahead wins, and it must overlap across', () => {
  const near = { left: 300, top: 0, width: 100, height: 100 };
  const far = { left: 600, top: 0, width: 100, height: 100 };
  const offRow = { left: 200, top: 400, width: 100, height: 100 };
  const from = { left: 0, top: 20, width: 100, height: 60 };
  assert.equal(pickArea([far, near, offRow], from, 'right'), 1);
  assert.equal(pickArea([offRow], from, 'right'), null, 'an area lower down is not to the right');
  assert.equal(pickArea([offRow], from, 'down'), null, 'and not below either: it does not overlap across');
  assert.equal(pickArea([], from, 'down'), null);
});
