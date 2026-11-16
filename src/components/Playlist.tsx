import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { played } from '../lib/played.ts';
import { player, usePlayer } from '../lib/player.ts';
import { Avatar } from './People.tsx';
import { FilmIcon, NoteIcon, RadioIcon } from './icons.tsx';

const FIRST = 120;
const MORE = 120;

// The playlist as little sticker-like tiles: the account's picture (or the cover when there
// is no account), a brief title, and the number. Hover or focus shows the full title.
// What is playing is not here: it moved up into the now-playing card, and what has played this session
// is gone (zapa, spec feat-taste-cache §T2).
// `label` is the view's own playlist name: until the player holds that playlist, the view shows its own
// waiting / empty text, and what is still playing from before (spec §Design pass fixes).
export function Playlist({ label, emptyText, waiting }: { label: string; emptyText: string; waiting: boolean }) {
  const p = usePlayer();
  const [limit, setLimit] = useState(FIRST);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const current = useRef<HTMLButtonElement>(null);

  // A different list starts from its first page again.
  useEffect(() => { setLimit(FIRST); }, [p.label]);
  useEffect(() => { if (p.index >= limit) setLimit(p.index + MORE); }, [p.index, limit]);
  useEffect(() => { current.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [p.index, p.queue]);

  if (p.queue.length === 0 || p.label !== label) {
    const still = p.queue[p.index];
    return (
      <div className="panel-empty">
        <p>{waiting ? 'Looking for content…' : emptyText}</p>
        {still && <p className="still-playing">Still playing: <b>{still.title}</b> · {p.label}</p>}
      </div>
    );
  }

  const gone = (id: string, i: number) => i === p.index || played.has(id);
  let next = -1;
  for (let i = p.index + 1; i < Math.min(p.queue.length, limit); i++) if (!gone(p.queue[i].id, i)) { next = i; break; }
  const left = p.queue.slice(0, limit).filter((row, i) => !gone(row.id, i)).length;

  const showTip = (el: HTMLElement, text: string) => {
    const r = el.getBoundingClientRect();
    setTip({ text, x: r.left + r.width / 2, y: r.top });
  };

  return (
    <>
      <ol className="tiles" aria-label={`Playlist: ${p.label}`}>
        {p.queue.slice(0, limit).map((row, i) => gone(row.id, i) ? null : (
          <li key={row.id}>
            <button
              type="button"
              className="tile"
              data-nav
              aria-label={row.title}
              ref={i === next ? current : undefined}
              onClick={() => player.jump(i)}
              onMouseEnter={e => showTip(e.currentTarget, row.title)}
              onFocus={e => showTip(e.currentTarget, row.title)}
              onMouseLeave={() => setTip(null)}
              onBlur={() => setTip(null)}
            >
              <span className="tile-art">
                {row.pubkey && !row.live ? <Avatar pubkey={row.pubkey} />
                  : <TileArt image={row.image} video={row.kind === 'video'} live={row.live} />}
              </span>
              <span className="tile-title">{row.title}</span>
              <span className="tile-n" aria-hidden="true">{i + 1}</span>
            </button>
          </li>
        ))}
        {left === 0 && p.queue.length <= limit && <li className="tiles-empty">Nothing else in this playlist.</li>}
        {p.queue.length > limit && (
          <li><button type="button" className="tile tile-more" data-nav onClick={() => setLimit(l => l + MORE)}>+{p.queue.length - limit} more</button></li>
        )}
      </ol>
      {tip && createPortal(<div className="tile-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>, document.body)}
    </>
  );
}

// A tile's cover, or the drawn icon when there is none or it fails to load.
function TileArt({ image, video, live }: { image?: string; video: boolean; live?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [image]);
  if (image && !failed) return <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  return live ? <RadioIcon size={26} /> : video ? <FilmIcon size={26} /> : <NoteIcon size={26} />;
}
