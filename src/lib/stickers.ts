import { toHash, type Route } from './route.ts';

export type Lane = 'listen' | 'watch' | 'people';
export type Tone = 'mint' | 'pink' | 'sky' | 'butter' | 'lilac' | 'peach';
export type GlyphName = 'music' | 'podcasts' | 'local' | 'continue' | 'short' | 'long' | 'pictures' | 'follow';

// A sticker is a shortcut: where it goes is just a Route.
export interface Sticker {
  id: string;
  lane: Lane;
  route: Route;
  title: string;
  blurb: string;
  tag: string;
  tone: Tone;
  glyph: GlyphName;
  note?: string; // the yellow hand-written note; decoration, never data
}

export const STICKERS: readonly Sticker[] = [
  { id: 'music', lane: 'listen', route: { page: 'viewer', mode: 'listen', filter: 'music' },
    title: 'Music', blurb: 'Open straight to music.', tag: 'Listen', tone: 'mint', glyph: 'music' },
  { id: 'podcasts', lane: 'listen', route: { page: 'viewer', mode: 'listen', filter: 'podcasts' },
    title: 'Podcasts', blurb: 'Open to podcasts and episodes.', tag: 'Listen', tone: 'pink', glyph: 'podcasts' },
  { id: 'local', lane: 'listen', route: { page: 'viewer', mode: 'listen', filter: 'local' },
    title: 'Local', blurb: 'The files on this device, as their own playlist.', tag: 'Listen', tone: 'butter', glyph: 'local', note: 'your files' },
  { id: 'continue', lane: 'watch', route: { page: 'viewer', mode: 'watch', filter: 'continue' },
    title: 'Keep watching', blurb: 'Carry on from the last video.', tag: 'Watch', tone: 'sky', glyph: 'continue' },
  { id: 'short', lane: 'watch', route: { page: 'viewer', mode: 'watch', filter: 'short' },
    title: 'Short videos', blurb: 'Short videos only.', tag: 'Watch', tone: 'lilac', glyph: 'short' },
  { id: 'long', lane: 'watch', route: { page: 'viewer', mode: 'watch', filter: 'long' },
    title: 'Long videos', blurb: 'The long ones.', tag: 'Watch', tone: 'peach', glyph: 'long' },
  { id: 'pictures', lane: 'watch', route: { page: 'viewer', mode: 'pictures', filter: 'mine' },
    title: 'My pictures', blurb: 'Your own pictures, as slides.', tag: 'Watch', tone: 'mint', glyph: 'pictures', note: 'epic' },
  { id: 'follow', lane: 'people', route: { page: 'viewer', mode: 'people', filter: 'follow' },
    title: 'Follow more creators', blurb: 'Find podcast creators and follow in one press.', tag: 'People', tone: 'sky', glyph: 'follow', note: 'one press' },
];

export const LANES: readonly { id: Lane; label: string; sub: string }[] = [
  { id: 'listen', label: 'Listen', sub: 'player + podcasts' },
  { id: 'watch', label: 'Watch', sub: 'videos + pictures' },
  { id: 'people', label: 'People', sub: 'who you follow' },
];

export const hrefOf = (sticker: Sticker): string => toHash(sticker.route);
