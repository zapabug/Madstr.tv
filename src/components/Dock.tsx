import { usePlayer } from '../lib/player.ts';
import { ExtraButtons, SeekBar, TransportButtons } from './Transport.tsx';

// The slim player bar along the bottom of the board and the plain pages, so music keeps
// a control within reach wherever you are. The theatre has its own player panel.
export function Dock() {
  const p = usePlayer();
  const item = p.queue[p.index];
  const status = p.error ?? (p.status === 'loading' ? 'Loading…' : item?.subtitle ?? p.label);
  return (
    <section className="dock" aria-label="Player">
      <div className="dock-bar">
        <TransportButtons />
        <div className="dock-now">
          <p className="dock-title">{item ? item.title : 'Nothing queued yet'}</p>
          <p className="dock-sub" role="status">{item ? status : 'Pick a sticker to start.'}</p>
          <SeekBar />
        </div>
        <ExtraButtons />
      </div>
    </section>
  );
}
