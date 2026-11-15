# Mad⚡tr.tv

Music, podcasts, videos and pictures from Nostr, RSS feeds and your own files, on one screen
that works from a remote: a board of sticker shortcuts, and a split screen to play.

Built on [Applesauce](https://applesauce.build) (React 19, Vite, TypeScript).

## What it does

- **Board**: eight stickers, each a shortcut that opens the player already set up (Music,
  Podcasts, Local, Keep watching, Short videos, Long videos, My pictures, Follow
  more creators). Each shows a live preview of what it would open.
- **Split screen** (anything but the board): the picture on top, a bottom panel with the media
  picker on the left (70%) and the controls on the right (30%). The bottom panel hides after
  45 s without input.
- **Sources**: the people the TV account (or you, once logged in) follow on Nostr, hashtags you
  add, RSS feeds, folders on your device, and your own pictures as slides.
- **People**: log in with a browser extension, a `bunker://` link or a QR code, and follow creators
  (friends of the people you follow first), ranked by what they publish: pictures, videos, podcasts,
  music and short videos (under 30 s).

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm test       # node --test over src/**/*.test.ts
pnpm build      # typecheck + production build
pnpm lint
```

`/api/rss?url=...` is a same-origin proxy for RSS feeds that block browsers (a Vite middleware
in development and preview, `api/rss.ts` as a Vercel function; see `server/rssProxy.ts`).

## Layout

```
src/lib/        plain logic with tests (routes, focus, queue, media rules, tags, shuffle)
                and the app singletons (applesauce store + relay pool, accounts, player)
src/data/       hooks that turn relays, RSS and local files into lists
src/components/ the board, split screen, panels, controls
feat-applesauce-revamp.md   the spec this was built from
```

Specs live in `feat-*.md`; `docs/` holds notes from the first (NDK) version of the app.
