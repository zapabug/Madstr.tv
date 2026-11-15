import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { player, usePlayer } from '../lib/player.ts';
import { Avatar } from './People.tsx';
import { FilmIcon, NoteIcon } from './icons.tsx';

const FIRST = 120;
const MORE = 120;

// The playlist as little sticker-like tiles: the account's picture (or the cover when there
// is no account), a brief title, and the number. Hover or focus shows the full title.
export function Playlist({ emptyText, waiting }: { emptyText: string; waiting: boolean }) {
  const p = usePlayer();
  const [limit, setLimit] = useState(FIRST);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const current = useRef<HTMLButtonElement>(null);
  const playing = p.status === 'playing' || p.status === 'loading';

  // A different list starts from its first page again.
  useEffect(() => { setLimit(FIRST); }, [p.label]);
  useEffect(() => { if (p.index >= limit) setLimit(p.index + MORE); }, [p.index, limit]);
  useEffect(() => { current.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [p.index, p.queue]);

  if (p.queue.length === 0) return <p className="panel-empty">{waiting ? 'Looking for content…' : emptyText}</p>;

  const showTip = (el: HTMLElement, text: string) => {
    const r = el.getBoundingClientRect();
    setTip({ text, x: r.left + r.width / 2, y: r.top });
  };

  return (
    <>
      <ol className="tiles" aria-label={`Playlist: ${p.label}`}>
        {p.queue.slice(0, limit).map((row, i) => (
          <li key={row.id}>
            <button
              type="button"
              className="tile"
              data-nav
              aria-current={i === p.index ? 'true' : undefined}
              aria-label={row.title}
              ref={i === p.index ? current : undefined}
              onClick={() => player.jump(i)}
              onMouseEnter={e => showTip(e.currentTarget, row.title)}
              onFocus={e => showTip(e.currentTarget, row.title)}
              onMouseLeave={() => setTip(null)}
              onBlur={() => setTip(null)}
            >
              <span className="tile-art">
                {row.pubkey ? <Avatar pubkey={row.pubkey} />
                  : row.image ? <img src={row.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  : row.kind === 'video' ? <FilmIcon size={26} /> : <NoteIcon size={26} />}
              </span>
              <span className="tile-title">{row.title}</span>
              <span className="tile-n" aria-hidden="true">{i === p.index && playing ? '▶' : i + 1}</span>
            </button>
          </li>
        ))}
        {p.queue.length > limit && (
          <li><button type="button" className="tile tile-more" data-nav onClick={() => setLimit(l => l + MORE)}>+{p.queue.length - limit} more</button></li>
        )}
      </ol>
      {tip && createPortal(<div className="tile-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>, document.body)}
    </>
  );
}
