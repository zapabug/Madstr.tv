import type { Route } from '../lib/route.ts';
import { STICKERS } from '../lib/stickers.ts';
import { useEffect, useRef } from 'react';

type ViewerRoute = Extract<Route, { page: 'viewer' }>;

const MODE_TEXT: Record<ViewerRoute['mode'], string> = {
  listen: 'Listen',
  watch: 'Watch',
  pictures: 'Pictures',
  people: 'People',
};

// One screen for every shortcut: the picture area on top, the dock below. R1 only
// proves the route (mode + filter reaches the viewer); R2 onward fills it.
export function Viewer({ route }: { route: ViewerRoute }) {
  const backRef = useRef<HTMLAnchorElement>(null);
  const sticker = STICKERS.find(s => s.route.page === 'viewer' && s.route.mode === route.mode && s.route.filter === route.filter);

  useEffect(() => { backRef.current?.focus({ preventScroll: true }); }, []);

  return (
    <main className="viewer" data-mode={route.mode} data-filter={route.filter}>
      <header className="viewer-head">
        <a className="back" href="#/" ref={backRef} data-nav>
          <span aria-hidden="true">←</span> Board
        </a>
        <h1>{MODE_TEXT[route.mode]} · {sticker?.title ?? route.filter}</h1>
      </header>
      <div className="stage">
        <p className="stage-title">Nothing here yet</p>
        <p className="stage-sub">This view opens as <b>{route.mode}</b> / <b>{route.filter}</b>. Its content arrives in the next steps.</p>
        <p className="stage-hint">Esc or Backspace goes back to the board.</p>
      </div>
    </main>
  );
}
