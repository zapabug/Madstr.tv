# AGENTS.md: Mad⚡tr.tv

Read `feat-applesauce-revamp.md` first: it is the spec and records what zapa decided. The
`docs/` folder is notes from the first (NDK) version and may describe code that is gone.

## Toolchain

pnpm, Vite 6, React 19, TypeScript strict, ESLint, `node --test` for pure logic. Applesauce
packages are pinned to exact versions in `package.json` (no `^`); adding any other runtime
dependency needs zapa's OK. Import Nostr helpers from Applesauce, not `nostr-tools`.

```bash
pnpm install && pnpm dev     # http://localhost:3000
pnpm test && pnpm lint && pnpm build   # all three must pass before a commit
```

## Rules

- **No mock data.** A sticker or list with no source says so; nothing is invented.
- **Nothing waits on a relay.** Render immediately and fill as events arrive.
- **Treat everything from relays, feeds and files as untrusted**: only http(s) URLs, clipped
  strings, plain-text rendering. Event rules live in `src/lib/media.ts` with tests built from
  real event shapes; change them together.
- **Layout first, styling later.** zapa has said colours and styling come later: do not restyle.
- **No secrets in the repo.** Saved logins sit in the browser's localStorage (Applesauce's
  AccountManager); they are credentials.
- Keep logic that can be pure in `src/lib/` with a test; hooks and components stay thin.
- Branch per feat (`feat/<name>`), commits `feat(<name>): ...`; do not push without asking.

## Verifying UI work

Drive a headless Chromium over the DevTools protocol (Node 22 has `WebSocket`): load the app,
press keys, read the DOM. The app is TV-minded, so every control is `data-nav` and reachable
with arrow keys (`src/lib/focusNav.ts`). Relays are slow or dead at times: wait, do not assume.
