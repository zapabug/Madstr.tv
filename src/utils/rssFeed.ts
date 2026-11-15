// RSS / Atom podcast and music feeds. Everything in a feed is untrusted: sizes,
// counts and string lengths are capped, only http(s) enclosure URLs are kept,
// and titles are plain text (React escapes them on render).

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

function childText(parent: Element, tag: string): string {
  return clip(parent.getElementsByTagName(tag)[0]?.textContent);
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
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('Not a valid feed');

  const channel = doc.getElementsByTagName('channel')[0] ?? doc.documentElement;
  const feedTitle = childText(channel, 'title');
  const feedImage = channel.getElementsByTagName('itunes:image')[0]?.getAttribute('href');
  const items: FeedItem[] = [];

  const entries = Array.from(doc.getElementsByTagName('item')).concat(Array.from(doc.getElementsByTagName('entry')));
  for (const entry of entries) {
    let url: string | null = null;
    let mime: string | null = null;

    const enclosure = entry.getElementsByTagName('enclosure')[0];
    if (enclosure) {
      url = enclosure.getAttribute('url');
      mime = enclosure.getAttribute('type');
    } else {
      // Atom: <link rel="enclosure" href="..." type="audio/mpeg"/>
      for (const link of Array.from(entry.getElementsByTagName('link'))) {
        if (link.getAttribute('rel') === 'enclosure') {
          url = link.getAttribute('href');
          mime = link.getAttribute('type');
          break;
        }
      }
    }

    if (!isHttpUrl(url) || !looksLikeAudio(url, mime)) continue;

    const imageHref = entry.getElementsByTagName('itunes:image')[0]?.getAttribute('href');
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
