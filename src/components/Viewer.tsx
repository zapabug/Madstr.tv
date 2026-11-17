import { useEffect, useRef } from 'react';
import { usePictures } from '../data/pictures.ts';
import { useViewItems } from '../data/views.ts';
import { player } from '../lib/player.ts';
import type { Route } from '../lib/route.ts';
import { HomeWord, PersonIcon } from './icons.tsx';
import { FollowView } from './People.tsx';
import { SourcesView } from './Sources.tsx';
import { RadioBar } from './Radio.tsx';
import { Theater } from './Theater.tsx';

type ViewerRoute = Extract<Route, { page: 'viewer' }>;

// The one screen behind every sticker. It builds the list for the sticker's mode and
// filter, hands it to the player, and shows it as the theatre (or, for following
// creators, a plain page).
export function Viewer({ route }: { route: ViewerRoute }) {
  const data = useViewItems(route);
  const pictures = usePictures(route.mode === 'pictures' ? 'mine' : 'all');
  const sig = data.items.map(i => i.id).join('|');

  // Open the queue when the list first has something; keep it in step as more arrives. Another list in the same
  // view (a Radio sticker) opens afresh.
  const opened = useRef(data.listKey);
  useEffect(() => {
    if (data.items.length === 0) return;
    const snap = player.getSnapshot();
    const otherList = opened.current !== data.listKey;
    opened.current = data.listKey;
    if (snap.label !== data.label || snap.queue.length === 0 || otherList) player.setQueue(data.items, 0, data.label, true);
    else player.updateQueue(data.items, data.label);
    // `sig` stands for the content of data.items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, data.label, data.listKey]);

  // Following creators, and Make it yours (your sources) behind the button beside Home (feat-phone-inline §P19).
  if (route.mode === 'people') {
    const sources = route.filter === 'sources';
    return (
      <main className="viewer" data-mode={route.mode} data-filter={route.filter}>
        <header className="viewer-head">
          <a className="back" href="#/" data-nav aria-label="Home"><HomeWord /></a>
          {!sources && <a className="back yours-btn" href="#/people/sources" data-nav aria-label="Make it yours"><span className="home-word" aria-hidden="true"><PersonIcon size={16} />Make it yours</span></a>}
          <h1>{data.label}</h1>
        </header>
        {sources ? <SourcesView /> : <FollowView />}
        <p className="stage-hint">Esc or Backspace goes back to the board.</p>
      </main>
    );
  }

  const hasVideo = route.mode === 'watch';
  // The chip that hops to the other side, as the old "VIDEOS" toggle did.
  const sibling = route.mode === 'watch' ? { label: 'MUSIC', href: '#/listen/music' } : route.mode === 'listen' ? { label: 'VIDEOS', href: '#/watch/continue' } : undefined;

  const emptyStage = route.mode === 'pictures' ? 'No pictures yet. Add a picture folder under Make it yours.' : undefined;
  const radio = route.mode === 'listen' && route.filter === 'radio';
  return <Theater data={data} pictures={pictures} hasVideo={hasVideo} modeLabel={sibling?.label} modeHref={sibling?.href} emptyStage={emptyStage} pickerExtra={radio ? <RadioBar /> : undefined} />;
}
