import { useEffect, useState, type CSSProperties } from 'react';
import type { MediaItem } from '../lib/media.ts';
import { useTaste } from '../lib/taste.ts';
import { downVote, hideArtist, toggleUpVote } from '../data/votes.ts';
import { shortName, useProfile } from '../data/people.ts';
import { player, usePlayer } from '../lib/player.ts';
import { formatTime } from '../lib/queue.ts';
import { authorSpot } from '../lib/author.ts';
import { Avatar } from './People.tsx';
import { FilmIcon, FolderArt, NextIcon, NoteIcon, PauseIcon, PersonIcon, PlayIcon, PrevIcon, ThumbDownIcon, ThumbUpIcon } from './icons.tsx';

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
  if (p.queue[p.index]?.live) return <LiveSticker since={p.liveSince} />;
  return (
    <div className="dock-extra" role="group" aria-label="Speed">
      <button type="button" className="chip-btn" data-nav disabled={!has} onClick={player.cycleRate} aria-label={`Speed ${p.rate}x`}>{p.rate}×</button>
    </div>
  );
}

// A live station or show (feat-radio §RA3): no seek bar and no speed; a LIVE sticker and how long you have been
// listening take their place.
function listened(since: number | null, now: number): string {
  return since ? formatTime(Math.max(0, (now - since) / 1000)) : '--:--';
}
export function LiveSticker({ since }: { since: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  return (
    <div className="live-row" role="group" aria-label="Live">
      <span className="live-sticker">LIVE</span>
      <span className="dock-time" title="Listening for">{listened(since, now)}</span>
    </div>
  );
}

// The now-playing card (spec feat-taste-cache §T2): the playlist's playing tile, bigger, with the author's face
// (or the cover, or the folder) as its round disc. When the track changes the old card drops away, as the song
// just played leaves the list for this session, and the new one slides in with its disc spinning into place.
function Disc({ item }: { item: MediaItem }) {
  const spot = authorSpot(item);
  return (
    <span className="now-disc">
      {spot.kind === 'profile' ? <Avatar pubkey={spot.pubkey} />
        : spot.kind === 'cover' ? <img src={spot.image} alt="" referrerPolicy="no-referrer" />
        : spot.kind === 'initial' ? <span className="author-initial">{spot.letter}</span>
        : spot.kind === 'folder' ? <FolderArt />
        : item.kind === 'video' ? <FilmIcon size={30} /> : <NoteIcon size={30} />}
    </span>
  );
}

function Card({ item, leaving, playing, onGone }: { item: MediaItem; leaving?: boolean; playing?: boolean; onGone?: () => void }) {
  const spot = authorSpot(item);
  const by = spot.kind === 'none' ? '' : ` by ${spot.label}`;
  return (
    <div className={`now-card ${leaving ? 'now-out' : 'now-in'}`} role={leaving ? undefined : 'img'} aria-hidden={leaving || undefined}
      aria-label={leaving ? undefined : `Now playing: ${item.title}${by}`} title={leaving ? undefined : item.title}
      onAnimationEnd={e => { if (leaving && e.target === e.currentTarget) onGone?.(); }}>
      <Disc item={item} />
      <span className="now-title">{item.title}</span>
      <span className="now-n" aria-hidden="true">{playing ? '▶' : '❚❚'}</span>
    </div>
  );
}

function NowCard({ item, playing }: { item: MediaItem | undefined; playing: boolean }) {
  const [shown, setShown] = useState(item);
  const [old, setOld] = useState<MediaItem | undefined>(undefined);
  if (item?.id !== shown?.id) {
    setOld(shown);
    setShown(item);
  }
  return (
    <>
      {old && <Card key={`out-${old.id}`} item={old} leaving onGone={() => setOld(undefined)} />}
      {shown && <Card key={shown.id} item={shown} playing={playing} />}
    </>
  );
}

// The media controls, top to bottom (spec feat-taste-cache §T2, §T6; zapa's layout): the now-playing card with
// up vote and down vote overlapping its sides and Hide artist (a post-it crossed out in red) on its bottom-right
// corner; previous / play / next; the speed post-it; the seek bar, full width. Seeking by steps is a double tap
// on the picture or the remote's keys.
export function PanelControls() {
  const p = usePlayer();
  const playing = p.status === 'playing' || p.status === 'loading';
  const has = p.queue.length > 0;
  const item = p.queue[p.index];
  const live = !!item?.live;
  const noun = item?.kind === 'video' ? 'video' : live ? 'station' : 'song';
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
          <NowCard item={item} playing={playing} />
          <button type="button" className={`taste-btn taste-up${up ? ' on' : ''}`} data-nav aria-pressed={up} aria-label="Up vote" disabled={!item}
            title="Up vote (a public like when logged in)" onClick={() => { if (item) run(item.id, toggleUpVote(item)); }}>
            <ThumbUpIcon size={22} />
          </button>
          <button type="button" className="taste-btn taste-down" data-nav aria-label="Down vote" disabled={!item}
            title="Down vote: hidden from your lists on this device" onClick={() => { if (item) run(item.id, downVote(item)); }}>
            <ThumbDownIcon size={22} />
          </button>
          {item?.pubkey && !live && (
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
      {live ? (
        <div className="pc-seek pc-live"><LiveSticker since={p.liveSince} /></div>
      ) : (
        <div className="pc-seek">
          <button type="button" className="postit postit-speed" data-nav disabled={!has} onClick={player.cycleRate} aria-label={`Speed ${p.rate}x`}>
            <span>speed</span> <b>×{p.rate}</b>
          </button>
          <SeekBar />
        </div>
      )}
      {item && note?.id === item.id && <p className="own-note bad pc-taste-note" role="status">{note.text}</p>}
      {live && p.error && <p className="own-note bad pc-taste-note" role="status">{p.error}</p>}
    </div>
  );
}
