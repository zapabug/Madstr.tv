import { useEffect } from 'react';
import { directionForKey, pickNext, type Box } from './focusNav.ts';

const NAV = '[data-nav]';

function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function visibleTargets(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(NAV)).filter(el => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

// Up / Down / Left / Right move focus between anything marked data-nav, like a
// remote. Enter and Space keep doing what the focused link or button does.
export function useFocusNav(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const direction = directionForKey(event.key);
      if (!direction || event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;

      const targets = visibleTargets();
      if (targets.length === 0) return;

      const current = targets.findIndex(el => el === document.activeElement);
      event.preventDefault();
      if (current < 0) {
        targets[0].focus();
        return;
      }
      const next = pickNext(targets.map(boxOf), current, direction);
      if (next === null) return;
      targets[next].focus();
      targets[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
