import { useEffect, useState } from 'react';

// As in the first Madstr: the controls fade away after a while with no mouse, key or
// touch, and come straight back on the next one. 45 seconds, like before.
export const AUTOHIDE_MS = 45_000;

function configuredMs(): number {
  // Only for testing: localStorage 'madstr:hideMs' shortens the wait.
  try {
    const n = Number(localStorage.getItem('madstr:hideMs'));
    return Number.isFinite(n) && n >= 500 ? n : AUTOHIDE_MS;
  } catch {
    return AUTOHIDE_MS;
  }
}

export function useAutoHide(enabled: boolean): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }
    const ms = configuredMs();
    let timer = 0;
    const wake = () => {
      setHidden(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setHidden(true), ms);
    };
    wake();
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach(e => window.addEventListener(e, wake, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, wake));
    };
  }, [enabled]);

  return hidden;
}
