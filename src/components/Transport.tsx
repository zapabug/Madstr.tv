import { useState, type CSSProperties } from 'react';
import { useTaste } from '../lib/taste.ts';
import { downVote, hideArtist, toggleUpVote } from '../data/votes.ts';
import { shortName, useProfile } from '../data/people.ts';
import { player, usePlayer } from '../lib/player.ts';
import { formatTime } from '../lib/queue.ts';
import { authorSpot } from '../lib/author.ts';
import { Avatar } from './People.tsx';
import { FolderArt, NextIcon, PauseIcon, PersonIcon, PlayIcon, PrevIcon, ThumbDownIcon, ThumbUpIcon } from './icons.tsx';

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
  const fraction = value / max;
  return (
    <div className="dock-seek">
      <span className="dock-time">{formatTime(p.position)}</span>
      <input type="range" className="seek" data-nav aria-label="Position" min={0} max={max} step={1} value={value}
        style={{ '--p': fraction } as CSSProperties}
        disabled={p.queue.length === 0 || p.duration === 0} onChange={e => player.seek(Number(e.target.value))} />
      <span className="dock-time">{p.duration > 0 ? formatTime(p.duration) : '--:--'}</span>
    </div>
  );
}

// The speed button; seeking is the seek bar, a double tap on the picture, or the remote's keys (spec
// feat-taste-cache §T6: the -10s / +30s buttons are gone).
export function ExtraButtons() {
  const p = usePlayer();
  const has = p.queue.length > 0;
  return (
    <div className="dock-extra" role="group" aria-label="Speed">
      <button type="button" className="chip-btn" data-nav disabled={!has} onClick={player.cycleRate} aria-label={`Speed ${p.rate}x`}>{p.rate}×</button>
    </div>
  );
}

// The right-hand control panel: the seek bar across the top, the author's face beside previous / play / next,
// and one row of up vote, down vote, Hide artist and speed.
// A small square for the author of what is playing (see lib/author.ts for what goes in it).
function AuthorSpot() {
  const p = usePlayer();
  const spot = authorSpot(p.queue[p.index]);
  if (spot.kind === 'none') return null;
  return (
    <div className={`author-spot${spot.kind === 'folder' ? ' author-spot-folder' : ''}`} title={spot.label} aria-label={`Author: ${spot.label}`} role="img">
      {spot.kind === 'profile' ? <Avatar pubkey={spot.pubkey} />
        : spot.kind === 'cover' ? <img src={spot.image} alt="" referrerPolicy="no-referrer" />
        : spot.kind === 'initial' ? <span className="author-initial">{spot.letter}</span>
        : <FolderArt />}
    </div>
  );
}

// The media controls, top to bottom (spec feat-taste-cache §T2, §T6; zapa's layout): the author's face with
// up vote and down vote overlapping its sides and Hide artist (a post-it crossed out in red) on its bottom-right
// corner; previous / play / next; the speed post-it; the seek bar, full width. Seeking by steps is a double tap
// on the picture or the remote's keys.
export function PanelControls() {
  const p = usePlayer();
  const playing = p.status === 'playing' || p.status === 'loading';
  const has = p.queue.length > 0;
  const item = p.queue[p.index];
  const noun = item?.kind === 'video' ? 'video' : 'song';
  const taste = useTaste();
  const profile = useProfile(item?.pubkey);
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);
  const up = item ? !!taste.up[item.id] : false;
  const artist = item?.pubkey ? shortName(item.pubkey, profile?.displayName) : '';
  const run = (id: string, action: Promise<string | null>) => {
    setNote(null);
    void action.then(text => { if (text) setNote({ id, text }); });
  };
  return (
    <div className="pc" role="group" aria-label="Media controls">
      <div className="pc-top">
        <div className="pc-face">
          <AuthorSpot />
          <button type="button" className={`taste-btn taste-up${up ? ' on' : ''}`} data-nav aria-pressed={up} aria-label="Up vote" disabled={!item}
            title="Up vote (a public like when logged in)" onClick={() => { if (item) run(item.id, toggleUpVote(item)); }}>
            <ThumbUpIcon size={22} />
          </button>
          <button type="button" className="taste-btn taste-down" data-nav aria-label="Down vote" disabled={!item}
            title="Down vote: hidden from your lists on this device" onClick={() => { if (item) run(item.id, downVote(item)); }}>
            <ThumbDownIcon size={22} />
          </button>
          {item?.pubkey && (
            <button type="button" className="postit postit-hide" data-nav aria-label={`Hide artist ${artist}`}
              title={`Hide everything by ${artist} on this device`} onClick={() => hideArtist(item, artist)}>
              <PersonIcon size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="pc-main">
        <button type="button" className="dock-btn" aria-label={`Previous ${noun}`} data-nav disabled={!has} onClick={player.prev}><PrevIcon size={26} /></button>
        <button type="button" className="dock-btn dock-play" aria-label={playing ? 'Pause' : 'Play'} data-nav disabled={!has} onClick={player.toggle}>
          {playing ? <PauseIcon size={32} /> : <PlayIcon size={32} />}
        </button>
        <button type="button" className="dock-btn" aria-label={`Next ${noun}`} data-nav disabled={!has} onClick={player.next}><NextIcon size={26} /></button>
      </div>
      <div className="pc-seek">
        <button type="button" className="postit postit-speed" data-nav disabled={!has} onClick={player.cycleRate} aria-label={`Speed ${p.rate}x`}>
          <b>{p.rate}×</b> <span>speed</span>
        </button>
        <SeekBar />
      </div>
      {item && note?.id === item.id && <p className="own-note bad pc-taste-note" role="status">{note.text}</p>}
    </div>
  );
}
