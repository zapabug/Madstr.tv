## 2024-07-18

*   **Investigate `TimelineQuery` Failure (useMediaContent.ts & main.tsx):**
    *   Added `console.log` statements for `imageQueryArgs` and `videoQueryArgs` to inspect the exact filters being passed to `Hooks.useStoreQuery`.
    *   Observation: Logs showed that `imageQueryArgs` and `videoQueryArgs` were initially (and persistently) constructed without `authors` or `tags`, because `followedAuthorPubkeys` and `followedTags` props were empty when `useMediaContent` first ran. This is likely due to `ContactsQuery` in `App.tsx` not having resolved yet.
    *   Added `console.log` at the beginning of `useMediaContent` to inspect the `followedAuthorPubkeys` and `followedTags` props upon each invocation.
    *   Observation 2: Subsequent logs confirmed that `useMediaContent` *does* receive the populated `followedAuthorPubkeys` array after `ContactsQuery` resolves. The `imageQueryArgs` and `videoQueryArgs` are then correctly reconstructed to include the `authors` list.
    *   Problem Persists: Despite correct filters with authors eventually being used, `TimelineQuery` still returns 0 image/video events.
    *   Next Step Hypothesis: Issue might be with `TimelineQuery` handling of a single filter object with many authors, or no recent matching events for that specific set of authors in the `EventStore`, OR `SimplePool` itself is not fetching/relaying these events to the `EventStore`.
    *   Action (Attempt 1 - Hardcoded Author): Modified `useMediaContent.ts` to temporarily hardcode a single author pubkey. Result: Still 0 events from `TimelineQuery`.
    *   User Rejection & Clarification: User rejected filter simplification attempts in `useMediaContent.ts`, preferring original OR logic and fallback. Clarified TV npub identity.
    *   Action (Logs in main.tsx): Modified `main.tsx` to add detailed logging within `SimplePool.subscribeMany`'s `onevent` callback. 
    *   Observation 3 (main.tsx logs): `SimplePool` *is* receiving Kind 31234 (podcast), Kind 3 (contacts), and Kind 0 (profile) events. No Kind 1063 (image) or 34235 (video) events were visible in the initial log snippet.
    *   **Action (Focus on Podcasts):** 
        *   Updated `src/hooks/useMediaContent.ts` to filter for podcast Kind `31234`.
        *   Refined logging in `main.tsx`.
        *   Further simplified podcast filter in `useMediaContent.ts` to be a broad, kind-only query (`{kinds: [31234], limit: 50}`).
        *   Commented out problematic relay `wss://relay.primal.net/`.
    *   **BREAKTHROUGH!** Podcasts (Kind 31234) are now being fetched by `TimelineQuery` and displayed in the UI. This confirms `TimelineQuery` can work with `EventStore` for this kind with a simple filter.
    *   **New Issue:** Podcasts fail to play. Log: `useMediaElementPlayback: togglePlayPause called with invalid state. Has media element: true, has currentItemUrl: false`.
    *   **Action (Current - Debug Podcast Playback):** Added logging to `processApplesauceEvent` in `useMediaContent.ts` to inspect the `basicUrl` being extracted for Kind 31234 events. 
    *   Action (Fix Linter Errors): Corrected `MediaPanel.tsx` to properly use the inferred profile data type returned by `ProfileQuery` (via `useStoreQuery`), resolving type mismatches and fixing `.picture` access.
    *   **Action (Current - Debug Podcast Playback):** Verify URL extraction via logs from `processApplesauceEvent`.

*   **Applesauce Internals Investigation (User-Led):**
    *   User provided a deep dive into `EventStore`, `ProfileQuery`, and `TimelineQuery` based on their examination of `applesauce-core`.
    *   **`EventStore` API:** Key methods for debugging identified: `getEvent(id)`, `hasEvent(id)`, `getAll(filters)` (synchronous, useful for testing filters directly against cache), `getTimeline(filters)` (returns observable, used by `useStoreQuery`). Logging can be enabled via `debug` library (`localStorage.debug = "applesauce:*"`).
    *   **`ProfileQuery`:** Returns `ProfileContent | undefined`. `ProfileContent` type defined (includes optional `name`, `display_name`, `about`, `picture`, `banner`, `website`, `lud16`, `lud06`, `nip05`, plus deprecated fields). Parsing from Kind 0 event content is handled by `getProfileContent` helper.
    *   **`TimelineQuery(filters, includeOldVersion?)`:** Returns `Query<NostrEvent[]>` (so `NostrEvent[] | undefined` from `Hooks.useStoreQuery`). It's a simple wrapper around `eventStore.timeline(filtersArray)`. The actual filtering logic (authors, kinds, tags, since, until) is in `eventStore` (specifically `matchFilter` / `matchFilters` in `core/src/helpers/filter.ts`), adapted from `nostr-tools`. `matchFilters` uses OR logic for an array of filters. Issues with complex filters are likely due to data mismatches in the store vs. filter criteria, or tag indexing/search specifics.
    *   **Debugging Complex Filters:** Recommended to use `eventStore.getAll(complexFilter)` to directly test against the cache, inspect stored events that *should* match, and simplify filters incrementally to isolate the problematic condition.
*   **Current Focus (Podcast Playback):** Waiting for user to run app and check logs from `processApplesauceEvent` (in `useMediaContent.ts`) to verify if `basicUrl` is correctly extracted for Kind 31234 podcast events and if relevant tags (`url`, `media`, `enclosure`) are present.

## 2024-07-19

*   **Podcast URL Extraction Debugging:**
    *   Logs confirmed `basicUrl: null` for Kind 31234 events. `processApplesauceEvent` logic reviewed; it checks `url`, `media`, `enclosure` tags (correctly removed `image` tag check).
    *   Examination of `allTags` from logs revealed the Kind 31234 events being processed lacked any standard URL tags.
    *   User provided example (`ea643df0...`) of a working NoSolutions podcast link, which was a **Kind 1 event** with the `.m4a` URL directly in the `content` field.
*   **Refactor `useMediaContent` for NoSolutions Kind 1 Podcasts:**
    *   Modified `podcastQueryArgs` to fetch `kinds: [1]` from `authors: [NOSOLUTIONS_PUBKEY_HEX]` if that author is followed, removing Kind 31234 queries for podcasts.
    *   Updated `processApplesauceEvent` to use regex (`AUDIO_URL_REGEX`) to extract URLs from the `content` of Kind 1 events matching `NOSOLUTIONS_PUBKEY_HEX`.
    *   Added filtering step `filter(note => note.url !== undefined)` after processing to ensure only notes with successfully extracted URLs are kept.
*   **Current Status - Still No Media:**
    *   App still shows loading spinner; no podcast, image, or video data displayed.
    *   Logs confirm the correct `podcastQueryArgs` (including Kind 1 filter) is created when `followedAuthorPubkeys` (including NoSolutions) is available.
    *   However, subsequent logs (`Raw fetchedPodcastEvents count`, `All processed notes`, `Notes with URLs after filter`) were missing from the console output provided, suggesting the processing `useEffect` might not be running as expected after the query args update, or `TimelineQuery` isn't emitting results.
*   **Action: Add Direct `EventStore` Check:**
    *   Added a diagnostic `useEffect` in `useMediaContent.ts` using `Hooks.useEventStore()` and `eventStore.getAll()` to synchronously check if matching Kind 1 events for NoSolutions exist in the store when the specific query (`podcastQueryArgs`) is active.
*   **Next Step:** User to run app and check the new `[DEBUG] EventStore.getAll found...` logs to determine if relevant Kind 1 events are present in the `EventStore`.