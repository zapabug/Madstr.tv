import { usePlayer } from '../lib/player.ts';
import { NoteIcon } from './icons.tsx';
import { ExtraButtons, PlayerStrip } from './Transport.tsx';

// The media controls: the right 30% of the bottom panel. What is playing, the play button,
// seek bar, speed, and the small buttons (like, -10s, +30s).
export function PlayerPanel() {
  const p = usePlayer();
  const item = p.queue[p.index];
  const status = p.error ?? (p.status === 'loading' ? 'Loading…' : item?.subtitle ?? p.label);
  return (
    <aside className="panel player-panel" aria-label="Media controls">
      <div className="pp-top">
        <div className="cover">{item?.image ? <img src={item.image} alt="" referrerPolicy="no-referrer" /> : <NoteIcon size={24} />}</div>
        <div className="pp-text">
          <h2 className="now-title">{item ? item.title : 'Nothing playing'}</h2>
          <p className="now-sub" role="status">{item ? status : 'Pick something from the list.'}</p>
        </div>
      </div>
      <PlayerStrip />
      <ExtraButtons speed={false} />
    </aside>
  );
}
