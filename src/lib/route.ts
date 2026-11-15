// The whole app is two places: the sticker board (home) and the viewer. A sticker
// is only a shortcut: it opens the viewer already set to a mode and a filter.
// The place lives in the URL hash so it survives a reload and the back button.

export type ViewerMode = 'listen' | 'watch' | 'pictures' | 'people';

export type ListenFilter = 'music' | 'podcasts' | 'local';
export type WatchFilter = 'continue' | 'short' | 'long';
export type PeopleFilter = 'liked' | 'follow';

export type Route =
  | { page: 'board' }
  | { page: 'viewer'; mode: 'listen'; filter: ListenFilter }
  | { page: 'viewer'; mode: 'watch'; filter: WatchFilter }
  | { page: 'viewer'; mode: 'pictures'; filter: 'mine' }
  | { page: 'viewer'; mode: 'people'; filter: PeopleFilter };

const LISTEN: readonly string[] = ['music', 'podcasts', 'local'];
const WATCH: readonly string[] = ['continue', 'short', 'long'];
const PEOPLE: readonly string[] = ['liked', 'follow'];

export const BOARD: Route = { page: 'board' };

export function toHash(route: Route): string {
  if (route.page === 'board') return '#/';
  return `#/${route.mode}/${route.filter}`;
}

// Anything unknown or malformed falls back to the board, never to an error.
export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [mode, filter] = parts;
  if (parts.length !== 2) return BOARD;
  if (mode === 'listen' && LISTEN.includes(filter)) return { page: 'viewer', mode, filter: filter as ListenFilter };
  if (mode === 'watch' && WATCH.includes(filter)) return { page: 'viewer', mode, filter: filter as WatchFilter };
  if (mode === 'pictures' && filter === 'mine') return { page: 'viewer', mode, filter };
  if (mode === 'people' && PEOPLE.includes(filter)) return { page: 'viewer', mode, filter: filter as PeopleFilter };
  return BOARD;
}
