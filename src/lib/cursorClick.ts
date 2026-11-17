import type { Point } from './cursor.ts';

// What is under the D-pad pointer, and a mouse click there (spec feat-tv-remote TV7-3). The pointer itself has
// pointer-events: none, so it is never what is under it.
export function under(at: Point): Element | null {
  return document.elementFromPoint(at.x, at.y);
}

// A mouse click at the pointer: pointer and mouse events with its position, focus, then the click itself.
export function clickAt(at: Point): void {
  const el = under(at);
  if (!(el instanceof HTMLElement)) return;
  const init = { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, button: 0 };
  el.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerType: 'mouse', isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mousedown', init));
  const focusable = el.closest<HTMLElement>('input, textarea, select, button, a[href], [tabindex]');
  focusable?.focus();
  el.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerType: 'mouse', isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mouseup', init));
  el.click();
}

