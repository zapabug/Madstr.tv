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
export const HeartIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.8-8 11-8 11z" /></Svg>
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
