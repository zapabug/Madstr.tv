import type { ReactNode } from 'react';
import type { ViewData } from '../data/views.ts';
import { usePictures } from '../data/pictures.ts';
import { player, usePlayer } from '../lib/player.ts';
import { useAutoHide } from '../lib/useAutoHide.ts';
import { NextChevron, PrevChevron } from './icons.tsx';
import { PickerPanel } from './PickerPanel.tsx';
import { PlayerPanel } from './PlayerPanel.tsx';
import { Slideshow } from './Slideshow.tsx';

// Out of the home view the screen is split, as in the first Madstr: the picture (the
// slideshow behind music, the video itself for video) fills the top with the thin
// previous / next chevrons on its edges, and the bottom is split in two: the media picker
// on the left, the player on the right. After a while without input the bottom panel
// slides away and the picture takes the whole screen.
export function Theater({ data, hasVideo, extras, modeLabel, modeHref }: { data: ViewData; hasVideo: boolean; extras?: ReactNode; modeLabel?: string; modeHref?: string }) {
  const p = usePlayer();
  const item = p.queue[p.index];
  const showingVideo = hasVideo && item?.kind === 'video';
  const hidden = useAutoHide(p.queue.length > 0);
  const pictures = usePictures();
  const none = p.queue.length === 0;

  return (
    <main className="theater" data-hidden={hidden ? 'true' : undefined}>
      <div className="media">
        <div className="stage-full">
          {hasVideo && <video ref={player.registerVideo} playsInline onClick={player.toggle} hidden={!showingVideo} />}
          {!showingVideo && <Slideshow images={pictures} />}
          {item && <p className="caption" aria-hidden="true">{item.title}{item.subtitle ? ` · ${item.subtitle}` : ''}</p>}
        </div>
        <span className="brand" aria-hidden="true">Mad<span className="bolt-mark">⚡</span>tr.tv</span>
        <button type="button" className="edge edge-prev" aria-label="Previous" data-nav disabled={none} onClick={player.prev}><PrevChevron /></button>
        <button type="button" className="edge edge-next" aria-label="Next" data-nav disabled={none} onClick={player.next}><NextChevron /></button>
        {modeLabel && modeHref && <a className="mode-chip" href={modeHref} data-nav>{modeLabel}</a>}
      </div>
      <div className="split">
        <PickerPanel label={data.label} emptyText={data.emptyText} waiting={data.waiting} extras={extras} />
        <PlayerPanel />
      </div>
    </main>
  );
}
