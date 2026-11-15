import type { ViewData } from '../data/views.ts';
import { useState } from 'react';
import { firstSentence } from '../lib/media.ts';
import { player, usePlayer } from '../lib/player.ts';
import type { MediaItem } from '../lib/media.ts';
import { useAutoHide } from '../lib/useAutoHide.ts';
import { NextChevron, PrevChevron } from './icons.tsx';
import { PickerPanel } from './PickerPanel.tsx';
import { PlayerPanel } from './PlayerPanel.tsx';
import { Slideshow } from './Slideshow.tsx';
import { Ticker } from './Ticker.tsx';
import { TrackToast } from './TrackToast.tsx';

// Out of the home view the screen is split, as in the first Madstr: the picture (the
// slideshow behind music, the video itself for video) fills the top with the thin
// previous / next chevrons on its edges, and the bottom is split in two: the media picker
// on the left 70% (where the message board was), the media controls on the right 30%. After a while without input the bottom panel
// slides away and the picture takes the whole screen.
export function Theater({ data, hasVideo, pictures, modeLabel, modeHref }: { data: ViewData; hasVideo: boolean; pictures: MediaItem[]; modeLabel?: string; modeHref?: string }) {
  const p = usePlayer();
  const item = p.queue[p.index];
  const showingVideo = hasVideo && item?.kind === 'video';
  const hidden = useAutoHide(p.queue.length > 0);
  const none = p.queue.length === 0;
  const [slide, setSlide] = useState<MediaItem | null>(null);
  // Only pictures that came from a Nostr post have words to show; your own pictures have none.
  const tickerText = !showingVideo && slide?.origin === 'nostr' ? firstSentence(slide.title) : '';

  return (
    <main className="theater" data-hidden={hidden ? 'true' : undefined}>
      <div className="media">
        <div className="stage-full">
          {hasVideo && <video ref={player.registerVideo} playsInline onClick={player.toggle} hidden={!showingVideo} />}
          {!showingVideo && <Slideshow images={pictures} onCurrent={setSlide} />}
        </div>
        <TrackToast item={item?.kind === 'audio' ? item : undefined} />
        <Ticker text={tickerText} />
        <span className="brand" aria-hidden="true">Mad<span className="bolt-mark">⚡</span>tr.tv</span>
        <button type="button" className="edge edge-prev" aria-label="Previous" data-nav disabled={none} onClick={player.prev}><PrevChevron /></button>
        <button type="button" className="edge edge-next" aria-label="Next" data-nav disabled={none} onClick={player.next}><NextChevron /></button>
        {modeLabel && modeHref && <a className="mode-chip" href={modeHref} data-nav>{modeLabel}</a>}
      </div>
      <div className="split">
        <PickerPanel label={data.label} emptyText={data.emptyText} waiting={data.waiting} />
        <PlayerPanel />
      </div>
    </main>
  );
}
