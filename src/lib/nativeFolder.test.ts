import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_LOCAL_FILES } from './localFolder.ts';
import { LOCAL_PREFIX, localFileUrl, nativeErrorText, NO_ACCESS_TEXT, NO_PICKER_TEXT, tracksFromEntries } from './nativeFolder.ts';

const doc = 'content://com.android.externalstorage.documents/tree/primary%3AMusic/document/primary%3AMusic%2Fá b.mp3';

test('localFileUrl: base64url of the UTF-8 uri, no padding, decodes back', () => {
  const url = localFileUrl(doc);
  assert.ok(url.startsWith(LOCAL_PREFIX));
  const enc = url.slice(LOCAL_PREFIX.length);
  assert.match(enc, /^[A-Za-z0-9_-]+$/);
  assert.equal(Buffer.from(enc, 'base64url').toString('utf8'), doc);
});

test('tracksFromEntries: keeps the kind, sorts by path, makes stable ids and local urls', () => {
  const tracks = tracksFromEntries('dir-1', [
    { uri: doc.replace('á b', 'Track 10'), path: 'B/Track 10.mp3', name: 'Track 10.mp3', mime: 'audio/mpeg', modified: 5 },
    { uri: doc.replace('á b', 'Track 2'), path: 'B/Track 2.mp3', name: 'Track 2.mp3', mime: 'audio/mpeg', modified: 0 },
    { uri: doc.replace('á b', 'cover'), path: 'B/cover.jpg', name: 'cover.jpg', mime: 'image/jpeg', modified: 1 },
    { uri: doc.replace('á b', 'Voice'), path: 'A/Voice', name: 'Voice', mime: 'audio/ogg', modified: 1 },
  ], 'audio');
  assert.deepEqual(tracks.map(t => t.id), ['dir-1:A/Voice', 'dir-1:B/Track 2.mp3', 'dir-1:B/Track 10.mp3']);
  assert.deepEqual(tracks.map(t => t.title), ['Voice', 'Track 2', 'Track 10']);
  assert.ok(tracks.every(t => t.url?.startsWith(LOCAL_PREFIX) && t.kind === 'audio' && !t.file));
  assert.equal(tracks[2].modified, 5);
});

test('tracksFromEntries: untrusted entries are dropped', () => {
  const bad = [null, 1, 'x', {}, { uri: 'file:///sdcard/a.mp3', name: 'a.mp3' }, { uri: 'https://x/a.mp3', name: 'a.mp3' },
    { uri: doc, name: '' }, { uri: doc, name: 42 }, { uri: doc, name: 'notes.txt', mime: 'text/plain' }];
  assert.deepEqual(tracksFromEntries('d', bad, 'audio'), []);
  assert.deepEqual(tracksFromEntries('d', 'nope', 'audio'), []);
  const odd = tracksFromEntries('d', [{ uri: doc, name: 'a.mp3', path: 7, modified: Number.NaN }], 'audio');
  assert.deepEqual(odd.map(t => [t.id, t.modified]), [['d:a.mp3', 0]]);
});

test('tracksFromEntries: at most MAX_LOCAL_FILES', () => {
  const many = Array.from({ length: MAX_LOCAL_FILES + 50 }, (_, i) => ({ uri: `${doc}${i}`, path: `${i}.mp3`, name: `${i}.mp3`, mime: '', modified: 0 }));
  assert.equal(tracksFromEntries('d', many, 'audio').length, MAX_LOCAL_FILES);
});

test('nativeErrorText: plugin codes become the spec texts', () => {
  assert.equal(nativeErrorText({ code: 'NO_ACCESS' }, 'x'), NO_ACCESS_TEXT);
  assert.equal(nativeErrorText({ code: 'NO_PICKER' }, 'x'), NO_PICKER_TEXT);
  assert.equal(nativeErrorText(new Error('boom'), 'Could not read this folder'), 'Could not read this folder');
  assert.equal(nativeErrorText(null, 'f'), 'f');
});
