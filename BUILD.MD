## 2025-05-06: Documentation Update & UI/UX Issues Post-Refactor

*   **Documentation Update:** `TV_Remote_Interaction_Summary.md` updated to reflect the recent major refactor of `src/hooks/useMediaContent.ts` (unified media discovery strategy) and to document the current critical UI/UX issues.
*   **Current Critical Issues:**
    *   **UI elements not displaying:** Certain UI components or media items are not being rendered as expected after the `useMediaContent.ts` refactor.
    *   **VideoPlayer rendering failure:** The `VideoPlayer.tsx` component is failing to render properly.
*   **Immediate Focus (as per user's to-do list):**
    1.  Test new media fetching & display strategy in `useMediaContent.ts`.
    2.  Analyze console logs from `useMediaContent.ts`.
    3.  Debug & refine the media strategy (regexes, deduplication, categorization).
    4.  (Lower Priority) Address placeholder chat functionality.

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

## 2024-07-22: Debugging Content Loading & Infinite Loop

*   **Initial State & Kind 3 Fixes:** (Covered previously - app stuck, Kind 3 for default/logged-in user fixed, `followedAuthorPubkeys` populating).
*   **Podcast Fetching Strategy:** `useMediaContent.ts` configured to fetch Kind 1 events from all followed authors, attempting to extract audio URLs from content.
*   **Relay List Update:** Updated `RELAYS` in `src/constants.ts` to a list of 9 relays previously used with NDK.
*   **Persistent "Maximum Update Depth Exceeded" Error:** Despite relay changes and previous attempts to stabilize `followedPubkeys` and `isLoadingContent` in `App.tsx`, the application immediately encountered an infinite re-render loop upon loading data.
*   **Applesauce Codebase Investigation Insights:**
    *   A detailed review of `applesauce-react` (`Hooks.useStoreQuery`) and `applesauce-core` (`Queries.ContactsQuery`, `QueryStore`, `EventStore`) indicated that `Hooks.useStoreQuery` does not inherently guarantee reference stability for array/object results if the underlying observable pipeline emits new references.
    *   Specifically, the `map` operator in `ContactsQuery` (using the `getContacts()` helper) is a likely point where new array references for `contactsData` are generated, even if the underlying contact list content is identical.
    *   No deep `distinctUntilChanged` comparison seems to be applied by default to the *output* of such queries within the core Applesauce pipeline examined.
*   **Latest Error Stack Trace & Hypothesis Shift:**
    *   The most recent stack trace for the "Maximum update depth exceeded" error now prominently includes `useMediaContent.ts` (specifically citing line 243 in one trace) in addition to `App.tsx`.
    *   This suggests that while `contactsData` reference instability (from `useStoreQuery(ContactsQuery,...)` in `App.tsx`) might still be an initial trigger propagating to `useMediaContent` (via `followedPubkeys`), the loop now critically involves `useMediaContent` itself.
    *   **Revised Hypothesis:** `useMediaContent` is re-run due to unstable `followedPubkeys`. Then, its own internal data fetching using `Hooks.useStoreQuery(Queries.TimelineQuery, ...)` for images, videos, or podcasts (`fetchedImageEvents`, `fetchedPodcastEvents`, etc.) might *also* be returning unstable array references. This would cause `useMediaContent`'s internal `useEffect` hooks (which process these fetched events and call `setProcessedImageNotes`, `setProcessedPodcastNotes`, etc.) to run repeatedly, setting state, causing `useMediaContent` to return new output array references to `App.tsx`, which then continues the re-render loop.
*   **Stabilization Attempts in `useMediaContent.ts` (2024-07-23):**
    *   Refactored `useMediaContent.ts` to introduce "stable" versions of `fetchedImageEvents`, `fetchedVideoEvents`, and `fetchedPodcastEvents` using `useMemo` and `JSON.stringify`. These stable versions are now dependencies for the `useEffect` hooks that process media events and call `setProcessed...Notes` setters.
    *   Corrected type inconsistencies within these processing `useEffect`s, ensuring `NostrNote[]` is used for arrays returned by `processApplesauceEvent`.
    *   Created `src/types/Events.ts` defining `ApplesauceEvent` and other related types, resolving import errors.
    *   Resolved duplicate `NostrNote` imports.
*   **Current Status (2024-07-23):**
    *   The "Maximum update depth exceeded" error appears to be resolved due to stabilization efforts.
    *   **NEW ISSUE:** No media content (images, videos, podcasts) is being displayed in the UI. (Update: Podcasts *are* populating their list in `MediaPanel`, but playback fails).
    *   Logs confirm `SimplePool` in `main.tsx` is receiving general Kind 1 events, indicating relay communication is active.
    *   **NEW ISSUE (Playback Failure):** When attempting to play a podcast, the error "useMediaElementPlayback: togglePlayPause called with invalid state. Has media element: true, has currentItemUrl: false" occurs. This suggests the podcast list is populating, but the selected item's URL is not being correctly set or propagated to the playback hook.
    *   **NEW ISSUE:** The placeholder chat functionality for non-logged-in users (previously available in `MessageBoard`) is reportedly missing or not working.
*   **Next Steps (Focus on Data Flow & Placeholder Chat):**
    1.  **Investigate Podcast Playback Failure (Priority):**
        *   Trace `currentItemUrl` in `useMediaState`: Verify it updates when a podcast is selected.
        *   Inspect the selected podcast `NostrNote` in `useMediaState` to ensure its `url` property is valid.
        *   Review `MediaPanel.tsx` and `Podcastr.tsx` selection handling.
    2.  **Investigate Image/Video Content Data Flow:** Deep dive into `useMediaContent.ts` to trace why fetched events (if any from `TimelineQuery`) are not resulting in displayed images/videos. This includes checking filters, query arguments, `TimelineQuery` results, `processApplesauceEvent` logic, and final state updates for `shuffledImageNotes`, `shuffledVideoNotes`.
    3.  **Investigate Placeholder Chat:** Review `App.tsx` and `MessageBoard.tsx` to understand how `neventToFollow` (or equivalent) was set for non-logged-in users and reinstate this functionality. Determine if a default event ID or logic was used.

## 2024-07-24: Podcast Playback Fixes, Image/Video Debug Prep, HMR Issues

*   **Podcast Playback Logic Refined (`useMediaState.ts`):**
    *   Modified the `useEffect` hook in `useMediaState.ts` that sets `currentItemUrl`. When `viewMode` is `'imagePodcast'`, it now correctly prioritizes `podcastNotes[currentPodcastIndex].url` if a valid podcast is selected and has a URL, before falling back to an image URL.
    *   Added detailed logging to trace `currentPodcastIndex`, the selected podcast note (and its URL), and the setting of `currentItemUrl`.
    *   **Result:** Logs confirmed `currentItemUrl` was being set correctly for NoSolutions podcasts, and sound playback was achieved.
*   **Generalized Podcast Audio Extraction (`useMediaContent.ts`):**
    *   Identified that `processApplesauceEvent` was only attempting audio URL extraction from Kind 1 events authored by `NOSOLUTIONS_PUBKEY_HEX`.
    *   Modified `processApplesauceEvent` to attempt `AUDIO_URL_REGEX` extraction from the `content` of *any* Kind 1 event, to support podcasts from other followed authors.
*   **Image/Video Fetching Debug Prep (`useMediaContent.ts`):**
    *   Added extensive `console.log` statements to log the direct results of `Hooks.useStoreQuery` for `fetchedImageEvents` and `fetchedVideoEvents`.
    *   Added logs for the output of `processApplesauceEvent` when processing potential image/video events.
*   **Identified HMR / `main.tsx` Issues:**
    *   User reported Vite HMR errors (`can't access lexical declaration 'App' before initialization`, `Failed to reload /src/App.tsx`) and a React `createRoot` warning.
    *   These indicate potential instability in the dev environment or issues in `main.tsx` / `App.tsx` that need to be addressed for reliable debugging.
*   **Current Status (End of Session):**
    *   Podcast playback for NoSolutions is working.
    *   Awaiting testing of generalized Kind 1 audio extraction for other followed authors.
    *   Awaiting testing/log analysis for image and video content fetching with new detailed logs in place.
    *   Vite HMR errors and `createRoot` warning need to be investigated, starting with a dev server restart.
    *   Placeholder chat functionality remains an outstanding issue.
*   **Plan for Next Session:**
    1.  **Stabilize Dev Environment:** Restart Vite dev server. If HMR/`createRoot` issues persist, investigate `main.tsx` and `App.tsx` for syntax errors, or circular dependencies.
    2.  **Test Generalized Podcast Fetching:** Verify if podcasts from authors other than NoSolutions can now be played.
    3.  **Analyze Image/Video Fetching Logs:** Once `followedAuthorPubkeys` are populated (e.g., after login), examine the new logs in `useMediaContent.ts` to see if `TimelineQuery` returns image/video events and if `processApplesauceEvent` handles them correctly.
    4.  **Address Placeholder Chat:** Investigate and restore this functionality.
    5.  **Continue Image/Video Debugging:** Based on log analysis, proceed with fixing image/video display.

## 2024-07-25: Refactor `useMediaContent.ts` - Unified Media Discovery Strategy

*   **Context:** To simplify media fetching and ensure content display even if specific kinds (1063, 34235) are not found or not posted by authors, a new strategy was implemented. The goal is to get the app running with some media, with further refinement to follow.
*   **Key Changes in `src/hooks/useMediaContent.ts`:**
    *   **Primary Discovery via Kind 1 Events:**
        *   The hook now primarily fetches general `Kind 1` events from all `followedAuthorPubkeys`.
        *   `processApplesauceEvent` was significantly updated to attempt to parse URLs for audio, images, AND videos directly from the `content` of these `Kind 1` events using new regexes (`IMAGE_URL_REGEX`, `VIDEO_URL_REGEX`) in addition to the existing `AUDIO_URL_REGEX`.
        *   A `mediaTypeHint` ('audio', 'image', 'video', 'unknown') is now added to the processed note.
    *   **Supplementary Fetching of Specific Kinds:**
        *   The hook continues to fetch specific `Kind 1063` (image) and `Kind 34235` (video) events as before, extracting URLs from their tags. These serve as a more explicit source of media.
    *   **Consolidated Event Processing:**
        *   The three separate `useEffect` hooks for processing podcasts, images, and videos have been replaced with a single, consolidated `useEffect` hook.
        *   This new hook gathers all events (from `fetchedGeneralKind1Events`, `fetchedImageEvents`, `fetchedVideoEvents`), processes them with the updated `processApplesauceEvent`.
        *   **Deduplication:** Implemented logic to deduplicate notes by event ID, with a basic prioritization (e.g., preferring a specific media kind event over a content-parsed Kind 1 event if both share an ID, or preferring a version with an extracted URL).
        *   **Categorization:** Notes are then filtered into `processedPodcastNotes`, `processedImageNotes`, and `processedVideoNotes` based on their `mediaTypeHint` and the presence of a valid `url`.
    *   **State Management & Filters:**
        *   State variables for podcast fetch limits/until (`podcastFetchLimit`, etc.) were renamed to `generalKind1FetchLimit`, etc.
        *   Filter construction (`mediaFilters`) was updated to create `generalKind1FiltersArray` for the broad Kind 1 fetch, while retaining specific filters for Kind 1063 and 34235.
*   **Rationale:** This approach aims to make the app more resilient in displaying some form of media by broadly scanning Kind 1 events, which are common, while still respecting dedicated media kinds for richer metadata and more explicit typing when available.
*   **Current Status:** The refactor of `useMediaContent.ts` with this new unified media discovery and processing strategy is complete.
*   **Next Steps:**
    1.  Thoroughly test the new media fetching and display logic:
        *   Do podcasts, images, and videos now appear from various authors?
        *   Is media correctly categorized?
        *   How well does the content-based URL extraction from Kind 1 events work?
        *   Is deduplication effective?
    2.  Analyze console logs from `useMediaContent.ts` to verify the flow.
    3.  Address any bugs or unexpected behavior arising from this new strategy.
    4.  Once media display is satisfactory, revisit placeholder chat functionality.

## 2024-07-26 (Current Session): Video Player Props & Linter Fix

*   **Goal:** Ensure `VideoPlayer.tsx` receives correct `src` and `authorPubkey` props.
*   **`useMediaState.ts` Changes:**
    *   Added `currentVideoNote: NostrNote | null` state.
    *   Modified `useEffect` for `currentItemUrl` to also set `currentVideoNote` in `videoPlayer` mode.
    *   Exposed `currentVideoNote` in the hook's return.
*   **`App.tsx` Changes:**
    *   Retrieved `currentVideoNote` from `useMediaState`.
    *   Passed `currentItemUrl` as `src` to `VideoPlayer`.
    *   Passed `currentVideoNote?.pubkey || null` as `authorPubkey` to `VideoPlayer`.
*   **Linter Error Fix (`App.tsx` / `ImageFeed.tsx`):
    *   Identified that `imageFeedRef`, `onNext`, and `onPrevious` props were passed to `ImageFeed` in `App.tsx` but not defined in `ImageFeed.tsx`'s `MediaFeedProps`.
    *   Removed these extraneous props from the `ImageFeed` invocation in `App.tsx`.
*   **Next Steps:**
    *   Test video player functionality.
    *   If videos don't display, debug `useMediaContent.ts` to ensure `shuffledVideoNotes` are populated.
    *   Address missing placeholder chat.
    *   Verify image feed navigation.

## 2025-05-07: Verifying TV Npub Curator Logic & RelayStatus Display

*   **Context Refinement:** Discussion clarified that the application intends to display content from authors *followed by* a predefined `TV_PUBKEY_NPUB` (curator pattern), as this TV Npub itself does not post content. This is documented in `docs/tv-app-architecture.md`.
*   **Relevant Architecture:** See `docs/tv-app-architecture.md` for details on the intended Kind 3 fetching logic in `App.tsx` and how `followedAuthorPubkeys` are derived.
*   **Current Content Fetching Status:** While `useMediaContent` receives 19 `followedAuthorPubkeys`, and successfully fetches some Kind 1 audio/images, no videos are appearing. This could be due to an incorrect list of `followedAuthorPubkeys` being generated (if the Kind 3 processing for `TV_PUBKEY_NPUB` in `App.tsx` is flawed) or because the actual followed authors don't post videos in a detectable way.
*   **UI Issue:** `RelayStatus.tsx` is reported as completely invisible. This component is crucial for accessing settings.
*   **Immediate Focus:**
    1.  **Verify `TV_PUBKEY_NPUB` & `App.tsx` Kind 3 Processing:**
        *   Confirm `TV_PUBKEY_NPUB` value in `src/constants.ts`.
        *   Review `App.tsx` logic for selecting the curator pubkey, fetching its Kind 3 list (`Queries.ContactsQuery`), and parsing this list into `followedAuthorPubkeys` for `useMediaContent`.
        *   Add logging in `App.tsx` to trace this data flow.
    2.  **Diagnose `RelayStatus.tsx` Invisibility:**
        *   Review how `RelayStatus` is rendered in `App.tsx`.
        *   Investigate how `relayCount` prop is derived (should now be based on `SimplePool` status).
    3.  **Analyze Video Content (Post-Verification):** Once the source of `followedAuthorPubkeys` is verified, re-assess why videos from those authors aren't appearing.

## 2025-05-08: Fixing Tag Loading, Verifying Video Sources, Restoring UI

*   **Context & Goal Refresher:** The app aims to display media from authors followed by `TV_PUBKEY_NPUB` (see `docs/tv-app-architecture.md`) AND from user-defined hashtags. This was largely functional with NDK. The current focus is on achieving parity and NIP-46 functionality with Applesauce. See `TVplanningcontext.md` for a summary of previous NDK state vs. current goals.
*   **Current Status - Data Flow:**
    *   `App.tsx` correctly fetches `TV_PUBKEY_NPUB`'s Kind 3 follow list and passes the 19 derived `followedAuthorPubkeys` to `useMediaContent`.
    *   `useAuth.ts` currently provides an empty `followedTags` array because IDB loading logic is commented out. This prevents tag-based content fetching.
*   **Current Status - UI:**
    *   `RelayStatus.tsx` is now temporarily visible after simplification; original styling needs to be restored with confirmed visibility.
    *   Settings Modal is reportedly missing functionality and shows empty tags (due to `useAuth.ts`).
*   **Current Status - Content:**
    *   Some audio/images are appearing via Kind 1 parsing from the 19 `followedAuthorPubkeys`.
    *   No videos are appearing. This is likely due to the 19 authors not posting detectable videos OR `followedTags` being empty.
*   **To-Do List:**
    1.  **Implement Tag Loading/Saving (IDB & `useAuth.ts`):
        *   Create `loadFollowedTagsFromDb` and `saveFollowedTagsToDb` in `src/utils/idb.ts`.
        *   Uncomment and integrate these functions into `src/hooks/useAuth.ts` to enable persistent hashtag following.
        *   Verify `followedTags` are passed to `useMediaContent` and that tag-based filters are attempted.
    2.  **Investigate Video Content Sources:**
        *   Manually inspect several of the 19 `followedAuthorPubkeys` (from `TV_PUBKEY_NPUB`'s list) on a Nostr client to see *if* and *how* they post videos (Kind 1 URLs, Kind 34235 events, etc.).
        *   Analyze `useMediaContent.ts` logs to see if it attempts to fetch/process events from these authors that *should* be videos.
        *   Refine `VIDEO_URL_REGEX` or Kind 34235 handling in `useMediaContent` if specific video formats from these authors are identified but missed.
    3.  **Restore `RelayStatus.tsx` Appearance:**
        *   Re-apply original styling (overlay button, etc.).
        *   Ensure default visibility (e.g., text color contrast, non-zero opacity for the gear icon by default).
    4.  **Address Settings Modal Functionality:** Systematically review and fix/re-implement missing features in `SettingsModal.tsx`, focusing on its interactions with `useAuth.ts` (tag management, NIP-46 initiation) and `useWallet.ts`.
    5.  **Verify Placeholder Chat Functionality.**
    6.  **(Longer Term) Robust Relay Status:** Improve `isReceivingData` and `connectedRelaysCount` in `App.tsx` for `RelayStatus.tsx` for more accurate feedback.