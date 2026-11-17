import { useEffect } from 'react';
import { cursorOn } from './cursorState.ts';
import { lockAct } from './textLock.ts';

// Text boxes wait for OK (spec feat-tv-remote TV4); the rules are in textLock.ts. A locked box is read-only and
// marked data-nav-locked, so the arrows treat it like any control (useFocusNav) and the TV keyboard stays shut.
export const LOCKED = 'data-nav-locked';
const TEXT_TYPES = new Set(['text', 'url', 'search', 'email', 'tel', 'password']);
// A focus this soon after a tap or click on the same box came from that tap (number logged in planning.md).
const POINTER_FOCUS_MS = 1000;

type Box = HTMLInputElement | HTMLTextAreaElement;

function textBox(el: EventTarget | null): Box | null {
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement && TEXT_TYPES.has(el.type)) return el;
  return null;
}

function lock(box: Box): void {
  if (box.readOnly && !box.hasAttribute(LOCKED)) return; // read-only on its own: not ours to touch
  box.readOnly = true;
  box.setAttribute(LOCKED, '');
}

function unlock(box: Box): void {
  if (!box.hasAttribute(LOCKED)) return;
  box.readOnly = false;
  box.removeAttribute(LOCKED);
}

// The VirtualKeyboard API, where the WebView has it (asks the TV keyboard to show).
type KeyboardNav = Navigator & { virtualKeyboard?: { show?: () => void } };

export function useTextBoxes(): void {
  useEffect(() => {
    let tapped: { box: Box; at: number } | null = null;
    let reopening: Box | null = null; // the box being re-focused to bring up the keyboard: do not lock it

    const onPointer = (event: PointerEvent) => {
      const box = textBox(event.target);
      if (!box) return;
      tapped = { box, at: performance.now() };
      if (lockAct({ kind: 'pointer' }) === 'unlock') unlock(box);
    };

    const onFocusIn = (event: FocusEvent) => {
      const box = textBox(event.target);
      if (!box || box === reopening) return;
      const byPointer = tapped !== null && tapped.box === box && performance.now() - tapped.at < POINTER_FOCUS_MS;
      if (lockAct({ kind: 'focus', byPointer }) === 'lock') lock(box);
    };

    const onFocusOut = (event: FocusEvent) => {
      const box = textBox(event.target);
      if (box && box !== reopening) unlock(box);
    };

    const onKey = (event: KeyboardEvent) => {
      const box = textBox(document.activeElement);
      if (!box || cursorOn() || event.altKey || event.ctrlKey || event.metaKey) return;
      const act = lockAct({ kind: 'key', key: event.key, locked: box.hasAttribute(LOCKED) });
      if (act === 'open') {
        // OK opens the box: no submit, nothing else sees this key.
        event.preventDefault();
        event.stopPropagation();
        unlock(box);
        reopening = box;
        box.blur();
        box.focus(); // a focus inside the key press brings up the keyboard
        reopening = null;
        (navigator as KeyboardNav).virtualKeyboard?.show?.();
      } else if (act === 'unlock') {
        unlock(box);
      } else if (act === 'relock-after') {
        window.setTimeout(() => { if (document.activeElement === box) lock(box); }, 0);
      }
    };

    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);
}
