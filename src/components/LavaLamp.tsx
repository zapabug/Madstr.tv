import { useEffect, useRef, useState } from 'react';
import { startLavaLamp } from '../lib/lavaLamp.ts';
import { startLavaLamp as startFocusedLavaLamp } from '../lib/lavaLampFocused.ts';
import { useLava } from '../lib/lavaSettings.ts';
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
  const lava = useLava();
  const on = useLampWanted() && lava.on;
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!on || !el) return;
    const tap = createSoundTap(player.soundElement);
    const start = lava.style === 'focused' ? startFocusedLavaLamp : startLavaLamp;
    const stop = start(el, tap);
    if (!stop) { tap.close(); return; } // no WebGL2 float textures: black, as before
    return () => { stop(); tap.close(); };
  }, [on, lava.style]);
  // A fresh canvas per style: the two lamps compile different shaders and should not share a live WebGL context.
  return on ? <canvas key={lava.style} ref={canvas} className="lava-lamp" aria-hidden="true" /> : null;
}
