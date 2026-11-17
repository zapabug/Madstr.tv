import { useEffect, useRef } from 'react';
import { leavePrompt, useLeavePrompt } from '../lib/leavePrompt.ts';
import { player } from '../lib/player.ts';

// "Leave Juke⚡tr?" (spec feat-tv-remote TV3-4): Stay is focused first, so an accidental OK keeps you in. Leave
// stops the music and closes the app. Back again, or Esc, answers Stay.
export function LeavePrompt() {
  const open = useLeavePrompt();
  const stay = useRef<HTMLButtonElement>(null);
  const before = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    before.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stay.current?.focus();
    return () => {
      // back to where you were when the pop-up opened
      if (before.current?.isConnected) before.current.focus();
    };
  }, [open]);

  if (!open) return null;
  const leave = () => {
    player.pause();
    void import('../native/tv.ts').then(m => m.leaveApp()).catch(() => { leavePrompt.close(); });
  };
  return (
    <div className="leave-back">
      <div className="leave" role="alertdialog" aria-modal="true" aria-labelledby="leave-title" data-nav-modal
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); leavePrompt.close(); } }}>
        <h2 id="leave-title">Leave Juke⚡tr?</h2>
        <p>The music stops when you leave.</p>
        <div className="leave-buttons">
          <button type="button" className="chip-btn solid" ref={stay} data-nav data-nav-start="1" onClick={leavePrompt.close}>Stay</button>
          <button type="button" className="chip-btn" data-nav onClick={leave}>Leave</button>
        </div>
      </div>
    </div>
  );
}
