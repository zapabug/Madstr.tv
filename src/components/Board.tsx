import { useEffect, useRef, useState } from 'react';
import { usePreviews, type PreviewData } from '../data/previews.ts';
import { Avatar } from './People.tsx';
import { LANES, STICKERS, hrefOf, type GlyphName, type Lane, type Sticker } from '../lib/stickers.ts';
import {
  BoltIcon, FilmIcon, FolderIcon, HeartIcon, ImageIcon, MicIcon, NoteIcon, PlusPersonIcon, ResumeIcon,
} from './icons.tsx';

type Filter = 'all' | Lane;

const GLYPHS: Record<GlyphName, (_props: { size?: number }) => React.JSX.Element> = {
  music: NoteIcon, podcasts: MicIcon, local: FolderIcon, continue: ResumeIcon, short: BoltIcon,
  long: FilmIcon, pictures: ImageIcon, liked: HeartIcon, follow: PlusPersonIcon,
};

// Pictures that fade through one after another (cover art, posters, slides).
function Rotator({ urls }: { urls: string[] }) {
  const [i, setI] = useState(0);
  const key = urls.join('\n');
  useEffect(() => {
    setI(0);
    if (urls.length < 2) return;
    const timer = window.setInterval(() => setI(n => (n + 1) % urls.length), 5000);
    return () => window.clearInterval(timer);
    // urls is represented by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const url = urls[i % urls.length];
  return <img key={url} className="preview-img" src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />;
}

// The area of a sticker that shows what it would open: cover art or a poster, a slide, the
// first frame of the next video, or the people involved. With nothing to show it says so.
function Preview({ sticker, data }: { sticker: Sticker; data: PreviewData }) {
  const Glyph = GLYPHS[sticker.glyph];
  return (
    <div className="preview" aria-hidden="true">
      {data.urls.length > 0 ? <Rotator urls={data.urls} />
        : data.frame ? <video className="preview-img" src={`${data.frame}#t=0.5`} muted playsInline preload="metadata" />
        : data.avatars.length > 0 ? <span className="preview-people">{data.avatars.map(pk => <Avatar key={pk} pubkey={pk} />)}</span>
        : <><Glyph size={44} /><span>{data.text ?? 'nothing queued yet'}</span></>}
      {data.progress !== undefined && <span className="preview-bar"><i style={{ width: `${Math.round(data.progress * 100)}%` }} /></span>}
      {(data.urls.length > 0 || data.frame || data.avatars.length > 0) && data.text && <span className="preview-text">{data.text}</span>}
    </div>
  );
}

function StickerCard({ sticker, data }: { sticker: Sticker; data: PreviewData }) {
  return (
    <a className={`sticker c-${sticker.tone}`} href={hrefOf(sticker)} data-nav>
      <span className="tag">{sticker.tag}</span>
      {sticker.note && <span className="note" aria-hidden="true">{sticker.note}</span>}
      <Preview sticker={sticker} data={data} />
      <h3>{sticker.title}</h3>
      <p>{sticker.blurb}</p>
      <span className="go">Open <span aria-hidden="true">→</span></span>
    </a>
  );
}

export function Board() {
  const [filter, setFilter] = useState<Filter>('all');
  const boardRef = useRef<HTMLDivElement>(null);
  const previews = usePreviews();
  const none: PreviewData = { urls: [], avatars: [] };

  // Start with the first sticker focused so the arrow keys work straight away.
  useEffect(() => {
    boardRef.current?.querySelector<HTMLElement>('a.sticker')?.focus({ preventScroll: true });
  }, []);

  const visible = LANES.filter(lane => filter === 'all' || lane.id === filter);
  const chips: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, ...LANES.map(l => ({ id: l.id, label: l.label }))];

  return (
    <main className="board-page" ref={boardRef}>
      <section className="hero">
        <p className="note note-hi" aria-hidden="true">pick a sticker 👆</p>
        <h1>What shall we <span className="grad">play</span>?</h1>
        <p className="sub">Each sticker is a shortcut: it opens the player already set up.</p>
        <div className="chips" role="group" aria-label="Show">
          {chips.map(chip => (
            <button key={chip.id} type="button" data-nav aria-pressed={filter === chip.id} onClick={() => setFilter(chip.id)}>
              {chip.label}
            </button>
          ))}
        </div>
      </section>

      <div className={`divide lanes-${visible.length}`}>
        {visible.map(lane => (
          <section key={lane.id} className={`lane lane-${lane.id}`} aria-labelledby={`lane-${lane.id}`}>
            <header className="lane-head">
              <h2 id={`lane-${lane.id}`}>{lane.label}</h2>
              <span>{lane.sub}</span>
            </header>
            <div className="stickers">
              {STICKERS.filter(s => s.lane === lane.id).map(s => <StickerCard key={s.id} sticker={s} data={previews[s.id] ?? none} />)}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
