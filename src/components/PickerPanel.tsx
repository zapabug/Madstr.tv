import { useState, type ReactNode } from 'react';
import { usePlayer } from '../lib/player.ts';
import { Playlist } from './Playlist.tsx';

// The media picker: the left 70% of the bottom panel, where the first Madstr had its message
// board. Its header holds the Back button and what is playing; the rest of it is the list
// you pick from. Setting up a source (RSS feeds, folders, hashtags, liked people) is behind
// the one small "Sources" toggle so it never crowds the list.
export function PickerPanel({ label, extras, emptyText, waiting }: { label: string; extras?: ReactNode; emptyText: string; waiting: boolean }) {
  const p = usePlayer();
  const item = p.queue[p.index];
  const [showSources, setShowSources] = useState(false);
  return (
    <aside className="panel picker" aria-label="Media picker">
      <header className="panel-head">
        <a className="back" href="#/" data-nav><span aria-hidden="true">←</span> Board</a>
        <h1 className="head-title" title={item?.title}>{item ? item.title : label}</h1>
        <span className="count">{item ? `${label} · ` : ''}{p.queue.length > 0 ? `${p.queue.length} in the playlist` : ''}</span>
        {extras && (
          <button type="button" className="chip-btn head-sources" data-nav aria-expanded={showSources} onClick={() => setShowSources(v => !v)}>
            {showSources ? 'Back to list' : 'Sources'}
          </button>
        )}
      </header>
      {showSources && extras
        ? <div className="picker-side">{extras}</div>
        : <div className="picker-list"><Playlist emptyText={emptyText} waiting={waiting} /></div>}
    </aside>
  );
}
