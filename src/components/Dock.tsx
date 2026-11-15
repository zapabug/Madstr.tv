import { useEffect, useRef } from 'react';
import { player, usePlayer } from '../lib/player.ts';
import { formatTime } from '../lib/queue.ts';
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from './icons.tsx';

const MAX_ROWS = 300;

// The bottom panel: the media player and the playlist. The playlist drawer is the
// current queue; in the viewer it is open so the whole list is one press away.
export function Dock({ open }: { open: boolean }) {
  const p = usePlayer();
  const item = p.queue[p.index];
  const playing = p.status === 'playing' || p.status === 'loading';
  const hasQueue = p.queue.length > 0;
  const showDrawer = open && hasQueue;
  const currentRow = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (showDrawer) currentRow.current?.scrollIntoView({ block: 'nearest' });
  }, [showDrawer, p.index, p.queue]);

  const rows = p.queue.slice(0, MAX_ROWS);
  const status = p.error ?? (p.status === 'loading' ? 'Loading…' : item?.subtitle ?? p.label);

  return (
    <section className="dock" aria-label="Player" data-drawer={showDrawer ? 'open' : 'closed'}>
      {showDrawer && (
        <ol className="drawer" aria-label={`Playlist: ${p.label}`}>
          {rows.map((row, i) => (
            <li key={row.id}>
              <button
                type="button"
                className="row"
                data-nav
                aria-current={i === p.index ? 'true' : undefined}
                ref={i === p.index ? currentRow : undefined}
                onClick={() => player.jump(i)}
              >
                <span className="row-n" aria-hidden="true">{i === p.index && playing ? '▶' : i + 1}</span>
                <span className="row-t">
                  {row.title}
                  {row.subtitle && <span className="row-s"> · {row.subtitle}</span>}
                </span>
                {row.duration !== undefined && <span className="row-d">{formatTime(row.duration)}</span>}
              </button>
            </li>
          ))}
          {p.queue.length > MAX_ROWS && <li className="row-more">Showing the first {MAX_ROWS} of {p.queue.length}</li>}
        </ol>
      )}

      <div className="dock-bar">
        <div className="dock-controls" role="group" aria-label="Playback">
          <button type="button" className="dock-btn" aria-label="Previous" data-nav disabled={!hasQueue} onClick={player.prev}>
            <PrevIcon size={28} />
          </button>
          <button type="button" className="dock-btn dock-play" aria-label={playing ? 'Pause' : 'Play'} data-nav disabled={!hasQueue} onClick={player.toggle}>
            {playing ? <PauseIcon size={34} /> : <PlayIcon size={34} />}
          </button>
          <button type="button" className="dock-btn" aria-label="Next" data-nav disabled={!hasQueue} onClick={player.next}>
            <NextIcon size={28} />
          </button>
        </div>

        <div className="dock-now">
          <p className="dock-title">{item ? item.title : 'Nothing queued yet'}</p>
          <p className="dock-sub" role="status">{item ? status : 'Pick a sticker to start.'}</p>
          <div className="dock-seek">
            <span className="dock-time">{formatTime(p.position)}</span>
            <input
              type="range"
              aria-label="Position"
              min={0}
              max={Math.max(1, Math.floor(p.duration))}
              step={1}
              value={Math.min(Math.floor(p.position), Math.max(1, Math.floor(p.duration)))}
              disabled={!hasQueue || p.duration === 0}
              onChange={e => player.seek(Number(e.target.value))}
            />
            <span className="dock-time">{p.duration > 0 ? formatTime(p.duration) : '--:--'}</span>
          </div>
        </div>

        <div className="dock-extra" role="group" aria-label="Seek and speed">
          <button type="button" className="chip-btn" data-nav disabled={!hasQueue} onClick={() => player.seekBy(-10)} aria-label="Back 10 seconds">−10s</button>
          <button type="button" className="chip-btn" data-nav disabled={!hasQueue} onClick={() => player.seekBy(30)} aria-label="Forward 30 seconds">+30s</button>
          <button type="button" className="chip-btn" data-nav disabled={!hasQueue} onClick={player.cycleRate} aria-label={`Speed ${p.rate}x`}>{p.rate}×</button>
        </div>
      </div>
    </section>
  );
}
