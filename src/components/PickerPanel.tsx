import type { ReactNode } from 'react';
import { player, usePlayer } from '../lib/player.ts';
import { HeadTitle } from './HeadTitle.tsx';
import { HomeWord, ShuffleIcon } from './icons.tsx';
import { Playlist } from './Playlist.tsx';

// The media picker: the left 70% of the bottom panel, where the first Madstr had its message
// board. The header holds the Back button, what is playing and the Shuffle toggle; the rest is only the things
// you can pick, as tiles.
// `extra`: a row under the header that belongs to the view (Radio's stickers, feat-radio §RA2).
export function PickerPanel({ label, emptyText, waiting, extra }: { label: string; emptyText: string; waiting: boolean; extra?: ReactNode }) {
  const p = usePlayer();
  const mine = p.label === label; // the player holds this view's playlist (not one left playing from before)
  const item = mine ? p.queue[p.index] : undefined;
  return (
    <aside className="panel picker" aria-label="Media picker" data-nav-group>
      <header className="panel-head">
        <a className="back" href="#/" data-nav aria-label="Home"><HomeWord /></a>
        <HeadTitle text={item ? item.title : label} />
        <button type="button" className="chip-btn shuffle" data-nav aria-label="Shuffle" aria-pressed={p.shuffle} disabled={!mine || p.queue.length < 2}
          title={p.shuffle ? 'Shuffle is on: back to the normal order' : 'Shuffle the playlist'} onClick={player.toggleShuffle}>
          <ShuffleIcon size={18} /><span className="shuffle-word"> Shuffle</span>
        </button>
        <span className="count">{item ? `${label} · ` : ''}{mine && p.queue.length > 0 ? `${p.queue.length} in the playlist` : ''}</span>
      </header>
      {extra}
      <div className="picker-list"><Playlist label={label} emptyText={emptyText} waiting={waiting} /></div>
    </aside>
  );
}
