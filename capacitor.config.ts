import type { CapacitorConfig } from '@capacitor/cli';

// The Android app (spec feat-pwa-zapstore §P2). The app id is permanent once published on zapstore: it is the
// one the first Madstr's Capacitor setup used.
const config: CapacitorConfig = {
  appId: 'com.madstr.tvapp',
  appName: 'Mad⚡tr.tv',
  webDir: 'dist',
  plugins: {
    // Native HTTP for fetch: RSS feeds load directly, without the web build's /api/rss proxy (spec §P2).
    CapacitorHttp: { enabled: true },
  },
  android: {
    // The app talks to relays over wss and loads media from https only.
    allowMixedContent: false,
  },
};

export default config;
