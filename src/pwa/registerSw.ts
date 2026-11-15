// Register the service worker (spec feat-pwa-zapstore §P1): production web builds only. Not inside the
// Android app, which carries its files already, and never on a dev server, where it would cache stale code.
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if ((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.error('[sw] could not register the service worker:', error);
    });
  });
}
