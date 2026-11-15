# feat-applesauce-revamp: Madstr.tv rebuilt on Applesauce, pleb.world style

Branch: `feat/applesauce-revamp`, off `feat/own-audio`.
Status: built (R1–R7) on `feat/applesauce-revamp`; spec from zapa's words on 2026-11-15, updated after
the audit the same day (see "Decided after the audit").
Scope: **web first.** TV / Android (APK, native media permission) is parked: see
"Parked: the TV".

## Goal

Redo Madstr.tv from the start on Applesauce (the old app is NDK + hooks and
`main` does not compile). Keep what zapa likes about it, and give it the
look and feel of pleb.world: funky, playful, a bit over the place on purpose.

## What zapa said (the source for everything below)

- It stays **TV-minded** in feel (big targets, remote-style focus). Update
  2026-11-15: **don't worry about the TV now**; web first.
- ~~No QR codes any more.~~ Update 2026-11-15: **QR login stays** (it works; `react-qr-code` is OK'd).
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

Home is the pleb.world-style board: a sky, post-its, and below them **Your sources** (RSS feeds,
folders, my pictures, hashtags per kind).
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
  | Short / Long videos | posters of the next videos in that queue that have one, slowly rotating through a few (2026-11-15: most long videos are kind 1 notes with no poster at all, so "next few" skips the ones without) |
  | Liked npubs | a few avatars |
  | Follow more creators | avatars of suggested creators |

  Previews are poster images (video `imeta` poster/image tags), cross-faded
  slowly, **not** autoplaying video: a TV and a board of seven stickers should
  not decode seven streams. If a short loop on focus is wanted later, it is a
  separate step. The sticker's preview and the viewer's queue come from the same
  list, so "next in queue" on the board is exactly what opens.
- The board still shows the divide: the listen stickers (Music, Podcasts) on one
  side, the watch stickers (Continue, Short, Long) on the other, people stickers
  apart. ~~Chips filter the board like on pleb.world.~~ Update 2026-11-15: no filter chips;
  all three lanes always show.
- Stickers use pleb.world's language: pastel cards, thick ink outline, hard
  shadow, slight tilt that straightens on focus/hover, yellow handwritten
  notes, deep-space sky. Fonts Unbounded / Figtree / JetBrains Mono, bundled.
- **Focus is first-class**: every sticker and button is reachable with arrow
  keys and Enter, with a clear focus ring. Hover tilt is a bonus on top.

## The split screen (zapa, 2026-11-15: "my layout from before", then "70 / 30")

Out of the home view the screen is split as the first Madstr was (`docs/Untitled.png`):
the **picture on top** (the slideshow behind music and podcasts, the video itself for video)
with the thin **⟨ ⟩ previous / next chevrons on its edges**, the brand top right and the
**VIDEOS / MUSIC chip bottom right**; and a **bottom panel split left / right, 70% / 30%**:

- **Left 70%, the media picker** (where the old message board was): the playlist. Sources are
  added on the board under "Your sources", not in the viewer.
- **Right 30%, the media controls**: what is playing, play, seek bar, speed, and the small
  buttons (like, -10s, +30s).

After 25 s without input (zapa, 2026-11-15; was 45 s) the bottom panel slides away and the picture takes the whole
screen; any mouse move or key brings it back, and arrow keys work while it is hidden.
Following creators is a plain page; the board keeps a slim player bar. Styling is part of this
feat: it is a fresh app, so the look (sky, halo, tiles, ticker) is designed as it goes.

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
from the tree (still in git history). `AGENTS.md` and `README.md` were rewritten for this app.

## Rules settled from real relay data (2026-11-15)

- **Short vs long video**: NIP-71 kinds 22 and 34236 are short, 21 and 34235 are normal
  (seen on relays, `duration` 6-28 s on the short ones). A kind 1063 video under 60 s
  counts as short. YouTube-only events are dropped.
- **Audio**: kind 1063 with `m audio/*` (minus the soundtracks of short videos, which
  carry an `a 3423x:` tag), kind 31337 tracks that have a `url` (their `duration` is
  milliseconds), and kind 1 notes linking an audio file. Encrypted audio is dropped.
- **Music vs podcast**: under 6 minutes or unknown length is music; 6 minutes or more is a
  podcast; RSS episodes are always podcasts; local files are their own list.
- **Where the content comes from**: the TV account "Madstr_tv" follows 33 accounts, but
  its follow list is only on `purplepag.es`, so follows are read from the index relays
  too. Media kinds are queried apart from plain notes (notes would crowd them out).
  Those 33 mostly post short videos and notes; there is little audio, so music will
  stay thin until hashtag discovery (R6) or more follows.

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

The old `useAuth`, NDK, `ndk-hooks`, framer-motion
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
- [x] R2 viewer + bottom panel: one player store (hidden audio + video in the viewer), queue,
      SVG prev / play / next, seek, -10s/+30s, speed, resume position, playlist drawer.
- [x] R3 Listen mode (Music / Podcasts / Local): Nostr audio from the TV's follows, RSS feeds
      and local folders (added on the board under "Your sources").
- [x] R4 Watch mode: short, long, keep-watching (last video first, then newest).
- [x] R5 People: login with a NIP-07 extension, a pasted NIP-46 bunker:// / nbunksec link, or a
      QR code (own session store in `src/lib/session.ts`, as the Madeira Livre app does, saved
      across reloads), follow / unfollow through Applesauce's FollowUser
      action, and a creator picker ranked by what people publish (Liked npubs was dropped later).
- [x] R6 picture wall (Nostr pictures, slideshow with cross-fade), live sticker previews, and
      hashtag discovery per kind (music/podcast, video, pictures) as the first Madstr had.
- [x] R7 local media on the web: Local playlist and My pictures (folder picker, or picked files
      for the session where there is no folder picker).
- [ ] RSS (incoming): RSS is still being worked on; the parser (`rssFeed.ts`) and the proxy's
      private-address guard (`server/rssProxy.ts`) get their tests with that work.
- [ ] R8 remote pass, the **final stage before deploy**: every control, inputs and sliders
      included (seek bar, picture mix, feed URL, hashtag, bunker link), is `data-nav`, and arrow
      keys can leave a text input, so the whole app works from a remote.
- [ ] later: TV (Android) build and native permission, see Parked.

## Rules added later (zapa, 2026-11-15)

- **Short video** = under 30 seconds (a known length decides; the NIP-71 short kinds only when it is not known).
- **Podcast** = audio longer than 9 minutes (lengths are read from the audio in the background; a #podcast
  hashtag or the word episode stands in until then). **Music** = audio of 9 minutes or less.
- **Creators to follow** are ranked by what they publish: images, videos, podcasts, music, short videos.
  Friends of your follows come first as a group; inside a group, whoever publishes most of the chosen
  category leads; chips pick the category.

## Dropped later (zapa, 2026-11-15)

**Liked npubs** is not needed: the sticker, its view, the heart buttons and the saved list are gone.
The people lane keeps "Follow more creators", whose suggestions come from friends of your follows first.

**Header account chip and the "Logged in" box** (zapa, 2026-11-15): the header chip no longer shows a
heart and your profile name; logged in, it is a **Log out** button (logged out it stays "Log in", a link
to People). People drops its "Logged in" section ("The board now shows what the people you follow
post"); the login options show only while logged out.

**Board hero and filter chips** (zapa, 2026-11-15): the board drops the "pick a sticker" note, the line
"Each sticker is a shortcut: it opens the player already set up." and the All / Listen / Watch / People
chips. The heading stays.

**Names** (zapa, 2026-11-15): someone with no name set shows as the **last 5 letters of their npub**
(`…ab3cd`). A name that is set is clipped to **40 characters** (relay data is untrusted; 40 is
proposed, waiting for zapa's OK), and a profile picture is only shown when it is an http(s) URL.

## Added later (zapa, 2026-11-15)

- **Shuffle button in the media picker** (its header, beside the title): it turns shuffle on and off for
  the playlist that is open. On: the item playing keeps playing and the rest of the playlist goes into
  a random order; items that arrive later from relays are mixed in at the end. Off: the playlist goes
  back to its normal order, with the same item still playing. Opening another playlist starts
  unshuffled (proposed, waiting for zapa's OK).
- **A video's sound keeps playing when you leave the viewer** (to the board, People, or My pictures):
  it carries on from the same second, and next / previous and the end of a video move through the
  video playlist as sound only. Coming back to the watch viewer shows the picture again from where the
  sound is. Opening another playlist (the Music sticker, say) replaces it, as before.

- **Your profile picture is the planet** in the sky while you are logged in (http(s) pictures only); the
  orange ball stays underneath. If the picture fails to load, the planet tries again **every 15 s, up
  to 4 times**, and also whenever the tab comes back into view or the network comes back, instead of
  giving up until a reload (numbers proposed, waiting for zapa's OK).

- **Looks** (zapa, 2026-11-15): the soft halo around profile pictures in the viewer (bottom-left author
  and the author spot in the controls) is bigger. The "Your sources" cards and the People page cards
  each get their own pastel sticker colour with a slight tilt, like the board stickers. The People
  category chips (Everything, Images, Videos, Podcasts, Music, Short videos) are little stickers in
  different colours; the picked one turns dark with its colour as text.

## Decided after the audit (zapa, 2026-11-15)

The audit of 2026-11-15 (`audits/audit-2026-11-15.md`) flagged these; zapa kept them as built:

- **QR login stays**, with `react-qr-code` as an OK'd dependency.
- **Login keeps its own session store** (`src/lib/session.ts`), not Applesauce's AccountManager:
  it works, do not touch.
- **The viewer's picker is the playlist only**; sources are added on the board under "Your sources".
- **Styling is in scope**: this is a fresh app, not a restyle of the old one.

## Not in this feat

Wavlake intake (its own feat once the music kinds are verified), zaps, chat,
the old message board.
