import { useEffect, useState } from 'react';

// As in the first Madstr: the controls fade away after a while with no mouse, key or
// touch, and come straight back on the next one. 25 seconds (spec §Split screen; zapa 2026-11-15, was 45).
export const AUTOHIDE_MS = 25_000;

/** Bring the controls back from code (a single tap on the picture). */
export const WAKE_EVENT = 'madstr:wake';
export function wakeControls(): void {
  window.dispatchEvent(new Event(WAKE_EVENT));
}

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
    // Touches and presses on the picture (`data-tap-zone`) do not wake by themselves: the picture decides once it
    // knows a single tap from a double tap, and sends WAKE_EVENT for a single one (spec feat-taste-cache §T6).
    const onInput = (event: Event) => {
      const inZone = event.target instanceof Element && event.target.closest('[data-tap-zone]') !== null;
      if (inZone && (event.type !== 'pointermove' || (event as PointerEvent).pointerType === 'touch')) return;
      wake();
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach(e => window.addEventListener(e, onInput, { passive: true }));
    window.addEventListener(WAKE_EVENT, wake);
    return () => {
      window.clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, onInput));
      window.removeEventListener(WAKE_EVENT, wake);
    };
  }, [enabled]);

  return hidden;
}
