// The small pieces of player behaviour that are plain logic.

// Where "next" goes: the following item, or null at the end of the queue.
export function nextIndex(index: number, length: number): number | null {
  return index + 1 < length ? index + 1 : null;
}

// "Previous" restarts the item when it has been playing a while, like a CD player.
export function prevAction(position: number, index: number): 'restart' | 'previous' {
  return position > 5 || index <= 0 ? 'restart' : 'previous';
}

// Where to resume: not at the very start, and not inside the last seconds.
export function resumeTime(saved: number | undefined, duration: number): number {
  if (saved === undefined || !Number.isFinite(saved) || saved < 5) return 0;
  if (Number.isFinite(duration) && duration > 0 && saved > duration - 10) return 0;
  return saved;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export const RATES = [1, 1.25, 1.5, 2, 0.75] as const;

export function nextRate(rate: number): number {
  const i = RATES.findIndex(r => r === rate);
  return RATES[(i + 1) % RATES.length];
}

// Playback speed is remembered per queue label (Music, Podcasts, Short videos, …): people listen to
// podcasts fast and music at 1×, and asking them to re-set it every time the mode changes is rude.
export function rateKey(label: string): string {
  return `madstr:rate:${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
}

export function validRate(value: unknown): number | null {
  return typeof value === 'number' && (RATES as readonly number[]).includes(value) ? value : null;
}
