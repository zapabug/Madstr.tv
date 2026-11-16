import type { ReactElement } from 'react';

// Plain SVG glyphs, drawn on a 24 grid with currentColor so they follow the theme.
interface IconProps {
  size?: number;
}

function Svg({ size = 24, children }: IconProps & { children: ReactElement | ReactElement[] }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

// A house, in place of the back arrow on the buttons that go back to the board (zapa, feat-phone-inline §P17).
export const HouseIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3 2 11.5h3V21h5.5v-6h3v6H19v-9.5h3z" /></Svg>
);
/** The house and the word Home; the link that holds it carries the name for screen readers. */
export const HomeWord = () => (
  <span className="home-word" aria-hidden="true"><HouseIcon size={16} />Home</span>
);
export const PrevIcon = (p: IconProps) => (
  <Svg {...p}><path d="M6 5h2v14H6zM20 5v14L9.5 12z" /></Svg>
);
export const NextIcon = (p: IconProps) => (
  <Svg {...p}><path d="M16 5h2v14h-2zM4 5v14l10.5-7z" /></Svg>
);
export const PlayIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 5v14l11-7z" /></Svg>
);
export const PauseIcon = (p: IconProps) => (
  <Svg {...p}><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></Svg>
);
export const ShuffleIcon = (p: IconProps) => (
  <Svg {...p}><path d="M16 4l4 3.5-4 3.5V8.5h-1.6l-3 3.5 3 3.5H16V13l4 3.5-4 3.5v-2.5h-2.5L10 13.5 6.5 17.5H3v-2h2.6l3.1-3.5L5.6 8.5H3v-2h3.5L10 10.5 13.5 6.5H16z" /></Svg>
);
export const NoteIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9 3v11.6A3.5 3.5 0 1 0 11 18V8h7V3z" /></Svg>
);
export const MicIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11z" /></Svg>
);
export const FolderIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Svg>
);
export const ResumeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M5 4h2v16H5zM10 4v16l10-8z" /></Svg>
);
export const BoltIcon = (p: IconProps) => (
  <Svg {...p}><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></Svg>
);
export const FilmIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v2h2V6zm0 4v2h2v-2zm0 4v2h2v-2zm12-8v2h2V6zm0 4v2h2v-2zm0 4v2h2v-2zM9 6v12h6V6z" /></Svg>
);
export const ImageIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm2 11h12l-3.5-4.5-2.5 3-2-2.5zm2.5-7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" /></Svg>
);
export const PersonIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm-8 9a8 8 0 0 1 16 0z" /></Svg>
);
export const PlusPersonIcon = (p: IconProps) => (
  <Svg {...p}><path d="M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0zM19 8h2v3h3v2h-3v3h-2v-3h-3v-2h3z" /></Svg>
);

// The first Madstr's on-screen previous / next: the same two paths on the same 24x24 grid. With
// `stretch` they fill whatever box they are given (tall and oversized on the picture's edges) while
// the line stays the same thickness on screen.
function Chevron({ d, size, stretch }: { d: string; size: number; stretch: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={stretch ? '100%' : size} height={stretch ? '100%' : size} fill="none" viewBox="0 0 24 24" stroke="currentColor"
      strokeWidth={stretch ? 3 : 2} preserveAspectRatio={stretch ? 'none' : undefined} aria-hidden="true" focusable="false">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} vectorEffect={stretch ? 'non-scaling-stroke' : undefined} />
    </svg>
  );
}
export const PrevChevron = ({ size = 24, stretch = false }: { size?: number; stretch?: boolean }) => <Chevron d="M15 5 L 13 12 L 15 19" size={size} stretch={stretch} />;
export const NextChevron = ({ size = 24, stretch = false }: { size?: number; stretch?: boolean }) => <Chevron d="M9 5 L 11 12 L 9 19" size={size} stretch={stretch} />;

// The placeholder for a local file's "author": a chunky sticker-style folder with a music note and
// a couple of sparkles. It has its own colours and a hard shadow; it leans, bobs and twinkles slowly.
export const FolderArt = () => (
  <svg className="folder-art" viewBox="0 0 64 58" width="100%" height="100%" aria-hidden="true" focusable="false" strokeLinejoin="round" strokeLinecap="round">
    <path d="M4 14 Q4 8 10 8 H24 L30 15 H54 Q60 15 60 21 V48 Q60 54 54 54 H10 Q4 54 4 48 Z" style={{ fill: 'var(--peach)', stroke: 'var(--ink)', strokeWidth: 3 }} />
    <path d="M4 25 Q4 21 9 21 H55 Q60 21 60 25 V48 Q60 54 54 54 H10 Q4 54 4 48 Z" style={{ fill: 'var(--butter)', stroke: 'var(--ink)', strokeWidth: 3 }} />
    <g style={{ stroke: 'var(--ink)', strokeWidth: 3, fill: 'none' }}>
      <path d="M26 43 V31 L40 28.5 V40" />
      <path d="M26 35 L40 32.5" />
    </g>
    <circle cx="23.5" cy="43.5" r="3.6" style={{ fill: 'var(--ink)' }} />
    <circle cx="37.5" cy="41" r="3.6" style={{ fill: 'var(--ink)' }} />
    <path className="folder-spark" d="M54 2 L55.8 7 L61 8.8 L55.8 10.6 L54 15.6 L52.2 10.6 L47 8.8 L52.2 7 Z" style={{ fill: 'var(--pink)', stroke: 'var(--ink)', strokeWidth: 1.6 }} />
    <path className="folder-spark folder-spark-2" d="M9 1 L10.2 4.4 L13.6 5.6 L10.2 6.8 L9 10.2 L7.8 6.8 L4.4 5.6 L7.8 4.4 Z" style={{ fill: 'var(--mint)', stroke: 'var(--ink)', strokeWidth: 1.4 }} />
  </svg>
);
export const ThumbUpIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2 21h3.5V9H2zm19.6-10.4c0-1-.8-1.8-1.8-1.8h-5.6l.9-4.1v-.3c0-.4-.2-.8-.4-1L13.6 2 7.4 8.2c-.3.3-.5.8-.5 1.3v9.7c0 1 .8 1.8 1.8 1.8h8.3c.7 0 1.4-.5 1.6-1.1l2.8-6.5c.1-.2.1-.4.1-.7z" /></Svg>
);
export const ThumbDownIcon = (p: IconProps) => (
  <Svg {...p}><path d="M22 3h-3.5v12H22zM2.4 13.4c0 1 .8 1.8 1.8 1.8h5.6l-.9 4.1v.3c0 .4.2.8.4 1l1.1 1.4 6.2-6.2c.3-.3.5-.8.5-1.3V4.8c0-1-.8-1.8-1.8-1.8H7c-.7 0-1.4.5-1.6 1.1l-2.8 6.5c-.1.2-.1.4-.1.7z" /></Svg>
);
