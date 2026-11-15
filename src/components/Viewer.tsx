import { useEffect, useRef } from 'react';
import { useViewItems } from '../data/views.ts';
import { formatTime } from '../lib/queue.ts';
import { player, usePlayer } from '../lib/player.ts';
import type { Route } from '../lib/route.ts';
import { OwnControls } from './OwnControls.tsx';
import { NoteIcon } from './icons.tsx';

type ViewerRoute = Extract<Route, { page: 'viewer' }>;

// The one screen behind every sticker. The picture area shows the cover (listen) or the
// video (watch); the playlist and transport live in the bottom panel.
export function Viewer({ route }: { route: ViewerRoute }) {
  const data = useViewItems(route);
  const p = usePlayer();
  const backRef = useRef<HTMLAnchorElement>(null);
  const item = p.queue[p.index];
  const sig = data.items.map(i => i.id).join('|');

  useEffect(() => { backRef.current?.focus({ preventScroll: true }); }, []);

  // Open the queue when the list first has something; keep it in step as more arrives.
  useEffect(() => {
    if (data.items.length === 0) return;
    const snap = player.getSnapshot();
    if (snap.label !== data.label || snap.queue.length === 0) player.setQueue(data.items, 0, data.label, true);
    else player.updateQueue(data.items, data.label);
    // `sig` stands for the content of data.items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, data.label]);

  const isVideo = route.mode === 'watch';
  const playable = route.mode === 'listen' || route.mode === 'watch';

  return (
    <main className="viewer" data-mode={route.mode} data-filter={route.filter} data-drawer={data.items.length > 0 ? 'open' : 'closed'}>
      <header className="viewer-head">
        <a className="back" href="#/" ref={backRef} data-nav><span aria-hidden="true">←</span> Board</a>
        <h1>{data.label}</h1>
        {data.items.length > 0 && <span className="count">{data.items.length} items</span>}
      </header>

      {isVideo ? (
        <div className="stage stage-video">
          <video ref={player.registerVideo} playsInline onClick={player.toggle} />
          {!item || item.kind !== 'video' ? <p className="stage-empty">{data.waiting ? 'Looking for videos…' : data.emptyText}</p> : null}
        </div>
      ) : (
        <div className="stage">
          {playable && item && item.kind === 'audio' ? (
            <div className="now">
              <div className="cover">
                {item.image ? <img src={item.image} alt="" referrerPolicy="no-referrer" /> : <NoteIcon size={72} />}
              </div>
              <h2 className="now-title">{item.title}</h2>
              {item.subtitle && <p className="now-sub">{item.subtitle}</p>}
              {item.duration !== undefined && <p className="now-meta">{formatTime(item.duration)}</p>}
            </div>
          ) : (
            <p className="stage-empty">{data.waiting ? 'Looking for music…' : data.emptyText}</p>
          )}
        </div>
      )}

      {route.mode === 'listen' && route.filter === 'podcasts' && <OwnControls kind="feeds" />}
      {route.mode === 'listen' && route.filter === 'local' && <OwnControls kind="folders" />}
      <p className="stage-hint">Esc or Backspace goes back to the board.</p>
    </main>
  );
}
