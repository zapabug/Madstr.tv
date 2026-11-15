# feat-own-audio — local music and RSS feeds in the audio playlist

Branch: `feat/own-audio` (cut from `origin/audio-debug`; `main` is broken, see Base).

## Goal

The audio list in Madstr TV only shows what Nostr relays return. Add two sources
the user controls, so the playlist always has something to play and doubles as a
music-intake test for the later Wavlake/Nostr work:

1. **Local music**: folders picked on the device.
2. **RSS feeds**: podcast / music feeds by URL.

Both feed the same audio list (`audioNotes`) as synthetic `NostrNote`s, so
playback, next/previous, speed, resume position and the list UI all work
unchanged.

## Decisions

- **No server for local music.** The browser cannot read `~/Music`. Chromium
  gets `showDirectoryPicker()`: the folder *handle* is stored in IndexedDB (no
  copy of the files), re-scanned on load, and a "Reconnect" button re-grants
  read permission when the browser asks again. Browsers without it (Firefox,
  the Android WebView) fall back to a plain file picker: tracks play for the
  session only and are not remembered.
- **Own IndexedDB** (`MadstrOwnAudioDB`), not a new version of the app DB, so
  the existing schema is untouched.
- **RSS goes direct first, then through `/api/rss`.** Most podcast hosts block
  cross-origin reads, so a same-origin proxy is the fallback: a Vite dev/preview
  middleware, and a Vercel function with the same code. The proxy only passes
  http(s), refuses private / loopback / link-local addresses (also after
  redirects), caps size and time, and returns the bytes untouched. Parsing is
  in the browser.
- Synthetic notes have no `posterPubkey`, so no profile lookup is attempted,
  and carry `source: 'local' | 'rss'`.
- The list row shows the track/episode title for own sources (Nostr notes keep
  showing the author). This is a one-line text change in `MediaPanel`, no
  styling.
- Nothing about Nostr audio kinds changes here.

## Not in this feat

- Reading ID3 tags or durations from local files (titles come from file names).
- Downloading / caching RSS episodes offline.
- Wavlake or any new Nostr audio kind: that is the next feat, tested on top of
  this list.
- Playlist order control: own items are merged into the existing newest-first
  sort by date.

## Milestones

- [x] M1 store + types: `ownAudioStore`, `source` on `NostrNote`
- [x] M2 RSS: `rssFeed` parser, proxy (`server/rssProxy`, Vite plugin, `api/rss`)
- [x] M3 local: folder scan and session-file fallback
- [x] M4 `useOwnAudio` hook merged into `audioNotes` in `App`
- [x] M5 Settings: "My Audio" section (add/remove/refresh/reconnect)
- [x] M6 checks: `tsc` and eslint no worse than baseline, build passes

## Status: built, partly verified

Checked in headless Chromium against the dev server:
- RSS: a real feed loads (direct fetch fails on CORS, proxy fallback works),
  100 episodes appear in the audio list as `♪ <title>` after a reload, and the
  Settings section shows the feed with Refresh / Remove.
- Proxy refuses loopback, metadata-IP, IPv6 loopback, `file:` and `ftp:`.
- Folder scan: recursion, extension filter and the session-file fallback, with a
  fake directory handle.

Not verified (needs a person at a real browser or device):
- The actual `showDirectoryPicker()` dialog, folder permission re-grant after a
  reload, and playing a local track.
- The Vercel function `api/rss.ts` (same code as the dev proxy, never deployed).
- Android WebView: no folder picker there, so the file-picker fallback applies.
- Relay-gate caveat: the app shows "Connecting to Nostr Relays..." until
  `ndk.connect()` returns, so own audio also waits for that. Pre-existing.

## Base

`main` does not compile: the `merge: audio-debug into main` commit left syntax
errors in `src/App.tsx`, `src/components/ImageFeed.tsx` and `src/utils/idb.ts`
(duplicate `DB_NAME`/`DB_VERSION` blocks). `origin/audio-debug` parses and
builds (baseline: 6 `tsc` errors, 6 eslint errors, all pre-existing), so this
feat starts there. Repairing `main` is a separate decision.
