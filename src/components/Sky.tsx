// The deep-space backdrop from pleb.world: two drifting star layers and a planet.
// Decorative only. When you are logged in, the planet wears your profile picture over the
// plain orange ball; if the picture's URL is bad or the image fails to load, the ball stays
// underneath so the planet never goes blank. Nothing here waits on a relay.
import { useEffect, useState } from 'react';
import { useAccount, useProfile } from '../data/people.ts';
import { isHttpUrl } from '../lib/media.ts';

export function Sky() {
  const account = useAccount();
  const profile = useProfile(account?.pubkey);
  const face = isHttpUrl(profile?.picture) ? profile?.picture : undefined;
  const [broken, setBroken] = useState(false);

  // A new picture URL (or a login) gets a fresh chance to load.
  useEffect(() => { setBroken(false); }, [face]);

  return (
    <>
      <div className="sky" aria-hidden="true">
        <div className="stars s1" />
        <div className="stars s2" />
      </div>
      <div className="planet" aria-hidden="true">
        <div className="ball" />
        {face && !broken && <img className="planet-face" src={face} alt="" referrerPolicy="no-referrer" decoding="async" onError={() => { setBroken(true); }} />}
      </div>
    </>
  );
}