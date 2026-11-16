// RSS / Atom podcast and music feeds. Everything in a feed is untrusted: sizes,
// counts and string lengths are capped, only http(s) enclosure URLs are kept,
// and titles are plain text (React escapes them on render). The XML is read by xmlLite (no DTD, no
// entity expansion), so this file is pure and tested under node (rssFeed.test.ts).

import { descendants, firstDescendant, parseXml, textOf, XmlError, type XmlElement } from './xmlLite.ts';

export interface FeedItem {
  guid: string;
  title: string;
  url: string;
  pubDate: number; // unix seconds
  duration?: string; // "1234", "MM:SS" or "HH:MM:SS", as the feed gives it
  image?: string;
}

export interface ParsedFeed {
  title: string;
  items: FeedItem[];
}

const MAX_FEED_CHARS = 20 * 1024 * 1024;
const MAX_ITEMS = 100;
const MAX_TEXT = 200;
const FETCH_TIMEOUT_MS = 15000;
const AUDIO_EXT = /\.(mp3|m4a|ogg|opus|aac|wav|flac)$/i;

function clip(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function childText(parent: XmlElement, tag: string): string {
  return clip(textOf(firstDescendant(parent, tag)));
}

function looksLikeAudio(url: string, mime: string | null): boolean {
  if (mime && mime.toLowerCase().startsWith('audio/')) return true;
  try {
    return AUDIO_EXT.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function parseDate(value: string): number {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

export function parseFeed(xml: string): ParsedFeed {
  let doc: XmlElement;
  try {
    doc = parseXml(xml);
  } catch (error) {
    if (error instanceof XmlError) throw new Error('Not a valid feed');
    throw error;
  }

  const channel = doc.name === 'channel' ? doc : firstDescendant(doc, 'channel') ?? doc;
  const feedTitle = childText(channel, 'title');
  const feedImage = firstDescendant(channel, 'itunes:image')?.attrs.href;
  const items: FeedItem[] = [];

  const entries = [doc, ...descendants(doc, 'item')].filter(e => e.name === 'item')
    .concat([doc, ...descendants(doc, 'entry')].filter(e => e.name === 'entry'));
  for (const entry of entries) {
    let url: string | null = null;
    let mime: string | null = null;

    const enclosure = firstDescendant(entry, 'enclosure');
    if (enclosure) {
      url = enclosure.attrs.url ?? null;
      mime = enclosure.attrs.type ?? null;
    } else {
      // Atom: <link rel="enclosure" href="..." type="audio/mpeg"/>
      for (const link of descendants(entry, 'link')) {
        if (link.attrs.rel === 'enclosure') {
          url = link.attrs.href ?? null;
          mime = link.attrs.type ?? null;
          break;
        }
      }
    }

    if (!isHttpUrl(url) || !looksLikeAudio(url, mime)) continue;

    const imageHref = firstDescendant(entry, 'itunes:image')?.attrs.href;
    const dateText = childText(entry, 'pubDate') || childText(entry, 'published') || childText(entry, 'updated');
    items.push({
      guid: clip(childText(entry, 'guid') || childText(entry, 'id') || url),
      title: childText(entry, 'title') || '(untitled)',
      url,
      pubDate: parseDate(dateText),
      duration: childText(entry, 'itunes:duration') || undefined,
      image: isHttpUrl(imageHref) ? imageHref : isHttpUrl(feedImage) ? feedImage : undefined,
    });
    if (items.length >= MAX_ITEMS) break;
  }

  return { title: feedTitle, items };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_FEED_CHARS) throw new Error('Feed too large');
  return text;
}

// Direct first (works for feeds that allow cross-origin reads), then through the
// same-origin proxy (see server/rssProxy.ts) for the many that do not.
export async function loadFeed(url: string): Promise<ParsedFeed> {
  if (!isHttpUrl(url)) throw new Error('Feed URL must start with http:// or https://');
  let text: string;
  try {
    text = await fetchText(url);
  } catch (directError) {
    console.log('[rssFeed] Direct fetch failed, trying proxy:', directError);
    text = await fetchText(`/api/rss?url=${encodeURIComponent(url)}`);
  }
  return parseFeed(text);
}
