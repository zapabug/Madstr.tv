import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, toHash, isTheater, BOARD, type Route } from './route.ts';

test('every viewer route round-trips through the hash', () => {
  const routes: Route[] = [
    { page: 'viewer', mode: 'listen', filter: 'music' },
    { page: 'viewer', mode: 'listen', filter: 'podcasts' },
    { page: 'viewer', mode: 'listen', filter: 'local' },
    { page: 'viewer', mode: 'watch', filter: 'continue' },
    { page: 'viewer', mode: 'watch', filter: 'short' },
    { page: 'viewer', mode: 'watch', filter: 'long' },
    { page: 'viewer', mode: 'pictures', filter: 'mine' },
    { page: 'viewer', mode: 'people', filter: 'liked' },
    { page: 'viewer', mode: 'people', filter: 'follow' },
  ];
  for (const route of routes) assert.deepEqual(parseHash(toHash(route)), route);
});

test('the board is the empty hash, "#" and "#/"', () => {
  assert.deepEqual(parseHash(''), BOARD);
  assert.deepEqual(parseHash('#'), BOARD);
  assert.deepEqual(parseHash('#/'), BOARD);
  assert.equal(toHash(BOARD), '#/');
});

test('unknown or malformed hashes fall back to the board', () => {
  for (const hash of ['#/nope', '#/listen', '#/listen/', '#/listen/jazz', '#/watch/music', '#/listen/music/extra', '#/pictures/theirs', '#//listen//music//x', '%00']) {
    assert.deepEqual(parseHash(hash), BOARD, hash);
  }
});

test('a filter from another mode is not accepted', () => {
  assert.deepEqual(parseHash('#/listen/short'), BOARD);
  assert.deepEqual(parseHash('#/watch/podcasts'), BOARD);
  assert.deepEqual(parseHash('#/people/music'), BOARD);
});

test('everything but the board and the follow page is the theatre', () => {
  assert.equal(isTheater(BOARD), false);
  assert.equal(isTheater({ page: 'viewer', mode: 'people', filter: 'follow' }), false);
  assert.equal(isTheater({ page: 'viewer', mode: 'people', filter: 'liked' }), true);
  assert.equal(isTheater({ page: 'viewer', mode: 'listen', filter: 'music' }), true);
  assert.equal(isTheater({ page: 'viewer', mode: 'watch', filter: 'short' }), true);
  assert.equal(isTheater({ page: 'viewer', mode: 'pictures', filter: 'mine' }), true);
});
