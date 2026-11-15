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
