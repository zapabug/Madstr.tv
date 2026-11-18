import test from 'node:test';
import assert from 'node:assert/strict';
import { BEAT_GAP, createRhythm, readBands, sprayColour } from './rhythm.ts';

// A spectrum with each band at a level 0-255.
function spectrum(bass: number, mid = 0, treble = 0): Uint8Array {
  const b = new Uint8Array(1024);
  for (let i = 2; i < 12; i++) b[i] = bass;
  for (let i = 12; i < 93; i++) b[i] = mid;
  for (let i = 93; i < 372; i++) b[i] = treble;
  return b;
}

test('silence gives nothing and no beat', () => {
  const s = createRhythm();
  for (let i = 0; i < 120; i++) {
    const b = readBands(spectrum(0), 1 / 60, s);
    assert.deepEqual(b, { bass: 0, mid: 0, treble: 0, beat: 0 });
  }
});

test('a kick after quiet is a beat; a steady bass is not', () => {
  const s = createRhythm();
  for (let i = 0; i < 60; i++) readBands(spectrum(20), 1 / 60, s);
  const kick = readBands(spectrum(220), 1 / 60, s);
  assert.ok(kick.beat >= 0.4, `beat ${kick.beat}`);
  assert.ok(kick.bass > 0.5);
  for (let i = 0; i < 60; i++) readBands(spectrum(220), 1 / 60, s); // the average catches up within a second
  let later = 0;
  for (let i = 0; i < 180; i++) later += readBands(spectrum(220), 1 / 60, s).beat;
  assert.equal(later, 0, 'a held bass is no beat');
});

test('beats are at least the gap apart', () => {
  const s = createRhythm();
  const times: number[] = [];
  // a kick every other frame: far faster than any music
  for (let i = 0; i < 120; i++) {
    const b = readBands(spectrum(i % 2 === 0 ? 230 : 0), 1 / 60, s);
    if (b.beat > 0) times.push(i / 60);
  }
  assert.ok(times.length > 1);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] > BEAT_GAP - 1e-9);
});

test('a 120 BPM kick gives a beat on every kick', () => {
  const s = createRhythm();
  let beats = 0;
  for (let f = 0; f < 60 * 8; f++) {
    const kick = f % 30 < 4; // a kick lasting 4 frames, every half second
    beats += readBands(spectrum(kick ? 230 : 15, 60, 30), 1 / 60, s).beat > 0 ? 1 : 0;
  }
  assert.ok(beats >= 15 && beats <= 16, `beats ${beats}`);
});

test('the spray colour follows the band that leads, turn by turn', () => {
  assert.equal(sprayColour({ bass: 1, mid: 0.2, treble: 0.1, beat: 1 }, 0), 'magenta');
  assert.equal(sprayColour({ bass: 1, mid: 0.2, treble: 0.1, beat: 1 }, 1), 'pink');
  assert.equal(sprayColour({ bass: 0.2, mid: 1, treble: 0.1, beat: 1 }, 1), 'lemon');
  assert.equal(sprayColour({ bass: 0.1, mid: 0.2, treble: 0.9, beat: 1 }, 0), 'sky');
  assert.equal(sprayColour({ bass: 0.1, mid: 0.2, treble: 0.9, beat: 1 }, 3), 'mint');
});
