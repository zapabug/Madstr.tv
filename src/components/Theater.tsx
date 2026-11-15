import type { ReactNode } from 'react';
import type { ViewData } from '../data/views.ts';
import { usePictures } from '../data/pictures.ts';
import { player, usePlayer } from '../lib/player.ts';
import { useAutoHide } from '../lib/useAutoHide.ts';
import { PickerPanel } from './PickerPanel.tsx';
import { PlayerPanel } from './PlayerPanel.tsx';
import { Slideshow } from './Slideshow.tsx';

// Playing: the picture fills the screen (the slideshow behind music, the video itself for
// video), the media picker is on the left and the player on the right, and both fade away
// when nobody touches anything.
export function Theater({ data, hasVideo, extras }: { data: ViewData; hasVideo: boolean; extras?: ReactNode }) {
  const p = usePlayer();
  const item = p.queue[p.index];
  const showingVideo = hasVideo && item?.kind === 'video';
  const hidden = useAutoHide(p.queue.length > 0);
  const pictures = usePictures();

  return (
    <main className="theater" data-hidden={hidden ? 'true' : undefined}>
      <div className="stage-full">
        {hasVideo && <video ref={player.registerVideo} playsInline onClick={player.toggle} hidden={!showingVideo} />}
        {!showingVideo && <Slideshow images={pictures} />}
        {item && <p className="caption" aria-hidden="true">{item.title}{item.subtitle ? ` · ${item.subtitle}` : ''}</p>}
      </div>
      <PickerPanel label={data.label} emptyText={data.emptyText} waiting={data.waiting} extras={extras} />
      <PlayerPanel />
    </main>
  );
}
