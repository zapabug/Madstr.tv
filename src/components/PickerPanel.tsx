import type { ReactNode } from 'react';
import { usePlayer } from '../lib/player.ts';
import { STICKERS, hrefOf } from '../lib/stickers.ts';
import { toHash, type Route } from '../lib/route.ts';
import { Playlist } from './Playlist.tsx';

// The media picker: the left 70% of the bottom panel, where the first Madstr had its message
// board. Everything you pick from is here: the same shortcuts as the home stickers and the
// current source's own controls on one side, the playlist on the other.
export function PickerPanel({ route, label, extras, emptyText, waiting }: { route: Extract<Route, { page: 'viewer' }>; label: string; extras?: ReactNode; emptyText: string; waiting: boolean }) {
  const p = usePlayer();
  const here = toHash(route);
  return (
    <aside className="panel picker" aria-label="Media picker">
      <header className="panel-head">
        <a className="back" href="#/" data-nav><span aria-hidden="true">←</span> Board</a>
        <h1>{label}</h1>
        {p.queue.length > 0 && <span className="count">{p.queue.length} in the playlist</span>}
      </header>
      <div className="picker-body">
        <div className="picker-side">
          <nav className="pick-chips" aria-label="Pick something to play">
            {STICKERS.map(s => (
              <a key={s.id} className="pick-chip" href={hrefOf(s)} data-nav aria-current={hrefOf(s) === here ? 'page' : undefined}>{s.title}</a>
            ))}
          </nav>
          {extras}
        </div>
        <div className="picker-list">
          <Playlist emptyText={emptyText} waiting={waiting} />
        </div>
      </div>
    </aside>
  );
}
