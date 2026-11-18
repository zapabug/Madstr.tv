import { useEffect, useRef, useState } from 'react';
import { startLavaLamp } from '../lib/lavaLamp.ts';
import { player } from '../lib/player.ts';
import { isTv } from '../lib/qrPopup.ts';
import { createSoundTap } from '../lib/soundTap.ts';

// The lava lamp behind the slideshow (spec feat-lava-lamp): only on a TV and not with reduced motion (LL-R5).
// The TV mark arrives a moment after start (the app asks Android), so it is watched rather than read once.
function useLampWanted(): boolean {
  const wanted = () => isTv() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [on, setOn] = useState(wanted);
  useEffect(() => {
    const check = () => setOn(wanted());
    const watch = new MutationObserver(check);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tv'] });
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    motion.addEventListener('change', check);
    check();
    return () => { watch.disconnect(); motion.removeEventListener('change', check); };
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
