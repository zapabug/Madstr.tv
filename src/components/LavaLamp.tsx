import { useEffect, useRef, useState } from 'react';
import { startLavaLamp } from '../lib/lavaLamp.ts';
import { player } from '../lib/player.ts';
import { createSoundTap } from '../lib/soundTap.ts';

// The lava lamp behind the slideshow (spec feat-lava-lamp): on every device the app runs on, but never with
// reduced motion (LL-R5); a device without WebGL2 float textures just keeps the black stage.
function useLampWanted(): boolean {
  const wanted = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [on, setOn] = useState(wanted);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const check = () => setOn(wanted());
    motion.addEventListener('change', check);
    return () => motion.removeEventListener('change', check);
  }, []);
  return on;
}

export function LavaLamp() {
  const on = useLampWanted();
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!on || !el) return;
    const tap = createSoundTap(player.soundElement);
    const stop = startLavaLamp(el, tap);
    if (!stop) { tap.close(); return; } // no WebGL2 float textures: black, as before
    return () => { stop(); tap.close(); };
  }, [on]);
  return on ? <canvas ref={canvas} className="lava-lamp" aria-hidden="true" /> : null;
}
