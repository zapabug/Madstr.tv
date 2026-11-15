import { player } from '../lib/player.ts';

// The one hidden <audio> for the whole app. It stays mounted, so music keeps playing
// while you move between the board and the viewer.
export function Engine() {
  return <audio ref={player.registerAudio} preload="metadata" />;
}
