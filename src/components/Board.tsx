import { useEffect, useRef, useState } from "react";
import { usePreviews, type PreviewData } from "../data/previews.ts";
import { Avatar } from "./People.tsx";
import { OwnControls } from "./OwnControls.tsx";
import { TagControls } from "./TagControls.tsx";
import {
  LANES,
  STICKERS,
  hrefOf,
  type GlyphName,
  type Sticker,
} from "../lib/stickers.ts";
import {
  BoltIcon,
  FilmIcon,
  FolderIcon,
  ImageIcon,
  MicIcon,
  NoteIcon,
  PlusPersonIcon,
  ResumeIcon,
} from "./icons.tsx";

const GLYPHS: Record<
  GlyphName,
  (_props: { size?: number }) => React.JSX.Element
> = {
  music: NoteIcon,
  podcasts: MicIcon,
  local: FolderIcon,
  continue: ResumeIcon,
  short: BoltIcon,
  long: FilmIcon,
  pictures: ImageIcon,
  follow: PlusPersonIcon,
};

// Pictures that fade through one after another (cover art, posters, slides).
function Rotator({ urls, onFail }: { urls: string[]; onFail: (_url: string) => void }) {
  const [i, setI] = useState(0);
  const key = urls.join("\n");
  useEffect(() => {
    setI(0);
    if (urls.length < 2) return;
    const timer = window.setInterval(
      () => setI((n) => (n + 1) % urls.length),
      5000,
    );
    return () => window.clearInterval(timer);
    // urls is represented by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const url = urls[i % urls.length];
  // Cross-fade: the previous picture stays underneath while the new one fades in on top.
  const prev = urls.length > 1 ? urls[(i - 1 + urls.length) % urls.length] : undefined;
  const shown = prev && prev !== url ? [prev, url] : [url];
  return (
    <>
      {shown.map((u) => (
        <img
          key={u}
          className="preview-img"
          src={u}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => onFail(u)}
        />
      ))}
    </>
  );
}

// The area of a sticker that shows what it would open: cover art or a poster, a slide, or
// the people involved. Never a video decode. With nothing to show it says so.
function Preview({ sticker, data }: { sticker: Sticker; data: PreviewData }) {
  const Glyph = GLYPHS[sticker.glyph];
  // A picture that fails to load drops out; with none left the sticker draws its glyph instead of
  // the browser's broken-image mark (spec §Design pass fixes).
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const urls = data.urls.filter((u) => !failed.has(u));
  const fail = (u: string) => setFailed((f) => new Set(f).add(u));
  return (
    <div className="preview" aria-hidden="true">
      {urls.length > 0 ? (
        <Rotator urls={urls} onFail={fail} />
      ) : data.avatars.length > 0 ? (
        <span className="preview-people">
          {data.avatars.map((pk) => (
            <Avatar key={pk} pubkey={pk} />
          ))}
        </span>
      ) : (
        <>
          <Glyph size={44} />
          <span>{data.text ?? "nothing queued yet"}</span>
        </>
      )}
      {data.progress !== undefined && (
        <span className="preview-bar">
          <i style={{ width: `${Math.round(data.progress * 100)}%` }} />
        </span>
      )}
      {(urls.length > 0 || data.avatars.length > 0) &&
        data.text && <span className="preview-text">{data.text}</span>}
    </div>
  );
}

function StickerCard({
  sticker,
  data,
}: {
  sticker: Sticker;
  data: PreviewData;
}) {
  return (
    <a className={`sticker c-${sticker.tone}`} href={hrefOf(sticker)} data-nav>
      <span className="tag">{sticker.tag}</span>
      {sticker.note && (
        <span className="note" aria-hidden="true">
          {sticker.note}
        </span>
      )}
      <Preview sticker={sticker} data={data} />
      <h3>{sticker.title}</h3>
      <p>{sticker.blurb}</p>
      <span className="go">
        Open <span aria-hidden="true">→</span>
      </span>
    </a>
  );
}

export function Board() {
  const boardRef = useRef<HTMLDivElement>(null);
  const previews = usePreviews();
  const none: PreviewData = { urls: [], avatars: [] };

  // Start with the first sticker focused so the arrow keys work straight away.
  useEffect(() => {
    boardRef.current
      ?.querySelector<HTMLElement>("a.sticker")
      ?.focus({ preventScroll: true });
  }, []);

  return (
    <main className="board-page" ref={boardRef}>
      <section className="hero">
        <h1>
          Mad <span className="grad">Player</span> Media
        </h1>
      </section>

      <div className={`divide lanes-${LANES.length}`}>
        {LANES.map((lane) => (
          <section
            key={lane.id}
            className={`lane lane-${lane.id}`}
            aria-labelledby={`lane-${lane.id}`}
          >
            <header className="lane-head">
              <h2 id={`lane-${lane.id}`}>{lane.label}</h2>
              <span>{lane.sub}</span>
            </header>
            <div className="stickers">
              {STICKERS.filter((s) => s.lane === lane.id).map((s) => (
                <StickerCard
                  key={s.id}
                  sticker={s}
                  data={previews[s.id] ?? none}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="sources" aria-labelledby="sources-h">
        <h2 id="sources-h" className="sources-h">
          Your sources
        </h2>
        <p className="sub">
          Where the stickers get their music, podcasts, videos and pictures,
          besides the people you follow.
        </p>
        <div className="sources-grid">
          <OwnControls kind="feeds" />
          <OwnControls kind="folders" />
          <OwnControls kind="pictures" />
          <TagControls kind="audio" />
          <TagControls kind="video" />
          <TagControls kind="image" />
        </div>
      </section>
    </main>
  );
}
