// Text boxes wait for OK (spec feat-tv-remote TV4). On a TV, a text box that gets focus opens the keyboard at once,
// and the keyboard then swallows the arrows. So a text box that gets focus any way but a tap or click is locked
// (read-only: focused, no keyboard; the arrows move on as from any control). OK opens it; on a computer, typing
// opens it too. Enter from the keyboard locks it again, focus staying on the box. Pure, so it is tested.

export type LockEvent =
  | { kind: 'focus'; byPointer: boolean } // the box got focus; byPointer: a tap or click on it
  | { kind: 'key'; key: string; locked: boolean } // a key went down on the box
  | { kind: 'pointer' }; // a tap or click on the box

export type LockAct =
  | 'lock' // make it read-only (focused, no keyboard)
  | 'open' // OK on a locked box: unlock and ask for the keyboard; the key itself does nothing else
  | 'unlock' // typing on a locked box: unlock and let the key through
  | 'relock-after' // Enter in an open box: let it do its job (submit), then lock again
  | 'none';

// Keys that type into a box, so a computer keyboard is never stuck behind the lock.
function types(key: string): boolean {
  return key.length === 1 || key === 'Backspace' || key === 'Delete';
}

export function lockAct(event: LockEvent): LockAct {
  switch (event.kind) {
    case 'focus': return event.byPointer ? 'none' : 'lock';
    case 'pointer': return 'unlock';
    case 'key':
      if (event.locked) {
        if (event.key === 'Enter') return 'open';
        return types(event.key) ? 'unlock' : 'none';
      }
      return event.key === 'Enter' ? 'relock-after' : 'none';
  }
}
