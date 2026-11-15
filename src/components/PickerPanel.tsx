import { useEffect, useRef, type ReactNode } from 'react';
import { player, usePlayer } from '../lib/player.ts';
import { formatTime } from '../lib/queue.ts';

const MAX_ROWS = 300;

// The media picker, on the left: where you are, anything you can add, and the playlist.
// Pressing a row plays it.
export function PickerPanel({ label, emptyText, waiting, extras }: { label: string; emptyText: string; waiting: boolean; extras?: ReactNode }) {
  const p = usePlayer();
  const current = useRef<HTMLButtonElement>(null);
  const rows = p.queue.slice(0, MAX_ROWS);
  const playing = p.status === 'playing' || p.status === 'loading';

  useEffect(() => { current.current?.scrollIntoView({ block: 'nearest' }); }, [p.index, p.queue]);

  return (
    <aside className="panel picker" aria-label="Media picker">
      <header className="panel-head">
        <a className="back" href="#/" data-nav><span aria-hidden="true">←</span> Board</a>
        <h1>{label}</h1>
        {p.queue.length > 0 && <span className="count">{p.queue.length}</span>}
      </header>
      {extras}
      {p.queue.length === 0 ? (
        <p className="panel-empty">{waiting ? 'Looking for content…' : emptyText}</p>
      ) : (
        <ol className="list" aria-label={`Playlist: ${p.label}`}>
          {rows.map((row, i) => (
            <li key={row.id}>
              <button type="button" className="row" data-nav aria-current={i === p.index ? 'true' : undefined} ref={i === p.index ? current : undefined} onClick={() => player.jump(i)}>
                <span className="row-n" aria-hidden="true">{i === p.index && playing ? '▶' : i + 1}</span>
                <span className="row-t">{row.title}{row.subtitle && <span className="row-s"> · {row.subtitle}</span>}</span>
                {row.duration !== undefined && <span className="row-d">{formatTime(row.duration)}</span>}
              </button>
            </li>
          ))}
          {p.queue.length > MAX_ROWS && <li className="row-more">Showing the first {MAX_ROWS} of {p.queue.length}</li>}
        </ol>
      )}
    </aside>
  );
}
