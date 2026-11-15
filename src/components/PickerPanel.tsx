import type { ReactNode } from 'react';
import { usePlayer } from '../lib/player.ts';
import { STICKERS, hrefOf } from '../lib/stickers.ts';
import { toHash, type Route } from '../lib/route.ts';

// The media picker, on the left (where the first Madstr had its message board): choose what
// to play. The same shortcuts as the home stickers, so you can switch without going back,
// plus whatever belongs to the current source (feeds, folders, liked people, ...).
export function PickerPanel({ route, label, extras }: { route: Extract<Route, { page: 'viewer' }>; label: string; extras?: ReactNode }) {
  const p = usePlayer();
  const here = toHash(route);
  return (
    <aside className="panel picker" aria-label="Media picker">
      <header className="panel-head">
        <a className="back" href="#/" data-nav><span aria-hidden="true">←</span> Board</a>
        <h1>{label}</h1>
        {p.queue.length > 0 && <span className="count">{p.queue.length} in the playlist</span>}
      </header>
      <nav className="pick-chips" aria-label="Pick something to play">
        {STICKERS.map(s => (
          <a key={s.id} className="pick-chip" href={hrefOf(s)} data-nav aria-current={hrefOf(s) === here ? 'page' : undefined}>{s.title}</a>
        ))}
      </nav>
      {extras}
    </aside>
  );
}
