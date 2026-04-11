# mediaplayer vs Madstr_tv — comparison notes

Reference doc. Things the new app does better, and things worth keeping from Madstr_tv.

---

## What mediaplayer does better

### 1. applesauce-relay instead of NDK

Madstr_tv uses `@nostr-dev-kit/ndk` — heavy: caching layer, signer plumbing, user abstractions, WebSocket polyfill issues in dev. The new app uses `applesauce-relay`, a thin RxJS-based relay pool:

- Smaller bundle
- Auto-reconnect built in (`reconnect: Infinity`)
- Subscriptions are plain `.subscribe({ next })` — no global singleton to thread through components

### 2. Two-slot double-buffer crossfade

Madstr_tv uses framer-motion `AnimatePresence mode="wait"` — the outgoing image fully exits before the next enters, causing a black flash. The new app keeps two `<div>` slots alive simultaneously. Incoming image loads behind the current one, then a CSS class swap brings it to front. Zero black frames, pure CSS (`slot-enter` / `slot-exit` + `zIndex`).

### 3. Ken Burns CSS animations (4 variants)

Madstr_tv: subtle `scale: 0.95 → 1` via framer-motion. The new app has 4 named variants (`kb-0`–`kb-3`) — different slow drift + zoom directions, randomly assigned per image. Pure CSS `@keyframes`, no JS overhead during animation.

### 4. Two-pool content strategy

Madstr_tv mixes all content into a flat array. The new app separates:
- `ownItems` — posts from the TV's own npub
- `communityItems` — hashtag + follow list

`pickNext()` gives the venue every 3rd slot (~33%). This is the home-TV use case — operator controls their feed ratio. For the community/venue-screen use case (Free Madeira), all content is community-driven.

### 5. Batch fetch + EOSE close + `since` pagination

Madstr_tv keeps subscriptions open indefinitely. The new app:
1. Subscribes, collects events
2. Unsubscribes on EOSE
3. Re-fetches with `since: newestTimestamp + 1` every 35 images shown

Predictable refresh cycle, no persistent relay connections.

### 6. Kind 3 follow list resolution

Madstr_tv needs hardcoded `authors` arrays. The new app's `useFollowList` hook fetches the TV npub's kind 3 contact list automatically — community content comes from whoever the operator follows on Nostr.

### 7. Config-driven module architecture

Madstr_tv is monolithic — all features wired in `App.tsx`, kind 1 only, audio added without a nostr filter (very little audio content exists). The new app has a `config.json` modules array — new modules are purely additive.

### 8. Seen-tag deduplication across restarts

Madstr_tv: in-memory only. The new app persists to `localStorage` (500 IDs). Already-shown images are skipped immediately on restart.

### 9. Clean venue header

Madstr_tv's InfoPanel shows name, bio, and follower counts — unreadable noise at 3m viewing distance. The new app shows only: profile picture (top-right circle) + name. Screen stays clean.

---

## What to keep from Madstr_tv

- **IndexedDB for seen notes** (`idb.ts`) — higher capacity than localStorage, better for large libraries
- **Kind 31338** — long-form media kind worth adding to fetches
- **Settings accessible via TV remote** — Madstr_tv has keyboard nav; this app's settings modal needs d-pad/remote support
