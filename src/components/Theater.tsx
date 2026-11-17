import type { ViewData } from '../data/views.ts';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createTapper, seekForSide } from '../lib/doubleTap.ts';
import { firstSentence } from '../lib/media.ts';
import { player, usePlayer } from '../lib/player.ts';
import type { MediaItem } from '../lib/media.ts';
import type { PictureSources } from '../data/pictures.ts';
import { availableCount, usePictureMix } from '../lib/pictureMix.ts';
import { useAutoHide, wakeControls } from '../lib/useAutoHide.ts';
import { ImageIcon, MarkIcon, NextChevron, PersonIcon, PrevChevron } from './icons.tsx';
import { PickerPanel } from './PickerPanel.tsx';
import { PlayerPanel } from './PlayerPanel.tsx';
import { Slideshow, type SlideCommand } from './Slideshow.tsx';
import { Avatar } from './People.tsx';
import { Clock } from './Clock.tsx';
import { Ticker } from './Ticker.tsx';
import { TrackToast } from './TrackToast.tsx';

// Out of the home view the screen is split, as in the first Madstr: the picture (the
// slideshow behind music, the video itself for video) fills the top with the thin
// previous / next chevrons on its edges, and the bottom is split in two: the media picker
// on the left 70% (where the message board was), the media controls on the right 30%. After a while without input the bottom panel
// slides away and the picture takes the whole screen.
// emptyStage: what the picture area says when it has nothing to show (My pictures with no pictures yet).
export function Theater({ data, hasVideo, pictures, modeLabel, modeHref, emptyStage, pickerExtra }: { data: ViewData; hasVideo: boolean; pictures: PictureSources; modeLabel?: string; modeHref?: string; emptyStage?: string; pickerExtra?: ReactNode }) {
  const p = usePlayer();
  const item = p.queue[p.index];
  const showingVideo = hasVideo && item?.kind === 'video';
  const none = p.queue.length === 0;
  const mix = usePictureMix();
  const pictureCount = availableCount(pictures.mine.length, pictures.others.length, mix);
  // Autohide when there is anything on screen: a queue (music, podcasts, videos) or pictures
  // (the slideshow is not a queue, so queue.length alone never armed it in picture mode).
  const hidden = useAutoHide(p.queue.length > 0 || pictureCount > 0);
  const [slide, setSlide] = useState<MediaItem | null>(null);
  const [command, setCommand] = useState<SlideCommand | null>(null);
  const stepPicture = (dir: 1 | -1) => setCommand(c => ({ dir, n: (c?.n ?? 0) + 1 }));
  // Only pictures that came from a Nostr post have words to show; your own pictures have none.
  // Whose post is on screen: the picture's poster over a slideshow, the video's over a video.
  const author = showingVideo ? item?.pubkey : slide?.origin === 'nostr' ? slide.pubkey : undefined;
  const tickerText = !showingVideo && slide?.origin === 'nostr' ? firstSentence(slide.title) : '';

  // Taps on the picture (spec feat-taste-cache §T6): a double tap seeks (left half -10 s, right half +30 s) and
  // leaves the full picture alone; a single tap pauses / plays a video and brings the controls back.
  const [sign, setSign] = useState<{ seconds: number; n: number } | null>(null);
  const zone = useRef<HTMLDivElement>(null);
  const live = useRef({ showingVideo, none });
  live.current = { showingVideo, none };
  const tapper = useRef<ReturnType<typeof createTapper> | null>(null);
  tapper.current ??= createTapper({
    onSingle: () => {
      if (live.current.showingVideo) player.toggle();
      wakeControls();
    },
    onDouble: tap => {
      const box = zone.current?.getBoundingClientRect();
      if (!box || live.current.none || player.current?.live) return; // nothing to seek on a live station
      const seconds = seekForSide(tap.x, box.left, box.width);
      player.seekBy(seconds);
      setSign(s => ({ seconds, n: (s?.n ?? 0) + 1 }));
    },
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: handle => window.clearTimeout(handle as number),
  });
  useEffect(() => () => tapper.current?.cancel(), []);
  useEffect(() => {
    if (!sign) return;
    const timer = window.setTimeout(() => setSign(null), 700);
    return () => window.clearTimeout(timer);
  }, [sign]);
  const onTap = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    tapper.current?.tap({ x: event.clientX, y: event.clientY, t: event.timeStamp });
  };

  return (
    <main className="theater" data-hidden={hidden ? 'true' : undefined}>
      <div className="media" data-nav-group>
        <div className="stage-full" ref={zone} data-tap-zone onPointerUp={onTap}>
          {hasVideo && <video ref={player.registerVideo} playsInline hidden={!showingVideo} />}
          {!showingVideo && <Slideshow mine={pictures.mine} others={pictures.others} onCurrent={setSlide} command={command} />}
          {!showingVideo && pictureCount === 0 && emptyStage && (
            <div className="stage-empty">
              <ImageIcon size={56} />
              <p>{emptyStage}</p>
              <a className="chip-btn solid yours-btn" href="#/people/sources" data-nav aria-label="Make it yours"><PersonIcon size={18} /> Make it yours</a>
            </div>
          )}
        </div>
        {sign && (
          <div key={sign.n} className={`tap-sign ${sign.seconds < 0 ? 'tap-back' : 'tap-forward'}`} aria-hidden="true">
            {sign.seconds < 0 ? `−${-sign.seconds} s` : `+${sign.seconds} s`}
          </div>
        )}
        <div className="topline">
          <Clock />
          <Ticker text={tickerText} />
          <span className="brand" aria-hidden="true">Juke<MarkIcon boltOnly className="bolt-mark" />tr</span>
        </div>
        <div className="bottomline">
          {author && <Avatar pubkey={author} />}
          <TrackToast item={item?.kind === 'audio' ? item : undefined} />
        </div>
        {/* As in the first Madstr: previous / next item of what fills the picture area. Over a
            slideshow that is the pictures; over a video it is the videos. The songs have their own
            previous / next in the controls. */}
        <button type="button" className="edge edge-prev" data-no-wake aria-label={showingVideo ? 'Previous video' : 'Previous picture'} data-nav
          disabled={showingVideo ? none : pictureCount < 2} onClick={() => (showingVideo ? player.prev() : stepPicture(-1))}><PrevChevron stretch /></button>
        <button type="button" className="edge edge-next" data-no-wake aria-label={showingVideo ? 'Next video' : 'Next picture'} data-nav
          disabled={showingVideo ? none : pictureCount < 2} onClick={() => (showingVideo ? player.next() : stepPicture(1))}><NextChevron stretch /></button>
        {modeLabel && modeHref && <a className="mode-chip" href={modeHref} data-nav>{modeLabel}</a>}
      </div>
      <div className="split">
        <PickerPanel label={data.label} emptyText={data.emptyText} waiting={data.waiting} extra={pickerExtra} more={data.more} />
        <PlayerPanel />
      </div>
    </main>
  );
}
