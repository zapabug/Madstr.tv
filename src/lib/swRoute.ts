// Which requests the service worker may answer (spec feat-pwa-zapstore §P1). Pure, so it is tested here and
// inlined into sw.js at build time. It only ever serves the app's own files: relays, the RSS proxy, media and
// other sites always go to the network untouched, so nothing stale or large is ever kept.

export type SwRoute = 'navigate' | 'shell' | 'pass';

export interface SwRequest {
  url: string;
  method: string;
  mode: string; // 'navigate' for a page load
}

export function swRoute(req: SwRequest, origin: string, shell: ReadonlySet<string>): SwRoute {
  if (req.method !== 'GET') return 'pass';
  let url: URL;
  try { url = new URL(req.url); } catch { return 'pass'; }
  if (url.origin !== origin) return 'pass'; // relays (wss), media, other sites
  if (url.pathname.startsWith('/api/')) return 'pass'; // the RSS proxy: always live
  if (req.mode === 'navigate') return 'navigate';
  return shell.has(url.pathname) ? 'shell' : 'pass';
}
