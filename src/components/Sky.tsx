// The corner planet from pleb.world (the drifting star layers are gone, zapa 2026-11-22).
// Decorative only. When you are logged in, the planet wears your profile picture over the
// plain orange ball; if the picture's URL is bad or the image fails to load, the ball stays
// underneath so the planet never goes blank. Nothing here waits on a relay.
import { useEffect, useState } from 'react';
import { useAccount, useProfile } from '../data/people.ts';
import { isHttpUrl } from '../lib/media.ts';

// A picture that fails to load is tried again (spec §Added later): every 15 s, up to 4 times, and
// whenever the tab comes back into view or the network comes back.
const RETRY_MS = 15_000;
const RETRIES = 4;

export function Sky() {
  const account = useAccount();
  const profile = useProfile(account?.pubkey);
  const face = isHttpUrl(profile?.picture) ? profile?.picture : undefined;
  const [broken, setBroken] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // A new picture URL (or a login) gets a fresh chance to load.
  useEffect(() => { setBroken(false); setAttempt(0); }, [face]);

  // After a failure, try again later instead of giving up until a reload.
  useEffect(() => {
    if (!broken) return;
    const retry = () => { setBroken(false); setAttempt(n => n + 1); };
    const onVisible = () => { if (document.visibilityState === 'visible') retry(); };
    const timer = attempt < RETRIES ? window.setTimeout(retry, RETRY_MS) : undefined;
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [broken, attempt]);

  return (
    <div className="planet" aria-hidden="true">
      <div className="ball" />
      {/* key: a retry mounts a fresh <img>, so the browser asks for the picture again */}
      {face && !broken && <img key={attempt} className="planet-face" src={face} alt="" referrerPolicy="no-referrer" decoding="async" onError={() => { setBroken(true); }} />}
    </div>
  );
}
