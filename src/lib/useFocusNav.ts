import { useEffect } from 'react';
import { arrowLeavesField, directionForKey, handOver, pickArea, pickNext, startIndex, type Box, type Candidate, type Field } from './focusNav.ts';

const NAV = '[data-nav]';
const GROUP = '[data-nav-group]';
const DOOR = '[data-nav-default]';
const BAR = '[data-nav-bar]';
// How long a new screen may take to show its start point (data arrives after the first render) before focus
// falls back to the screen's first control (feat-tv-remote TV1-1; number logged in planning.md).
const START_WAIT_MS = 1500;
const START_POLL_MS = 100;

function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function usable(el: HTMLElement): boolean {
  if (!el.isConnected || el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// While a dialog marked data-nav-modal is open (Radio's genre picker), the arrows stay inside it.
function visibleTargets(): HTMLElement[] {
  const root: ParentNode = document.querySelector('[data-nav-modal]') ?? document;
  return Array.from(root.querySelectorAll<HTMLElement>(NAV)).filter(usable);
}

const TEXT_TYPES = new Set(['text', 'url', 'search', 'email', 'tel', 'password']);

function isTextBox(el: HTMLElement): boolean {
  return (el instanceof HTMLInputElement && TEXT_TYPES.has(el.type)) || el instanceof HTMLTextAreaElement || el.isContentEditable;
}

// A fallback never lands on Log in / Log out (data-nav-nofallback, TV1-3), nor in a text box, which would
// open the keyboard on a TV.
function candidateOf(el: HTMLElement): Candidate {
  const mark = el.getAttribute('data-nav-start');
  const start = mark === null ? null : Number(mark) || 1;
  return { box: boxOf(el), start, noFallback: el.hasAttribute('data-nav-nofallback') || isTextBox(el) };
}

// What kind of form field the key came from, for arrowLeavesField (spec R8).
function fieldOf(target: EventTarget | null): Field {
  if (!(target instanceof HTMLElement)) return { kind: 'none' };
  // A text box locked until OK (feat-tv-remote TV4) is like any control: every arrow moves on.
  if (target.hasAttribute('data-nav-locked')) return { kind: 'none' };
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

function focusOn(el: HTMLElement): void {
  el.focus();
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// Where focus was last, so it can be handed over when that control vanishes (TV1-2).
let last: { el: HTMLElement; box: Box; group: Element | null } | null = null;

// Each area's last focused control, for coming back to it (TV2-2). Forgotten on a new screen.
let areaMemory = new WeakMap<Element, HTMLElement>();

// Where arrowing into an area lands (TV2-1, TV2-2): an area with a front door (data-nav-default: the player
// panel's Play/Pause) is always entered there; any other area at the control you were on in it, if that is still
// there; else null (the geometric pick stands). Door before memory: see planning.md (TV2, spec conflict).
function entryOf(area: Element, targets: HTMLElement[]): HTMLElement | null {
  const door = area.querySelector<HTMLElement>(DOOR);
  if (door && targets.includes(door)) return door;
  const remembered = areaMemory.get(area);
  return remembered && targets.includes(remembered) ? remembered : null;
}

function remember(el: HTMLElement): void {
  last = { el, box: boxOf(el), group: el.closest(GROUP) };
}

function focusIsLost(): boolean {
  const a = document.activeElement;
  if (!a || a === document.body || a === document.documentElement) return true;
  return a instanceof HTMLElement && a.matches(NAV) && !usable(a);
}

// Put focus back somewhere sensible: where it was if that is still there, else the nearest control to it
// (its own area first), else the screen's start point. Returns whether focus was placed.
function recover(): boolean {
  const targets = visibleTargets();
  if (targets.length === 0) return false;
  if (last && targets.includes(last.el)) {
    focusOn(last.el);
    return true;
  }
  const candidates = targets.map(candidateOf);
  let index: number | null = null;
  if (last) {
    const group = last.group?.isConnected ? last.group : null;
    const prefer = group ? targets.flatMap((el, i) => (group.contains(el) ? [i] : [])) : [];
    index = handOver(candidates, last.box, prefer);
  }
  if (index === null) index = startIndex(candidates);
  if (index === null) return false;
  focusOn(targets[index]);
  return true;
}

// A new screen (or the app opening): focus its start point. The marked start may arrive a moment after the
// first render, so wait for it up to START_WAIT_MS, then take the first control a fallback may choose.
function focusStart(): () => void {
  const began = Date.now();
  const before = document.activeElement;
  let timer = 0;
  const tryStart = () => {
    const targets = visibleTargets();
    // Something on the new screen already put focus on a control (a pop-up opening on its own field): leave it.
    const active = document.activeElement;
    if (active !== before && active instanceof HTMLElement && targets.includes(active)) return;
    const candidates = targets.map(candidateOf);
    const marked = candidates.some(c => c.start !== null);
    const waited = Date.now() - began >= START_WAIT_MS;
    if (marked || (waited && targets.length > 0)) {
      const index = startIndex(candidates);
      if (index !== null) {
        focusOn(targets[index]);
        return;
      }
    }
    if (!waited || targets.length === 0) timer = window.setTimeout(tryStart, START_POLL_MS);
  };
  // Stop waiting once the person has moved focus themselves.
  const stop = () => window.clearTimeout(timer);
  timer = window.setTimeout(tryStart, 0);
  window.addEventListener('keydown', stop, { once: true, capture: true });
  window.addEventListener('pointerdown', stop, { once: true, capture: true });
  return () => {
    stop();
    window.removeEventListener('keydown', stop, { capture: true });
    window.removeEventListener('pointerdown', stop, { capture: true });
  };
}

// Up / Down / Left / Right move focus between anything marked data-nav, like a
// remote. Enter and Space keep doing what the focused link or button does. Text boxes and
// sliders keep the arrows they need and let go of the rest (spec R8). Focus is never lost (feat-tv-remote TV1).
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
        // Focus was lost or outside the controls: put it back rather than jump to the first control (TV1-3).
        recover();
        return;
      }
      // Stay inside the area you are in (picture area, picker, controls: data-nav-group); cross to
      // another area only when nothing lies further that way inside this one (spec R8).
      const group = targets[current].closest(GROUP);
      let next: number | null = null;
      if (group) {
        const inGroup = targets.flatMap((el, i) => (el.closest(GROUP) === group ? [i] : []));
        const local = pickNext(inGroup.map(i => boxOf(targets[i])), inGroup.indexOf(current), direction);
        if (local !== null) next = inGroup[local];
      }
      // A bar fixed over the page (the player bar, data-nav-bar) is reached only when nothing else lies that way,
      // so Down from a sticker goes to the next row of stickers (feat-tv-remote TV2-4).
      if (next === null && !targets[current].closest(BAR)) {
        const notBar = targets.flatMap((el, i) => (i === current || !el.closest(BAR) ? [i] : []));
        const pick = pickNext(notBar.map(i => boxOf(targets[i])), notBar.indexOf(current), direction);
        if (pick !== null) next = notBar[pick];
      }
      if (next === null) next = pickNext(targets.map(boxOf), current, direction);
      // Nothing lines up that way, but another area lies there (a low playlist tile, the player panel to its
      // right): go into that area (TV2-1).
      let area: Element | null = null;
      if (next === null && group) {
        const areas = [...new Set(targets.map(el => el.closest(GROUP)).filter((g): g is Element => g !== null && g !== group))];
        const a = pickArea(areas.map(boxOf), boxOf(targets[current]), direction);
        if (a !== null) area = areas[a];
      }
      if (next !== null) {
        const into = targets[next].closest(GROUP);
        if (into && into !== group) area = into;
      }
      const entry = area ? entryOf(area, targets) : null;
      if (entry) {
        focusOn(entry);
        return;
      }
      if (next === null) return;
      focusOn(targets[next]);
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement) || !event.target.matches(NAV)) return;
      remember(event.target);
      const area = event.target.closest(GROUP);
      if (area) areaMemory.set(area, event.target);
    };

    // The focused control vanished or was disabled (a card after Follow, a chip that re-rendered): hand focus
    // to its neighbour (TV1-2). A click elsewhere that leaves the control in place does not count.
    let frame = 0;
    const check = () => {
      frame = 0;
      if (last && !usable(last.el) && focusIsLost()) recover();
    };
    const watcher = new MutationObserver(() => {
      if (!frame) frame = window.requestAnimationFrame(check);
    });
    watcher.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'aria-hidden'] });

    let stopStart = focusStart();
    const onScreen = () => {
      stopStart();
      last = null;
      areaMemory = new WeakMap();
      stopStart = focusStart();
    };

    window.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    window.addEventListener('hashchange', onScreen);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('hashchange', onScreen);
      watcher.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      stopStart();
    };
  }, []);
}
