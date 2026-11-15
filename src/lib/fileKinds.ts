// Which local files count as what. Pure, so it is unit tested without a browser.
export type LocalKind = 'audio' | 'image';

export const AUDIO_EXT = /\.(mp3|m4a|ogg|opus|aac|wav|flac)$/i;
export const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;

export function matchesKind(name: string, mime: string, kind: LocalKind): boolean {
  if (kind === 'audio') return AUDIO_EXT.test(name) || mime.startsWith('audio/');
  return IMAGE_EXT.test(name) || mime.startsWith('image/');
}

export function titleFromName(name: string): string {
  return name.replace(/\.[A-Za-z0-9]{2,5}$/, '').replace(/_+/g, ' ').trim().slice(0, 200) || name;
}
