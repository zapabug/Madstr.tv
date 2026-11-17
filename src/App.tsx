import { useEffect } from 'react';
import { Board } from './components/Board.tsx';
import { Dock } from './components/Dock.tsx';
import { Engine } from './components/Engine.tsx';
import { LeavePrompt } from './components/LeavePrompt.tsx';
import { QrLoginPopup } from './components/QrLogin.tsx';
import { AccountChip } from './components/People.tsx';
import { Sky } from './components/Sky.tsx';
import { Viewer } from './components/Viewer.tsx';
import { MarkIcon } from './components/icons.tsx';
import { BOARD, isTheater, toHash } from './lib/route.ts';
import { useFocusNav } from './lib/useFocusNav.ts';
import { useRemoteKeys } from './lib/useRemoteKeys.ts';
import { useTextBoxes } from './lib/useTextBoxes.ts';
import { useRoute } from './lib/useRoute.ts';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

export function App() {
  const { route, go } = useRoute();
  useFocusNav();
  useRemoteKeys();
  useTextBoxes();

  // Esc / Backspace walk back to the board, like the Back key on a remote.
  useEffect(() => {
    if (route.page === 'board') return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === 'Escape' || event.key === 'Backspace') && !isTyping(event.target)) {
        event.preventDefault();
        go(BOARD);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [route.page, go]);

  // A page opened from the board starts at its top, not at the board's scroll position (zapa, feat-phone-inline §P19).
  const hash = toHash(route);
  useEffect(() => {
    if (route.page !== 'board') window.scrollTo(0, 0);
    // `hash` stands for the route
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  const theater = isTheater(route);

  return (
    <>
      <Sky />
      {!theater && (
        <header className="top">
          <a className="logo" href="#/" aria-label="Jukestr home">Juke<MarkIcon className="bolt-mark" />tr</a>
          <AccountChip />
        </header>
      )}
      {route.page === 'board' ? <Board /> : <Viewer key={`${route.mode}/${route.filter}`} route={route} />}
      {!theater && <Dock />}
      <Engine />
      <LeavePrompt />
      <QrLoginPopup />
    </>
  );
}
