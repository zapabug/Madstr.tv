import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFeed } from './rssFeed.ts';

// Cut from real feeds on 2026-11-16 (channel header + the first items, closed again); not edited otherwise.
const feed = (name: string) => readFileSync(new URL(`./fixtures/feeds/${name}`, import.meta.url), 'utf8');

test('a podcast feed (Darknet Diaries, PRX): titles, mp3 links, dates, durations, episode art', () => {
  const { title, items } = parseFeed(feed('darknet-diaries.rss.xml'));
  assert.equal(title, 'Darknet Diaries');
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    guid: 'prx_7057_c0abbff3-ae98-4e23-a389-5ee0fd824f51',
    title: '182: Blackshades',
    url: 'https://www.podtrac.com/pts/redirect.mp3/dovetail.prxu.org/7057/c0abbff3-ae98-4e23-a389-5ee0fd824f51/darknet-diaries-ep182-blackshades.mp3',
    pubDate: 1793692800,
    duration: '39:17',
    image: 'https://f.prxu.org/7057/c0abbff3-ae98-4e23-a389-5ee0fd824f51/images/2a7a8a4b-7f32-4d33-8c82-f624ac181eeb/Ep182_BlackshadesSquare.jpg',
  });
  assert.equal(items[1].duration, '01:20:15');
});

test('a podcast feed whose enclosure link has &amp; in it (NPR Planet Money) gets plain & back', () => {
  const { title, items } = parseFeed(feed('npr.rss.xml'));
  assert.equal(title, 'Planet Money');
  assert.equal(items.length, 2);
  assert.match(items[0].url, /^https:\/\/tracking\.swap\.fm\/.*\/default\.mp3\?awCollectionId=[^&]+&awEpisodeId=/);
  assert.ok(!items[0].url.includes('&amp;'));
  assert.equal(items[0].duration, '2470');
});

test('a Wavlake album feed (CDATA titles, op3 prefixed mp3) gives its track with the album art', () => {
  const { title, items } = parseFeed(feed('wavlake-album.rss.xml'));
  assert.equal(title, 'The Prayer of St. Francis');
  assert.deepEqual(items, [{
    guid: '6baa5e31-8fc4-4960-b0d0-98303d6a6ad5',
    title: 'The Prayer of St. Francis',
    url: 'https://op3.dev/e,pg=37844ae6-7303-53d2-a733-aed9585d253f/https://d12wklypp119aj.cloudfront.net/track/6baa5e31-8fc4-4960-b0d0-98303d6a6ad5.mp3',
    pubDate: 1730564498,
    duration: '00:03:24',
    image: 'https://d12wklypp119aj.cloudfront.net/image/3d9e23b0-e723-45b9-9ec1-aa65873afdcf.jpg',
  }]);
});

test('an Atom feed with videos and no audio (YouTube) has its title and no items', () => {
  assert.deepEqual(parseFeed(feed('youtube.atom.xml')), { title: 'MrBeast', items: [] });
});

test('an Atom entry with an audio enclosure link is kept', () => {
  const xml = '<feed xmlns="http://www.w3.org/2005/Atom"><title>A</title><entry><id>tag:a,1</id><title>One</title>'
    + '<updated>2026-11-01T10:00:00Z</updated><link rel="alternate" href="https://a.test/1"/>'
    + '<link rel="enclosure" type="audio/mpeg" href="https://a.test/1.mp3"/></entry></feed>';
  assert.deepEqual(parseFeed(xml).items, [{ guid: 'tag:a,1', title: 'One', url: 'https://a.test/1.mp3', pubDate: 1793527200, duration: undefined, image: undefined }]);
});

test('untrusted input: only http(s) audio links, clipped text, no HTML rendered, at most 100 items', () => {
  const xml = '<rss><channel><title>' + 'x'.repeat(500) + '</title>'
    + '<item><title>js</title><enclosure url="javascript:alert(1)" type="audio/mpeg"/></item>'
    + '<item><title>video</title><enclosure url="https://a.test/v.mp4" type="video/mp4"/></item>'
    + '<item><title><![CDATA[<b>bold</b>]]></title><enclosure url="https://a.test/a.mp3"/></item>'
    + '<item><enclosure url="https://a.test/no-title.ogg"/></item>'
    + Array.from({ length: 120 }, (_, k) => `<item><title>${k}</title><enclosure url="https://a.test/${k}.m4a"/></item>`).join('')
    + '</channel></rss>';
  const { title, items } = parseFeed(xml);
  assert.equal(title.length, 200);
  assert.equal(items.length, 100);
  assert.equal(items[0].title, '<b>bold</b>'); // text, never markup
  assert.equal(items[1].title, '(untitled)');
  assert.ok(items.every(i => i.url.startsWith('https://')));
});

test('an entity bomb is not expanded, and a page or a broken file is not a feed', () => {
  const bomb = '<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]>'
    + '<rss><channel><title>&b;</title></channel></rss>';
  assert.equal(parseFeed(bomb).title, '&b;');
  assert.throws(() => parseFeed('<!doctype html><html><body><p>gone<br></p></body></html>'), /Not a valid feed/);
  assert.throws(() => parseFeed('<rss><channel><title>a</channel></rss>'), /Not a valid feed/);
  assert.throws(() => parseFeed('Feed returned HTTP 404'), /Not a valid feed/);
});
