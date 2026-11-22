// What the lava lamp hears (spec feat-lava-lamp LL2): three bands from the spectrum, each scaled to its own recent
// peak, a beat when the bass jumps, and the colours a spray takes from the sound. Pure: it reads a spectrum, it never
// touches audio itself.

export const BASS: readonly [number, number] = [2, 12]; // FFT 2048 bins: about 47-280 Hz at 48 kHz
export const MID: readonly [number, number] = [12, 93]; // about 280 Hz - 2.2 kHz
export const TREBLE: readonly [number, number] = [93, 372]; // about 2.2 - 8.7 kHz
export const PEAK_DECAY = 0.2; // per second: how fast a band forgets its loudest moment
export const PEAK_FLOOR = 0.08; // so silence never counts as loud
export const BEAT_RISE = 1.2;
export const BEAT_MARGIN = 0.03;
export const BEAT_GAP = 0.28; // seconds: at most one beat in this long
export const AVERAGE_RATE = 2.5; // per second: the bass's running average

export interface Bands { bass: number; mid: number; treble: number; beat: number }
export interface RhythmState { peak: { bass: number; mid: number; treble: number }; average: number; lastBeat: number; t: number }

export const SILENT: Bands = { bass: 0, mid: 0, treble: 0, beat: 0 };

export function createRhythm(): RhythmState {
  return { peak: { bass: 0.2, mid: 0.2, treble: 0.1 }, average: 0, lastBeat: -Infinity, t: 0 };
}

function band(bins: ArrayLike<number>, [lo, hi]: readonly [number, number]): number {
  let s = 0;
  const top = Math.min(hi, bins.length);
  for (let i = lo; i < top; i++) s += bins[i];
  return top > lo ? s / ((top - lo) * 255) : 0;
}

// One frame: bins are the analyser's byte spectrum (0-255), dt the seconds since the last frame. Each band comes
// back 0-1 against its own recent peak; beat is 0, or 0.4-1 on the frame a beat lands. The state is updated.
export function readBands(bins: ArrayLike<number>, dt: number, s: RhythmState): Bands {
  s.t += dt;
  const raw = { bass: band(bins, BASS), mid: band(bins, MID), treble: band(bins, TREBLE) };
  const out: Bands = { bass: 0, mid: 0, treble: 0, beat: 0 };
  for (const k of ['bass', 'mid', 'treble'] as const) {
    s.peak[k] = Math.max(raw[k], s.peak[k] * Math.exp(-dt * PEAK_DECAY), PEAK_FLOOR);
    out[k] = Math.min(1, Math.max(0, (raw[k] / s.peak[k] - 0.35) / 0.65));
  }
  if (raw.bass > s.average * BEAT_RISE + BEAT_MARGIN && s.t - s.lastBeat > BEAT_GAP) {
    out.beat = Math.min(1, 0.4 + out.bass);
    s.lastBeat = s.t;
  }
  s.average += (raw.bass - s.average) * (1 - Math.exp(-dt * AVERAGE_RATE));
  return out;
}

// The lamp's colours, Jukestr 3000 palette.
export const LAMP_COLOURS = {
  orange: [1, 0.478, 0.239],
  pink: [0.941, 0.31, 0.627],
  mint: [0.4, 0.851, 0.651],
  lilac: [0.663, 0.549, 0.941],
  magenta: [0.863, 0.004, 0.753],
  lemon: [0.83, 0.72, 0.38],
  sky: [0.52, 0.62, 0.85],
} as const satisfies Record<string, readonly [number, number, number]>;
export type LampColour = keyof typeof LAMP_COLOURS;

export const BASE_COLOURS: readonly LampColour[] = ['orange', 'pink', 'mint', 'lilac'];
const GROUPS: Record<'bass' | 'mid' | 'treble', readonly LampColour[]> = {
  bass: ['magenta', 'pink', 'orange'],
  mid: ['orange', 'lemon', 'lilac'],
  treble: ['sky', 'mint'],
};

// LL2-3: a spray's ink is a pair: the band that leads (treble a little favoured, it is quieter) chooses the group,
// turn by turn within it, and the spray takes that colour at its core with its neighbour in the group at the rim.
// The pair is what makes the mixing: a single spray already paints a gradient, and where two sprays meet, core into
// rim and rim into core, the hues walk through each other instead of sitting side by side.
export function sprayInk(b: Bands, n: number, band?: 'bass' | 'mid' | 'treble'): { core: LampColour; rim: LampColour } {
  const lead = band ?? (b.treble * 1.2 >= b.bass && b.treble * 1.2 >= b.mid * 0.9 ? 'treble' : b.bass >= b.mid * 0.9 ? 'bass' : 'mid');
  const group = GROUPS[lead];
  const i = ((n % group.length) + group.length) % group.length;
  return { core: group[i], rim: group[(i + 1) % group.length] };
}

// Kept for callers that want a single colour (LL2-3): the core of the n-th spray's ink.
export function sprayColour(b: Bands, n: number): LampColour {
  return sprayInk(b, n).core;
}
