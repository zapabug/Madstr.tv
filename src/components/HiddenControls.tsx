import { setTaste, useTaste, withArtistBack, withSongBack } from '../lib/taste.ts';

// Shown at most, newest first; the rest are counted (spec feat-taste-cache §T2).
const SHOWN = 40;

// Songs and artists hidden from the media controls, each with a way back (spec feat-taste-cache §T2).
export function HiddenControls() {
  const taste = useTaste();
  const rows = [
    ...Object.entries(taste.artists).map(([key, h]) => ({ key, artist: true, ...h })),
    ...Object.entries(taste.songs).map(([key, h]) => ({ key, artist: false, ...h })),
  ].sort((a, b) => b.at - a.at);
  return (
    <section className="own" aria-label="Hidden songs and artists">
      <h2>Hidden</h2>
      {rows.length === 0 ? (
        <p className="own-note">Nothing hidden. Hide a song or an artist from the media controls while it plays.</p>
      ) : (
        <ul>
          {rows.slice(0, SHOWN).map(row => (
            <li key={`${row.artist ? 'a' : 's'}:${row.key}`}>
              <span className="own-name" title={row.name}>{row.name}</span>
              <span className="own-status">{row.artist ? 'Artist' : 'station' in row && row.station ? 'Station' : 'Song'}</span>
              <button type="button" className="chip-btn" data-nav aria-label={`Bring back ${row.name}`}
                onClick={() => setTaste(t => (row.artist ? withArtistBack(t, row.key) : withSongBack(t, row.key)))}>Bring back</button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > SHOWN && <p className="own-note">And {rows.length - SHOWN} more hidden.</p>}
    </section>
  );
}
