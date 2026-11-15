import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem } from '../lib/media.ts';
import { mergeOrder, wrapIndex } from '../lib/shuffle.ts';

// The picture show behind the music: pictures cross-fade every few seconds, in an order
// that stays put while more pictures arrive. A picture that will not load is dropped.
export function Slideshow({ images, intervalMs = 9000 }: { images: MediaItem[]; intervalMs?: number }) {
  const urls = useMemo(() => [...new Set(images.map(i => i.url))], [images]);
  const urlKey = urls.join('\n');
  const [order, setOrder] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const previous = useRef<string | null>(null);
  const shown = useRef<string | null>(null);

  useEffect(() => {
    setOrder(prev => mergeOrder(prev, urls));
    // urls is represented by urlKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey]);

  useEffect(() => {
    if (order.length < 2) return;
    const timer = window.setInterval(() => setIndex(i => wrapIndex(i + 1, order.length)), intervalMs);
    return () => window.clearInterval(timer);
  }, [order.length, intervalMs]);

  const current = order.length > 0 ? order[wrapIndex(index, order.length)] : null;

  // Remember what was on screen before, so it can stay underneath while the next fades in.
  if (current !== shown.current) {
    previous.current = shown.current;
    shown.current = current;
  }

  // Warm the next picture so it is ready when its turn comes.
  useEffect(() => {
    if (order.length < 2) return;
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = order[wrapIndex(index + 1, order.length)];
  }, [order, index]);

  if (!current) return null;
  const drop = (url: string) => setOrder(o => o.filter(u => u !== url));

  return (
    <div className="slides" aria-hidden="true">
      {previous.current && previous.current !== current && order.includes(previous.current) && (
        <img key={`p:${previous.current}`} className="slide" src={previous.current} alt="" referrerPolicy="no-referrer" />
      )}
      <img key={`c:${current}`} className="slide slide-in" src={current} alt="" referrerPolicy="no-referrer" onError={() => drop(current)} />
    </div>
  );
}
