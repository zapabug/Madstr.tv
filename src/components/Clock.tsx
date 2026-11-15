import { useClock } from '../lib/clock.ts';

// The system time, melting: each digit is a warm gradient that stretches and sags on its own beat,
// the whole thing wobbles through a liquid distortion, and a drip grows under every digit. It is a
// little drippy toy on purpose. With reduced motion it stands still (still gradient, no drips).
export function Clock() {
  const time = useClock();
  return (
    <>
      <svg className="clock-defs" width="0" height="0" aria-hidden="true" focusable="false">
        <filter id="clock-melt" x="-10%" y="-20%" width="120%" height="420%">
          <feTurbulence type="fractalNoise" baseFrequency="0.015 0.06" numOctaves="2" seed="7" result="noise">
            <animate attributeName="baseFrequency" dur="9s" values="0.015 0.06;0.03 0.09;0.015 0.06" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <span className="clock" role="img" aria-label={`Time ${time}`}>
        {[...time].map((ch, i) => (
          <span key={i} className={ch === ':' || ch === ' ' ? 'clock-ch clock-sep' : 'clock-ch'} style={{ '--i': i } as React.CSSProperties} aria-hidden="true">{ch === ' ' ? ' ' : ch}</span>
        ))}
      </span>
    </>
  );
}
