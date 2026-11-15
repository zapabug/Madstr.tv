import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesKind, titleFromName } from './fileKinds.ts';

test('audio and picture files are told apart, case-insensitively', () => {
  assert.equal(matchesKind('Song.MP3', '', 'audio'), true);
  assert.equal(matchesKind('a.flac', '', 'audio'), true);
  assert.equal(matchesKind('x.bin', 'audio/mpeg', 'audio'), true, 'mime counts too');
  assert.equal(matchesKind('p.jpg', '', 'audio'), false);
  assert.equal(matchesKind('P.JPEG', '', 'image'), true);
  assert.equal(matchesKind('p.avif', '', 'image'), true);
  assert.equal(matchesKind('x', 'image/png', 'image'), true);
  assert.equal(matchesKind('notes.txt', '', 'image'), false);
  assert.equal(matchesKind('a.mp3', '', 'image'), false);
});

test('titles come from the file name', () => {
  assert.equal(titleFromName('My_Song.mp3'), 'My Song');
  assert.equal(titleFromName('holiday.2024.jpg'), 'holiday.2024');
  assert.equal(titleFromName('.mp3'), '.mp3', 'never returns an empty title');
});
