import test from 'node:test';
import assert from 'node:assert/strict';
import { askToRead, crossHost, parseMemory, remember, serializeMemory } from './readableHosts.ts';

const PAGE = 'https://localhost';

test('only another site\'s http(s) file needs asking', () => {
  assert.equal(crossHost('https://audio.nostr.build/a.mp3', PAGE), 'audio.nostr.build');
  assert.equal(crossHost('http://icecast.example:8000/live', PAGE), 'icecast.example:8000');
  assert.equal(crossHost('https://localhost/_capacitor_file_/song.mp3', PAGE), null);
  assert.equal(crossHost('blob:https://localhost/1234', PAGE), null);
  assert.equal(crossHost('data:audio/mp3;base64,AAAA', PAGE), null);
  assert.equal(crossHost('not a url', PAGE), null);
});

test('asks unless the host is remembered as refusing', () => {
  const memory = new Map([['storage.googleapis.com', false], ['archive.org', true]]);
  assert.equal(askToRead('https://storage.googleapis.com/wavlake/x.mp3', PAGE, memory), false);
  assert.equal(askToRead('https://archive.org/download/x.mp3', PAGE, memory), true);
  assert.equal(askToRead('https://new.example/x.mp3', PAGE, memory), true);
  assert.equal(askToRead('https://localhost/x.mp3', PAGE, memory), false);
});

test('remembers the newest answer last and drops the oldest past the cap', () => {
  let m = new Map<string, boolean>();
  m = remember(m, 'a', true, 2);
  m = remember(m, 'b', false, 2);
  m = remember(m, 'a', false, 2); // a again: now the newest
  m = remember(m, 'c', true, 2); // b is the oldest and goes
  assert.deepEqual([...m], [['a', false], ['c', true]]);
});

test('storage round-trips and junk is ignored', () => {
  const m = remember(remember(new Map(), 'x.example', true), 'y.example', false);
  assert.deepEqual(parseMemory(serializeMemory(m)), m);
  assert.deepEqual([...parseMemory('{"x":1}')], []);
  assert.deepEqual([...parseMemory('nope')], []);
  assert.deepEqual([...parseMemory('[["ok.example",true],[1,true],["bad","yes"]]')], [['ok.example', true]]);
  assert.deepEqual([...parseMemory(null)], []);
});
