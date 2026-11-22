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

### 2026-11-22 · feat-lava-lamp LL5 · two looks and an off switch
- **Type:** spec-gap (zapa asked for the toggles while looking at the dropped libs)
- **Spec ref:** LL3-1, LL3-3s, LL3-5s, LL5-1 … LL5-5
- **What I did:** kept zapa's dropped "smoky" implementation as `lavaLamp.ts` / `lavaShaders.ts` and the
  earlier focused sticker lamp as `lavaLampFocused.ts` / `lavaShadersFocused.ts`; the component starts one
  or the other on a fresh canvas. A saved `madstr:lava` record (pure parser plus `useSyncExternalStore`,
  as in `pictureMix.ts`) drives both the lamp and the new Background card on Make it yours. Off removes
  the canvas and closes the sound tap, so a slow device costs nothing. Reduced motion and video still win.
  zapa also asked to remove the moving stars/lights behind the other menus: the two drifting `.stars` layers and
  their CSS/keyframes are gone from `Sky.tsx`; the corner planet (and its profile picture) stays.
  A text-only Make it yours chip was added beside the Log in/out chip in the home header only (wrapped in
  `.top-actions` with slightly smaller chip-link padding so two chips fit on a phone; no icon, 0.86 rem words
  after zapa asked for bigger text); the People pages already have their own link, so it is not repeated there.
- **Status:** machine-verified (`pnpm test && pnpm lint && pnpm build`, 264 tests); awaiting zapa's look

## feat-tv-remote (spec `feat-tv-remote.md`, 2026-11-17)

Decided by zapa in the `/vibe-therapist` and `/vibe-feat` sessions, after watching the app on his TV (Vestel
Cosmos, Android TV 11; the page is 960×540 at 2×):

| Area | Decision |
| --- | --- |
| Order | Remote first: TV1 focus never lost, TV2 front door + memory, TV3 keys + leave, TV4 text boxes, TV5 layout, TV6 QR, TV7 cursor |
| Arrows | Keep moving focus everywhere, also in the player (not seek keys) |
| Cursor | Hold OK 0.6 s turns on a page-drawn pointer; pointer remotes work as a mouse |
| ⏪ / ⏩ | Previous / next item in every mode (the remote's prev / next buttons send these keys) |
| Channel Up / Down | Next / previous picture (the edge arrows); Up = next |
| Back | TV app only: "Leave Juke⚡tr?" on the board, Stay first; Leave closes the app and the music. Phones unchanged |
| Pictures on a TV | Whole, on black, at most 2× (number PROPOSED) |
| Scale on a TV | 1280×720 or 1920×1080: zapa picks on the TV from two test builds |
| Dependencies | None new; Norigin / mrowser are learned from |

Why: the remote got lost (focus fell to Log out and logged the TV out), the playlist could not reach Play/Pause,
text boxes opened the keyboard on focus, a held OK repeated the button, and the QR login was half hidden. The
pointer covers whatever the arrows still cannot reach.

## Undiscussed decisions (needs lfg review)

Found in the code by the audit of 2026-11-15; none was agreed in the spec. Keep (move into the
spec), change, or revert.

Mechanics:
- Lava lamp LL5 (2026-11-22): default On + Smoky, zapa's last look; the toggle sits on a new Background card
  at the end of Make it yours, and the two implementations are kept as separate modules rather than one
  parameterized shader. Off means no canvas at all (black), not a paused frame. Brightness was pulled down
  after zapa said the white light was overwhelming (wax cap 0.68, 35 % toward the purple, halo 0.04).
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
- Probing: 40 probes, 3 at a time, 8 s each; while Music or Podcasts is open it keeps going down the whole list, 40
  waiting at a time (2026-11-17, old podcasts were never measured, so never found); the board measures the first 40. Local scan depth 6.
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
- Remote fast-forward / rewind use the on-screen steps (+30 s / −10 s). **Superseded 2026-11-17** (zapa, feat-tv-remote TV3-2):
  the remote's ⏪ / ⏩ are previous / next.
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
    service worker still pre-caches it with the app. It is the one file over Vite's 500 kB warning. The light build
    (376 kB) was tried and dropped: 4 of 8 live shows carry their sound as a separate audio track and were silent.
- Cleanup (2026-11-16, zapa: "keep or delete?"): the old NDK / Cursor-era files are deleted (`.cursorrules`,
  `.cursor/`, `cursor-tools.config.json`, `.cursor-tools.env.example`, `NIP46_QR_FLOW.md`, `madstr-tv.npk`, an
  April 2025 build of the old app); git history keeps them. `.cursor-tools.env` stays in `.gitignore` as a guard.
  The build splits the libraries into `react` and `nostr` files (no file over 500 kB but hls.js).

### 2026-11-17 · TV1 · How long a new screen waits for its start point
- **Type:** guess
- **Spec ref:** feat-tv-remote TV1-1 (no number given)
- **What the spec said:** on a screen change focus goes to the start point.
- **What I did:** the start point is looked for every 100 ms for up to 1.5 s (the tiles and Play/Pause arrive after the first render); after that the first control a fallback may take (`src/lib/useFocusNav.ts` START_WAIT_MS, START_POLL_MS). A key press or a touch stops the wait.
- **Why:** focusing the first control at once would land on the picture's edge arrows before Play/Pause exists.
- **Alternatives:** wait longer (relays can be slow), or move focus again when the start point turns up later.
- **Status:** awaiting lfg

### 2026-11-17 · TV1 · A fallback never lands in a text box
- **Type:** guess
- **Spec ref:** TV1-1, TV1-2 (spec names only Log in / Log out)
- **What the spec said:** fallbacks never choose Log in / Log out.
- **What I did:** text boxes are skipped by fallbacks too (`candidateOf` in `src/lib/useFocusNav.ts`).
- **Why:** focusing a text box opens the keyboard on the TV (until TV4), which swallows the arrows.
- **Alternatives:** allow them once TV4 keeps the keyboard shut.
- **Status:** awaiting lfg

### 2026-11-17 · TV1 · Lost focus returns to where it was first
- **Type:** guess
- **Spec ref:** none: spec silent (TV1-2 covers a control that vanished)
- **What I did:** when focus is lost but its control is still there (a click on empty space, a blur), the next arrow puts focus back on that control rather than moving from it (`recover`).
- **Why:** the safest place is the one the person last saw.
- **Status:** awaiting lfg

### 2026-11-17 · TV1 · Radio's genre picker still starts on Done
- **Type:** deviation
- **Spec ref:** TV1-1 (picker → its search box)
- **What I did:** the picker keeps focusing Done when it opens (`src/components/Radio.tsx`).
- **Why:** until TV4, focusing the search box opens the TV keyboard. Switch to the search box in TV4.
- **Status:** awaiting lfg (to be done in TV4)

### 2026-11-17 · TV2 · Front door before memory
- **Type:** spec-conflict
- **Spec ref:** feat-tv-remote TV2-2 vs TV2-EC1
- **What the spec said:** TV2-2: coming back into an area lands where you were; TV2-EC1: from any playlist tile, Right reaches Play/Pause in one press.
- **What I did:** an area with a front door is always entered at the door; memory is for areas without one (`entryOf` in `src/lib/useFocusNav.ts`). So the player panel is always entered at Play/Pause, and the playlist returns you to your tile.
- **Why:** with memory first, leaving the panel through Previous brought you back to Previous next time, which is the complaint this feat started from.
- **Alternatives:** memory first everywhere (TV2-2 as written).
- **Status:** awaiting lfg

### 2026-11-17 · TV2 · The board's rows: a "bar" rule instead of rows as areas
- **Type:** deviation
- **Spec ref:** TV2-4
- **What the spec said:** the board's sticker rows and the player bar are areas, so Down from a sticker goes to the next sticker row.
- **What I did:** the player bar is marked `data-nav-bar` and is reached only when no other control lies that way (`src/components/Dock.tsx`, `useFocusNav`); sticker rows are not areas.
- **Why:** same result (Down goes row to row, the bar comes after the last row) without areas that would remember a sticker per row.
- **Status:** awaiting lfg

### 2026-11-17 · TV2 · Left from Play/Pause goes to Previous first
- **Type:** spec-gap
- **Spec ref:** TV2-EC2 ("from Play/Pause, Left returns to the tile you came from")
- **What I did:** Left from Play/Pause moves to Previous (it is in the same panel, to the left); the next Left leaves the panel and returns to the tile. Checked that way.
- **Why:** Previous has to stay reachable; jumping over it would make it unreachable from the left.
- **Status:** awaiting lfg

### 2026-11-17 · TV3 · Channel Up / Down and ⏪ / ⏩ act once per press
- **Type:** guess
- **Spec ref:** feat-tv-remote TV3-2, TV3-3 (silent on holding)
- **What I did:** a held channel or ⏪ / ⏩ key acts once until it is let go (`src/lib/useRemoteKeys.ts` heldKeys). In the app the native media keys already act once (`MainActivity`: repeatCount 0 only).
- **Why:** the TV repeats held keys; flicking through ten pictures or tracks by accident is worse than pressing again.
- **Alternatives:** let a held key keep going.
- **Status:** awaiting lfg

### 2026-11-17 · TV3 · The leave pop-up's words and the music note
- **Type:** guess
- **Spec ref:** TV3-4 (title and buttons given)
- **What I did:** "Leave Juke⚡tr?" with the line "The music stops when you leave.", Stay (focused) and Leave, styled like Radio's genre picker (`src/components/LeavePrompt.tsx`). Leave pauses the player before closing the app. If the page cannot show the pop-up, Back keeps the old behaviour (`MainActivity.goBack`).
- **Status:** awaiting lfg

### 2026-11-17 · TV3 · Fields keep Enter
- **Type:** guess
- **Spec ref:** TV3-1
- **What I did:** OK acting on release applies to buttons and links; text boxes, selects and other fields keep Enter as it was (a text box submits on Enter).
- **Why:** a text box's Enter is the keyboard's "go", not a press.
- **Status:** awaiting lfg

### 2026-11-17 · TV3 · Not run on a device
- **Type:** fix (verification gap)
- **Spec ref:** TV3-EC2, TV3-EC4, TV3-EC5
- **What I did:** the native parts (⏪ / ⏩ in `MediaHub.actionForKey`, the Tv plugin, Back on the board) compile (`gradlew compileDebugJavaWithJavac`) but were not run on the TV or the phone (zapa: no screenshots, he tests later). The page side of every TV3 check passes headless.
- **Status:** awaiting zapa's test on the TV and the phone

### 2026-11-17 · TV4 · Locked means read-only; a tap opens at once; typing opens too
- **Type:** guess
- **Spec ref:** feat-tv-remote TV4-1, TV4-2
- **What the spec said:** focus by an arrow shows focus without the keyboard; OK opens it.
- **What I did:** any focus that is not a tap / click on the box (within 1 s, `POINTER_FOCUS_MS`) locks it by making it read-only (`src/lib/useTextBoxes.ts`). OK unlocks it, re-focuses it inside the key press and calls the VirtualKeyboard API where the WebView has it. A tap or click opens it at once (phones, mouse); typing a character on a locked box opens it and keeps the key (computer keyboards).
- **Why:** read-only is the one way that keeps the Android keyboard shut on focus everywhere; the tap and typing rules keep phones and computers as they were.
- **Alternatives:** `inputmode="none"` until OK; only on a TV (`data-tv`).
- **Status:** awaiting lfg; whether the keyboard comes up on OK is only known on the TV

### 2026-11-17 · TV4 · Back with the keyboard up
- **Type:** spec-gap
- **Spec ref:** TV4-2 ("Back ... closes the keyboard and leaves focus on the box")
- **What I did:** nothing extra: on Android the keyboard takes Back for itself and closes; the box stays open (editable) and the arrows Up / Down leave it as before (R8). It locks again when focus leaves it.
- **Status:** awaiting zapa's test on the TV

### 2026-11-17 · TV4 · Radio's picker opens on the search box (TV1 deviation closed)
- **Type:** fix
- **Spec ref:** TV1-1
- **What I did:** the picker focuses its search box (marked `data-nav-start`), locked, and a screen's start point no longer overrides focus that a pop-up placed itself (`focusStart` in `useFocusNav.ts`).
- **Status:** awaiting lfg

### 2026-11-17 · TV5 · How the TV page width is set, and 1280 until zapa picks
- **Type:** guess
- **Spec ref:** feat-tv-remote TV5-1 (OPEN: zapa picks 1280 or 1920 from two test builds)
- **What I did:** on a TV only, the app turns on the WebView's wide viewport (`MainActivity`), and the page sets its viewport tag to `width=1280` (`src/native/tv.ts`, `src/lib/tvWidth.ts`); a build with `VITE_TV_WIDTH=1920` lays it out 1920. Checked on zapa's TV over DevTools: the page is 1280×720 (it was 960×540). Two test APKs: `android/app/build/outputs/apk/debug/juketr-tv1280-debug.apk` and `juketr-tv1920-debug.apk` (debug-signed; the TV has the 1280 one).
- **Status:** awaiting zapa's pick on the TV

### 2026-11-17 · TV5 · Picture limit, focus ring, video fit
- **Type:** guess
- **Spec ref:** TV5-2, TV5-4 (PROPOSED numbers)
- **What I did:** pictures at most 2× their own size (the slideshow notes each picture's size; `styles.css` caps it), videos `contain` on black, focus ring 4 px white with a black frame (2 px inside, 2 px outside). All TV only.
- **Status:** awaiting lfg

### 2026-11-17 · TV5 · Two fixes that apply everywhere
- **Type:** fix
- **Spec ref:** TV5-5, TV5-6
- **What I did:** the tile tooltip hides whenever the theatre's panels hide (it was drawn outside the panel, so it stayed); a control scrolled into view is kept above the player bar (`scroll-padding-bottom` while the bar shows). Neither changes how anything looks; both apply on phones and desktop too.
- **Status:** awaiting lfg

### 2026-11-17 · TV5 · People cards as focus stops
- **Type:** guess
- **Spec ref:** TV5-6 (OK on a card follows: PROPOSED)
- **What I did:** each card is one arrow stop (everywhere); OK on it follows / unfollows; a tap or click on the card does nothing, only its Follow button does (so phones behave as before). The Follow button is no longer an arrow stop.
- **Status:** awaiting lfg

### 2026-11-17 · TV5 · Found, not fixed: People keeps re-sorting while you browse
- **Type:** spec-gap
- **Spec ref:** none: spec silent
- **What I saw:** while relays answer, People's cards grow (pictures arrive) and change order, so Down can land on another card than the one below, and a focused card can be pushed under the bar. Once the list holds still, all 30 cards are reachable and stay in view (checked at 1280 and 1920).
- **Alternatives:** freeze the order once the person starts moving through it; keep the focused card in view when the layout shifts.
- **Status:** awaiting lfg (a candidate for a later milestone)

### 2026-11-17 · TV6 · The pop-up opens from the header's Log in; the People card stays as it is
- **Type:** guess
- **Spec ref:** feat-tv-remote TV6-1 ("Log in opens a full-screen pop-up")
- **What I did:** on a TV the header chip "Log in" opens the pop-up instead of going to People (`AccountChip`, `src/components/QrLogin.tsx`); the login card on People (with its own QR button) is unchanged. The QR is `min(80vh, 55vw)` square (74 % of the height at 1280×720), with "Log in", a line to scan it with a signer app, "Waiting for it to answer…" and Close.
- **Alternatives:** the People card's "Log in with a QR code" opens the pop-up on a TV too.
- **Status:** awaiting lfg

### 2026-11-17 · TV6 · Back closes a pop-up first
- **Type:** guess
- **Spec ref:** TV6-1 ("Back closes it")
- **What I did:** the app's Back first calls `window.jukeBack()` (`src/lib/backStack.ts`, 2 tests); a pop-up registered there closes and Back stops. Only the QR pop-up registers; the leave pop-up keeps its own Back (TV3-4) and Radio's genre picker keeps today's behaviour.
- **Status:** awaiting lfg

### 2026-11-17 · TV6 · Not logged in for real
- **Type:** fix (verification gap)
- **Spec ref:** TV6-EC1, TV6-2
- **What I did:** the pop-up, its size, focus and closing are checked headless; scanning it with zapa's signer and the pop-up closing after login need zapa on the TV.
- **Status:** awaiting zapa's test

### 2026-11-17 · TV7 · Two numbers the spec did not give
- **Type:** guess
- **Spec ref:** feat-tv-remote TV7-2, TV7-4
- **What I did:** an arrow counts as held after 200 ms (then it moves on its own at the ramp's speed); the edge scrolls at 600 px/s (`CURSOR.holdDelayMs`, `CURSOR.scrollPxPerS` in `src/lib/cursor.ts`). The spec's own numbers (24 px, 300 → 1200 px/s over 1 s, 48 px) are as written and tested.
- **Status:** awaiting lfg (tune on the TV)

### 2026-11-17 · TV7 · Where the pointer starts, how it looks, what a click does
- **Type:** guess
- **Spec ref:** TV7-1, TV7-3; OPEN "after a cursor click, stay in cursor mode" (default: stay)
- **What I did:** it starts on the middle of the focused control (else the middle of the screen); a white arrow with a black edge; a click sends pointer and mouse events at its tip, focuses what is focusable there, then clicks; after a click it stays on (the OPEN default).
- **Status:** awaiting lfg

### 2026-11-17 · TV7 · Holding OK in an open text box does not start the pointer
- **Type:** spec-gap
- **Spec ref:** TV7-1, TV4
- **What I did:** a text box keeps Enter for itself (TV3 / TV4), so holding OK while typing in one does not turn the pointer on. From a locked box (just arrived by the arrows) it does.
- **Status:** awaiting lfg

### 2026-11-17 · TV7 · Holding OK now always means the pointer
- **Type:** deviation (follows from the spec)
- **Spec ref:** TV3-1, TV7-1
- **What I did:** a hold of OK anywhere turns the pointer on (it used to repeat the button, before TV3). The TV3 check was updated to turn it off again with Esc.
- **Status:** awaiting lfg

### 2026-11-18 · feat-lava-lamp LL3 · what the spec left open in the lamp
- **Type:** spec-gap
- **Spec ref:** LL3-2 … LL3-5
- **What I did:**
  - "Loudness" and "a big beat" (LL3-3): strength is 0.4 + 0.9 × loudness with loudness = eased
    0.6·bass + 0.4·mid; a beat over 0.9 has a 50 % chance of a second, slightly weaker spray.
  - Flow forces the spec does not number: the spray's push ×240, a heater's lift ×30, buoyancy
    26·heat − 11·wax, vorticity confinement k = 10, velocity damping 1.2 /s. Tuned on dev so a blob
    crosses the lamp in a few seconds and a spray reaches the middle; zapa's TV check is the real review.
  - The first frame: the spec says nothing about the lamp at start; it seeds 8 blobs of the base
    colours, some warm, so it is alive before the first heater puff.
  - The sticker look (LL3-5): thin wax glows 0.03–0.38 density, thick at 0.38, the shadow sits
    (−0.00625, +0.0139) off, the warm band at (+0.007, −0.0153); tuned by eye on dev against the boards.
  - Small caps: heaters rotate their colour every 14 s; at most 4 sprays alive at once; bass / mid
    easing 30/6 and 8/2.5 per second.
- **Status:** awaiting lfg

### 2026-11-18 · feat-lava-lamp LL-R5 · every device, not TV-only
- **Type:** decision (zapa)
- **Spec ref:** LL-R5, LL3-1, LL4
- **What I did:** zapa asked why the lamp is TV-only ("it would look nice on other devices aswell"). The
  `data-tv` gate and its MutationObserver are gone; the lamp runs on every device the app runs on, TV
  included, still never behind a video and never with reduced motion. A device without WebGL2 float
  textures (the Vestel) still shows black. The cleanup no longer kills the WebGL context (dev StrictMode
  reuses the canvas); `startLavaLamp` refuses a context that is already lost.
- **Status:** decided by zapa; confirmed working on the dev server

## Open questions

- (none open)

## Change log

- 2026-11-18: feat-lava-lamp LL1-LL3 built on feat/lava-lamp: per-host CORS memory, the sound tap and the
  rhythm (7fa7933), the stable-fluids lamp behind the TV's slideshow (e27bf4d); LL4-1 machine-checked.
  On zapa's Vestel: no WebGL2 and no WebGL1 float textures (captureStream exists); Canvas 2D ~1 fps, so the
  spec's black fallback shows there. zapa decided: the feat ships for capable devices (no byte-packed WebGL1).
  LL1's ask-retry-remember checked live headless against a CORS-yes and a CORS-no origin.
  Later the same day: zapa made the lamp every-device, not TV-only (7c19d07), and confirmed it working on
  the dev server. Merged to main and shipped on pleb.world/jukestr and as Android 1.7.
- 2026-11-17: feat-tv-remote spec (TV1-TV7) written from the session on zapa's TV; finished specs moved to `archive/`.

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
