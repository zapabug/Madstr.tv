import { useEffect } from 'react';
import { CURSOR, edgePush, moveBy, speedAt, type Dir, type Point } from '../lib/cursor.ts';
import { cursorAt, cursorOn, setCursor, useCursor } from '../lib/cursorState.ts';
import { onBack } from '../lib/backStack.ts';
import { under } from '../lib/cursorClick.ts';
import { OK_HOLD_EVENT } from '../lib/useRemoteKeys.ts';
import { wakeControls } from '../lib/useAutoHide.ts';

// The D-pad pointer (spec feat-tv-remote TV7): hold OK to turn it on (or off again); the arrows move it, OK
// clicks what is under it as a mouse click would, it scrolls at the screen's edge, Back or Esc turns it off.
// Drawn by the page, so it works in the app on any TV and in a TV's browser.
const KEYS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

function screen() {
  return { width: window.innerWidth, height: window.innerHeight };
}

// Where the pointer starts: the middle of the focused control, else the middle of the screen.
function startPoint(): Point {
  const a = document.activeElement;
  if (a instanceof HTMLElement && a !== document.body) {
    const r = a.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

// What scrolls under the pointer, in the direction it is pushed: the nearest scrollable box, else the page.
function scrollerAt(at: Point, push: Point): Element | null {
  for (let el = under(at); el && el !== document.body; el = el.parentElement) {
    const s = getComputedStyle(el);
    const canY = push.y !== 0 && /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight;
    const canX = push.x !== 0 && /(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth;
    if (canY || canX) return el;
  }
  return document.scrollingElement;
}

function turnOn(): void {
  setCursor({ on: true, at: startPoint() });
  wakeControls();
}

// Off: focus goes to the control under the pointer if it is one, otherwise it stays where it was.
function turnOff(): void {
  const target = under(cursorAt())?.closest<HTMLElement>('[data-nav]');
  setCursor({ on: false });
  if (target) target.focus();
}

export function Cursor() {
  const { on, at } = useCursor();

  // Holding OK turns it on, or off again.
  useEffect(() => {
    const toggle = () => { if (cursorOn()) turnOff(); else turnOn(); };
    window.addEventListener(OK_HOLD_EVENT, toggle);
    return () => window.removeEventListener(OK_HOLD_EVENT, toggle);
  }, []);

  // While on: the arrows move it (they no longer move focus), Esc / Back turn it off, the edge scrolls.
  useEffect(() => {
    if (!on) return;
    const held = new Map<Dir, number>(); // direction → when it went down
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      let at = cursorAt();
      const moving: Dir[] = [];
      let fastest = 0;
      held.forEach((since, d) => {
        if (now - since > CURSOR.holdDelayMs) { moving.push(d); fastest = Math.max(fastest, speedAt(now - since)); }
      });
      if (moving.length) at = moveBy(at, moving, (fastest * dt) / 1000, screen());
      const push = edgePush(at, screen());
      if (push.x || push.y) {
        const px = (CURSOR.scrollPxPerS * dt) / 1000;
        scrollerAt(at, push)?.scrollBy({ left: push.x * px, top: push.y * px });
      }
      if (moving.length) { setCursor({ at }); wakeControls(); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const onDown = (event: KeyboardEvent) => {
      const dir = KEYS[event.key];
      if (dir) {
        event.preventDefault();
        event.stopPropagation(); // not for focus navigation while the pointer is on
        if (!held.has(dir)) { // the first press moves a step; the TV's repeats do nothing more
          held.set(dir, performance.now());
          setCursor({ at: moveBy(cursorAt(), [dir], CURSOR.stepPx, screen()) });
          wakeControls();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        turnOff();
      }
    };
    const onUp = (event: KeyboardEvent) => {
      const dir = KEYS[event.key];
      if (dir) { held.delete(dir); event.stopPropagation(); }
    };
    const offBack = onBack(turnOff);
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    return () => {
      cancelAnimationFrame(frame);
      offBack();
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
    };
  }, [on]);

  if (!on) return null;
  return (
    <div className="dpad-cursor" style={{ transform: `translate(${at.x}px, ${at.y}px)` }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="36" height="36"><path d="M3 2l17 9-7 2-3 7z" fill="#fff" stroke="#000" strokeWidth="1.6" strokeLinejoin="round" /></svg>
    </div>
  );
}
