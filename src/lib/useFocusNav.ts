import { useEffect } from 'react';
import { arrowLeavesField, directionForKey, pickNext, type Box, type Field } from './focusNav.ts';

const NAV = '[data-nav]';

function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

// While a dialog marked data-nav-modal is open (Radio's genre picker), the arrows stay inside it.
function visibleTargets(): HTMLElement[] {
  const root: ParentNode = document.querySelector('[data-nav-modal]') ?? document;
  return Array.from(root.querySelectorAll<HTMLElement>(NAV)).filter(el => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

const TEXT_TYPES = new Set(['text', 'url', 'search', 'email', 'tel', 'password']);

// What kind of form field the key came from, for arrowLeavesField (spec R8).
function fieldOf(target: EventTarget | null): Field {
  if (!(target instanceof HTMLElement)) return { kind: 'none' };
  if (target instanceof HTMLInputElement) {
    if (target.type === 'range') return { kind: 'range' };
    if (TEXT_TYPES.has(target.type)) {
      let start: number | null = null;
      let end: number | null = null;
      try { start = target.selectionStart; end = target.selectionEnd; } catch { /* type without a caret */ }
      return { kind: 'text', start, end, length: target.value.length };
    }
    return { kind: 'none' };
  }
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return { kind: 'other' };
  return { kind: 'none' };
}

// Up / Down / Left / Right move focus between anything marked data-nav, like a
// remote. Enter and Space keep doing what the focused link or button does. Text boxes and
// sliders keep the arrows they need and let go of the rest (spec R8).
export function useFocusNav(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const direction = directionForKey(event.key);
      if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
      if (!arrowLeavesField(direction, fieldOf(event.target))) return;

      const targets = visibleTargets();
      if (targets.length === 0) return;

      const current = targets.findIndex(el => el === document.activeElement);
      event.preventDefault();
      if (current < 0) {
        targets[0].focus();
        return;
      }
      // Stay inside the area you are in (picture area, picker, controls: data-nav-group); cross to
      // another area only when nothing lies further that way inside this one (spec R8).
      const group = targets[current].closest('[data-nav-group]');
      let next: number | null = null;
      if (group) {
        const inGroup = targets.flatMap((el, i) => (el.closest('[data-nav-group]') === group ? [i] : []));
        const local = pickNext(inGroup.map(i => boxOf(targets[i])), inGroup.indexOf(current), direction);
        if (local !== null) next = inGroup[local];
      }
      if (next === null) next = pickNext(targets.map(boxOf), current, direction);
      if (next === null) return;
      targets[next].focus();
      targets[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
