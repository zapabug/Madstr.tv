// How OK (Enter) on a remote is read (spec feat-tv-remote TV3-1, TV7-1). A TV sends OK again and again while
// it is held, with no repeat flag, until it is let go. So a press acts once, on release; a hold of OK_HOLD_MS
// or more is a hold (it starts the cursor), never a press; the repeats never press again. Pure, so it is tested
// without a browser; the hook feeds it key-downs, key-ups and a timer tick.
export const OK_HOLD_MS = 600; // feat-tv-remote TV3-1, TV7-1 (zapa: 0.6 s)

export interface OkState {
  downAt: number | null; // when OK went down, null while it is up
  held: boolean; // the hold already fired for this press
}

export type OkEvent = { type: 'down' | 'up' | 'tick'; t: number };
export type OkAct = 'none' | 'press' | 'hold';

export const OK_IDLE: OkState = { downAt: null, held: false };

export function okStep(state: OkState, event: OkEvent): { state: OkState; act: OkAct } {
  const { downAt, held } = state;
  if (event.type === 'down') {
    if (downAt === null) return { state: { downAt: event.t, held: false }, act: 'none' };
    return holdCheck(state, event.t); // a repeat while held
  }
  if (event.type === 'tick') {
    if (downAt === null) return { state, act: 'none' };
    return holdCheck(state, event.t);
  }
  // up
  if (downAt === null) return { state: OK_IDLE, act: 'none' }; // a stray release (OK went down elsewhere)
  if (held) return { state: OK_IDLE, act: 'none' };
  return { state: OK_IDLE, act: event.t - downAt >= OK_HOLD_MS ? 'hold' : 'press' };
}

function holdCheck(state: OkState, t: number): { state: OkState; act: OkAct } {
  if (state.downAt === null || state.held || t - state.downAt < OK_HOLD_MS) return { state, act: 'none' };
  return { state: { downAt: state.downAt, held: true }, act: 'hold' };
}
