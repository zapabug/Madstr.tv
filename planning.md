# planning.md: Mad⚡tr.tv (feat-applesauce-revamp)

The why. Spec: `feat-applesauce-revamp.md`. What was built: `build.md`. The old app's planning
notes are in `docs/Planning.md` (NDK era, may describe code that is gone).

## Locked decisions

| Area | Decision |
| --- | --- |
| Stack | pnpm, Vite 6, React 19, TypeScript strict, ESLint, `node --test` |
| Nostr | Applesauce, pinned exactly: core 7.1.3, relay 7.1.1, loaders 7.2.0, signers 7.1.0, actions 7.1.1, common 7.1.1, react 7.1.0. No `nostr-tools`, no NDK |
| Extra runtime deps | `react-qr-code` (OK'd by zapa 2026-11-15). Anything else needs zapa's OK |
| Login | Extension, bunker / nbunksec, QR. Own session store `src/lib/session.ts`, not AccountManager |
| Scope | Web first; TV / Android parked |
| Layout | One viewer; picker = playlist only; sources on the board under "Your sources" |
| Styling | In scope: fresh app, the look is built as it goes |
| Order | RSS work is incoming; the remote pass (R8) is the final stage before deploy |

## Decisions made, with rationale

- **2026-11-15, QR login kept.** zapa: keep it, it works. The spec's earlier "no QR codes" is
  withdrawn.
- **2026-11-15, own session store over AccountManager.** The flow copies the Madeira Livre app
  (commit bb3a465); zapa: "it works, don't touch".
- **2026-11-15, picker without a sources column.** Sources are set up once, on the board; the
  viewer stays a playlist.
- **2026-11-15, styling is in scope.** "Layout first, styling later" came from the first (NDK)
  app; this is a fresh app.
- **2026-11-15, header chip is Log out; "Logged in" box removed.**
- **2026-11-15, process files skipped until now.** The project was an old one that needed a full
  refresh; `build.md`, `planning.md` and `Status.md` were written after the audit.
- **2026-11-15, remote pass last.** Remote navigation (inputs and sliders `data-nav`) is the final
  stage before deploy, not a blocker for feature work.

## Undiscussed decisions (needs lfg review)

Found in the code by the audit of 2026-11-15; none was agreed in the spec. Keep (move into the
spec), change, or revert.

Mechanics:
- Picture mix: "Only my pictures" plus a seldom / very often slider (`pictureMix.ts`).
- Melting SVG clock (`Clock.tsx`, `clock.ts`).
- Ticker with the first sentence of the picture's post (`Ticker.tsx`).
- 20 s track toast (`TrackToast.tsx`).
- Author spot in the controls (`author.ts`).
- Playback speed remembered per queue kind (`queue.ts`, `player.ts`).
- Audio-length probing limits (`durations.ts`).
- Profile picture as the planet (uncommitted `Sky.tsx`).
- "Everything" creator chip; Esc / Backspace goes back.
- Podcast fallback also counts the word "podcast" and the tags podcasting / podcastindex /
  podcastsonnostr (`media.ts`).
- Kind 31337 `duration` treated as milliseconds only when above 10000 (`media.ts`).
- localStorage overrides `madstr:hideMs` and `madstr:toastMs` for the hide and toast timers.

- "Played" = played and moved on from, or ended; lists hide played items when they open (not mid-visit).
- Shuffle resets when another playlist opens; the Shuffle button sits in the picker header.

Numbers:
- Picture cache 2000; older pictures 300 per batch, one batch every 20 s; session sets capped at 5000 played / 6000 seen pictures (proposed 2026-11-15).
- Planet picture retry: every 15 s, up to 4 times (`Sky.tsx`); proposed 2026-11-15.
- Names clipped to 40 characters (`MAX_NAME`, `names.ts`); proposed 2026-11-15.
- Player: prev restarts after 5 s; resume skips < 5 s and the last 10 s; rates 1, 1.25, 1.5, 2,
  0.75; position saved every 5 s.
- Slideshow every 9 s, avoids the last 12; history 60; mix share 0.05 + 0.75 × often, default 0.5;
  preview rotation 5 s, 4 shown.
- Text: MAX_TEXT 160, ticker max 140, ticker duration max(14, len × 0.2 + 10) s.
- Relay limits: 300 per chunk, 200 notes, 100 authors per filter; creator filters 300/200/200/200;
  friends-of-follows cap 400, 30 creators; 300 pictures; playlist pages of 120; 12 tags.
- Probing: 40 probes, 3 at a time, 8 s each. Local scan depth 6.
- Signer: QR 240 s, sign 90 s, connect 20 s, key re-ask 5 s, publish 8 s, subscription retry 3 s,
  extension wait 1.5 s. Clock refresh 10 s. The relay lists in `relays.ts`.

Android play (feat-android-play, 2026-11-15), written into the spec by the agent from zapa's report:
- Background service stops 3 s after the player stops playing; notification title clipped to 80 characters.
- Notification permission asked once, on the first play (Android 13+); partial wake lock and Wi-Fi lock while
  playing; no play / pause buttons in the notification yet.
- The Android app always picks files, never a folder (even if a later WebView could open folders).

Android native (feat-android-native, 2026-11-15), numbers the agent wrote into the spec:
- Controls stay 10 minutes while paused; an empty player ends them after 3 s; position resent past 2 s drift.
- Notification picture: http(s) only, at most 2 MB, scaled to 512 px; texts clipped to 80 characters.
- Remote fast-forward / rewind use the on-screen steps (+30 s / −10 s).
- Music mix: default none, at most 8 in 10 tracks, evenly spread, fixed order; when one side runs out the
  rest is the other. Music floor: a track of unknown length stays until measured.

Taste and cache (feat-taste-cache, 2026-11-15), numbers the agent wrote into the spec:
- Faces: picture poster 56 px, now-playing author 72 px.
- Up vote takes a second press to withdraw (a kind 5 deletion of the like); logged out it stays on the device.
  Down vote = hide song (zapa); it also withdraws a like. Hide artist covers Music, Podcasts and videos, not the
  picture show. Caps: 2000 up votes, 2000 down-voted songs, hidden artists uncapped. Hidden card shows 40.
- Double tap: left / right half of the picture, 300 ms window; the single tap waits that long.
- Device cache: music 3000, videos 1500, profiles 3000, lengths 5000; written every 3 s, capped at start.
- Walk back in time (zapa: one batch per 30 dropped): what counts as dropped is the agent's reading: played this
  session, hidden, or (Music) under 2 minutes; one batch on opening the list; only while a list is open; 4 walks
  kept (one per follow list); "reached the start" lasts one visit.
- Relays added: relay.wavlake.com, theforest.nostr1.com, nostr.bitcoiner.social, relay.nostr.net.
- Now-playing card (§T2): disc 84 px / 60 px under 1000 px tall / 56 px on phones; title 2 lines, 1 when small; card 150 / 130 / 118 px wide; swap animation 450 ms out, 550 ms in, disc spins 270°.
- Phone controls (feat-phone-inline): disc 46 px in a small card; buttons 34 / 42 px (play), thumbs 32 px, Hide artist 22 px; tile row gap 10 px on phones; the playlist header's "N in the playlist" count is left out on phones (to keep the header on one line).
- Radio (feat-radio, built 2026-11-16), choices the spec did not fix:
  - Words left out of the genre picker: music, música, musica, musique, musik, radio, fm, am, estación, estacion,
    station, emisora, internet radio, online radio, web radio, webradio, radio station, live, stream, streaming
    (`DULL_GENRES` in lib/radio.ts). The picker shows 60 genres at a time and 40 countries.
  - The picker opens by itself each time Radio opens while you have no genre stickers (not only the first time).
  - Live now is the top of Radio's playlist (the same tiles), not a separate row.
  - A pressed sticker starts at its own first station, below Live now; the station playing keeps going until that
    genre's stations arrive.
  - Live shows count only if updated within the hour (NIP-53) and tagged music or radio (`internal:music` too),
    unless someone you follow hosts them. The host is the `p` tag marked host, else the signer.
  - Caps: stations in the device cache 2000, Your stations 500, 12 genres per station, 40 genre stickers.
  - A station's error text stays until the next one plays; when all fail, the player stops with it.
  - Up vote on a live show likes it but does not save it (Your stations keeps stations only).
  - hls.js is a separate 600 kB file (187 kB gzipped) loaded only for HLS where the browser cannot play it; the
    service worker still pre-caches it with the app.

## Open questions

- **Legacy files still tracked:** `.cursorrules`, `.cursor/`, `cursor-tools.config.json`,
  `NIP46_QR_FLOW.md`, `madstr-tv.npk`. Keep or delete?
- **Cleanup:** the stray `*/` in `styles.css`; the 655 kB chunk.

## Change log

- 2026-11-15: audit (`audits/audit-2026-11-15.md`); zapa's answers recorded in the spec
  (§Decided after the audit) and AGENTS.md; RSS and R8 milestones added; this file, `build.md`
  and `Status.md` created.
- 2026-11-15: board hero note, shortcut line and lane filter chips removed; names fall back to the
  last 5 letters of the npub.
- 2026-11-15: profile pictures checked for http(s), names clipped; sticker previews brought in line with
  the spec (pure `lib/previews.ts`); tests for previews, last-video restore, local folders, stickers.
- 2026-11-15: Shuffle in the media picker; a video's sound keeps playing off the viewer; long-video
  previews look further down the list for posters.
- 2026-11-15: the planet retries a profile picture that failed to load.
- 2026-11-15: bigger halo; coloured source / people cards and sticker chips.
- 2026-11-15: autohide 25 s; video fills the screen when the panel hides (viewer no longer scrollable).
- 2026-11-15: autohide 15 s (zapa, on feat/taste-cache).
- 2026-11-15: design pass (two HIGH, four MEDIUM fixed); "Logged in as" label to check the signer's key.
- 2026-11-15: R8 remote pass built; arrows stay inside an area (picture, picker, controls) until nothing lies further.
- 2026-11-15: played items hide per session; slideshow avoids repeats per session; picture cache walks back in time.
- 2026-11-15: feat-android-play: the app picks files instead of a folder; background play service (1.1).
- 2026-11-15: feat-android-native: native media controls, remembered folders in the app, music mix slider, music 2-9 min (1.2).
- 2026-11-15: feat-taste-cache spec: bigger faces, votes and hiding, device cache, walk back in time, more relays.
