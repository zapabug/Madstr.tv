import { NextIcon, PlayIcon, PrevIcon } from './icons.tsx';

// The bottom panel: dedicated to the media player and the playlist, present on
// the board and in the viewer. R1 is the shell only: nothing is queued yet, so
// the controls are shown but off. R2 wires the audio element, queue and resume.
export function Dock() {
  return (
    <section className="dock" aria-label="Player">
      <div className="dock-controls" role="group" aria-label="Playback">
        <button type="button" className="dock-btn" aria-label="Previous" disabled>
          <PrevIcon size={28} />
        </button>
        <button type="button" className="dock-btn dock-play" aria-label="Play" disabled>
          <PlayIcon size={34} />
        </button>
        <button type="button" className="dock-btn" aria-label="Next" disabled>
          <NextIcon size={28} />
        </button>
      </div>
      <div className="dock-now">
        <p className="dock-title">Nothing queued yet</p>
        <p className="dock-sub">Pick a sticker to start.</p>
      </div>
    </section>
  );
}
