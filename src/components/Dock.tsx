import { usePlayer } from '../lib/player.ts';
import { ExtraButtons, TransportButtons } from './Transport.tsx';

// The slim player bar along the bottom of the board and the plain pages, so music keeps
// a control within reach wherever you are. No seek bar here (zapa, feat-phone-inline §P22): seeking is in the
// theatre's own player panel.
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
        </div>
        <ExtraButtons />
      </div>
    </section>
  );
}
