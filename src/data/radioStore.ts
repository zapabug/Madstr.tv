import { useSyncExternalStore } from 'react';
import type { MediaItem } from '../lib/media.ts';
import {
  DEFAULT_PREFS, RADIO_PREFS_KEY, SAVED_KEY, newestSaved, parsePrefs, parseSaved, savedList,
  type RadioPrefs, type SavedStation,
} from '../lib/radio.ts';

// Radio's choices on this device (feat-radio §RA2, §RA4): your genre stickers, the country, the sticker that is
// open, and Your stations (saved with an up vote). localStorage, read back through the pure parsers in lib/radio.ts.

function read<T>(key: string, parse: (_raw: unknown) => T, fallback: T): T {
  try { return parse(JSON.parse(localStorage.getItem(key) ?? 'null')); } catch { return fallback; }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked: this session only */ }
}

function makeStore<T>(key: string, parse: (_raw: unknown) => T, fallback: T) {
  let value: T | null = null;
  const listeners = new Set<() => void>();
  const get = (): T => (value ??= read(key, parse, fallback));
  const set = (change: (_v: T) => T) => {
    value = change(get());
    write(key, value);
    listeners.forEach(fn => fn());
  };
  const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
  const use = (): T => useSyncExternalStore(subscribe, get, get);
  return { get, set, use };
}

const prefs = makeStore<RadioPrefs>(RADIO_PREFS_KEY, parsePrefs, DEFAULT_PREFS);
const saved = makeStore<Record<string, SavedStation>>(SAVED_KEY, parseSaved, {});

export const useRadioPrefs = prefs.use;
export const getRadioPrefs = prefs.get;

// Selecting (spec RA5): a sticker turns on or off, several at once; All genres turns every genre on and the single
// ones off; All countries is on when no single country is.
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

export function toggleOn(genre: string): void {
  prefs.set(p => parsePrefs({ ...p, allGenres: false, on: toggle(p.on, genre) }));
}
export function toggleAllGenres(): void {
  prefs.set(p => parsePrefs({ ...p, allGenres: !p.allGenres, on: [] }));
}
export function clearGenres(): void {
  prefs.set(p => parsePrefs({ ...p, allGenres: false, on: [], yours: false }));
}
export function toggleYours(): void {
  prefs.set(p => parsePrefs({ ...p, yours: !p.yours }));
}
/** Add a word to your genre stickers (turned on), or take it away. */
export function toggleGenre(genre: string): void {
  prefs.set(p => {
    const has = p.genres.includes(genre);
    return parsePrefs({ ...p, genres: toggle(p.genres, genre), on: has ? p.on.filter(g => g !== genre) : [...p.on, genre], allGenres: has ? p.allGenres : false });
  });
}
export function toggleCountryOn(country: string): void {
  prefs.set(p => parsePrefs({ ...p, countriesOn: toggle(p.countriesOn, country) }));
}
export function allCountries(): void {
  prefs.set(p => parsePrefs({ ...p, countriesOn: [] }));
}
/** Add a country to your country stickers (turned on), or take it away. */
export function toggleCountry(country: string): void {
  prefs.set(p => {
    const has = p.countries.includes(country);
    return parsePrefs({ ...p, countries: toggle(p.countries, country), countriesOn: has ? p.countriesOn.filter(c => c !== country) : [...p.countriesOn, country] });
  });
}

let savedListCache: { from: Record<string, SavedStation>; list: MediaItem[] } | null = null;
/** Your stations, the newest saved first. */
export function useSavedStations(): MediaItem[] {
  const all = saved.use();
  if (savedListCache?.from !== all) savedListCache = { from: all, list: savedList(all) };
  return savedListCache.list;
}
export function isSaved(id: string): boolean {
  return id in saved.get();
}
export function saveStation(item: MediaItem): void {
  saved.set(s => newestSaved({ ...s, [item.id]: { at: Date.now(), item } }));
}
export function unsaveStation(id: string): void {
  saved.set(s => {
    if (!(id in s)) return s;
    const { [id]: _gone, ...rest } = s;
    return rest;
  });
}
