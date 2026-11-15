import { useEffect } from 'react';
import { Board } from './components/Board.tsx';
import { Dock } from './components/Dock.tsx';
import { Engine } from './components/Engine.tsx';
import { Sky } from './components/Sky.tsx';
import { Viewer } from './components/Viewer.tsx';
import { BOARD } from './lib/route.ts';
import { useFocusNav } from './lib/useFocusNav.ts';
import { useRoute } from './lib/useRoute.ts';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

export function App() {
  const { route, go } = useRoute();
  useFocusNav();

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

  return (
    <>
      <Sky />
      <header className="top">
        <a className="logo" href="#/" aria-label="Madstr.tv home">Mad<span className="bolt-mark" aria-hidden="true">⚡</span>tr.tv</a>
      </header>
      {route.page === 'board' ? <Board /> : <Viewer key={`${route.mode}/${route.filter}`} route={route} />}
      <Dock open={route.page === 'viewer'} />
      <Engine />
    </>
  );
}
