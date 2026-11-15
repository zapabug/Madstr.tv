import { useCallback, useSyncExternalStore } from 'react';
import { parseHash, toHash, type Route } from './route.ts';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const getHash = (): string => window.location.hash;
const getServerHash = (): string => '';

export function useRoute(): { route: Route; go: (_route: Route) => void } {
  const hash = useSyncExternalStore(subscribe, getHash, getServerHash);
  const go = useCallback((route: Route) => {
    window.location.hash = toHash(route);
  }, []);
  return { route: parseHash(hash), go };
}
