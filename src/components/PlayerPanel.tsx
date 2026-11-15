import { ExtraButtons, PlayerStrip } from './Transport.tsx';

// The media controls: the right 30% of the bottom panel, and only controls: play, seek bar,
// speed, and the small buttons (like, -10s, +30s). What is playing is shown in the picker's header.
export function PlayerPanel() {
  return (
    <aside className="panel player-panel" aria-label="Media controls">
      <PlayerStrip />
      <ExtraButtons speed={false} />
    </aside>
  );
}
