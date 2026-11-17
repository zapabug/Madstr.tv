# Juke⚡tr

**Your Nostr Jukebox.** Music, podcasts, radio, videos and a picture show from the people you follow on
Nostr, RSS feeds and your own files, on one screen you can drive with a TV remote, a keyboard or a finger.

- Web app: **[www.pleb.world/jukestr](https://www.pleb.world/jukestr/)** (installable, works offline)
- Android phones and Android TV: **Juke⚡tr on [zapstore](https://zapstore.dev)** (app id `com.madstr.tvapp`)

Built on [Applesauce](https://applesauce.build) with React 19, Vite and TypeScript. The repo keeps its first
name, Madstr.tv.

## What it does

- **Home**: a board of stickers, each a shortcut that opens the player already set up, with a live preview of
  what it would play: Music, Podcasts, Radio, Local, Keep watching, Short videos, Long videos, My pictures, and
  Follow more creators.
- **The player screen**: the picture on top (the video, or a picture show from the people you follow behind the
  music), and below it one orange "Jukestr 3000" machine: the playlist as tiles, and the controls (now-playing
  card, up / down votes, previous / play / next, speed, a rainbow seek bar). The Play button is the logo. The
  panel slides away after a while; a tap or a key brings it back. Double tap the picture to jump back 10 s or
  forward 30 s.
- **Music and Podcasts** come from Nostr posts by the people you follow (and hashtags you add), RSS feeds and
  folders on your device. Music is 2 to 9 minutes, longer is a podcast; lengths are read from the files. Older
  posts are fetched as you listen, and everything seen is kept on the device, so lists show before any relay
  answers.
- **Radio**: internet radio stations from Nostr (kind 31237, from the WaveFunc relay) and live shows from
  zap.stream and others (NIP-53). Turn on genres (any word, like jazz or bitcoin) and countries, one, many or
  all; it loads up to 300 stations and plays them 30 at a time. Up vote saves a station to Your stations, down
  vote hides it.
- **Taste**: up votes are public likes when you are logged in; down votes and hidden artists stay on the device,
  with a way back under Make it yours. What played this session leaves the list.
- **People**: log in with Amber or another signer app on the phone, a browser extension, a `bunker://` link or
  a QR code, and follow creators (friends of the people you follow first). Logged out, the board shows what the
  TV's own account follows.
- **Make it yours**: your RSS feeds, music and picture folders, hashtags, and what you have hidden.
- **Remote first**: every control is reachable with the arrow keys; Esc or Backspace goes back home.
- **Phones**: their own upright and sideways layouts; the Android app plays in the background with lock-screen
  and notification controls.

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # node --test over src/**/*.test.ts and server/**/*.test.ts
pnpm lint
pnpm build        # typecheck + production build (base /, also used by the Android app)
```

`/api/rss?url=...` is a same-origin proxy for RSS feeds that refuse browsers (`server/rssProxy.ts`: http(s)
only, no private addresses, capped size and time). It runs as Vite middleware in development and as a
function on pleb.world.

## Ship it

- **Web (pleb.world/jukestr)**: `./scripts/deploy-pleb.sh` builds under `/jukestr/` and copies the app and the
  RSS function into the pleb.world repo; committing and pushing that repo deploys it.
- **Android (zapstore)**: bump `versionCode` / `versionName` in `android/app/build.gradle`, then
  `pnpm build && pnpm exec cap sync android && (cd android && ./gradlew assembleRelease) && ./scripts/sign-release.sh`,
  then publish with zsp (`zapstore.yaml`; release notes come from `CHANGELOG.md`). The signing key lives outside
  the repo.
- **Icons**: `./scripts/make-icons.sh` makes every web and Android icon and the start screen from
  `assets/brand/app-icon.png` and `assets/brand/mark.svg`.

## Layout

```
src/lib/        plain logic with tests (media and station rules, routes, focus, queue, taste, feeds, cache)
                and the app singletons (Applesauce store + relay pool, accounts, player)
src/data/       hooks that turn relays, RSS feeds and local files into lists
src/components/ the board, the player screen, panels, controls, Radio's stickers
server/         the RSS proxy
android/        the Capacitor app (native media controls, folders, background play)
assets/brand/   the logo sources
scripts/        deploy, icons, release signing, relay probe
```

Each feature has its spec in a `feat-*.md` file, finished ones in `archive/` (the docs win over the code); `build.md` records what was built
and checked, `planning.md` why, and `Status.md` where things stand. `docs/` holds notes from the first (NDK)
version of the app.
