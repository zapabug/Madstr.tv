import type { CSSProperties } from 'react';
import { player, usePlayer } from '../lib/player.ts';
import { formatTime } from '../lib/queue.ts';
import { toggleLike, useLiked } from '../lib/liked.ts';
import { HeartIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from './icons.tsx';

// The pieces of the player, shared by the right-hand player panel and the slim bar on
// the board.

export function TransportButtons() {
  const p = usePlayer();
  const playing = p.status === 'playing' || p.status === 'loading';
  const has = p.queue.length > 0;
  return (
    <div className="dock-controls" role="group" aria-label="Playback">
      <button type="button" className="dock-btn" aria-label="Previous" data-nav disabled={!has} onClick={player.prev}><PrevIcon size={28} /></button>
      <button type="button" className="dock-btn dock-play" aria-label={playing ? 'Pause' : 'Play'} data-nav disabled={!has} onClick={player.toggle}>
        {playing ? <PauseIcon size={34} /> : <PlayIcon size={34} />}
      </button>
      <button type="button" className="dock-btn" aria-label="Next" data-nav disabled={!has} onClick={player.next}><NextIcon size={28} /></button>
    </div>
  );
}

export function SeekBar() {
  const p = usePlayer();
  const max = Math.max(1, Math.floor(p.duration));
  const value = Math.min(Math.floor(p.position), max);
  const fill = Math.round((value / max) * 100);
  return (
    <div className="dock-seek">
      <span className="dock-time">{formatTime(p.position)}</span>
      <input type="range" className="seek" aria-label="Position" min={0} max={max} step={1} value={value}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        disabled={p.queue.length === 0 || p.duration === 0} onChange={e => player.seek(Number(e.target.value))} />
      <span className="dock-time">{p.duration > 0 ? formatTime(p.duration) : '--:--'}</span>
    </div>
  );
}

export function ExtraButtons({ speed = true }: { speed?: boolean }) {
  const p = usePlayer();
  const liked = useLiked();
  const author = p.queue[p.index]?.pubkey;
  const has = p.queue.length > 0;
  return (
    <div className="dock-extra" role="group" aria-label="Seek, speed and like">
      {author && (
        <button type="button" className="chip-btn heart" data-nav aria-pressed={liked.includes(author)} onClick={() => toggleLike(author)}
          aria-label={liked.includes(author) ? 'Unlike this creator' : 'Like this creator'}><HeartIcon size={16} /></button>
      )}
      <button type="button" className="chip-btn" data-nav disabled={!has} onClick={() => player.seekBy(-10)} aria-label="Back 10 seconds">−10s</button>
      <button type="button" className="chip-btn" data-nav disabled={!has} onClick={() => player.seekBy(30)} aria-label="Forward 30 seconds">+30s</button>
      {speed && <button type="button" className="chip-btn" data-nav disabled={!has} onClick={player.cycleRate} aria-label={`Speed ${p.rate}x`}>{p.rate}×</button>}
    </div>
  );
}

// The right-hand control panel, laid out on purpose so it reads the same at any width:
// the seek bar across the top, the main transport row under it (-10s, play, +30s), and the
// two small extras (like, speed) below. Previous / next are the chevrons on the picture.
export function PanelControls() {
  const p = usePlayer();
  const liked = useLiked();
  const playing = p.status === 'playing' || p.status === 'loading';
  const has = p.queue.length > 0;
  const author = p.queue[p.index]?.pubkey;
  return (
    <div className="pc" role="group" aria-label="Media controls">
      <SeekBar />
      <div className="pc-main">
        <button type="button" className="chip-btn" data-nav disabled={!has} onClick={() => player.seekBy(-10)} aria-label="Back 10 seconds">−10s</button>
        <button type="button" className="dock-btn dock-play" aria-label={playing ? 'Pause' : 'Play'} data-nav disabled={!has} onClick={player.toggle}>
          {playing ? <PauseIcon size={32} /> : <PlayIcon size={32} />}
        </button>
        <button type="button" className="chip-btn" data-nav disabled={!has} onClick={() => player.seekBy(30)} aria-label="Forward 30 seconds">+30s</button>
      </div>
      <div className="pc-extra">
        {author && (
          <button type="button" className="chip-btn heart" data-nav aria-pressed={liked.includes(author)} onClick={() => toggleLike(author)}
            aria-label={liked.includes(author) ? 'Unlike this creator' : 'Like this creator'}><HeartIcon size={16} /></button>
        )}
        <button type="button" className="chip-btn" data-nav disabled={!has} onClick={player.cycleRate} aria-label={`Speed ${p.rate}x`}>{p.rate}×</button>
      </div>
    </div>
  );
}
