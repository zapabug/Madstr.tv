import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import type { MediaItem } from '../lib/media.ts';
import { ensureAhead, pickNext, step, usePictureMix, type History } from '../lib/pictureMix.ts';
import { createSessionSet } from '../lib/sessionSet.ts';

// Every picture on screen this session (spec §Added later): all of a pool is shown once before any repeats.
const seenPictures = createSessionSet('madstr:seenPictures', 6000);

export interface SlideCommand { dir: 1 | -1; n: number }

// The picture show behind the music. Pictures cross-fade every few seconds. Each next picture is chosen at
// random: yours or the slideshow's by your "only mine / how often" settings, never one already shown this
// session while an unseen one remains (then that pool starts a new round). Previous goes back through what
// was shown. A picture that will not load is dropped.
export function Slideshow({ mine, others, intervalMs = 9000, onCurrent, command }: {
  mine: MediaItem[]; others: MediaItem[]; intervalMs?: number; onCurrent?: (_item: MediaItem | null) => void; command?: SlideCommand | null;
}) {
  const mix = usePictureMix();
  const bad = useRef(new Set<string>());
  const [badVersion, setBadVersion] = useState(0);
  const [history, setHistory] = useState<History>({ urls: [], cursor: 0 });
  const previous = useRef<string | null>(null);
  const shown = useRef<string | null>(null);

  const byUrl = useMemo(() => {
    const map = new Map<string, MediaItem>();
    for (const item of [...others, ...mine]) map.set(item.url, item);
    return map;
  }, [mine, others]);

  const mineUrls = useMemo(() => mine.map(i => i.url).filter(u => !bad.current.has(u)),
    // badVersion marks a picture dropped for not loading
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mine, badVersion]);
  const otherUrls = useMemo(() => others.map(i => i.url).filter(u => !bad.current.has(u)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [others, badVersion]);

  // Keep one picture queued after the one on screen, and warm it.
  useEffect(() => {
    if (history.cursor < history.urls.length - 1) return;
    const recent = seenPictures.snapshot() as Set<string>;
    for (const u of history.urls.slice(-12)) recent.add(u);
    const next = pickNext(mineUrls, otherUrls, mix, recent);
    // A pool where everything has been seen: start its next round.
    if (next && seenPictures.has(next)) seenPictures.removeAll(mineUrls.includes(next) ? mineUrls : otherUrls);
    if (next) setHistory(h => ensureAhead(h, next));
  }, [history, mineUrls, otherUrls, mix]);

  const ahead = history.urls[history.cursor + 1];
  useEffect(() => {
    if (!ahead) return;
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = ahead;
  }, [ahead]);

  // The previous / next chevrons step by hand; the show carries on from there.
  useEffect(() => {
    if (command) setHistory(h => step(h, command.dir));
    // only a new command steps the show
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.n]);

  const playable = mineUrls.length + otherUrls.length >= 2;
  useEffect(() => {
    if (!playable) return;
    const timer = window.setInterval(() => setHistory(h => step(h, 1)), intervalMs);
    return () => window.clearInterval(timer);
  }, [playable, intervalMs, history.cursor]);

  const current = history.urls[history.cursor] ?? null;
  useEffect(() => { if (current) seenPictures.add(current); }, [current]);
  const currentItem = current ? byUrl.get(current) ?? null : null;
  const currentId = currentItem?.id;

  // Tell the ticker which post the picture on screen came from.
  useEffect(() => {
    onCurrent?.(currentItem);
    return () => onCurrent?.(null);
    // the item is identified by its id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // Remember what was on screen before, so it can stay underneath while the next fades in.
  if (current !== shown.current) {
    previous.current = shown.current;
    shown.current = current;
  }

  if (!current) return null;
  const drop = (url: string) => {
    bad.current.add(url);
    setBadVersion(v => v + 1);
    setHistory(h => step(h, 1));
  };

  return (
    <div className="slides" aria-hidden="true">
      {previous.current && previous.current !== current && !bad.current.has(previous.current) && (
        <img key={`p:${previous.current}`} className="slide" src={previous.current} alt="" referrerPolicy="no-referrer" onLoad={noteSize} />
      )}
      <img key={`c:${current}`} className="slide slide-in" src={current} alt="" referrerPolicy="no-referrer" onLoad={noteSize} onError={() => drop(current)} />
    </div>
  );
}

// A picture's own size, so a TV never enlarges it past 2× (feat-tv-remote TV5-2; the cap is in styles.css).
function noteSize(event: SyntheticEvent<HTMLImageElement>): void {
  const img = event.currentTarget;
  img.style.setProperty('--nw', String(img.naturalWidth));
  img.style.setProperty('--nh', String(img.naturalHeight));
}
