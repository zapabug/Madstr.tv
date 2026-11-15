import { usePlayer } from '../lib/player.ts';
import { NoteIcon } from './icons.tsx';
import { ExtraButtons, SeekBar, TransportButtons } from './Transport.tsx';

// The player, on the right: what is playing and its controls.
export function PlayerPanel() {
  const p = usePlayer();
  const item = p.queue[p.index];
  const status = p.error ?? (p.status === 'loading' ? 'Loading…' : item?.subtitle ?? p.label);
  return (
    <aside className="panel player-panel" aria-label="Player">
      <div className="cover">
        {item?.image ? <img src={item.image} alt="" referrerPolicy="no-referrer" /> : <NoteIcon size={64} />}
      </div>
      <h2 className="now-title">{item ? item.title : 'Nothing playing'}</h2>
      <p className="now-sub" role="status">{item ? status : 'Pick something from the list.'}</p>
      <TransportButtons />
      <SeekBar />
      <ExtraButtons />
    </aside>
  );
}
