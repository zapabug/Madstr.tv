import { useEffect, useMemo, useRef, useState } from 'react';
import { useGenreStations, useRecentStations } from '../data/radio.ts';
import { openSticker, setCountry, toggleGenre, useRadioPrefs, useSavedStations } from '../data/radioStore.ts';
import { cleanGenre, countryCounts, countryFromLanguage, genreCounts } from '../lib/radio.ts';

// Radio's stickers (feat-radio §RA2): Your stations first, then the genres you picked, in your order; a + genres
// sticker opens the picker; the country sticker says which country the stations are from.

const regionNames = (() => {
  try { return new Intl.DisplayNames([navigator.language], { type: 'region' }); } catch { return null; }
})();
function countryName(code: string): string {
  try { return regionNames?.of(code) ?? code; } catch { return code; }
}

export function RadioBar() {
  const prefs = useRadioPrefs();
  const [picking, setPicking] = useState(false);
  // Until you pick a genre, the picker opens by itself when Radio opens.
  const opened = useRef(false);
  useEffect(() => {
    if (!opened.current && prefs.genres.length === 0) setPicking(true);
    opened.current = true;
  }, [prefs.genres.length]);
  return (
    <>
      <div className="radio-bar" role="group" aria-label="Radio stickers">
        <button type="button" className="radio-chip c-butter" data-nav aria-pressed={prefs.sticker === 'yours'} onClick={() => openSticker('yours')}>Your stations</button>
        {prefs.genres.map((g, i) => (
          <button key={g} type="button" className={`radio-chip c-${TONES[i % TONES.length]}`} data-nav aria-pressed={prefs.sticker === g} onClick={() => openSticker(g)}>{g}</button>
        ))}
        <button type="button" className="radio-chip radio-add" data-nav onClick={() => setPicking(true)}>+ genres</button>
        <button type="button" className="radio-chip radio-country" data-nav onClick={() => setPicking(true)}
          aria-label={`Country: ${prefs.country ? countryName(prefs.country) : 'every country'}`}>
          {prefs.country ? countryName(prefs.country) : 'Every country'}
        </button>
      </div>
      {picking && <GenrePicker onClose={() => setPicking(false)} />}
    </>
  );
}

const TONES = ['mint', 'pink', 'sky', 'lilac', 'peach'] as const;
const SHOW_GENRES = 60;

function GenrePicker({ onClose }: { onClose: () => void }) {
  const prefs = useRadioPrefs();
  const recent = useRecentStations(true);
  const open = useGenreStations(prefs.sticker !== 'yours' ? prefs.sticker : undefined);
  const saved = useSavedStations();
  const [query, setQuery] = useState('');
  const box = useRef<HTMLDivElement>(null);

  const seen = useMemo(() => [...recent, ...open, ...saved], [recent, open, saved]);
  const genres = useMemo(() => genreCounts(seen).map(g => g.genre), [seen]);
  const q = cleanGenre(query);
  const shown = (q ? genres.filter(g => g.includes(q)) : genres).filter(g => !prefs.genres.includes(g)).slice(0, SHOW_GENRES);
  const mine = useMemo(() => countryFromLanguage(navigator.language), []);
  const countries = useMemo(() => {
    const list = countryCounts(seen).map(c => c.country);
    return mine ? [mine, ...list.filter(c => c !== mine)] : list;
  }, [seen, mine]);

  useEffect(() => { box.current?.querySelector<HTMLElement>('[data-nav]')?.focus(); }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  };

  return (
    <div className="radio-picker-back" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="radio-picker" role="dialog" aria-modal="true" aria-label="Pick genres" data-nav-modal ref={box} onKeyDown={onKey}>
        <header>
          <h2>Your genre stickers</h2>
          <button type="button" className="chip-btn solid" data-nav onClick={onClose}>Done</button>
        </header>
        {prefs.genres.length > 0 && (
          <div className="radio-genres" role="group" aria-label="Your genres (press to take one away)">
            {prefs.genres.map((g, i) => (
              <button key={g} type="button" className={`radio-chip c-${TONES[i % TONES.length]}`} data-nav aria-pressed="true" onClick={() => toggleGenre(g)}>{g} ✕</button>
            ))}
          </div>
        )}
        <input className="radio-search" type="search" data-nav placeholder="Find a genre" aria-label="Find a genre" value={query} maxLength={40}
          onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && q) { toggleGenre(q); setQuery(''); } }} />
        <div className="radio-genres" role="group" aria-label="Genres, commonest first">
          {q && !genres.includes(q) && !prefs.genres.includes(q) && (
            <button type="button" className="radio-chip radio-add" data-nav onClick={() => { toggleGenre(q); setQuery(''); }}>+ {q}</button>
          )}
          {shown.map(g => (
            <button key={g} type="button" className="radio-chip" data-nav aria-pressed="false" onClick={() => toggleGenre(g)}>{g}</button>
          ))}
          {genres.length === 0 && !q && <p className="radio-wait">Asking the relay for its stations…</p>}
        </div>
        <h3>Country</h3>
        <div className="radio-genres" role="group" aria-label="Country">
          <button type="button" className="radio-chip" data-nav aria-pressed={!prefs.country} onClick={() => setCountry('')}>Every country</button>
          {countries.slice(0, 40).map(c => (
            <button key={c} type="button" className="radio-chip" data-nav aria-pressed={prefs.country === c} onClick={() => setCountry(c)}>{countryName(c)}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
