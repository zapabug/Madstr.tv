import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { player, usePlayer } from '../lib/player.ts';
import { Avatar } from './People.tsx';
import { FilmIcon, NoteIcon } from './icons.tsx';

const FIRST = 120;
const MORE = 120;

// The playlist as little sticker-like tiles: the account's picture (or the cover when there
// is no account), a brief title, and the number. Hover or focus shows the full title.
// `label` is the view's own playlist name: until the player holds that playlist, the view shows its own
// waiting / empty text, and what is still playing from before (spec §Design pass fixes).
export function Playlist({ label, emptyText, waiting }: { label: string; emptyText: string; waiting: boolean }) {
  const p = usePlayer();
  const [limit, setLimit] = useState(FIRST);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const current = useRef<HTMLButtonElement>(null);
  const playing = p.status === 'playing' || p.status === 'loading';

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
                  : <TileArt image={row.image} video={row.kind === 'video'} />}
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

// A tile's cover, or the drawn icon when there is none or it fails to load.
function TileArt({ image, video }: { image?: string; video: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [image]);
  if (image && !failed) return <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  return video ? <FilmIcon size={26} /> : <NoteIcon size={26} />;
}
