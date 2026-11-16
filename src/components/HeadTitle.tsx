import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

// The playlist header's title (zapa, feat-phone-inline §P7): when it is too long for its space it runs as a
// ticker, sliding to its end and back; when it fits it stands still. With reduced motion it is cut short instead.
export function HeadTitle({ text }: { text: string }) {
  const box = useRef<HTMLHeadingElement>(null);
  const run = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const outer = box.current;
    const inner = run.current;
    if (!outer || !inner) return;
    const measure = () => setShift(Math.max(0, Math.ceil(inner.scrollWidth - outer.clientWidth)));
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(outer);
    return () => watch.disconnect();
  }, [text]);
  // About 30 px a second, with a pause at either end (in the keyframes).
  const style = shift > 0 ? ({ '--shift': `${shift}px`, animationDuration: `${Math.max(6, Math.round(shift / 30) + 4)}s` } as CSSProperties) : undefined;
  return (
    <h1 ref={box} className={shift > 0 ? 'head-title is-long' : 'head-title'} title={text}>
      <span ref={run} key={text} className="head-title-run" style={style}>{text}</span>
    </h1>
  );
}
