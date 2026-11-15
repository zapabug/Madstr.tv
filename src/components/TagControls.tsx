import { useState } from 'react';
import { addTagTo, removeTagFrom, useTagSet, type TagKind } from '../lib/tags.ts';

const WHAT: Record<TagKind, string> = { audio: 'Music and podcast hashtags', video: 'Video hashtags', image: 'Picture hashtags' };

// Hashtag discovery: also pull in posts with these hashtags, not only the people you follow.
export function TagControls({ kind }: { kind: TagKind }) {
  const tags = useTagSet()[kind];
  const [text, setText] = useState('');
  return (
    <section className="own tags" aria-label={WHAT[kind]}>
      <h2>{WHAT[kind]}</h2>
      <ul className="tag-list">
        {tags.map(tag => (
          <li key={tag}>
            <span className="tag-chip">#{tag}</span>
            <button type="button" className="chip-btn" data-nav onClick={() => removeTagFrom(kind, tag)} aria-label={`Remove #${tag}`}>✕</button>
          </li>
        ))}
        {tags.length === 0 && <li className="own-note">None yet: only the people you follow.</li>}
      </ul>
      <form className="own-add" onSubmit={e => { e.preventDefault(); addTagTo(kind, text); setText(''); }}>
        <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="#music" aria-label="Add a hashtag" autoComplete="off" />
        <button type="submit" className="chip-btn solid" data-nav disabled={!text.trim()}>Add</button>
      </form>
    </section>
  );
}
