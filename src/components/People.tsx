import { useState } from 'react';
import QRCode from 'react-qr-code';
import { hasExtension, loginWithBunker, loginWithExtension, logout, startQrLogin, type QrLogin } from '../lib/accounts.ts';
import { toggleLike, useLiked } from '../lib/liked.ts';
import { follow, shortName, unfollow, useAccount, useCreatorSuggestions, useProfile } from '../data/people.ts';
import { HeartIcon } from './icons.tsx';

export function Avatar({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  const name = shortName(pubkey, profile?.displayName);
  return profile?.picture
    ? <img className="avatar" src={profile.picture} alt="" loading="lazy" referrerPolicy="no-referrer" />
    : <span className="avatar avatar-fallback" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>;
}

export function PersonName({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  return <>{shortName(pubkey, profile?.displayName)}</>;
}

// The small chip in the header: who you are, or a way to log in.
export function AccountChip() {
  const account = useAccount();
  const profile = useProfile(account?.pubkey);
  return (
    <a className="chip-link" href="#/people/follow" data-nav>
      {account ? `♥ ${shortName(account.pubkey, profile?.displayName)}` : 'Log in'}
    </a>
  );
}

export function LoginPanel() {
  const account = useAccount();
  const profile = useProfile(account?.pubkey);
  const [uri, setUri] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<QrLogin | null>(null);

  const showQr = () => {
    setError(null);
    const login = startQrLogin();
    setQr(login);
    login.connected.then(() => setQr(null)).catch(e => { setQr(null); setError(e instanceof Error ? e.message : 'Could not log in'); });
  };
  const stopQr = () => { qr?.cancel(); setQr(null); };

  const attempt = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setUri('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log in');
    } finally {
      setBusy(false);
    }
  };

  if (account) {
    return (
      <section className="own" aria-label="Account">
        <h2>Logged in</h2>
        <ul><li>
          <Avatar pubkey={account.pubkey} />
          <span className="own-name">{shortName(account.pubkey, profile?.displayName)}</span>
          <button type="button" className="chip-btn" data-nav onClick={logout}>Log out</button>
        </li></ul>
        <p className="own-note">The board now shows what the people <b>you</b> follow post.</p>
      </section>
    );
  }

  return (
    <section className="own" aria-label="Log in">
      <h2>Log in to follow people</h2>
      <p className="own-note">Optional. Without a login the board shows what the people the TV account follows post.</p>
      <div className="own-add">
        <button type="button" className="chip-btn solid" data-nav disabled={busy || !hasExtension()} onClick={() => { void attempt(loginWithExtension); }}>
          {hasExtension() ? 'Use browser extension' : 'No browser extension found'}
        </button>
      </div>
      {qr ? (
        <div className="qr-login">
          <div className="qr-box"><QRCode value={qr.uri} size={208} level="M" /></div>
          <p className="own-note">Scan this with your signer app (Amber or another NIP-46 signer). Waiting for it to answer…</p>
          <div className="own-add">
            <a className="chip-btn solid" data-nav href={qr.uri}>Open in a signer on this device</a>
            <button type="button" className="chip-btn" data-nav onClick={() => { void navigator.clipboard?.writeText(qr.uri); }}>Copy link</button>
            <button type="button" className="chip-btn" data-nav onClick={stopQr}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="own-add">
          <button type="button" className="chip-btn solid" data-nav disabled={busy} onClick={showQr}>Log in with a QR code</button>
        </div>
      )}
      <form className="own-add" onSubmit={e => { e.preventDefault(); void attempt(() => loginWithBunker(uri)); }}>
        <input type="text" value={uri} onChange={e => setUri(e.target.value)} placeholder="bunker://… (from Amber or another signer)" aria-label="Bunker link" autoComplete="off" spellCheck={false} />
        <button type="submit" className="chip-btn solid" data-nav disabled={busy || !uri.trim()}>{busy ? 'Connecting…' : 'Connect'}</button>
      </form>
      {error && <p className="own-status bad" role="alert">{error}</p>}
    </section>
  );
}

function LikeButton({ pubkey }: { pubkey: string }) {
  const liked = useLiked().includes(pubkey);
  return (
    <button type="button" className="chip-btn" data-nav aria-pressed={liked} onClick={() => toggleLike(pubkey)} aria-label={liked ? 'Unlike' : 'Like'}>
      <HeartIcon size={16} /> {liked ? 'Liked' : 'Like'}
    </button>
  );
}

export function FollowView() {
  const account = useAccount();
  const { creators, following } = useCreatorSuggestions();
  const [pending, setPending] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (pubkey: string, isFollowing: boolean) => {
    setPending(p => [...p, pubkey]);
    setMessage(null);
    try {
      await (isFollowing ? unfollow(pubkey) : follow(pubkey));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not update your follows');
    } finally {
      setPending(p => p.filter(k => k !== pubkey));
    }
  };

  return (
    <div className="people">
      <LoginPanel />
      <LikedPeople />
      <section className="own" aria-label="Creators to follow">
        <h2>Podcast and music creators</h2>
        <p className="own-note">People publishing audio on Nostr: friends of the people you follow first, then others.</p>
        {message && <p className="own-status bad" role="alert">{message}</p>}
        {creators.length === 0 && <p className="own-note">Looking for creators…</p>}
        <ul className="creators">
          {creators.map(c => {
            const isFollowing = following?.has(c.pubkey) ?? false;
            return (
              <li key={c.pubkey} className="creator-card">
                {c.mutual > 0 && <span className="note">{c.mutual} of your follows</span>}
                <Avatar pubkey={c.pubkey} />
                <h3 className="card-name"><PersonName pubkey={c.pubkey} /></h3>
                <p className="card-sub">{c.count} {c.count === 1 ? 'item' : 'items'} · {c.latest}</p>
                <div className="card-actions">
                  <LikeButton pubkey={c.pubkey} />
                  <button type="button" className="chip-btn solid" data-nav disabled={!account || pending.includes(c.pubkey)} title={account ? undefined : 'Log in to follow'}
                    onClick={() => { void run(c.pubkey, isFollowing); }}>
                    {pending.includes(c.pubkey) ? '…' : isFollowing ? 'Unfollow' : 'Follow'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {!account && creators.length > 0 && <p className="own-note">Log in above to follow. You can already like people for the Liked sticker.</p>}
      </section>
    </div>
  );
}

export function LikedPeople() {
  const liked = useLiked();
  return (
    <section className="own" aria-label="Liked npubs">
      <h2>Liked npubs</h2>
      {liked.length === 0 ? (
        <p className="own-note">Nobody yet. Press ♥ Like in the player on any track or video, or on a creator under “Follow more creators”.</p>
      ) : (
        <ul className="creators">
          {liked.map(pubkey => (
            <li key={pubkey} className="creator-card">
              <Avatar pubkey={pubkey} />
              <h3 className="card-name"><PersonName pubkey={pubkey} /></h3>
              <div className="card-actions">
                <button type="button" className="chip-btn" data-nav onClick={() => toggleLike(pubkey)} aria-label="Unlike">Unlike</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
