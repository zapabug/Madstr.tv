import { useEffect, useRef, useState } from 'react';
import { LANES, STICKERS, hrefOf, type GlyphName, type Lane, type Sticker } from '../lib/stickers.ts';
import {
  BoltIcon, FilmIcon, FolderIcon, HeartIcon, ImageIcon, MicIcon, NoteIcon, PlusPersonIcon, ResumeIcon,
} from './icons.tsx';

type Filter = 'all' | Lane;

const GLYPHS: Record<GlyphName, (_props: { size?: number }) => React.JSX.Element> = {
  music: NoteIcon, podcasts: MicIcon, local: FolderIcon, continue: ResumeIcon, short: BoltIcon,
  long: FilmIcon, pictures: ImageIcon, liked: HeartIcon, follow: PlusPersonIcon,
};

// The area of a sticker that will show the picture of what it would open (cover
// art, a poster, the next video in the queue). Until a source is wired it says so
// plainly instead of showing made-up content.
function Preview({ sticker }: { sticker: Sticker }) {
  const Glyph = GLYPHS[sticker.glyph];
  return (
    <div className="preview" aria-hidden="true">
      <Glyph size={44} />
      <span>nothing queued yet</span>
    </div>
  );
}

function StickerCard({ sticker }: { sticker: Sticker }) {
  return (
    <a className={`sticker c-${sticker.tone}`} href={hrefOf(sticker)} data-nav>
      <span className="tag">{sticker.tag}</span>
      {sticker.note && <span className="note" aria-hidden="true">{sticker.note}</span>}
      <Preview sticker={sticker} />
      <h3>{sticker.title}</h3>
      <p>{sticker.blurb}</p>
      <span className="go">Open <span aria-hidden="true">→</span></span>
    </a>
  );
}

export function Board() {
  const [filter, setFilter] = useState<Filter>('all');
  const boardRef = useRef<HTMLDivElement>(null);

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
              {STICKERS.filter(s => s.lane === lane.id).map(s => <StickerCard key={s.id} sticker={s} />)}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
