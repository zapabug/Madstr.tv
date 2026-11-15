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
| RSS | RSS work (incoming) | in progress; parser and proxy tests come with it |
| R8 | Remote pass (final stage before deploy) | built + machine-verified; awaiting zapa's remote test |
| later | TV (Android) build | parked |

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

## RSS [incoming]
Spec: §Milestones RSS

- Carried over from `feat/own-audio` (842ef1d): `rssFeed.ts`, `server/rssProxy.ts`, `api/rss.ts`.
- To do with that work: tests for the parser and the private-address guard.

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
