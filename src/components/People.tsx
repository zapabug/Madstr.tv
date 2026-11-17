import { useState } from 'react';
import QRCode from 'react-qr-code';
import { PersonIcon } from './icons.tsx';
import { isTv, qrPopup } from '../lib/qrPopup.ts';
import { CATEGORIES, type Category } from '../lib/creators.ts';
import { loginWithBunker, loginWithSigner, logout, signerAvailable, startQrLogin, type QrLogin } from '../lib/accounts.ts';
import { isHttpUrl } from '../lib/media.ts';
import { follow, shortName, unfollow, useAccount, useCreatorSuggestions, useProfile } from '../data/people.ts';

// Someone's picture; without one (or when it fails to load) their initial, or a person icon when they
// have not set a name either (spec §Design pass fixes).
export function Avatar({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  const picture = isHttpUrl(profile?.picture) ? profile.picture : undefined;
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const initial = profile?.displayName?.trim().slice(0, 1).toUpperCase();
  return picture && failed !== picture
    ? <img className="avatar" src={picture} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(picture)} />
    : <span className="avatar avatar-fallback" aria-hidden="true">{initial || <PersonIcon size={18} />}</span>;
}

export function PersonName({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  return <>{shortName(pubkey, profile?.displayName)}</>;
}

// The small chip in the header: log out, or a way to log in. On a TV, Log in opens the QR pop-up
// (feat-tv-remote TV6); elsewhere it goes to People, where the login card is.
export function AccountChip() {
  const account = useAccount();
  const profile = useProfile(account?.pubkey);
  return account
    ? <button type="button" className="chip-link" data-nav data-nav-nofallback title={`Logged in as ${shortName(account.pubkey, profile?.displayName)}`} onClick={() => { void logout(); }}>Log out</button>
    : <a className="chip-link" href="#/people/follow" data-nav data-nav-nofallback onClick={e => { if (isTv()) { e.preventDefault(); qrPopup.open(); } }}>Log in</a>;
}

export function LoginPanel() {
  const account = useAccount();
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

  if (account) return null;

  return (
    <section className="own" aria-label="Log in">
      <h2>Log in to follow people</h2>
      <p className="own-note">Optional. Without a login the board shows what the people the TV account follows post.</p>
      <div className="own-add">
        <button type="button" className="chip-btn solid" data-nav disabled={busy || !signerAvailable()} onClick={() => { void attempt(loginWithSigner); }}>
          {signerAvailable() ? 'Open signer' : 'No signer found'}
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
        <input type="text" data-nav value={uri} onChange={e => setUri(e.target.value)} placeholder="bunker:// or nbunksec… (from Amber or another signer)" aria-label="Bunker link" autoComplete="off" spellCheck={false} />
        <button type="submit" className="chip-btn solid" data-nav disabled={busy || !uri.trim()}>{busy ? 'Connecting…' : 'Connect'}</button>
      </form>
      {error && <p className="own-status bad" role="alert">{error}</p>}
    </section>
  );
}

export function FollowView() {
  const account = useAccount();
  const [category, setCategory] = useState<Category | 'all'>('all');
  const { creators, following } = useCreatorSuggestions(category);
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
      <section className="own" aria-label="Creators to follow">
        <h2>Creators to follow</h2>
        <p className="own-note">People you do not follow yet, ranked by what they publish: friends of the people you follow first, then others.</p>
        <div className="chips creator-chips" role="group" aria-label="Rank by">
          <button type="button" data-nav data-nav-start="1" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>Everything</button>
          {CATEGORIES.map(c => (
            <button key={c.id} type="button" data-nav aria-pressed={category === c.id} title={c.hint} onClick={() => setCategory(c.id)}>{c.emoji} {c.label}</button>
          ))}
        </div>
        {message && <p className="own-status bad" role="alert">{message}</p>}
        {creators.length === 0 && <p className="own-note">{category === 'all' ? 'Looking for creators…' : 'Nobody found yet who publishes this. More may arrive.'}</p>}
        <ul className="creators">
          {creators.map(c => {
            const isFollowing = following?.has(c.pubkey) ?? false;
            return (
              // The card is one focus stop (feat-tv-remote TV5-6); OK on it follows / unfollows. A tap on the card does
              // nothing (detail > 0): only the button follows by touch or mouse, as before.
              <li key={c.pubkey} className="creator-card" data-nav tabIndex={0}
                onClick={e => { if (e.detail === 0 && e.target === e.currentTarget && account && !pending.includes(c.pubkey)) void run(c.pubkey, isFollowing); }}>
                {c.mutual > 0 && <span className="note">{c.mutual} of your follows</span>}
                <Avatar pubkey={c.pubkey} />
                <h3 className="card-name"><PersonName pubkey={c.pubkey} /></h3>
                <p className="card-counts" aria-label="What they publish">
                  {CATEGORIES.filter(k => c.counts[k.id] > 0).map(k => <span key={k.id} title={`${k.label}: ${k.hint}`}>{k.emoji} {c.counts[k.id]}</span>)}
                </p>
                <p className="card-sub">{c.latest}</p>
                <div className="card-actions">
                  <button type="button" className="chip-btn solid" tabIndex={-1} disabled={!account || pending.includes(c.pubkey)} title={account ? undefined : 'Log in to follow'}
                    onClick={() => { void run(c.pubkey, isFollowing); }}>
                    {pending.includes(c.pubkey) ? '…' : isFollowing ? 'Unfollow' : 'Follow'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {!account && creators.length > 0 && <p className="own-note">Log in above to follow.</p>}
      </section>
    </div>
  );
}
