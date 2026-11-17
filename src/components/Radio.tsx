import { useEffect, useMemo, useRef, useState } from 'react';
import { useRecentStations } from '../data/radio.ts';
import {
  allCountries, clearGenres, toggleAllGenres, toggleCountry, toggleCountryOn, toggleGenre, toggleOn, toggleYours,
  useRadioPrefs, useSavedStations,
} from '../data/radioStore.ts';
import { cleanGenre, countryCounts, countryFromLanguage, genreCounts, hasSelection } from '../lib/radio.ts';

// Radio's stickers (feat-radio §RA5): Your stations, All genres and your genre stickers, + genres; All countries and
// your country stickers, + countries. A sticker turns on or off, several at once; nothing is on until you pick.

const regionNames = (() => {
  try { return new Intl.DisplayNames([navigator.language], { type: 'region' }); } catch { return null; }
})();
function countryName(code: string): string {
  try { return regionNames?.of(code) ?? code; } catch { return code; }
}

const TONES = ['mint', 'pink', 'sky', 'lilac', 'peach'] as const;

// The strip scrolls sideways; its scroll bar is hidden (it cannot be reached on a phone or with a remote), so a
// little slider under it moves it (zapa, RA5). 0..1000 = start..end; it follows the strip when it scrolls itself.
// `version` changes when the stickers do (a new sticker widens the strip without resizing it).
function useStripScroll(ref: React.RefObject<HTMLDivElement | null>, version: string) {
  const [state, setState] = useState({ at: 0, overflow: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const room = el.scrollWidth - el.clientWidth;
      setState({ overflow: room > 2, at: room > 0 ? Math.round((el.scrollLeft / room) * 1000) : 0 });
    };
    read();
    el.addEventListener('scroll', read, { passive: true });
    const seen = new ResizeObserver(read);
    seen.observe(el);
    for (const child of Array.from(el.children)) seen.observe(child);
    return () => { el.removeEventListener('scroll', read); seen.disconnect(); };
  }, [ref, version]);
  const to = (value: number) => {
    const el = ref.current;
    if (el) el.scrollLeft = (value / 1000) * (el.scrollWidth - el.clientWidth);
  };
  return { ...state, to };
}
const SHOW_GENRES = 60;
const SHOW_COUNTRIES = 40;

export function RadioBar() {
  const prefs = useRadioPrefs();
  const [picking, setPicking] = useState(false);
  // Until you have genre stickers, the picker opens by itself when Radio opens.
  const opened = useRef(false);
  useEffect(() => {
    if (!opened.current && prefs.genres.length === 0 && !hasSelection(prefs)) setPicking(true);
    opened.current = true;
  }, [prefs]);
  const allCountriesOn = prefs.countriesOn.length === 0;
  const bar = useRef<HTMLDivElement>(null);
  const scroll = useStripScroll(bar, `${prefs.genres.join()}|${prefs.countries.join()}`);
  return (
    <>
      <div className="radio-dash">
      <div className="radio-bar" role="group" aria-label="Radio: genres and countries" ref={bar}>
        <button type="button" className="radio-chip c-butter radio-word" data-nav aria-pressed={prefs.yours} onClick={toggleYours}>Your stations</button>
        <button type="button" className="radio-chip radio-all" data-nav aria-pressed={prefs.allGenres} onClick={toggleAllGenres}>All genres</button>
        {prefs.genres.map((g, i) => (
          <button key={g} type="button" className={`radio-chip c-${TONES[i % TONES.length]}`} data-nav aria-pressed={prefs.on.includes(g)} onClick={() => toggleOn(g)}>{g}</button>
        ))}
        <button type="button" className="radio-chip radio-add" data-nav onClick={() => setPicking(true)}>+ genres</button>
        <span className="radio-gap" aria-hidden="true" />
        <button type="button" className="radio-chip radio-all radio-word" data-nav aria-pressed={allCountriesOn} onClick={allCountries}>All countries</button>
        {prefs.countries.map(c => (
          <button key={c} type="button" className="radio-chip radio-country radio-word" data-nav aria-pressed={prefs.countriesOn.includes(c)} onClick={() => toggleCountryOn(c)}>{countryName(c)}</button>
        ))}
        <button type="button" className="radio-chip radio-add radio-word" data-nav onClick={() => setPicking(true)}>+ countries</button>
      </div>
      {scroll.overflow && (
        <input type="range" className="radio-slider" data-nav aria-label="Scroll the genres and countries" min={0} max={1000} step={10}
          value={scroll.at} onChange={e => scroll.to(Number(e.target.value))} />
      )}
      </div>
      {picking && <RadioPicker onClose={() => setPicking(false)} />}
    </>
  );
}

function RadioPicker({ onClose }: { onClose: () => void }) {
  const prefs = useRadioPrefs();
  const recent = useRecentStations(true);
  const saved = useSavedStations();
  const [query, setQuery] = useState('');
  const box = useRef<HTMLDivElement>(null);

  const seen = useMemo(() => [...recent, ...saved], [recent, saved]);
  const genres = useMemo(() => genreCounts(seen).map(g => g.genre), [seen]);
  const q = cleanGenre(query);
  const shown = (q ? genres.filter(g => g.includes(q)) : genres).filter(g => !prefs.genres.includes(g)).slice(0, SHOW_GENRES);
  const mine = useMemo(() => countryFromLanguage(navigator.language), []);
  const countries = useMemo(() => {
    const list = countryCounts(seen).map(c => c.country);
    return (mine ? [mine, ...list.filter(c => c !== mine)] : list).filter(c => !prefs.countries.includes(c));
  }, [seen, mine, prefs.countries]);

  // Opens on its search box (feat-tv-remote TV1-1); it stays shut until OK (TV4), so no keyboard pops up.
  useEffect(() => { (box.current?.querySelector<HTMLElement>('input[data-nav]') ?? box.current?.querySelector<HTMLElement>('[data-nav]'))?.focus(); }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  };
  const add = (word: string) => { if (word && !prefs.genres.includes(word)) toggleGenre(word); setQuery(''); };

  return (
    <div className="radio-picker-back" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="radio-picker" role="dialog" aria-modal="true" aria-label="Genres and countries" data-nav-modal ref={box} onKeyDown={onKey}>
        <header>
          <h2>Genres</h2>
          <button type="button" className="chip-btn solid" data-nav onClick={onClose}>Done</button>
        </header>
        <div className="radio-genres" role="group" aria-label="Your genres: press to turn on or off">
          <button type="button" className="radio-chip radio-all" data-nav aria-pressed={prefs.allGenres} onClick={toggleAllGenres}>All genres</button>
          <button type="button" className="radio-chip radio-add" data-nav onClick={clearGenres}>Clear</button>
          {prefs.genres.map((g, i) => (
            <span key={g} className="radio-pair">
              <button type="button" className={`radio-chip c-${TONES[i % TONES.length]}`} data-nav aria-pressed={prefs.on.includes(g)} onClick={() => toggleOn(g)}>{g}</button>
              <button type="button" className="radio-x" data-nav aria-label={`Take ${g} off your stickers`} onClick={() => toggleGenre(g)}>✕</button>
            </span>
          ))}
        </div>
        <input className="radio-search" type="search" data-nav data-nav-start="1" placeholder="Find a genre, or type any word (bitcoin, salsa…)" aria-label="Find a genre or type a word"
          value={query} maxLength={40} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(q); }} />
        <div className="radio-genres" role="group" aria-label="Genres, commonest first: press to add">
          {q && !genres.includes(q) && !prefs.genres.includes(q) && (
            <button type="button" className="radio-chip radio-add" data-nav onClick={() => add(q)}>+ {q}</button>
          )}
          {shown.map(g => (
            <button key={g} type="button" className="radio-chip" data-nav onClick={() => add(g)}>+ {g}</button>
          ))}
          {genres.length === 0 && !q && <p className="radio-wait">Asking the relay for its stations…</p>}
        </div>
        <h3>Countries</h3>
        <div className="radio-genres" role="group" aria-label="Your countries: press to turn on or off">
          <button type="button" className="radio-chip radio-all radio-word" data-nav aria-pressed={prefs.countriesOn.length === 0} onClick={allCountries}>All countries</button>
          {prefs.countries.map(c => (
            <span key={c} className="radio-pair">
              <button type="button" className="radio-chip radio-country radio-word" data-nav aria-pressed={prefs.countriesOn.includes(c)} onClick={() => toggleCountryOn(c)}>{countryName(c)}</button>
              <button type="button" className="radio-x" data-nav aria-label={`Take ${countryName(c)} off your stickers`} onClick={() => toggleCountry(c)}>✕</button>
            </span>
          ))}
        </div>
        <div className="radio-genres" role="group" aria-label="Countries, yours first: press to add">
          {countries.slice(0, SHOW_COUNTRIES).map(c => (
            <button key={c} type="button" className="radio-chip radio-word" data-nav onClick={() => toggleCountry(c)}>+ {countryName(c)}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
