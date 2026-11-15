import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePictures, reviveEntry } from './pictureCache.ts';
import { mediaFilters } from './mediaFilters.ts';
import type { MediaItem } from './media.ts';

const pic = (n: number, url = `https://img.example/${n}.jpg`): MediaItem => ({ id: `nostr:${n}`, kind: 'image', origin: 'nostr', url, title: '', createdAt: n });

test('the cache keeps the newest pictures, one per URL, up to its size', () => {
  const merged = mergePictures([pic(1), pic(2)], [pic(3), pic(2, 'https://img.example/2.jpg')], 2);
  assert.deepEqual(merged.map(p => p.createdAt), [3, 2]);
  assert.equal(mergePictures([pic(1)], []).length, 1);
});

test('stored entries are read back as untrusted', () => {
  assert.equal(reviveEntry({ id: 'x', url: 'javascript:alert(1)', createdAt: 1 }), null);
  assert.equal(reviveEntry({ id: 'x', url: 'https://ok/p.jpg', createdAt: 'soon' }), null);
  assert.equal(reviveEntry('junk'), null);
  const ok = reviveEntry({ id: 'x', url: 'https://ok/p.jpg', createdAt: 5, title: 'y'.repeat(500), pubkey: 'not hex', hashtags: ['art', 7] });
  assert.equal(ok?.url, 'https://ok/p.jpg');
  assert.ok((ok?.title.length ?? 999) <= 160, 'title clipped');
  assert.equal(ok?.pubkey, undefined, 'a malformed pubkey is dropped');
  assert.deepEqual(ok?.hashtags, ['art']);
});

test('older pictures are asked for with until, notes apart from the media kinds', () => {
  const authors = Array.from({ length: 150 }, (_, i) => i.toString(16).padStart(64, '0'));
  const f = mediaFilters([1, 20, 1063], authors, ['art'], 1000);
  assert.equal(f.length, 5, 'two author groups x (media kinds + notes) + one hashtag filter');
  assert.ok(f.every(x => x.until === 1000));
  assert.deepEqual(f[0].kinds, [20, 1063]);
  assert.deepEqual(f[1].kinds, [1]);
  assert.equal(mediaFilters([20], [], [])[0], undefined, 'nobody and no hashtag: no request');
  assert.equal('until' in mediaFilters([20], authors.slice(0, 1), [])[0], false, 'no until for the live feed');
});
