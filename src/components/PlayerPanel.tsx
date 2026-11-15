import { usePlayer } from '../lib/player.ts';
import { Playlist } from './Playlist.tsx';
import { ExtraButtons, PlayerStrip } from './Transport.tsx';

// The media control panel, on the right (as in the first Madstr): the playlist, with the
// player strip and its buttons under it.
export function PlayerPanel({ emptyText, waiting }: { emptyText: string; waiting: boolean }) {
  const p = usePlayer();
  const item = p.queue[p.index];
  const status = p.error ?? (p.status === 'loading' ? 'Loading…' : item?.subtitle ?? p.label);
  return (
    <aside className="panel player-panel" aria-label="Media control panel">
      <Playlist emptyText={emptyText} waiting={waiting} />
      {item && <p className="now-line" role="status"><b>{item.title}</b> · {status}</p>}
      <PlayerStrip />
      <ExtraButtons />
    </aside>
  );
}
