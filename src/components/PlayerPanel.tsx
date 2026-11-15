import { PanelControls } from './Transport.tsx';

// The media controls: the right 30% of the bottom panel, and only controls. What is playing
// is shown in the picker's header.
export function PlayerPanel() {
  return (
    <aside className="panel player-panel" aria-label="Media controls" data-nav-group>
      <PanelControls />
    </aside>
  );
}
