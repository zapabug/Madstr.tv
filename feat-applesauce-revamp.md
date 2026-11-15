# feat-applesauce-revamp: Madstr.tv rebuilt on Applesauce, pleb.world style

Branch (not cut yet): `feat/applesauce-revamp`, off `feat/own-audio`.
Status: draft spec from zapa's words on 2026-11-15. No code yet.
Scope: **web first.** TV / Android (APK, native media permission) is parked: see
"Parked: the TV".

## Goal

Redo Madstr.tv from the start on Applesauce (the old app is NDK + hooks and
`main` does not compile). Keep what zapa likes about it, and give it the
look and feel of pleb.world: funky, playful, a bit over the place on purpose.

## What zapa said (the source for everything below)

- It stays **TV-minded** in feel (big targets, remote-style focus). Update
  2026-11-15: **don't worry about the TV now**; web first.
- **No QR codes any more.**
- The **bottom panel is dedicated to the playlist and the media player.**
- Keep the **SVG previous / next buttons on the screen.**
- The home screen shows the **divide: player + podcasts on one side, videos on
  the other.**
- Home is a **board of post-its**, and the post-its are **shortcuts into one
  viewer**: open to music, open to podcasts, keep going from the last video,
  short videos only, long videos, liked npubs, easy follow of more podcast
  creators.
- A **docked mini player** stays on while browsing, so music keeps playing.
- Fresh branch in this repo (not a new repo).

## Home = the sticker board (shortcuts)

Home is the pleb.world-style board and nothing else: a sky, and post-its.
Each sticker is a **shortcut that opens the one viewer already set up**, not a
room of its own.

| Sticker | Opens the viewer as |
| --- | --- |
| Music | audio list, music only, playing |
| Podcasts | audio list, podcasts only |
| Local | the local playlist: audio files on the device, listed separately from Music |
| My pictures | a slideshow of the pictures on the device |
| Continue | the last video, at the saved position |
| Short videos | video playlist, short only |
| Long videos | video playlist, long only |
| Liked npubs | the viewer filtered to the people zapa liked |
| Follow more creators | the podcast-creator picker (one-press follow) |

- **Stickers are live previews.** Each one shows what it would open: a picture,
  a short preview, or a slide from the videos, or **the next item in its
  queue**. Preview sources:

  | Sticker | Preview |
  | --- | --- |
  | Music | cover art of the next track (RSS/Nostr image; local files have none, so a drawn fallback) |
  | Podcasts | cover of the next episode (RSS `itunes:image`, already parsed) |
  | Local | no cover art (local files rarely have any), so a drawn fallback with the track count |
  | My pictures | the device's own pictures, as slides |
  | Continue | the poster of the last video, with a progress bar at the saved position |
  | Short / Long videos | poster of the next video in that queue, slowly rotating through the next few |
  | Liked npubs | a few avatars |
  | Follow more creators | avatars of suggested creators |

  Previews are poster images (video `imeta` poster/image tags), cross-faded
  slowly, **not** autoplaying video: a TV and a board of seven stickers should
  not decode seven streams. If a short loop on focus is wanted later, it is a
  separate step. The sticker's preview and the viewer's queue come from the same
  list, so "next in queue" on the board is exactly what opens.
- The board still shows the divide: the listen stickers (Music, Podcasts) on one
  side, the watch stickers (Continue, Short, Long) on the other, people stickers
  apart. Chips filter the board like on pleb.world.
- Stickers use pleb.world's language: pastel cards, thick ink outline, hard
  shadow, slight tilt that straightens on focus/hover, yellow handwritten
  notes, deep-space sky. Fonts Unbounded / Figtree / JetBrains Mono, bundled.
- **Focus is first-class**: every sticker and button is reachable with arrow
  keys and Enter, with a clear focus ring. Hover tilt is a bonus on top.

## The viewer (one screen, two modes)

One screen, as the old app had: the picture area on top, the **bottom panel**
dedicated to the playlist and the media player (SVG previous / next, play,
progress, queue, speed). A sticker only chooses the mode and the filter.

- **Listen mode** (Music, Podcasts): audio list plus player. Sources: Nostr
  audio, local folders and RSS feeds (carried over from `feat-own-audio`).
  Images from follows play as the picture wall behind it, as in the old app
  (assumption, see open items).
- **Watch mode** (Continue, Short, Long): sequential video playlist with resume
  position, next/previous.
- A button or key goes back to the board. The player keeps playing audio
  while on the board (docked mini player).

## Local media (web)

- **Local music** is its own playlist (the "Local" sticker), not mixed into
  Music/Podcasts. No cover art, so it gets a drawn fallback; titles from file
  names until tags are read.
- **My pictures** feeds the "My pictures" sticker and can also be the picture
  wall behind listen mode (alongside pictures from follows on Nostr).
- In Chromium a folder picker remembers the folder (works today for audio in
  `feat-own-audio`; extend it to pictures). Browsers without it fall back to
  picking files for the session.
- If access is refused, the app still works with Nostr and RSS.

## Parked: the TV

Not part of this feat for now. When it comes back: the TV is Android and the app
runs as a Capacitor debug APK sideloaded over ADB (`docs/tips/apk.md`,
`docs/tips/live-reload.md`, older-machine paths). The native side needs a media
read permission and a way to hand files to the page (plugin or bridge not chosen
or verified), plus the TV launcher entry. This machine has `adb`, JDK 21 and
`~/Android/Sdk`; the repo's `android/` folder is empty. Focus-first navigation
(arrow keys + Enter, visible focus ring) stays in the web build, since it costs
little and keeps the door open.

## Toolchain (R1)

pnpm (bun is not installed here; `pnpm-lock.yaml` committed), Vite 6, React 19,
TypeScript strict, ESLint, `node --test` for pure logic. Applesauce pinned
exactly: core 7.1.3, relay 7.1.1, loaders 7.2.0, signers 7.1.0, actions 7.1.1,
common 7.1.1, react 7.1.0. The old NDK/Tailwind app and its `bun.lock` are gone
from the tree (still in git history). `AGENTS.md` and `README.md` still describe
the old app and need a rewrite.

## Applesauce pieces (checked against the Applesauce docs)

- Store and loading: `EventStore`, `RelayPool`, loaders (unified/timeline).
- Login: `NostrConnectSigner` (NIP-46: bunker URI, nbunksec session) for
  Amber, and `ExtensionSigner` (NIP-07). Replaces the old 1,200-line `useAuth`.
- Follow: `FollowUser` action (and a `FollowMany` for bulk), on kind 3.
- Examples to read when building: `user-status/now-playing` (local audio),
  `outbox/video-gallery` (video events), `file/explorer` (kind 1063).
- Pin exact versions, as pleb.world does (v7 line).

## Carried over from feat-own-audio

RSS parser + same-origin proxy (`server/rssProxy.ts`, `api/rss.ts`), local
folder scan, own IndexedDB store. They become sources of the Music/Podcasts
rooms, not Settings-only extras.

## Dropped

QR codes (`react-qr-code`), the old `useAuth`, NDK, `ndk-hooks`, framer-motion
unless a real need appears, the old 6-minute music/podcast duration hack.

## Open items (discuss later, not blockers)

0. **Sticker previews**: poster slides only (proposed), or a muted short loop on
   focus? Local music has no cover art without reading ID3 tags.

1. **Music vs podcast**: what separates them? Old app guessed by duration
   (< 6 min = music). Wavlake is kind 31337 per the mediaplayer notes; not
   verified against relays. Podcasts: RSS, kind 1 / 1063 audio links.
2. **Short vs long video**: old app listed NIP-71 kinds 34235 and 34236 and a
   2-minute minimum. Which kind is "short" must be checked against the
   NIP and real relays before it is relied on.
3. **Images**: kept as the picture wall behind the listen side? (assumed yes)
4. **Liked npubs**: a list kept on the device, a Nostr list (follow set), or
   the existing contacts? Where it is stored decides sync between TV and phone.
5. **Follow more podcast creators**: where the candidate list comes from
   (a curated list, a relay search, what follows of follows post).
6. **Relay gate**: never block the screen on `connect()`; show the board
   immediately and fill as relays answer (the old app hung on dead relays).
7. **Android app** (Capacitor): keep, or web-only first.

## Milestones (draft)

- [x] R1 skeleton: Vite + TS + React 19, Applesauce store and relay pool wired,
      bundled fonts, pleb.world sky and sticker board, arrow-key focus,
      stickers routing to the (empty) viewer with a mode + filter, dock shell
      with SVG prev / play / next (off until R2). No relay gate.
- [ ] R2 viewer + bottom panel: audio element, SVG prev/next, queue, resume position.
- [ ] R3 Listen mode (Music / Podcasts): Nostr audio plus local folders and RSS.
- [ ] R4 Watch mode: continue-last, short, long, sequential playlist.
- [ ] R5 People: login (NIP-46 / NIP-07), liked npubs, follow more creators.
- [ ] R6 picture wall (Nostr pictures), polish.
- [ ] R7 local media on the web: Local playlist and My pictures (folder picker).
- [ ] later: TV (Android) build and native permission, see Parked.

## Not in this feat

Wavlake intake (its own feat once the music kinds are verified), zaps, chat,
the old message board.
