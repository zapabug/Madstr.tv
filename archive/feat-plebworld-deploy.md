# feat-plebworld-deploy: the web app moves to pleb.world/madstr; Android 1.3

Branch: `feat/plebworld-deploy`, off `main` (after feat-taste-cache merged).
Status: from zapa's words on 2026-11-15: "remove the vercel server and instead push to pleb.world/madstr, and we
have to publish to zapstore the mobile apk and deploy to plebworld directly"; "this means the fork: tv mode pwa
vs mobile".

## The fork

- **Web app / PWA** at `https://www.pleb.world/madstr/`: the TV and desktop experience, installable from the
  browser. Built with the base path `/madstr/` and copied into the pleb.world site (`public/madstr/`), the same
  way wazaa, zapslingers and letter-scrubber live there. pleb.world deploys when its repo is pushed.
- **Android app** (APK on zapstore): the mobile build, base path `/`, with what only the app does (the sideways
  view, feat-taste-cache §T7). Release **1.3**, versionCode **4**.
- One codebase. `pnpm build` stays the app build; `pnpm build:pleb` is the web build for pleb.world.

## D1: Base path

- Everything the app loads from its own site works under `/madstr/`: the page, scripts, fonts, icons, the
  manifest (relative paths; start and scope are the folder), and the service worker (registered at
  `/madstr/sw.js`, scope `/madstr/`, caching only `/madstr/` files).
- The RSS proxy stays at the site root, `/api/rss`.
- Exit: the pleb.world build served under `/madstr/` loads, installs and opens offline; the app build is
  unchanged.

## D2: RSS proxy on pleb.world

- The proxy (`server/rssProxy.ts`, with its private-address guard) runs as a pleb.world function at `/api/rss`,
  as plain JS (pleb.world's rule), generated from the same source.
- Exit: `/api/rss?url=<a feed>` answers on pleb.world.

## D3: pleb.world

- `public/madstr/` holds the build; the Mad⚡tr.tv sticker links to `/madstr/` instead of madstr-tv.vercel.app.
- Pushed to pleb.world's repo, which deploys it.
- Exit: `https://www.pleb.world/madstr/` shows the board.

## D4: Vercel project madstr-tv

- Removed by zapa in the Vercel dashboard (no Vercel CLI on this machine). `api/rss.ts` (the Vercel function)
  goes from this repo.

## D5: Android 1.3 on zapstore

- versionCode 4, versionName 1.3; built, signed with the release key, published with `zapstore publish`.
- Exit: release 1.3 visible on zapstore.
