import { useRef, useState } from 'react';
import { useOwn } from '../data/ownContext.ts';

// Adding your own sources, right where they show up: RSS feeds under Podcasts,
// local folders under Local.
export function OwnControls({ kind }: { kind: 'feeds' | 'folders' }) {
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
          <input type="url" value={text} onChange={e => setText(e.target.value)} placeholder="https://example.com/feed.xml" aria-label="Feed address" />
          <button type="submit" className="chip-btn solid" data-nav disabled={adding}>{adding ? 'Adding…' : 'Add feed'}</button>
        </form>
      </section>
    );
  }

  return (
    <section className="own" aria-label="Local folders">
      <h2>Folders</h2>
      <ul>
        {own.folders.map(folder => (
          <li key={folder.id}>
            <span className="own-name" title={folder.name}>{folder.name}</span>
            <span className={`own-status${folder.status === 'error' ? ' bad' : ''}`}>
              {folder.status === 'loading' ? 'Loading…' : folder.status === 'needs-permission' ? 'Needs permission' : folder.status === 'error' ? folder.error : `${folder.count} tracks`}
            </span>
            {folder.status === 'needs-permission' && (
              <button type="button" className="chip-btn solid" data-nav onClick={() => { void own.reconnectFolder(folder.id); }}>Reconnect</button>
            )}
            <button type="button" className="chip-btn" data-nav onClick={() => own.removeFolder(folder.id)} aria-label={`Remove ${folder.name}`}>Remove</button>
          </li>
        ))}
      </ul>
      {own.canPickFolder ? (
        <button type="button" className="chip-btn solid" data-nav onClick={() => { void own.addFolder(); }}>Add music folder</button>
      ) : (
        <>
          <input ref={fileRef} type="file" multiple hidden accept="audio/*,.mp3,.m4a,.ogg,.opus,.aac,.wav,.flac"
            onChange={e => { own.addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          <button type="button" className="chip-btn solid" data-nav onClick={() => fileRef.current?.click()}>Add audio files</button>
          <p className="own-note">This browser cannot remember folders, so picked files last until you reload.</p>
        </>
      )}
    </section>
  );
}
