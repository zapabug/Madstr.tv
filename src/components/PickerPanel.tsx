import { usePlayer } from '../lib/player.ts';
import { Playlist } from './Playlist.tsx';

// The media picker: the left 70% of the bottom panel, where the first Madstr had its message
// board. The header holds the Back button and what is playing; the rest is only the things
// you can pick, as tiles.
export function PickerPanel({ label, emptyText, waiting }: { label: string; emptyText: string; waiting: boolean }) {
  const p = usePlayer();
  const item = p.queue[p.index];
  return (
    <aside className="panel picker" aria-label="Media picker">
      <header className="panel-head">
        <a className="back" href="#/" data-nav><span aria-hidden="true">←</span> Board</a>
        <h1 className="head-title" title={item?.title}>{item ? item.title : label}</h1>
        <span className="count">{item ? `${label} · ` : ''}{p.queue.length > 0 ? `${p.queue.length} in the playlist` : ''}</span>
      </header>
      <div className="picker-list"><Playlist emptyText={emptyText} waiting={waiting} /></div>
    </aside>
  );
}
