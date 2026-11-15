import { useEffect } from 'react';
import { usePictures } from '../data/pictures.ts';
import { useViewItems } from '../data/views.ts';
import { player } from '../lib/player.ts';
import type { Route } from '../lib/route.ts';
import { FollowView } from './People.tsx';
import { Theater } from './Theater.tsx';

type ViewerRoute = Extract<Route, { page: 'viewer' }>;

// The one screen behind every sticker. It builds the list for the sticker's mode and
// filter, hands it to the player, and shows it as the theatre (or, for following
// creators, a plain page).
export function Viewer({ route }: { route: ViewerRoute }) {
  const data = useViewItems(route);
  const pictures = usePictures(route.mode === 'pictures' ? 'mine' : 'all');
  const sig = data.items.map(i => i.id).join('|');

  // Open the queue when the list first has something; keep it in step as more arrives.
  useEffect(() => {
    if (data.items.length === 0) return;
    const snap = player.getSnapshot();
    if (snap.label !== data.label || snap.queue.length === 0) player.setQueue(data.items, 0, data.label, true);
    else player.updateQueue(data.items, data.label);
    // `sig` stands for the content of data.items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, data.label]);

  if (route.mode === 'people' && route.filter === 'follow') {
    return (
      <main className="viewer" data-mode={route.mode} data-filter={route.filter}>
        <header className="viewer-head">
          <a className="back" href="#/" data-nav><span aria-hidden="true">←</span> Board</a>
          <h1>{data.label}</h1>
        </header>
        <FollowView />
        <p className="stage-hint">Esc or Backspace goes back to the board.</p>
      </main>
    );
  }

  const isLiked = route.mode === 'people' && route.filter === 'liked';
  const hasVideo = route.mode === 'watch' || isLiked;
  // The chip that hops to the other side, as the old "VIDEOS" toggle did.
  const sibling = route.mode === 'watch' ? { label: 'MUSIC', href: '#/listen/music' } : route.mode === 'listen' ? { label: 'VIDEOS', href: '#/watch/continue' } : undefined;

  return <Theater data={data} pictures={pictures} hasVideo={hasVideo} modeLabel={sibling?.label} modeHref={sibling?.href} />;
}
