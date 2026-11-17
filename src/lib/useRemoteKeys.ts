import { useEffect } from 'react';
import { OK_HOLD_MS, OK_IDLE, okStep, type OkState } from './okKey.ts';
import { player } from './player.ts';

// The remote's keys beyond the arrows (spec feat-tv-remote TV3):
// - OK acts once, on release; a hold never presses (it is announced as `juke:ok-hold` for the cursor, TV7).
// - Channel Up / Down move the pictures, as the picture's edge arrows do; the page does not scroll on them.
// - ⏪ / ⏩ (MediaRewind / MediaFastForward), when they reach the page (a TV's browser), are previous / next.
//   In the Android app the media keys never reach the page; MediaHub maps them the same way.
export const OK_HOLD_EVENT = 'juke:ok-hold';

// Fields keep Enter for themselves (a text box submits, a select opens).
function keepsEnter(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return true;
  if (el.isContentEditable) return true;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

function clickEdge(which: 'next' | 'prev'): void {
  const edge = document.querySelector<HTMLElement>(`.edge-${which}`);
  if (edge && edge.getBoundingClientRect().width > 0 && !edge.hasAttribute('disabled')) edge.click();
}

export function useRemoteKeys(): void {
  useEffect(() => {
    let ok: OkState = OK_IDLE;
    let target: HTMLElement | null = null; // the control OK went down on
    let timer = 0;
    const heldKeys = new Set<string>(); // channel / media keys already acted on until they are let go

    const act = (out: ReturnType<typeof okStep>) => {
      ok = out.state;
      if (out.act === 'press') target?.click();
      else if (out.act === 'hold') window.dispatchEvent(new CustomEvent(OK_HOLD_EVENT, { detail: { target } }));
      if (ok.downAt === null) { target = null; window.clearTimeout(timer); }
    };

    const onDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Enter') {
        // Already handled by this press (a repeat), or a field that keeps Enter.
        if (ok.downAt === null && keepsEnter(document.activeElement)) return;
        event.preventDefault(); // no click on the way down, and none for the repeats
        if (ok.downAt === null) {
          target = document.activeElement as HTMLElement;
          timer = window.setTimeout(() => act(okStep(ok, { type: 'tick', t: performance.now() })), OK_HOLD_MS);
        }
        act(okStep(ok, { type: 'down', t: performance.now() }));
        return;
      }
      const media = event.key === 'ChannelUp' || event.key === 'ChannelDown' || event.key === 'MediaFastForward' || event.key === 'MediaRewind';
      if (!media) return;
      event.preventDefault();
      if (heldKeys.has(event.key)) return; // a held key acts once
      heldKeys.add(event.key);
      if (event.key === 'ChannelUp') clickEdge('next');
      else if (event.key === 'ChannelDown') clickEdge('prev');
      else if (event.key === 'MediaFastForward') player.next();
      else player.prev();
    };

    const onUp = (event: KeyboardEvent) => {
      heldKeys.delete(event.key);
      if (event.key !== 'Enter' || ok.downAt === null) return;
      event.preventDefault();
      act(okStep(ok, { type: 'up', t: performance.now() }));
    };

    // Capture: decide before the focused control sees the key.
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.clearTimeout(timer);
    };
  }, []);
}
