import { useEffect, useRef } from 'react';
import { player, usePlayer } from '../lib/player.ts';
import { formatTime } from '../lib/queue.ts';

const MAX_ROWS = 300;

// The playlist rows (number, thumbnail, title, length). Pressing a row plays it.
export function Playlist({ emptyText, waiting }: { emptyText: string; waiting: boolean }) {
  const p = usePlayer();
  const current = useRef<HTMLButtonElement>(null);
  const rows = p.queue.slice(0, MAX_ROWS);
  const playing = p.status === 'playing' || p.status === 'loading';

  useEffect(() => { current.current?.scrollIntoView({ block: 'nearest' }); }, [p.index, p.queue]);

  if (p.queue.length === 0) return <p className="panel-empty">{waiting ? 'Looking for content…' : emptyText}</p>;

  return (
    <ol className="list" aria-label={`Playlist: ${p.label}`}>
      {rows.map((row, i) => (
        <li key={row.id}>
          <button type="button" className="row" data-nav aria-current={i === p.index ? 'true' : undefined} ref={i === p.index ? current : undefined} onClick={() => player.jump(i)}>
            <span className="row-n" aria-hidden="true">{i === p.index && playing ? '▶' : i + 1}</span>
            {row.image && <img className="row-thumb" src={row.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
            <span className="row-t">{row.title}{row.subtitle && <span className="row-s"> · {row.subtitle}</span>}</span>
            {row.duration !== undefined && <span className="row-d">{formatTime(row.duration)}</span>}
          </button>
        </li>
      ))}
      {p.queue.length > MAX_ROWS && <li className="row-more">Showing the first {MAX_ROWS} of {p.queue.length}</li>}
    </ol>
  );
}
