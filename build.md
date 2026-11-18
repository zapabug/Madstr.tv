# build.md: Mad⚡tr.tv (feat-applesauce-revamp)

The what: what was built per milestone, with commits. The spec is `feat-applesauce-revamp.md`;
the why is in `planning.md`. Written 2026-11-15 from git history and the audit of that day
(`audits/audit-2026-11-15.md`), when this file was first created; earlier sessions kept no build log.

| Milestone | Title | Status |
| --- | --- | --- |
| R1 | Skeleton, sticker board, viewer route | built + machine-verified; no user confirmation recorded |
| R2 | Viewer + bottom panel (player, queue, split screen) | built + machine-verified; no user confirmation recorded |
| R3 | Listen mode (Music / Podcasts / Local) | built + machine-verified; no user confirmation recorded |
| R4 | Watch mode (short, long, keep watching) | built + machine-verified; no user confirmation recorded |
| R5 | People (login, follow, creator picker) | built + machine-verified; Log out chip in 9d821b3 |
| R6 | Picture wall, live previews, hashtag discovery | built + machine-verified; preview gaps fixed in 9d821b3 |
| R7 | Local media on the web | built; folder picker untested in a real browser |
| RSS | Feed parser and proxy tests | built + machine-verified (faa4288); awaiting zapa |
| RA1-RA4 | Radio, Nostr first: stations, Live now, genre stickers, votes | built + machine-verified on feat/radio; awaiting zapa |
| RA5 + podcasts | Radio genre first, many at once, 30 at a time; older podcasts on Nostr | built + machine-verified (ec7f783); look of the sticker strip to be discussed |
| R8 | Remote pass (final stage before deploy) | built + machine-verified; awaiting zapa's remote test |
| A1 | Android app picks files (feat-android-play) | built + machine-verified; awaiting zapa on a device |
| A2 | Android app keeps playing in the background (1.1) | zapa: works (2026-11-15) |
| N1 | Native media controls (app) + media session (web) | built; web machine-verified; app not run on a device |
| N2 | Remembered folders in the app | built; not run on a device |
| N3 | Local music mixed into Music (slider) | built + machine-verified |
| N4 | Music is 2 to 9 minutes | built + machine-verified |
| T1 | Bigger faces (feat-taste-cache) | built + machine-verified |
| T2 | Votes and hiding | built + machine-verified (logged-in publish not run: no signing key here) |
| T3 | Device cache | built + machine-verified |
| T4 | Reach back in time | built + machine-verified |
| T5 | More relays | built + probed |
| T6 | Double tap to seek; -10s / +30s buttons gone | built + machine-verified |
| T7 | Phone turned sideways | withdrawn 2026-11-16 (sideways = TV layout) |
| D1-D3 | Web app at pleb.world/madstr, RSS proxy there | live 2026-11-15 |
| D4 | Vercel project madstr-tv removed | waiting on zapa (dashboard) |
| D5 | Android 1.3 on zapstore | published 2026-11-15 |
| P1 | Phone controls in two compact rows (feat-phone-inline) | built; released in 1.4 |
| P29 | The logo on every icon, the start screen and the Play button | built (905ffb0); not released |
| Final pass | Your Nostr Jukebox, bolt in the wordmark, README, zapstore notes | built (fb46755); deployed 2026-11-17 |
| Release 1.5 | Android 1.5 (versionCode 6) on zapstore; web on pleb.world/jukestr | published 2026-11-17 (event ba7b7198…, pending at zapstore) |
| P2-P27 | Phone layouts, Open signer, Make it yours, Jukestr 3000 look | built + machine-verified; shaped live with zapa on his phone (test builds); not released |
| P28 | The name is Juke⚡tr; web app at pleb.world/jukestr | built + machine-verified; pleb.world committed, not pushed |

Verify on 2026-11-15: `pnpm test` 93/93 (118/118 after the new tests), `pnpm lint` clean, `pnpm build` passes with two warnings
(a stray `*/` in `src/styles.css`, a 655 kB chunk). Headless Chromium boot shows the board at once.

## R1 — Skeleton [built]
Commit: 2934f2e
Spec: §Home, §Milestones R1, §Toolchain

- Vite 6 + React 19 + TS strict; Applesauce store and relay pool (`src/lib/applesauce.ts`), no relay gate.
- Bundled fonts, sky (`Sky.tsx`), sticker board (`Board.tsx`, `stickers.ts`), arrow focus
  (`useFocusNav.ts`, `focusNav.ts`), hash routing (`route.ts`), dock (`Dock.tsx`).
- Tested: `route.test.ts`, `focusNav` tests; headless boot.
- 9d821b3 (2026-11-15): "pick a sticker" note, the shortcut line and the All / Listen / Watch /
  People chips removed; all three lanes always show. Headless boot checked.

## R2 — Viewer + bottom panel [built]
Commits: 384a317 (player), 3e2fe10, 81d8aa3, 02d3923, 90bbc05, dc7a613, f0ce1af, bca1ac6, 1adee47,
e74c251, 6d4877a, 1cc10fc, 33c29da, 2b6a181, 107d7c4, f39ea77, fbc7e9d
Spec: §Split screen, §The viewer, §Milestones R2

- One player store (`player.ts`), hidden audio (`Engine.tsx`), video in `Theater.tsx`, queue and
  resume (`queue.ts`), SVG prev / play / next, seek, -10s/+30s, speed (`Transport.tsx`), playlist.
- Split screen: picture on top with ⟨ ⟩ chevrons, brand, mode chip; bottom 70/30 picker / controls;
  45 s autohide (`useAutoHide.ts`); thin top bar with time; track toast; author spot; ticker.
- fbc7e9d: autohide in picture mode, one playback speed per queue kind.
- 37092b4: video failed to fill the screen when the panel hid (the playlist's scrollIntoView scrolled the
  whole viewer once the panel was off-screen); `.theater` is now `overflow: clip`. Autohide 25 s (zapa).
- Decided after the audit: the picker is the playlist only (no sources column, no 1100 px rule).

## Added later — Shuffle, video sound off-screen [built + machine-verified]
Commit: 9d821b3
Spec: §Added later (2026-11-15)

- Shuffle toggle in the media picker header (`PickerPanel.tsx`, `ShuffleIcon`): pure order rules in
  `queue.ts` (`shuffleAround`, `mergeShuffled`, `unshuffle`, tests in `queue.test.ts`); the player keeps
  the normal order to turn it off, mixes late arrivals in at the end, and a newly opened playlist starts
  unshuffled.
- Leaving the watch viewer hands a playing video to the hidden `<audio>` at the same second; next /
  end carry on as sound; coming back puts the picture back at the sound's position (`player.ts`).
- Headless, real relays (#/watch/long): video at 2.2 s → board: audio of the same file playing at
  6.8 s → back: video playing at 10.8 s, audio paused. Shuffle on reorders the list, off restores it.

## R3 — Listen mode [built]
Commits: 384a317, 7f2bc57
Spec: §Listen mode, §Rules added later (podcast > 9 min)

- Nostr audio from follows, RSS feeds, local folders (`views.ts`); podcasts = over 9 minutes, kind 1
  audio attachments (7f2bc57); background length probing (`durations.ts`).
- Sources are added on the board under "Your sources" (decided after the audit).
- Tested: `media.test.ts` (event rules from real shapes).

## R4 — Watch mode [built]
Commit: 384a317
Spec: §Watch mode, §Rules added later (short < 30 s)

- Short, long, keep watching (last video first, then newest), `views.ts`.

## R5 — People [built]
Commits: f72f8ac, 603825b (QR login), e25434b, 4eaaa87, 1b81491 (Liked npubs removed), 5b0168b,
bb3a465 (session store as in the Madeira Livre app), 54bd69c, 5e81a5b, 63f0e27; 9d821b3 (Log out chip, names)
Spec: §Milestones R5, §Decided after the audit, §Dropped later

- Login: NIP-07 extension, pasted bunker:// / nbunksec, QR (nostrconnect) with retry, switch_relays
  and a 240 s give-up; own session store `src/lib/session.ts`. Follow / unfollow via FollowUser.
- Creator picker ranked by images, videos, podcasts, music, shorts; friends of follows first.
- 9d821b3 (2026-11-15): header chip is Log out when logged in; the "Logged in" box is gone.
- 9d821b3 (2026-11-15): no name set shows the last 5 letters of the npub; a set name is clipped
  to 40 characters (`src/lib/names.ts`, `names.test.ts`); avatars show only http(s) pictures.
- Headless check with a read-only stub extension (fiatjaf's pubkey): chip says Log out and the planet
  shows the profile picture within 2 s.
- Known, left as is by zapa ("it works, don't touch"): cancelling a QR login can still save the
  session if the signer approves later (`accounts.ts`, save before the cancel check).

## R6 — Picture wall, previews, hashtags [built]
Commits: ef3bc6b (live previews), 02d3923 (hashtag discovery), 8b025f8 (picture mix)
Spec: §Home preview table, §Milestones R6

- Slideshow (`Slideshow.tsx`), sticker previews (`previews.ts`, `Board.tsx`), hashtags per kind (`tags.ts`).
- Audit gaps fixed (9d821b3, 2026-11-15): rules moved to pure `src/lib/previews.ts`
  (`previews.test.ts`). My pictures shows only device pictures; Music / Podcasts show the cover of the
  next item itself (drawn fallback when it has none); Short / Long rotate the next few posters; Keep
  watching's bar uses the length the player measured (now saved with the last video), else the
  event's; no `<video>` first-frame fallback (glyph instead); the rotator cross-fades.
- 2026-11-15, zapa: Long videos showed no pictures. Real relays: 158 of 158 long kind 1 notes and 15 of 16
  kind 21 videos carry no poster; the preview now takes posters from further down the list.
- Tested: `previews.test.ts`, `player.test.ts` (last-video restore, poster URL check). Headless boot:
  8 stickers, no `<video>` in any preview.

## R7 — Local media [built]
Commits: 09a59e7, f90deec, 603825b (folder placeholder), 8b025f8
Spec: §Local media, §Milestones R7

- Local playlist and My pictures from a folder picker or picked files (`ownAudioState.ts`,
  `localFolder.ts`, `OwnControls.tsx`). Not exercised in a real browser yet.
- Tested (2026-11-15): `localFolder.test.ts` (scan of a handle tree, depth limit, picked-file cap),
  `stickers.test.ts` (every sticker opens its route, lanes).

## Styling (in scope, decided after the audit)
Commits: f2eeaec, b538884, 1478632 (melting clock), plus the halo / tiles / ticker commits above;
5948541: profile picture as the planet (`Sky.tsx`, `styles.css`; the rest of that CSS diff is a formatter
rewrite). 4fbb7ad: a picture that fails to load is tried again (every 15 s, up to 4 times, and on tab focus /
network back); checked headless with the first request forced to fail, shown 15 s later.

- 5b1e9aa: bigger halo around profile pictures in the viewer; "Your sources" and People cards in their own
  pastel colours with a slight tilt; People category chips as coloured stickers (picked one dark).
  Checked with headless screenshots of the board, People and the short-video viewer.

- b6a258c: creator cards bigger and scaling with the screen (4 per row at 1280, 5 at 1920).

- 909de93: design pass fixes: each view shows its own list or empty text (+ "Still playing"); My pictures
  empty state; person icon for unnamed people; image fallbacks; "Logged in as" on Log out; no tilt on
  phones; flat dashed disabled chips. Checked with screenshots (Podcasts, My pictures, People phone).

- f7f944c: played items hide for the session (lists and previews, snapshot when a list opens); slideshow shows
  every picture once before repeats; picture cache (2000) on the device, walking back in time 300 per
  20 s per request. Headless: played video gone on reopen; cache 629 -> 929 in under 2 minutes.

- f44572b: phones (< 640 px) stack the bottom panel: picker, then the controls in two rows; seek bar usable.

## Deploy (2026-11-15)
- Merged into `main` (dbf5bc8; main takes the rebuild's tree, the old NDK commits stay in history);
  branch `feat/applesauce-revamp` deleted.
- Vercel project `tugajoes-projects/madstr-tv` created and linked (GitHub repo connected, so pushes to
  zapabug/Madstr.tv build). First deploy went to **production**: https://madstr-tv.vercel.app (page OK).
- `/api/rss` crashed on Vercel (ERR_MODULE_NOT_FOUND, bare import in a Node ESM function); fixed in
  9e52802. Snippet: synch/snippets/vercel-function-esm-import-needs-js-extension.md.
- GitHub's main had 4 April commits (old NDK app via shakespeare.diy, a GitHub Pages workflow and a
  Pages base path); merged into history keeping the rebuild's files (e4e29cf, zapa's call) and pushed.
  Vercel built production from GitHub in ~30 s: board loads with 8 stickers, `/api/rss` returns a real
  feed, private addresses get 403.
- pleb.world: Mad⚡tr.tv sticker added (plebworld 98f862b), pushed; live on www.pleb.world in ~30 s.

## RSS [built + machine-verified, awaiting zapa]
Commit: faa4288
Spec: §Milestones RSS

- Carried over from `feat/own-audio` (842ef1d): `rssFeed.ts`, `server/rssProxy.ts` (the function is now pleb.world's
  `/api/rss`).
- `src/lib/xmlLite.ts`: a pure XML reader replacing DOMParser in `rssFeed.ts` (no DTD, no entity expansion, depth
  cap 256, no recursion). Compared with the browser's DOMParser in headless Chromium on six real feeds (Darknet
  Diaries, Planet Money, a Wavlake album, Lex Fridman, Linux Unplugged at 9 MB, an Anchor feed at 5 MB): identical
  output. The one difference is on purpose: an entity bomb stays `&b;` instead of growing.
- Tests: `rssFeed.test.ts` (7, fixtures in `src/lib/fixtures/feeds/` cut from real feeds), `xmlLite.test.ts` (5),
  `server/rssProxy.test.ts` (3, no internet: private ranges, localhost, schemes, safe headers). `pnpm test` now
  also runs `server/`. 210/210, lint, both builds.
- In the dev app (headless Chromium), `loadFeed` on three live feeds went through `/api/rss` and parsed.

## R8 — Remote pass [built + machine-verified, final stage before deploy]
Commit: e6d1054
Spec: §Milestones R8

- `data-nav` on the seek bar, picture-mix slider, feed URL, hashtag and bunker inputs, with an ink
  focus ring on the pastel cards.
- Arrow rules for fields: pure `arrowLeavesField` (`focusNav.ts`, 4 tests); `useFocusNav.ts` reads the
  caret. Areas (`data-nav-group`: picture area, picker, controls) keep arrows inside until nothing lies
  further that way.
- Headless with real key events: board stickers and all 7 source controls, People 17/17, viewer 51/51
  (Long videos); text box Left mid-text stays, Down leaves; seek Right 0 → 1 stays, Up leaves.
- Not checked: a real TV remote / Android TV (parked).

# feat-pwa-zapstore (spec: feat-pwa-zapstore.md)

| Milestone | Title | Status |
| --- | --- | --- |
| P1 | Service worker + manifest | built + machine-verified |
| P2 | Capacitor Android app (phone + TV) | built + machine-verified; not run on a device yet |
| P3 | Signed release + zapstore | published 2026-11-15 (release 03d84ecc…); awaiting zapa's install test |

## P1 — Service worker and manifest [built + machine-verified]
Commit: 094352a
- `sw.js` generated by a plugin in `vite.config.ts` (runs last, so `index.html` is listed): app shell of the
  build, cache `madstr-<hash>`, pure route rule `src/lib/swRoute.ts` (tests) inlined; builder
  `src/pwa/swSource.ts` (tests). Registered in production web builds only (`src/pwa/registerSw.ts`).
- `public/manifest.webmanifest`, icons 192 / 512 / maskable 512 / apple-touch from `favicon.svg`.
- Headless on the production build: worker active, 17 files kept; offline reload opens the full board;
  `/api/rss` fails offline (never cached); `Page.getInstallabilityErrors` empty.

## P2 — Capacitor Android app [built + machine-verified]
Commit: a636e65
- Capacitor 8.6.0 (pinned; 8.6.1/8.6.2 were 3 days old), app id `com.madstr.tvapp`, CapacitorHttp on (RSS
  loads natively). TV: Leanback launcher entry + 320x180 banner; touchscreen / leanback not required.
  Icons, round icons, adaptive background and splash screens from `favicon.svg`.
- `assembleDebug` builds (4.6 MB); aapt2: package, label, banner, launchable + leanback-launchable.
- Not run on a device or emulator (none here). Known limit: audio stops when the app leaves the foreground.

## P3 — Signed release and zapstore [published]
Commit: d3ce3cd
- Go 1.27.4 installed with mise; zsp v2.0.1 built with `go install` (in mise's Go bin, on PATH with mise).
- `zapstore.yaml` written; unsigned release APK builds (3.5 MB).
- Default signer on this machine: `zapstore` wrapper (`~/.local/bin/zapstore`) loads zapa's bunker from
  `~/.config/zsp/signer.env` (600). Bunker signer key `de26d9ce…`.
- zapa was remote, so at his request the agent did the by-hand part: release keystore (PKCS12, RSA 4096,
  cert SHA-256 92aca110…d8c7) in `~/.android-keys/` (600) — **zapa to back it up**; APK signed with
  `scripts/sign-release.sh` (apksigner, schemes v2 + v3).
- Bunker timeout: zsp waits for EOSE from every bunker relay before sending `connect`; nos.lol and nostr.mom
  are unreachable from this machine, so they were dropped from the local signer file (snippet
  `zsp-bunker-timeout-one-unreachable-relay.md`).
- C1 proof: zsp v2 makes it only in the wizard (TTY) or via hotbox (which needs the nsec). A local copy of
  zsp v2.0.1 with one 19-line change (publish falls back to the wizard's own `keystoreProofSigner`) published
  the proof with the first release. Signer confirmed as zapa (npub18weq…).
- Published 2026-11-15: release `03d84ecc…`, status pending at first (zapstore holds a release until it has
  read the APK); minutes later the relay served kind 32267 (app), 30063 (release 1.0), 3063 (asset) and
  30509 (proof for cert 92aca110…), all by zapa.
- Next releases: the proof is valid 2 years, so stock `zapstore publish -q` (after `assembleRelease` and
  `scripts/sign-release.sh`, with a higher versionCode) is enough.

## A1 — Pick files in the Android app [built + machine-verified]
Commit: a790dcf · Spec: `feat-android-play.md` §A1
- zapa (1.0 from zapstore): the folder / file picker does not open. Cause found in Capacitor 8.6.0's
  `BridgeWebChromeClient.showFilePicker`: it calls `intent.getType().startsWith(".")`, and a folder request
  (`showDirectoryPicker`, which newer WebViews have) carries no type. Not seen on a device.
- `src/lib/platform.ts` (`isNativeApp`, `folderPickerUsable`, with tests): the app never offers the folder
  picker; music and pictures show "Add audio files" / "Add pictures" (several files, plain file input).
  The app's note: "Pick several files at once. They stay until the app is closed."
- Headless Chromium with the Capacitor bridge faked: the app shows the file buttons and the chooser opens
  in multi-select; the web still shows "Add music folder" / "Add picture folder".

## A2 — Keep playing in the background [built; not run on a device]
Commit: 48fb782 · Spec: `feat-android-play.md` §A2
- `PlaybackService.java`: media foreground service (type mediaPlayback), notification "Mad⚡tr.tv" + title
  (low importance, opens the app), partial wake lock + Wi-Fi lock; stops on swipe-away and with the activity.
- `PlaybackPlugin.java` (`Playback.start/stop`): starts the service, or only updates the notification when it
  runs (allowed from the background); asks the notification permission once on Android 13+.
- Page: `src/lib/keepAlive.ts` (with tests: starts on playing / loading, updates on a new title, stops 3 s
  after pause / idle / error, a gap between tracks does not stop it), `src/native/backgroundPlay.ts`, loaded
  from `main.tsx` only in the app (its own 9 kB chunk).
- versionCode 2 / 1.1. `assembleRelease` builds; signed with the same certificate (92aca110…); aapt2 shows
  the service with type mediaPlayback and the four new permissions. `pnpm test` 151/151, lint, build clean.
- Not verified: on a phone or TV (no emulator here: no KVM). Whether Android's WebView keeps an `<audio>`
  element playing once the app is kept alive is the open question; if it does not, the next step is a native
  player (snippet `capacitor-webview-audio-stops-in-background.md`).

- Published 2026-11-15 on zapstore: release `dbc6dcbb…` (1.1, versionCode 2), status pending at first, like 1.0.

## N1 — Native media controls [built; app not run on a device]
Commits: be390b3 · Spec: `feat-android-native.md` §N1 (zapa chose "native controls, web player")
- `MediaHub.java`: framework `MediaSession` + media-style notification (previous / play-pause / next, seek,
  artwork ≤ 2 MB scaled to 512 px, http(s) only), wake + Wi-Fi locks only while playing / loading.
  `PlaybackService` now only holds the foreground and takes notification taps; `PlaybackPlugin` = update /
  end + `action` events; `MainActivity.dispatchKeyEvent` sends remote / keyboard media keys to the page.
- Page: `src/lib/nowPlaying.ts` (bridge: starts with playing, tells only changes or a > 2 s position jump,
  10 min while paused, 3 s after the player empties; tests), `src/lib/mediaActions.ts` (actions → player,
  bad input ignored; tests), `src/native/nowPlayingNative.ts`, `src/pwa/mediaSession.ts` (web).
- Headless Chromium: navigator.mediaSession shows the track and playlist name, playing / paused follow the
  player. Debug and release APKs build; release lint passes.

## N2 — Remembered folders in the app [built; not run on a device]
Commit: 28bae75 · Spec: §N2
- `LocalFoldersPlugin.java`: ACTION_OPEN_DOCUMENT_TREE + persisted read grant; scan via DocumentsContract
  (depth 6, 2000 files, the web's file types); release on remove. `LocalFileServer.java` +
  `LocalFilesWebViewClient.java`: `/_madstr_local/<base64url uri>` with 200 / 206 / 416, only inside held
  folders. Capacitor's own content server was not used: it streams from byte 0 whatever the range says.
- Page: `src/lib/nativeFolder.ts` (entries → tracks, untrusted input dropped, url encoding; tests),
  `src/native/localFolders.ts`; `StoredFolder` holds `handle` (web) or `uri` (app); pick errors show as a note.
- The 1.1 several-files path is gone from the app (the web keeps it for browsers without folders).

## N3 — Local music in Music [built + machine-verified]
Commit: 1bf7fc0 · Spec: §N3
- `src/lib/musicMix.ts` (setting `madstr:musicMix`, default none, max 8 in 10, even spread; tests), slider
  under Folders. Headless Chromium with 8 generated tracks: note "About 4 in 10 tracks in Music are yours" at
  the middle; with only 2 Nostr tracks loaded, the rest of Music was local (one side ran out).

## N4 — Music is 2 to 9 minutes [built + machine-verified]
Commit: 1bf7fc0 · Spec: §N4
- `isMusic` in `src/lib/media.ts` (tests); used by the Music list and its board preview. Logged out on the
  default relays Music showed 2 tracks with and without the floor, so the floor is not what keeps it thin.

## Release 1.2
- versionCode 3, signed with the same certificate (92aca110…). Published 2026-11-15 on zapstore: release `33ada0b0…`.

## T1 — Bigger faces [built]
Commit: 5292bfa, layout fix in 0a9b4a9
Spec: feat-taste-cache §T1

- Face of the picture's poster 56 px (was 32); face in the media controls 72 px (was 40), 52 px on phones.
- The 72 px face overflowed the 263 px panel at 1280×900, so it now sits beside previous / play / next
  (`.pc-row`; on phones the row dissolves into the existing grid).
- Checked in headless Chromium at 1280×900, 1920×1080 and 400×860: the panel does not scroll, nothing is cut.

## T2 — Votes and hiding [built]
Commit: 0a9b4a9
Spec: feat-taste-cache §T2

- `lib/taste.ts` (device store `madstr:taste`, pure changes, `applyTaste`), `lib/reaction.ts` (kind 7 like,
  kind 5 unlike templates), `data/votes.ts` (toggle up / down, hide song / artist, moving the player on),
  `signAndPublish` in `accounts.ts`; signer asked for kinds 3, 7, 5. Buttons under the media controls;
  Hidden card under Your sources with Bring back. Lists and board previews apply taste before played-hiding.
- Tests: `taste.test.ts` (8). Headless as a logged-in account that cannot sign: down vote moved the playing
  track to the end without stopping it; up vote cleared the down vote and showed "Liked on this device only";
  Hide song / Hide artist moved the player on and dropped the items; the Hidden card listed both and Bring back
  worked; all of it in `madstr:taste` after reload.
- Not run: a real published like (needs a signer). Undiscussed numbers in planning.md.
- Reworked after zapa tried it (2474bb0): down vote and Hide song were one job, so Hide song is gone and a
  down vote hides the song (the `down` map left `madstr:taste`). zapa's layout: face 96 px (64 on phones,
  replacing T1's 72 / 52 and the `.pc-row`), thumbs either side overlapping its edges, Hide artist as a small
  pink post-it with a red diagonal on its bottom-right corner, previous / play / next, a SPEED post-it, and
  the seek bar across the full width. Checked headless at 1920×1080, 1280×720, 960×540 and 747×727: all of
  it shows and nothing is cut.
- c796a79, zapa after trying it on the dev server: thumbs further apart (44 px out from the face, 40 on phones);
  the speed post-it reads "SPEED ×1.5", tilts 7° and sits tucked under the right end of the seek bar, which is
  drawn over it. Tests, lint and build pass; no screenshots this time (zapa).
- 15ac919, zapa: "use this card for current playing instead of the currently playing artist; animate this card as
  replacing the previous music disc; it removes the card from the playlist into now playing". The now-playing
  card (`NowCard` in Transport.tsx) is the playing tile, bigger: butter sticker, round disc (face, cover or
  folder), title, ▶. On a track change the old card drops away and the new one slides in from the playlist's
  side (above on phones) with the disc spinning in; nothing moves with reduced motion. The playlist leaves out
  the playing song and what has played this session, and says so when nothing else is left.
- Checked headless, DOM only: the panel does not scroll at 1920×1080, 1280×720, 960×540, 747×727, 400×860
  (the compact size, disc 60 px and one title line, fixed a 5 px overflow under 1000 px tall); the playing song
  is not among the tiles; right after Next the old card is there, 900 ms later it is gone.
- Changed behaviour: played songs used to stay in the list until the view reopened (applesauce spec,
  "inside one visit nothing disappears"); in the playlist tiles they now go at once, per zapa.

## T3 — Device cache [built]
Commit: 1cb1a8d
Spec: feat-taste-cache §T3

- `lib/eventCacheRules.ts` (which events, keys, caps, revive), `lib/eventCache.ts` (IndexedDB
  `MadstrEventCache`: events + kv; restore into the store at start, writes every 3 s, caps applied at start),
  started from `main.tsx` without waiting. Track lengths kept in the same database (`durations.ts`).
- Lists now ask the store without the relay limits (`unlimited` in `data/nostr.ts`), so cached and older
  events show; event to item conversion is remembered per event (WeakMap), so the larger lists stay cheap.
- Tests: `eventCacheRules.test.ts` (4), `durations.test.ts` (2). Headless, as zapa's account (read-only):
  online, the first 25 Music tiles took 3.5 s; reloaded with every WebSocket blocked, 60 tiles and 54 faces
  showed in 0.53 s from the device. Logged out: 2 tiles in 0.29 s offline.

## T4 — Reach back in time [built]
Commits: 688cb2d, 95313fb
Spec: feat-taste-cache §T4 (zapa: "refetch for every 30 we drop")

- `lib/walk.ts` (batches wanted, walk state, one walk per follow list), `data/older.ts` (`useOlderMedia`),
  counted in `data/views.ts`: dropped = hidden + played this session (live) + Music's under-2-minute tracks.
- Tests: `walk.test.ts` (5). Headless as zapa: hiding 31 songs brought more batches (the walk moved further
  back, 2 requests reached the start); on the next visit the walk carried on from where it stopped.
- Fixed while checking (95313fb): the TV's follow list, used until a login lands, overwrote your saved walk;
  now one walk per follow list. An empty answer no longer ends a walk for good, only for that visit.
- Found: zapa's follows' dedicated track posts all fit in the first page, and older pages are mostly notes
  without audio, so Music stayed at 80 cached tracks. More sources (relays, hashtags) are what adds music.

## T5 — More relays [built]
Commit: 57f665b
Spec: feat-taste-cache §T5

- relay.wavlake.com, theforest.nostr1.com, nostr.bitcoiner.social, relay.nostr.net added to the content
  relays; each held music posts in a probe (wavlake 40, theforest 30, bitcoiner 13, nostr.net 10 of 200).
- `pnpm relays`: all four ok. nos.lol and nostr.mom do not answer from this machine (known before; they work
  elsewhere), so they stay.

## T6 — Double tap to seek [built]
Commit: 2474bb0
Spec: feat-taste-cache §T6

- The -10 s / +30 s buttons left the media controls and the board's player bar. `lib/doubleTap.ts`
  (`createTapper`, `seekForSide`): a double tap within 300 ms and 60 px on the picture's left half goes back
  10 s, on the right half forward 30 s, with a short sign on that side; a single tap waits out the 300 ms.
  The picture area is marked `data-tap-zone`, and taps there do not wake the panel in the full picture.
- Tests: `doubleTap.test.ts`. Headless on a video: a double tap on the right moved 4 s to 35 s, showed
  "+30 s", the picture stayed full and the video kept playing; a single tap paused it after 300 ms.
- Fixed while checking: a pending single tap was swallowed when a second, far-away tap arrived; it now runs.

## T7 — Phone turned sideways [built]
Commits: 8d0cfef, 06277f8, 87736c2
Spec: feat-taste-cache §T7

- One media query, `(orientation: landscape) and (max-height: 500px) and (pointer: coarse)`, in
  `styles.css` and `useAutoHide.ts`: the picture fills the screen, the playlist, face, thumbs and SPEED
  post-it are not shown, and a touch brings back only previous / play / next and the seek bar. Turning
  sideways hides the controls at once (matchMedia change, resize or orientationchange).
- 06277f8: zapa saw the designed buttons go on the desktop. The first version keyed on the window's shape
  alone; it now needs a touch screen too, so desktops and TVs keep the full controls. (What zapa saw that
  time was also the folder left on main by an interrupted speed comparison; restored.)
- Checked headless: a touch phone at 860×400 gets the full picture and the transport only; a desktop window
  at 1280×450 keeps everything. Not run on a real phone.
- 87736c2: zapa: "keep that android only, and iOS when and if people ask". The app marks the page with
  `data-native` (main.tsx); the CSS block and the auto-hide both need it. Checked headless at 860×400 touch:
  in a browser the normal layout stays; with the app's bridge present the full picture and transport only.


## D1-D5 — Web app on pleb.world, Android 1.3 [live]
Commits: f04e298, b681753; pleb.world 3648231
Spec: feat-plebworld-deploy.md

- feat-taste-cache merged into main (b39083b) first.
- D1: `pnpm build:pleb` builds with base `/madstr/` into `dist-pleb/`; the service worker plugin, `swSource` and
  `registerSw` follow the base; the manifest uses relative paths. `pnpm build` (the app) is unchanged.
- D2: `scripts/build-pleb-api.mjs` turns `server/rssProxy.ts` into plain JS for pleb.world (`api/rss.js`,
  `api/_lib/rssProxy.js`). Run in Node: a real feed 200, 127.0.0.1 refused 403.
- D3: `scripts/deploy-pleb.sh` copies both into the pleb.world repo; the sticker links to `/madstr/`. Pushed,
  Vercel deployed it. Live checks: `/madstr/` 200, `/madstr/sw.js` 200, `/api/rss` returns a feed; headless on
  the live site the board shows, the service worker registers with scope `/madstr/`, fonts and icons load.
- D4: `api/rss.ts` removed here. The Vercel project madstr-tv is still up until zapa removes it in the dashboard.
- D5: versionCode 4, versionName 1.3, signed with the release key (cert 92aca110…), `zapstore publish`: event
  `4ceb8db1…`, status pending at the time. zapstore.yaml website now pleb.world/madstr.

## P1 — Phone controls in two compact rows [built]
Commit: b966316
Spec: feat-phone-inline.md

- Phones (up to 640 px wide): a small disc card (46 px disc, Hide artist on its corner) over two rows; row 1
  the seek bar, row 2 previous / play / next, thumbs, SPEED. The playlist header stays on one line (count left
  out). Desktop, TV and the app's sideways view are unchanged.
- Measured headless: controls panel 244 → 94 px; full tile rows 0 / 1 / 1 → 2 / 2 / 2 at 360×780, 393×852,
  412×915; nothing overlaps or leaves the panel. 1280×720 and 1920×1080 as before; sideways view as before.
- Shaped with zapa live on the dev server (disc card over both rows; smaller; SPEED back on the bottom row).

## T7 withdrawn — sideways is the TV layout
Commit: 9eb6470

- zapa, 2026-11-16: "the compact two rows [upright]; sideways same as TV". The picture-only sideways view, its
  auto-hide on turning and the app's `data-native` marker are removed. Checked headless: a touch phone at
  860×400 (browser, and with the app's bridge) shows the TV layout; upright 393×852 the compact two rows;
  1280×720 unchanged.

## Release 1.4 + pleb.world update (2026-11-16)
- Web: compact phone controls and the sideways change deployed to www.pleb.world/madstr (pleb.world 7f22fa1);
  the live stylesheet carries the two-row phone grid.
- Android 1.4, versionCode 5, same release key (92aca110…), published on zapstore: event `2dc3dfcc…`, pending.

## P2-P27 — Phone layouts, Open signer, Make it yours, the Jukestr 3000 look [built, shaped with zapa]
Commit: f6697c8
Spec: feat-phone-inline.md P2-P27

Built in one session with zapa watching a headed Chromium window and test builds on his Pixel 8 Pro (installed
over wifi adb, release-signed, still versionName 1.4). Each change was shown to him before the next.
- Phone layouts: upright bar sized to the width (P2), thumbs beside the seek bar and no times (P5), prev / play
  / next centred and a plain ×1 sticker (P5); playlist + bar in 40 % of the height (P4), one row less for a
  short playlist (P9, the panel takes the row's real height); smaller near-square tiles, four across, title over
  the picture (P8); header Home = Shuffle size, Shuffle icon only, scrolling title right to left only (P7);
  post ticker on its own line (P14); VIDEOS near the edge (P10); pictures fit the screen on phones (P11).
- Sideways phones: no playlist, the same bar as upright (P3); no Hide artist there (P15).
- Arrows on the picture: a tap changes the picture without waking the panel (P13; upright they fade, sideways
  they stay dimmed). No hover tips or lifted tiles on touch screens (P16).
- Android app: status bar and gesture handle hidden, two swipes to leave (P6); back swipe goes back a page, on the
  board it sends the app to the background (P12). Checked with adb (the back key went to the board).
- Make it yours (P19): your sources moved off the board to `#/people/sources`, reached from the follow page next
  to Home; the People sticker hints at it; pages open at their top. Board → Home with a house icon (P17).
- Open signer (P21): window.nostr, else NIP-55 to the phone's signer app (applesauce AndroidNativeSigner +
  `capacitor-plugin-nostr-signer` 0.2.0, zapa OK'd; its Android code read: intents and the content provider, no
  network), else NIP-55's web callback in a phone browser / PWA (`src/lib/signerCallback.ts`, tested; signing
  after login on the clipboard). zapa: "working great" with real Amber.
- Looks: buttons rounded rectangles, player buttons round (P18); Home mint, Make it yours pink (P20; a colour
  rotation was tried and withdrawn); no seek bar on the board's bar (P22); profile picture opaque, a fixed 400 px
  circle on a matching planet with a bigger halo (P23: the `<img>` used to keep the file's pixel size); the
  Jukestr 3000 look from the "Player Bezels" artifact: orange plastic bezel, one body for playlist + player
  (P26), domed matte buttons everywhere (P24, P25), rainbow seek bar with a Saturn knob (P27), bezels off the
  screen's edges on phones.
- Tests 195/195 (new: Amber callback, saved signer sessions), lint clean, build passes (old `*/` CSS warning).
- Open: the logo (bolt-play mark in an upside-down pyramid with the sun behind, no bird) is next; the Make it
  yours page's boxes are still sticker cards; no release yet.

## P28 — The name is Juke⚡tr; the web app at pleb.world/jukestr [built + machine-verified, not pushed]
Commit: d71afb1 (plebworld a688402, not pushed)
Spec: feat-phone-inline.md P28

- The bolt stays for the S (zapa): header logo, player brand, page title and preview, both manifests, Android
  launcher name, the NIP-46 app name and the zapstore listing say Juke⚡tr; the short name is Jukestr.
- `build:pleb` builds under /jukestr/; `deploy-pleb.sh` copies into pleb.world's `public/jukestr/`. In
  pleb.world, `public/madstr/` is removed with no redirect (zapa: nobody uses it yet), the sticker says Juke⚡tr
  and opens /jukestr/.
- The web cache is `jukestr-<id>` and clears old `madstr-` caches. App id and saved keys unchanged.
- Checked: tests 195/195, lint, build; pleb.world build and its tests 6/6. Headless Chromium on the /jukestr/
  build: title and logo Juke⚡tr, manifest Juke⚡tr / Jukestr, service worker scope /jukestr/, cache jukestr-….
- Not renamed (not in the spec): the board's headline "Mad Player Media".


## RA1-RA4 — Radio, Nostr first [built + machine-verified, awaiting zapa]
Commits: 2b6a1d4 (RA1), 8120aef (RA3 + RA3b), 54fb93d (RA2), 594a9f7 (RA4)
Spec: feat-radio.md

- Probed first: relay.wavefunc.live caps `limit` at 500; half the stations are http-only (left out); ~5 % HLS;
  25 live NIP-53 events, 13 of them real music / radio streams, the rest stale for days (hence the one-hour rule).
- `src/lib/radio.ts` (pure): stations (content JSON and `stream` tags, primary https stream, genres, country),
  live shows, Radio's order, genre and country counts, prefs and Your stations read back as untrusted. 11 tests on
  real events in `src/lib/fixtures/` (6 stations, 6 live events). Stations join the device cache (one per address).
- `src/data/radio.ts`, `radioStore.ts`: one ask per genre / follows / newest 500, Live now from relay.zap.stream and
  the content relays, re-read every minute; your stickers, country and Your stations in localStorage.
- Player: live items have no seek, speed, resume or "played"; LIVE sticker + listening time; 10 s silence check
  ("Station not answering", next); HLS natively, else hls.js 1.7.4 (pinned, zapa OK'd). Logos are the disc and
  tiles; no Hide artist on stations; no progress on the lock screen. `attach()` now runs once per element: in dev,
  StrictMode had attached the listeners twice and one failure skipped two items.
- UI: Radio card (lilac, "live"); stickers row under the picker's header; genre / country picker as a dialog
  (arrows stay inside `data-nav-modal`); up saves + likes, down hides, Hidden says Station.
- Checked in headless Chromium against live relays: Live now fills (8 shows) and NoGood Radio plays natively and
  through forced hls.js (blob source, LIVE 0:02 → 0:22); a station that never sends sound is dropped at 10 s, a
  refused one at once, then a real one plays; jazz → 298 entries, jazz in Germany → 57; up vote saves, Your
  stations lists it, down vote hides it and the Hidden card shows it; phone width (412 px) lays out.
- Tests 224/224, lint clean, `pnpm build` passes. Not run on the Android app (HLS in the WebView unconfirmed).
- 10 choices the spec did not fix are listed in planning.md (Undiscussed decisions → Radio).

## Cleanup — legacy files, the broken motion comment, chunk sizes [done]
Spec: planning.md open questions (from audits/audit-2026-11-15.md)

- Deleted the old NDK / Cursor-era files: `.cursorrules`, `.cursor/`, `cursor-tools.config.json`,
  `.cursor-tools.env.example`, `NIP46_QR_FLOW.md`, `madstr-tv.npk`. Nothing referred to them.
- `styles.css`: the `/* --- motion --- */` comment had lost its start in 5948541, so the browser dropped the
  reduced-motion block after it: the stars' drift and the post-it wiggle had been off since. Fixed; in headless
  Chromium `.s1` / `.s2` went from `animation: none` to `drift`. The css-syntax-error warning is gone.
- Build: `manualChunks` puts React (223 kB) and the Nostr libraries (371 kB) in their own files; the app is
  152 kB. Same bytes, cached across deploys. hls.js (599 kB, loaded only when needed) is the one file left over
  500 kB: its light build failed 4 of 8 live shows (separate audio tracks), checked against the full build, which
  played all 8. The `@scure/base` annotation note is from that library and predates this.
- Tests 224/224, lint clean, build passes.

## RA5 — Radio genre first, 30 at a time; older podcasts [built + machine-verified, awaiting zapa]
Commit: ec7f783
Spec: feat-radio.md §RA5, feat-taste-cache.md §T4

- Radio starts with nothing selected (the picker opens); genres are any words, asked as `#c` and as a NIP-50 search
  on relay.wavefunc.live (probe: "bitcoin" is 1 station's genre, 3 stations' text); words take turns at the top
  (`takeTurns`); countries one or many; All genres / All countries / Clear; ✕ takes a sticker off.
- At most 300 stations (each word asks for its share, at least 30); the playlist holds 30, the next 30 join when
  the player is on the last one (its own order, so it works shuffled) or with +30 more; shuffle mixes only what is
  loaded and the next 30 join after it (checked: the 30 kept their places, the new ones only after).
- The sticker row scrolls with a little slider (scroll bar hidden). "Radio · N in the playlist" is gone everywhere.
- Checked headless: opens empty; bitcoin + jazz → Noderunners, Good Morning Bitcoin, Radio Sahar, Valencianismo …;
  jazz in DE + US → only DE / US; All genres → 30 with +30 more. Bugs found and fixed on the way: the new order
  deduped twice (no stations), one end loaded 60 instead of 30, bitcoin was buried under jazz.
- Podcasts: three gaps, all fixed. (1) the Podcasts list never counted the music it leaves out as dropped (T4 says
  it should); (2) lengths were only measured for the newest 40 posts, so older posts never became podcasts; (3) audio
  is rare among notes, so a batch often brought none: under 30 episodes the walk now keeps going (≤ 50 batches).
  On the TV account the walk now reached 2020 and the start in a minute (it has only 38 audio posts in all).
- The look of the sticker strip (inset into the bezel) is waiting for zapa; left as it is for now (his call).
- Tests 226/226, lint clean, build passes.

## P29 — The logo on every icon, the start screen and the Play button [built, awaiting zapa]
Commit: 905ffb0
Spec: feat-phone-inline.md P29

- Sources in `assets/brand/`: `app-icon.png` (zapa's appiconbrandmark, 1024) and `mark.svg` (madstrtv-mark.svg);
  the old `assets/icon.png` (orange bolt) is gone. `scripts/make-icons.sh` (ImageMagick + rsvg-convert) writes:
  web 192 / 512 / apple-touch 180 (the picture), maskable 512 (the mark at 68 % on the purple), `favicon.svg` (the
  mark), Android `ic_launcher` (picture), `ic_launcher_round` (mark 72 % on purple, circle), adaptive foreground
  (mark 54 %, inside the 66 dp safe zone; background colour `#3D034E`), and every `splash.png` (mark 30 % of the
  short side on `#0B0716`). The mark gets the picture's die-cut border (cream `#FEFEDC`, dark edge).
- `MarkIcon` (icons.tsx) is the big Play button on the player and the board's bar; Pause stays two bars.
- Checked: a contact sheet of the icons (safe circle drawn over the adaptive one), the board and the player in headless
  Chromium (Play shows the mark when paused). Tests 226/226, lint, build. Not yet in an Android build.
- Then ("make sure the play button goes everywhere it need one"): the now-playing card's playing sign is the mark;
  Android's notification / lock-screen Play and the status-bar icon are the mark's silhouette (even-odd: triangle with
  the bolt cut out). `gradlew :app:processDebugResources` passes. Sticker glyphs stay one-colour glyphs.

## Final pass — Your Nostr Jukebox, the wordmark's bolt, README, zapstore notes [built]
Commit: fb46755
Spec: feat-phone-inline.md P28, P29

- Home headline "Your Nostr Jukebox" ("Nostr" in the gradient), zapa's pick from four suggestions.
- The S of Juke⚡tr (header, player top line) is the full brand mark (`MarkIcon`, after zapa: "its not using the svg";
  the bolt alone was tried first), 1.55 em, a little over the text.
- README rewritten for the app as it is (Radio, the logo, phones, Make it yours, shipping, icons, layout).
- `CHANGELOG.md`: release notes 1.0 to 1.5 (1.5 marked unreleased; give it its date when it ships);
  `zapstore.yaml` reads it (`release_notes`, as zsp documents), with a new summary, description and a radio tag.
- Page meta / og and manifest descriptions match; project AGENTS.md title; Status.md rewritten to the current state.
- Checked: the wordmark on home, the player and a 412 px phone; tests 226/226, lint, build; zapstore.yaml parses.

## Release 1.5 — Android on zapstore, web on pleb.world [published 2026-11-17]
Commits: 3ef26ea (version 1.5 / versionCode 6, CHANGELOG dated), f3fbb3c (Android TV banner)

- The Android TV banner still said "Madstr tv · nostr" with the orange bolt; `make-icons.sh` now draws it (sticker
  mark + Juke⚡tr wordmark + "your nostr jukebox") in headless Chromium with the app's fonts.
- APK: `aapt2` reports com.madstr.tvapp 1.5 (6), label Juke⚡tr; signed with the release key (cert `92aca110…d8c7`,
  same as the C1 proof); `zsp check` ok, authorized; `zapstore publish` accepted, event `ba7b7198…`, status pending.
- Web: `deploy-pleb.sh`, pleb.world sticker now "Your Nostr jukebox: …" with the mark as the S (plebworld 395eb3a),
  pushed. Madstr.tv main pushed to GitHub.
- Re-running make-icons.sh rewrites PNGs whose pixels did not change (ImageMagick dates them); the web icons were
  checked (0 pixels differ) and left out of the commit.

# feat-tv-remote (spec: feat-tv-remote.md)

| Milestone | Title | Status |
| --- | --- | --- |
| TV1 | Focus never lost | [x] zapa: works on the TV (2026-11-17) |
| TV2 | Front door + memory | [x] zapa: works on the TV (2026-11-17) |
| TV3 | Remote keys + leave on Back | [x] zapa: works on the TV (2026-11-17) |
| TV4 | Text boxes wait for OK | [x] zapa: works on the TV (2026-11-17) |
| TV5 | TV layout | [x] zapa: works on the TV at 1280 (2026-11-17) |
| TV6 | QR login pop-up | [x] zapa: logged in on the TV (2026-11-17) |
| TV7 | Hold OK for a cursor | [x] zapa: works on the TV (2026-11-17) |

## TV1 — Focus never lost [built + machine-verified, awaiting zapa on the TV]
Commit: dcc8b59
Spec: feat-tv-remote.md TV1-1 … TV1-4

- `src/lib/focusNav.ts`: pure `startIndex` (lowest `data-nav-start`, else the first control a fallback may take) and
  `handOver` (nearest control, its own area first, never a `noFallback` one); 4 new tests (230/230 in all).
- `src/lib/useFocusNav.ts`: on every screen change (hashchange) and at start-up focus goes to the start point; a
  MutationObserver hands focus over when the focused control vanishes or is disabled; an arrow with focus lost
  returns it instead of jumping to the first control.
- Marks: Play/Pause `data-nav-start=1`, the first playlist tile `2`, People's Everything `1`; Log in / Log out
  `data-nav-nofallback`.
- Headless at 960×540 2× with real key events (`check-tv1*.mjs`, DOM only): start points on board, Music,
  Podcasts, Radio, Watch, People, Make it yours, back to the board; blur then arrow returns; a played tile hands
  focus to a neighbour (Watch); picking a genre keeps focus in the picker and Down ×25 stays inside; walks on four
  screens never reach Log in / Log out. All pass.
- Seen for TV5: at 960×540 the player bar covers People's category chips, so its Next sits level with Everything.
- ⚠ 4 undiscussed decisions, see planning.md.

## TV2 — Front door + memory [built + machine-verified, awaiting zapa on the TV]
Commit: 58cd12d
Spec: feat-tv-remote.md TV2-1 … TV2-4

- `src/lib/focusNav.ts`: pure `pickArea` (the nearest area ahead that overlaps across), 2 tests (232/232 in all).
- `src/lib/useFocusNav.ts`: crossing into an area lands on its front door (`data-nav-default`), else where you were in
  it; when nothing lines up that way, `pickArea` still finds the area to go into. The player bar
  (`data-nav-bar`) is reached only when no other control lies that way.
- Marks: Play/Pause in the player panel `data-nav-default`; the Dock `data-nav-bar`.
- Headless with real keys (`check-tv2.mjs`), at 960×540 2× and at 1920×1080: Right from the last tile of three
  rows lands on Pause; Left, Left (via Previous) returns to that tile; coming back after leaving from Next lands on
  Pause; board Down goes sticker → sticker (desktop: the bar comes after the last row). All pass. TV1 checks re-run.
- ⚠ 3 undiscussed decisions, see planning.md.

## TV3 — Remote keys + leave on Back [built + machine-verified (page side); native part compiled, not run on a device]
Commit: 1e91ad1
Spec: feat-tv-remote.md TV3-1 … TV3-5

- `src/lib/okKey.ts` (pure, 6 tests): a tap of OK presses once on release; a hold of 0.6 s (`OK_HOLD_MS`) is a hold,
  never a press; the TV's repeated key-downs never press again. `src/lib/useRemoteKeys.ts` feeds it and announces a
  hold as `juke:ok-hold` (for TV7). Fields keep Enter.
- Channel Up / Down click the picture's edge arrows (next / previous picture, or video) and no longer scroll.
- ⏪ / ⏩: `MediaHub.actionForKey` maps `KEYCODE_MEDIA_REWIND` / `FAST_FORWARD` to previous / next; in a browser the
  page maps `MediaRewind` / `MediaFastForward` the same. Lock-screen / Bluetooth seek actions unchanged.
- Leave on Back: `TvPlugin.java` (`info` → is the UI mode television, `leave` → finish the activity, which ends the
  music in `onDestroy`); `src/native/tv.ts` marks `<html data-tv>`; `MainActivity.goBack` on a TV calls
  `window.jukeAskLeave()` instead of backgrounding; `LeavePrompt.tsx` shows "Leave Juke⚡tr?" with Stay focused.
  Phones keep backgrounding with the music on.
- Headless (`check-tv3.mjs`, 960×540 2×): OK opens a sticker; OK held 2 s on Next with 50 ms repeats presses
  nothing, a tap presses once; ⏩ / ⏪ in the page go next / back; Channel Up changes the picture (checked over four
  presses), Channel Down does not scroll; the pop-up opens on Stay, Right reaches Leave, arrows stay inside, a
  second Back and Esc answer Stay, focus returns. All pass. 238/238 tests, lint, build, Java compiles.
- Not run on a device: ⏪ / ⏩ in the app, the Tv plugin, Back on the TV and on the phone.
- ⚠ 4 undiscussed decisions, see planning.md.

## TV4 — Text boxes wait for OK [built + machine-verified; whether the TV keyboard opens on OK is for zapa's test]
Commit: 2b2c5f3
Spec: feat-tv-remote.md TV4-1 … TV4-3

- `src/lib/textLock.ts` (pure, 5 tests): focus not by a tap locks a box; OK opens it; typing opens it and keeps the
  key; Enter in an open box locks it again after it did its job.
- `src/lib/useTextBoxes.ts`: locked = read-only + `data-nav-locked`; `useFocusNav` treats a locked box like any
  control (every arrow moves on). OK re-focuses the box inside the key press and asks the VirtualKeyboard API to
  show. Radio's genre picker opens on its search box (TV1-1); a start point no longer overrides a pop-up's own focus.
- Headless (`check-tv4.mjs`, 960×540 2×): Down through Make it yours stops on 3 kinds of text box, always locked, and
  reaches the last control; Up leaves it; OK opens the feed box, typing works, Enter locks it again with focus
  staying, Down moves on; typing on a locked box opens it (computer keyboard); a click opens a box at once; the
  picker opens on its locked search box, Down leaves it, OK opens it. All pass; TV1 and TV3 checks re-run. 243/243.
- Seen for TV5: the lower hashtag boxes sit under the player bar; scrolling them "into view" leaves them behind it.
- ⚠ 3 undiscussed decisions, see planning.md.

## TV5 — TV layout [built + machine-verified; 1280 checked on zapa's TV; scale pick pending]
Commit: 4e88c5f
Spec: feat-tv-remote.md TV5-1 … TV5-6

- Scale: `MainActivity` turns on the wide viewport on a TV only; `src/native/tv.ts` sets the viewport to
  `tvWidth()` (`src/lib/tvWidth.ts`, 1 test): 1280, or 1920 in a `VITE_TV_WIDTH=1920` build. On zapa's TV (DevTools,
  no screenshots): 1280×720, `data-tv` set, focus on the first Listen sticker (TV1 on a device).
  Test APKs (debug-signed): `android/app/build/outputs/apk/debug/juketr-tv1280-debug.apk` (installed on the TV) and
  `juketr-tv1920-debug.apk` (checked: it passes 1920).
- Pictures (TV): whole, centred on black, at most 2× their own size (`Slideshow.tsx` notes the size; CSS caps it);
  theatre video `contain`. Focus ring (TV): 4 px white framed in black. People: each card is a focus stop, OK follows.
  Everywhere: the tile tooltip hides with the panels; scroll-padding keeps focused controls above the player bar.
- Headless (`check-tv5.mjs` in TV mode at 1280×720 1.5× and 1920×1080; `check-tv5-ec6.mjs`): a 1366 px picture fits
  whole (0.44×), a 376 px one stops at 2×; Watch tiles and titles fit the playlist (Podcasts / Radio had no tiles in
  the test profile); 4 px white ring; tooltip shows on focus and goes with the panels; all 30 People cards reachable,
  each fully above the bar (once the list holds still); desktop (cover) and phone (contain) unchanged, no TV ring.
  244/244 tests, lint, build.
- Found, not fixed: People grows and re-sorts while relays answer, which moves cards under the remote.
- ⚠ 5 undiscussed decisions, see planning.md.

## TV6 — QR login pop-up [built + machine-verified; scanning and logging in for zapa's test]
Commit: c65b984
Spec: feat-tv-remote.md TV6-1 … TV6-3

- `src/components/QrLogin.tsx`: on a TV the header's Log in opens a full-screen pop-up with the login QR
  (`startQrLogin`, the same Nostr Connect login as the People card) as large as fits, a line to scan it, Close
  focused first; it closes itself when the signer answers, and cancels the wait when closed.
- `src/lib/backStack.ts` (2 tests): Back in the app calls `window.jukeBack()` first and stops when a pop-up closed
  (`MainActivity.goBack` → `goBackPage`). `src/lib/qrPopup.ts`: the pop-up's state and `isTv()`.
- Headless (`check-tv6.mjs`, TV mode at 1280×720): OK on Log in opens it, the whole QR 534 px of 720 (74 %), Close
  focused, arrows stay inside, Back closes it and focus returns to Log in, Back with nothing open reports none, Esc
  closes; not a TV: Log in goes to People. All pass; TV3 re-run. 246/246, lint, build, Java compiles.
- ⚠ 3 undiscussed decisions, see planning.md.

## TV7 — Hold OK for a cursor [built + machine-verified, awaiting zapa on the TV]
Commit: f94ae4d
Spec: feat-tv-remote.md TV7-1 … TV7-6

- `src/lib/cursor.ts` (pure, 5 tests): 24 px a tap; held, 300 rising to 1200 px/s over 1 s; stays on screen; 48 px
  edge zones. `src/lib/cursorState.ts`, `src/lib/cursorClick.ts`, `src/components/Cursor.tsx`: the pointer drawn by
  the page; a hold of OK (`juke:ok-hold`) turns it on or off; while on, the arrows move it (not focus), OK clicks
  under it (`useRemoteKeys`), it scrolls what scrolls at the edge, Back (`backStack`) or Esc turn it off and focus
  goes to the control under it. Nothing in the app is hover-only (TV7-6; the tile tooltip also shows on focus).
- Headless (`check-tv7.mjs`, TV mode 1280×720): hold OK → on without pressing the sticker; Right tap +24 px; held
  1.2 s → 1085 px; focus unmoved; steered onto the Podcasts sticker, OK opened it; Down to the bottom edge scrolled
  the board 0 → 834; hold again, Back, Esc each turn it off; arrows move focus again after. All pass. Every earlier
  check re-run (TV3's updated: a hold now turns the pointer on). 251/251, lint, build.
- ⚠ 4 undiscussed decisions, see planning.md.

## feat-tv-remote — state at the end of the run (2026-11-17)
- TV1-TV7 built and machine-checked; nothing confirmed by zapa yet. 26 undiscussed decisions in planning.md.
- On zapa's TV (192.168.1.66): the debug build with everything, laid out 1280×720 (checked over DevTools: TV mode
  on, focus on the first sticker). To try 1920 instead: `adb install -r
  android/app/build/outputs/apk/debug/juketr-tv1920-debug.apk` (both are debug-signed; the zapstore release needs
  an uninstall first).
- Not run on a device: ⏪ / ⏩ and Back in the app, the leave pop-up closing the app, the TV keyboard on OK, a real
  QR login, the pointer with the real remote; the phone's Back unchanged.
- Headless checks live in the session scratchpad (`check-tv1*.mjs` … `check-tv7.mjs`, `drive.mjs`); they read the
  DOM only, no screenshots.

## Release 1.6 — the TV remote, on zapstore and pleb.world [2026-11-17]
- zapa tried the debug build on his TV: "all work" (the QR login failure was his phone on the wrong network; the
  relays refused the signer's reply as expired, nothing in the build). TV size stays 1280 (no 1920 pick asked for).
- versionCode 7 / 1.6, CHANGELOG 1.6; feat/tv-remote merged into main (d35c97f) and pushed to GitHub.
- APK: aapt2 com.madstr.tvapp 1.6 (7), release cert `92aca110…d8c7`; `zapstore check` ok; `zapstore publish` event
  `7ecc484c…`, status pending (as 1.5 was).
- Web: `deploy-pleb.sh`, plebworld 7bb4ada pushed; pleb.world/jukestr served the new build about 30 s later.

# feat-lava-lamp (spec: feat-lava-lamp.md)

| Milestone | Title | Status |
| --- | --- | --- |
| LL1 | Reading the sound where the host allows it | built + machine-verified (7fa7933); live-checked headless |
| LL2 | The rhythm: bands, beats, spray colour | built + machine-verified (7fa7933) |
| LL3 | The lamp | built + machine-verified (e27bf4d, 7c19d07); zapa: working (dev) |
| LL4 | On a device | machine check done (LL4-1); zapa confirmed the lamp working on dev (LL4-2); Vestel stays black |

## LL1-LL2 — Read the sound where allowed, hear the rhythm [built]
Commit: 7fa7933
Spec: feat-lava-lamp.md LL1, LL2

- `src/lib/readableHosts.ts` (pure, 4 tests): per-host memory in `madstr:readable-hosts` (300 hosts, oldest
  dropped), who gets asked with `crossOrigin="anonymous"` (another site's http(s) only; same-origin, blob: and
  data: never). `src/lib/player.ts`: the hidden `<audio>` asks unless the host is known to refuse; a failure
  before it ever played loads it again at once without asking (never a skip); the answer is remembered on
  `playing`. The viewer's `<video>` and hls.js are untouched.
- `src/lib/soundTap.ts`: `captureStream()` (or moz) on the playing `<audio>` into an AnalyserNode (FFT 2048,
  smoothing 0.55) whose output ends in a gain of 0 — playback untouched (LL-R2); re-captures on `playing`,
  suspends while the page is hidden, wakes on the next key or tap.
- `src/lib/rhythm.ts` (pure, 5 tests): bass 2–12 / mid 12–93 / treble 93–372 against each band's own recent peak
  (decay 0.2 /s, floor 0.08); a beat is bass over its running average × 1.2 + 0.03, at most one per 0.28 s; the
  spray colour follows the leading band (bass magenta/pink/orange, mids orange/lemon/lilac, treble sky/mint,
  turn by turn). Jukestr 3000 palette in `LAMP_COLOURS`.
- Probed before writing LL1 (2026-11-18, real events): 47 of 49 answering radio streams allow reading;
  archive.org, audio.nostr.build, blossom.jumble.social, renaissancemachine.ai allow it, storage.googleapis.com
  (Wavlake) does not — recorded in the spec.
- Checked live headless (2026-11-18, the app's real hidden `<audio>`, two localhost origins — one sends
  `Access-Control-Allow-Origin: *`, one sends none): an unknown host is asked with `crossOrigin="anonymous"`;
  the allowing one plays and is remembered true; the refusing one is loaded again at once without asking
  (no skip, one item in the queue throughout) and remembered false; a second file on the refusing host is
  never asked (no Origin header on the wire), on the allowing one it is. Gotcha on the way: headless media
  loads stall when the page is "hidden" — `--window-size` + `Page.bringToFront` (snippet
  `headless-chromium-media-load-deferred-hidden-page.md`).

## LL3 — The lamp [built + machine-verified, awaiting zapa on the TV]
Commit: e27bf4d
Spec: feat-lava-lamp.md LL3, LL-R1 … LL-R5

- `src/lib/lavaLamp.ts` + `src/lib/lavaShaders.ts` (GLSL ES 3.00, WebGL2): our own stable-fluids sim (after Jos
  Stam; the Powder Toy napplet was learned from, not used — LL-R1, no new dependency). Flow 160×90, wax 384×216
  (colour premultiplied, heat in alpha), 20 pressure steps, drawn 576×324 and scaled up (LL3-1). Three heaters
  puff warm wax on the lava's own clock (rate 0.55), warm wax rises, cools (0.1 /s, faster near the top), sinks,
  is rewarmed at the bottom (LL3-2). On a beat a spray shoots in from the edge (left 40 %, right 40 %, top /
  bottom 10 %, aimed inward ± 34°, 0.45 s, strength 0.4 + 0.9 × loudness, a big beat may add a second), pushes
  the flow, mixes in and stays; the heaters then puff the last three spray colours (LL3-3). Wax fades 0.01 /s;
  past the budget (a quarter of the screen) the oldest melts away faster in proportion (LL3-4). The look
  (LL3-5): purple glow, thin wax a soft glow, thick wax a sticker with black outline, hard shadow down-right and
  a warm light band, all muted 22 % toward the purple.
- `src/components/LavaLamp.tsx`: on every device, never with `prefers-reduced-motion: reduce` (LL-R5, every-device
  change 7c19d07); mounted in `Theater.tsx` only when no video shows (never behind a video). No float textures →
  no canvas, black as today; the sound tap is closed with the lamp.
- `styles.css`: the lamp fills the picture area; `.slides` loses its black only behind it, so a picture sits
  whole on the lamp.
- Machine check LL4-1 (`pnpm test` 260/260, `pnpm lint` clean, `pnpm build` passes; headless Chromium,
  `#/listen/music`, DOM and `gl.readPixels` numbers only, no screenshots): lamp appears on the viewer with no
  TV mark (576×324) and `.slides` goes transparent; the frame is not blank; a same-origin 120 bpm tone through
  the real hidden `<audio>` played untouched while the tap heard 11 beats in 5 s; `prefers-reduced-motion:
  reduce` removes the lamp and allowing motion brings it back. The side-strip brightness check (sprays colour
  the edges) passed on an earlier run (+20.6 against −1.1 drift-only) but is flaky under SwiftShader (context
  loss mid-run freezes the frame); it is not a gate — zapa confirmed the sprays on the dev server.
- ⚠ 5 undiscussed decisions, see planning.md (the "watching data-tv" one is gone with the TV gate).

## LL4 — On a device [zapa confirmed the lamp working on dev 2026-11-18; Vestel stays black]

- Measured on zapa's Vestel (adb + CDP, Android 11, WebView Chrome 142.0.7444.174 — the limits are the TV's
  GPU driver, not the WebView's age): **no WebGL2 at all; WebGL1 without any float-texture extension**
  (half-float framebuffer incomplete). The fluid sim cannot run there in any WebGL form. `captureStream()` and
  `AudioContext` DO exist. Canvas 2D fallback probes: 16 radial gradients ~1 fps, a hand-rolled Uint32
  pixel buffer ~0.5 fps — a CPU lamp is not viable either. Snippet: `vestel-tv-webview-no-webgl2-slow-canvas.md`.
- Debug APK with LL1-LL3 installed on the TV: `data-tv` set, lamp canvas 576×324 present, `.slides`
  transparent, canvas black (no WebGL2 → `startLavaLamp` returns null) — exactly LL-R5's "black, as today";
  the app otherwise unchanged. Gotcha on the way: gradle does not copy the web build into the APK —
  `npx cap sync android` after `pnpm build`, or the APK ships the previous bundle (snippet
  `madstr-apk-stale-web-assets-cap-sync.md`).
- Direction decided (zapa, 2026-11-18): "continue with the feat, it will work great for other devices" —
  the spec's black fallback stands on the Vestel; the byte-packed WebGL1 idea is dropped.
- Still for zapa's LL4-2 check: the lamp beside a picture and spraying in time on a device that can draw it
  (his TV cannot; the Vestel check is the black fallback + playback unchanged: a Wavlake song still plays,
  radio plays, background play). LL1's live behavior is machine-checked (see LL1-LL2 above).

## Every device, not TV-only [zapa: working]
Commit: 7c19d07
Spec: feat-lava-lamp.md LL-R5, LL3-1, LL4

- zapa, 2026-11-18: "again why is it tv only its an everydevice app including tv", "i did say it would look
  nice on other devices aswell". Spec first (LL-R5, "What it is", LL3-1, LL4), then the code: the `data-tv`
  gate and its MutationObserver are gone from `LavaLamp.tsx`; reduced motion is the only off switch; a device
  without WebGL2 float textures still shows black.
- `lavaLamp.ts`: `startLavaLamp` also refuses a context that is already lost (`gl.isContextLost()`), and the
  cleanup no longer calls `WEBGL_lose_context` — dev StrictMode simulates an unmount and the re-mount reuses
  the same canvas, so killing the context there left the lamp dead. On a real unmount the canvas is
  garbage-collected with its context.
- Headless re-check on the final code: lamp on the viewer with no TV mark, 576×324, `.slides` transparent,
  the frame draws (nonBlack=1.0), a same-origin tone plays untouched and the tap hears 11 beats in 5 s,
  reduced motion off and on again. The spray-strip metric stayed flaky under SwiftShader (see LL3); zapa
  confirmed the lamp working, sprays included, on the real dev server.
- `pnpm test` 260/260, `pnpm lint` clean, `pnpm build` passes.
