import { useRef, useState, type CSSProperties } from 'react';
import { setMix, shareOf, usePictureMix } from '../lib/pictureMix.ts';
import { useOwn } from '../data/ownContext.ts';
import { setMusicMix, shareOfMine, useMusicMix } from '../lib/musicMix.ts';

// How your pictures and the slideshow's share the screen: only yours, or mixed in, and how often yours come up.
function PictureMixControls({ count }: { count: number }) {
  const mix = usePictureMix();
  const none = count === 0;
  const inTen = Math.round(shareOf(mix.often) * 10);
  return (
    <div className="mix" role="group" aria-label="How your pictures show up">
      <button type="button" className="chip-btn" data-nav aria-pressed={mix.onlyMine} disabled={none} onClick={() => setMix({ onlyMine: !mix.onlyMine })}>
        {mix.onlyMine ? '\u2713 ' : ''}Only my pictures
      </button>
      <div className={`mix-row${mix.onlyMine || none ? ' off' : ''}`}>
        <span className="mix-end">seldom</span>
        <input type="range" className="seek" data-nav aria-label="How often my pictures come up" min={0} max={100} step={5} value={Math.round(mix.often * 100)}
          style={{ '--p': mix.often } as CSSProperties} disabled={mix.onlyMine || none} onChange={e => setMix({ often: Number(e.target.value) / 100 })} />
        <span className="mix-end">very often</span>
      </div>
      <p className="own-note">{none ? 'Add pictures to use these.' : mix.onlyMine ? 'The slideshow shows only your pictures.' : `About ${inTen} in 10 pictures are yours.`}</p>
    </div>
  );
}

// How much of your local music plays in Music (spec feat-android-native §N3): none ... lots.
function MusicMixControls({ count }: { count: number }) {
  const often = useMusicMix();
  const none = count === 0;
  const inTen = Math.round(shareOfMine(often) * 10);
  return (
    <div className="mix" role="group" aria-label="How much of my music plays in Music">
      <div className={`mix-row${none ? ' off' : ''}`}>
        <span className="mix-end">none</span>
        <input type="range" className="seek" data-nav aria-label="How much of my music plays in Music" min={0} max={100} step={10} value={Math.round(often * 100)}
          style={{ '--p': often } as CSSProperties} disabled={none} onChange={e => setMusicMix(Number(e.target.value) / 100)} />
        <span className="mix-end">lots</span>
      </div>
      <p className="own-note">{none ? 'Add a music folder to use this.' : inTen === 0 ? 'Music has none of your tracks.' : `About ${inTen} in 10 tracks in Music are yours.`}</p>
    </div>
  );
}

// Adding your own sources, right where they show up: RSS feeds under Podcasts,
// local folders under Local.
export function OwnControls({ kind }: { kind: 'feeds' | 'folders' | 'pictures' }) {
  const own = useOwn();
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (kind === 'feeds') {
    const add = async () => {
      if (!text.trim() || adding) return;
      setAdding(true);
      await own.addFeed(text);
      setAdding(false);
      setText('');
    };
    return (
      <section className="own" aria-label="RSS feeds">
        <h2>RSS feeds</h2>
        <ul>
          {own.feeds.map(feed => (
            <li key={feed.url}>
              <span className="own-name" title={feed.url}>{feed.name}</span>
              <span className={`own-status${feed.status === 'error' ? ' bad' : ''}`}>
                {feed.status === 'loading' ? 'Loading…' : feed.status === 'error' ? feed.error : `${feed.count} episodes`}
              </span>
              <button type="button" className="chip-btn" data-nav onClick={() => { void own.refreshFeed(feed.url); }}>Refresh</button>
              <button type="button" className="chip-btn" data-nav onClick={() => own.removeFeed(feed.url)} aria-label={`Remove ${feed.name}`}>Remove</button>
            </li>
          ))}
        </ul>
        <form className="own-add" onSubmit={e => { e.preventDefault(); void add(); }}>
          <input type="url" data-nav value={text} onChange={e => setText(e.target.value)} placeholder="https://example.com/feed.xml" aria-label="Feed address" />
          <button type="submit" className="chip-btn solid" data-nav disabled={adding}>{adding ? 'Adding…' : 'Add feed'}</button>
        </form>
      </section>
    );
  }

  const wanted = kind === 'pictures' ? 'image' : 'audio';
  const noun = kind === 'pictures' ? 'pictures' : 'tracks';
  return (
    <section className="own" aria-label={kind === 'pictures' ? 'Picture folders' : 'Local folders'}>
      <h2>{kind === 'pictures' ? 'Picture folders' : 'Folders'}</h2>
      <ul>
        {own.folders.filter(f => f.kind === wanted).map(folder => (
          <li key={folder.id}>
            <span className="own-name" title={folder.name}>{folder.name}</span>
            <span className={`own-status${folder.status === 'error' ? ' bad' : ''}`}>
              {folder.status === 'loading' ? 'Loading…' : folder.status === 'needs-permission' ? 'Needs permission' : folder.status === 'error' ? folder.error : `${folder.count} ${noun}`}
            </span>
            {folder.status === 'needs-permission' && (
              <button type="button" className="chip-btn solid" data-nav onClick={() => { void own.reconnectFolder(folder.id); }}>Reconnect</button>
            )}
            <button type="button" className="chip-btn" data-nav onClick={() => own.removeFolder(folder.id)} aria-label={`Remove ${folder.name}`}>Remove</button>
          </li>
        ))}
      </ul>
      {own.canPickFolder ? (
        <>
          <button type="button" className="chip-btn solid" data-nav onClick={() => { void own.addFolder(wanted); }}>{kind === 'pictures' ? 'Add picture folder' : 'Add music folder'}</button>
          {own.folderNote && <p className="own-note bad" role="status">{own.folderNote}</p>}
        </>
      ) : (
        <>
          <input ref={fileRef} type="file" multiple hidden accept={kind === 'pictures' ? 'image/*,.jpg,.jpeg,.png,.webp,.gif,.avif' : 'audio/*,.mp3,.m4a,.ogg,.opus,.aac,.wav,.flac'}
            onChange={e => { own.addFiles(Array.from(e.target.files ?? []), wanted); e.target.value = ''; }} />
          <button type="button" className="chip-btn solid" data-nav onClick={() => fileRef.current?.click()}>{kind === 'pictures' ? 'Add pictures' : 'Add audio files'}</button>
          <p className="own-note">This browser cannot remember folders, so picked files last until you reload.</p>
        </>
      )}
      {kind === 'pictures' && <PictureMixControls count={own.pictures.length} />}
      {kind === 'folders' && <MusicMixControls count={own.local.length} />}
    </section>
  );
}
