## Madstr TV App - Planning (Applesauce Native)

**Overall Goal:** Create a robust, user-friendly TV application for browsing Nostr media content, fully leveraging the Applesauce toolkit for all Nostr-related functionality and adhering to the detailed functional requirements in `madstrtvSPEC.md`.

**Reference Documents:**
*   `madstrtvSPEC.md`: The canonical functional specification for the application.
*   `docs/tv-app-architecture.md`: Describes the Applesauce-based implementation approach for the features in `madstrtvSPEC.md`.
*   `BUILD.MD`: Tracks development progress and key decisions.
*   `DIAGNOSTIC_NOTES.md`: Tracks temporary code changes during debugging sessions.

## Current Debugging Focus (Re-Render Loop in `App.tsx` - Session Paused)

**Summary of Investigation (Detailed in `DIAGNOSTIC_NOTES.md` - Part 2):
After extensive, systematic neutralization of hooks and state, the re-render loop in `App.tsx` was traced to a subtle interaction. The loop occurred when `App.tsx` called `useAuth()` AND `App.tsx`'s own `isLoadingContent` state logic was active. Neutralizing `App.tsx`'s `isLoadingContent` logic stabilized `App.tsx`, even when calling a progressively re-activated `useAuth.ts`.

**Current Phased Re-activation of `useAuth.ts` (App.tsx Stable):**
*   **Goal:** Ensure `useAuth.ts` can be fully re-activated internally without destabilizing the now-stable `App.tsx` (which has its `isLoadingContent` logic dummied).
*   **Progress:**
    1.  `loadAllSettings` `useEffect` (with all 3 `setState` calls) in `useAuth.ts`: **Re-activated. App Stable.**
    2.  `loadTags` `useEffect` (with `setState` call) in `useAuth.ts`: **Re-activated. App Stable.**
    3.  `Hooks.useQueryStore()` call in `useAuth.ts`: **Re-activated. App Stable.**
    4.  `useNip46AuthManagement()` call in `useAuth.ts`: **Re-activated. App Stable.**
    5.  Content of `initializeAuth` `async` function (within `useEffect`) in `useAuth.ts`: **Re-activated.**
        *   Initial calls to `setIsLoadingAuth` within `initializeAuth` and its `useEffect` conditions: **COMMENTED OUT.**
        *   Dependency array of `initializeAuth` `useEffect`: Temporarily changed to `[queryStore, activeSigner]` (from `[queryStore, activeSigner, restoreNip46Session]`) to test stability of `restoreNip46Session` callback.

*   **Current State (Awaiting Test Results for `initializeAuth` deps change):**
    *   **`src/App.tsx`:**
        *   `useState` for `loadingMessageIndex` & `isLoadingContent`, and `useEffect` for `setIsLoadingContent`: **COMMENTED OUT** (values static).
        *   `useAuth()` call: **ACTIVE**.
        *   All other `App.tsx` custom hooks, Applesauce data hooks, `setInterval` `useEffect`: Still **COMMENTED OUT / DUMMIED**.
        *   Data inputs (`rawContactsData`, `viewMode`): Still **HARDCODED**.
    *   **`src/hooks/useAuth.ts`:**
        *   `loadAllSettings` & `loadTags` `useEffect`s: **Active**.
        *   `Hooks.useQueryStore()` & `useNip46AuthManagement()`: **Active**.
        *   `initializeAuth` `async` function content: **Active**.
        *   `setIsLoadingAuth` calls related to `initializeAuth`: **Commented Out**.
        *   `initializeAuth` `useEffect` dependency array: **`[queryStore, activeSigner]`** (pending test results).
        *   `updateNpub` `useEffect` & `isLoadingAuth` fallback `useEffect`: Still **COMMENTED OUT / EMPTIED**.
        *   Return object of `useAuth`: Wrapped in `useMemo` with a full dependency list.
    *   **Calls to `useAuth()` in other components**: Still **COMMENTED OUT / DUMMIED**.

*   **Immediate Next Action (When Session Resumes):**
    1.  **Observe Console Logs:** With `initializeAuth` `useEffect` deps set to `[queryStore, activeSigner]`, check if `App.tsx` re-render loop is gone. Logs to monitor: `[App.tsx] Function body execution START` and `initializeAuth` internal logs.
    2.  **If Stable:** This points to `restoreNip46Session` callback from `useNip46AuthManagement` possibly being unstable. The next step would be to investigate `useNip46AuthManagement` to ensure `restoreNip46Session` is a stable `useCallback`. If it can be stabilized, restore it to `initializeAuth`'s dependency array.
    3.  **If Loop Persists (even with modified deps):** The issue is likely within the `initializeAuth` logic itself, specifically how `setActiveSigner` changes might be interacting with `App.tsx` re-renders, despite `useAuth`'s memoized return. Further isolation within `initializeAuth` would be needed (e.g., temporarily preventing `setActiveSigner` calls after successful load).
    4.  **Continue `useAuth.ts` Reactivation:** Once `initializeAuth` is stable, proceed to re-enable `updateNpub` `useEffect` and then `setIsLoadingAuth` calls.

*   **(Future Priorities - Post `useAuth.ts` Full Stability):**
    *   Cautiously re-activate `App.tsx`'s `isLoadingContent` `useState` and `useEffect`.
    *   Gradually re-activate other hooks/data sources in `App.tsx`.
    *   Re-activate `useAuth()` calls in `useWallet.ts`, `ImageFeed.tsx`, `SettingsModal.tsx`.
    *   Address the original `ContactsQuery` instability.

---
*Previous planning sections retained below for historical context.*

## Current State & Recent Milestones (as of 2024-05-XX - Debugging Session)

1.  **Functional Specification & Architecture:** Established (`madstrtvSPEC.md`, `docs/tv-app-architecture.md`).
2.  **Core Refactoring to Applesauce:** Completed for data, signing, DMs.
3.  **"Maximum Update Depth Exceeded" Debugging (Ongoing -> Breakthrough!):**
    *   **Initial Symptoms:** Application unusable due to a persistent re-render loop, manifesting as a "crazy carousel" for images and errors in `App.tsx` and child components like `ImageFeed.tsx` and `SettingsModal.tsx`.
    *   **Extensive Diagnostic Steps Undertaken (see `DIAGNOSTIC_NOTES.md` for details):
        *   Stabilization attempts for props and state within `useMediaContent`, `useMediaState` using `JSON.stringify`.
        *   Scoped `useEffect` dependencies in various hooks.
        *   Systematic bypass/hardcoding of `useAuth` outputs in `App.tsx`.
        *   Systematic bypass/hardcoding of `ImageFeed` props in `App.tsx`.
        *   Systematic bypass/hardcoding of `viewMode` in `App.tsx`.
        *   Temporary removal of `framer-motion` components around `ImageFeed`.
        *   Temporary disabling of `useAuth` and `useWallet` via internal flags.
    *   **BREAKTHROUGH FINDING:** The "Maximum update depth exceeded" loop was **resolved** when the `Hooks.useStoreQuery(Queries.ContactsQuery, ...)` call in `App.tsx` (used to fetch the follow list for `pubkeyToFetchFollowsFor`) was completely bypassed (by hardcoding `rawContactsData = null;`). This occurred even with `useAuth` and `useWallet` fully re-enabled. This strongly indicates an issue with `Hooks.useStoreQuery(Queries.ContactsQuery, ...)` or its underlying observable causing excessive re-renders of `App.tsx`.

## Next Steps & Priorities (Revised after Loop Resolution):

*   **(HIGHEST PRIORITY) Investigate and Stabilize `ContactsQuery` in `App.tsx`:**
    *   **Goal:** Understand why `Hooks.useStoreQuery(Queries.ContactsQuery, ...)` triggers a re-render loop in `App.tsx` and implement a stable way to consume this data.
    *   **Actions:**
        1.  Restore the `Hooks.useStoreQuery(Queries.ContactsQuery, ...)` call in `App.tsx`.
        2.  Add detailed logging for `rawContactsData` to observe its reference and content changes upon app start and when `pubkeyToFetchFollowsFor` (derived from `isLoggedIn` and `currentUserNpub` from `useAuth`) changes.
        3.  If `rawContactsData` shows frequent reference changes for identical content, this confirms the instability with `useStoreQuery`'s output for this specific query.
        4.  **Explore Solutions:**
            *   **Option A (Preferred if feasible):** Manually subscribe to the contacts data observable (e.g., via `eventStore.contacts(pubkey)` or similar in Applesauce) within a `useEffect` in `App.tsx`. This allows for manual control over `setState` for `contactsData`, enabling deeper comparisons or custom stabilization logic.
            *   **Option B (Wrapper):** Create a custom hook that wraps `Hooks.useStoreQuery(Queries.ContactsQuery, ...)`, implementing more aggressive memoization or stabilization for the returned `contactsData` (e.g., deep equality check before returning a new reference).
            *   **Option C (Applesauce Issue):** If the problem lies deep within `useStoreQuery` or the `ContactsQuery` observable itself, document this for potential upstream reporting/fixing.

*   **(Medium Priority) Gradual Reversion of Diagnostics & System Stability Checks:**
    *   Once `contactsData` in `App.tsx` is stable and the main loop is confirmed gone:
        1.  Restore `ImageFeed` props in `App.tsx` (remove hardcoding of `imageNotes` and `currentImageIndex`). *Test stability.*
        2.  Restore dynamic `viewMode` in `App.tsx` (remove hardcoding, use value from `useMediaState`). *Test stability.*
        3.  Restore `framer-motion` components (`AnimatePresence`, `motion.div`) around `ImageFeed` in `App.tsx`. *Test stability.*
        4.  Restore `motion.img` and its `AnimatePresence` wrapper within `ImageFeed.tsx`. *Test stability.*
        5.  Re-enable tipping logic in `ImageFeed.tsx`. *Test stability.*
    *   At each step, verify that the UI behaves as expected (carousel, video playback, etc.) and no new loops are introduced.

*   **(Medium Priority) Verify Full Media Content Flow:**
    *   Once `contactsData` is stable and provides `followedAuthorPubkeys`, ensure `useMediaContent` correctly fetches and processes media (images, videos, podcasts) from these authors and any followed tags.
    *   Ensure `useMediaState` correctly manages and displays this content.
    *   Test all features outlined in `madstrtvSPEC.md` related to media fetching, display, and playback. Playback for videos and podcasts needs to be re-verified.

*   **(Lower Priority) Address Linter Errors & Code Cleanup:**
    *   Resolve any outstanding linter errors (e.g., related to `viewMode` comparisons once it's dynamic).
    *   Remove all diagnostic code, console logs, and comments added during this debugging session (refer to `DIAGNOSTIC_NOTES.md`).

*   **(Lower Priority) Review `useAuth` & `useWallet` for General Stability:**
    *   Even though they weren't the primary cause of *this* loop, review their internal `useEffect` dependencies and state management for any potential instabilities or areas for improvement, especially regarding how they interact with `EventStore` or `QueryStore` subscriptions.

**Old `Planning.md` content related to `madstrtvSPEC.md` feature implementation (video handling, settings modal) remains relevant once core stability is fully restored.**

## Interaction 15: 2024-07-22 (Infinite Loop Persists - Focus Shifts to useMediaContent)

## Session Ending 2024-07-27 (Approx.)

*   **(Ongoing) UI/UX Refinements & Bug Fixes:**
    *   Address any outstanding UI issues (e.g., `RelayStatus.tsx` appearance, full functionality of `SettingsModal.tsx`).
    *   Continue refining features to align with `madstrtvSPEC.md`.

## Interaction 16: 2025-05-12 (Debugging "Maximum Update Depth Exceeded" & Carousel Loop)

*   **Initial State:** Application loading but quickly running into runtime errors.
*   **Error 1: `imageNotes is undefined` in `ImageFeed.tsx`**
    *   **Action:** Further refined `currentImageNote` derivation in `ImageFeed.tsx` for safety against `undefined` `imageNotes` prop during initial renders. Added checks to scroll `useEffect`.
    *   **Result:** Error resolved.
*   **Error 2: `hookInstanceId is not defined` in `useMediaContent.ts`** (after adding extensive diagnostic logging to this hook).
    *   **Action:** Changed `hookInstanceId` definition from `useMemo` to `useRef` for more explicit and stable instantiation within `useMediaContent.ts`.
    *   **Result:** Error resolved.
*   **Persistent Error 3: "Maximum update depth exceeded"**
    *   **Symptoms:** Console error with stack trace pointing to `ImageFeed.tsx` and `App.tsx`. UI shows images, but the image carousel flips through them extremely rapidly ("crazy carousel").
    *   **Diagnostic Steps & Iterative Fixes:**
        1.  **Isolate `ImageFeed` local state:** Temporarily disabled tipping logic (`canTip`, `handleTip`) in `ImageFeed.tsx` to remove `useAuth` and `useWallet` as direct dependencies for local state setters. Loop persisted, indicating the issue was likely from props or higher-order effects.
        2.  **Isolate `App.tsx` `isLoadingContent`:** Modified the `useEffect` in `App.tsx` responsible for `setIsLoadingContent` to only change the state once `contactsData` becomes defined. Loop persisted.
        3.  **Correct Linter Error in `App.tsx`:** Fixed destructuring from `useMediaState` (was `imageNotes`, should be `imageNotesForDisplay`) and updated usages.
        4.  **Stabilize `useMediaContent` output arrays:** Added `JSON.stringify` checks in the `useEffect` hooks that call `setShuffledImageNotes` and `setShuffledVideoNotes` to ensure these state setters are only called if the stringified content of the new arrays differs from the current state. This aimed to stabilize the references of `shuffledImageNotes` and `shuffledVideoNotes` returned by `useMediaContent`.
        5.  **Stabilize `useMediaState` display batch arrays:** Added `JSON.stringify` checks in `useMediaState.ts` before calling `setImageNotesForDisplay` (in `generateNewImageDisplayBatch`) and `setVideoNotesForDisplay` (in its init effect) to prevent new references if the content of these display batches hasn't changed.
*   **Current Status & Key Insight:**
    *   Images are now displaying, which is a positive sign that data is flowing to some extent.
    *   The "Maximum update depth exceeded" error and the "crazy carousel" persist.
    *   The rapid carousel behavior strongly suggests that `onTick` prop (`handleNext` function from `useMediaState`) passed to `useImageCarousel` in `App.tsx` is being called excessively or the carousel's interval is constantly resetting due to unstable prop references (especially `onTick`).
    *   The instability likely originates from `handleNext` in `useMediaState.ts` getting a new reference frequently due to its dependencies (`imageNotesForDisplay`, `videoNotesForDisplay`) changing reference, even if our latest `JSON.stringify` fixes in `useMediaState` aimed to mitigate this for the display arrays themselves.

### Next Steps & Priorities (Revised):
*   **(Highest Priority) Resolve "Maximum Update Depth Exceeded" & Crazy Carousel:**
    *   **Investigate `useImageCarousel`:** Confirm its internal logic (how it uses `onTick`, how its interval is managed, and what dependencies its internal `useEffect` has). If it's a simple interval, the instability of the `onTick` prop is the most likely cause.
    *   **Further Stabilize `handleNext` in `useMediaState.ts`:** Examine all dependencies of the `handleNext` `useCallback`. Ensure that any state arrays it depends on (`imageNotesForDisplay`, `videoNotesForDisplay`) are as reference-stable as possible. The `JSON.stringify` checks on their setters should help, but if `fullImageCache` (prop from `useMediaContent`) changes reference frequently, it will still trigger updates to these display arrays.
    *   **Verify `isPlaying` stability:** The `isActive` prop of `useImageCarousel` depends on `isPlaying` from `useMediaElementPlayback`. If `isPlaying` is unstable, it could also toggle the carousel rapidly. Check the dependencies of `useMediaElementPlayback` and ensure its outputs are stable.
    *   **Consider `useCallback` for `onTick` in `App.tsx`:** While it might not solve the root cause if `handleNext` from `useMediaState` is already unstable, wrapping the `handleNext` function in another `useCallback` within `App.tsx` before passing it to `useImageCarousel` could be a diagnostic step or minor improvement if `App.tsx` itself re-renders for other reasons.
*   **(Medium Priority) Verify Podcast and Video Playback:** Once the rendering loop is fixed and the UI is stable.
*   **(Medium Priority) Review `useWallet` re-initializations:** Address the user's earlier concern about `stopDepositListener` being called frequently, which might indicate `useWallet` itself is unstable or being re-instantiated.
*   **(Lower Priority) Continue with `madstrtvSPEC.md` feature implementation:** Only after core stability is achieved. Address the video content handling and playlist management features from `madstrtvSPEC.md` and `Planning.md` (Interactions 1-15 focus).

## Next Steps & Priorities

**High Priority: Implement Video Content Handling as per `madstrtvSPEC.md`**

1.  **Refactor `useMediaContent` Fetching Strategy:**
    *   **Goal:** Align fetching with `madstrtvSPEC.md` (large initial Kind 1 fetch, appropriate batching for specific kinds based on authors/tags and enabled toggles).
    *   **Tasks:**
        *   Modify `useMediaContent` to perform a larger initial fetch for general Kind 1 notes (e.g., 500-1000 as suggested in spec, or a configurable amount) to build a substantial internal cache of `processedPodcastNotes`, `processedImageNotes`, `processedVideoNotes`.
        *   Implement fetching for Kind 1063 (images) and Kind 34235 (videos) considering `fetchImagesByTagEnabled` / `fetchVideosByTagEnabled` flags from `useAuth`, and respecting batch sizes specified in `madstrtvSPEC.md` (e.g., 30 images/source, 15 videos/source).
        *   Ensure results from these queries are correctly processed by `processApplesauceEvent` and merged into the respective internal caches.

2.  **Implement `useMediaContent` Deduplication & Sorting for Videos:**
    *   **Goal:** Videos displayed sequentially, deduplicated by URL (newest kept).
    *   **Task:** Within `useMediaContent`, after all video notes are collected (from Kind 1 parsing and Kind 34235 fetches), deduplicate them by `url`, keeping the event with the latest `created_at`. Then, sort the unique video notes by `created_at` in descending order (newest first) before storing in `internalAllVideoNotes` (or similar).

3.  **Refactor `useMediaState` for Advanced Playlist Management (Images & Videos):**
    *   **Goal:** Implement the "infinite feel" from cached content, specific display batching, video preloading, and continuous play as per `madstrtvSPEC.md`.
    *   **Tasks for Images:**
        *   `useMediaState` should request an initial display batch of random images (e.g., 30) from `useMediaContent`'s internal image cache.
        *   `handleNext` for images should cycle through this display batch. When at the end, it should request a *new random batch* from `useMediaContent`'s cache.
        *   Only when `useMediaContent` signals its internal cache is exhausted for new random batches (or a threshold is met) should `fetchOlderImagesFromRelays` be called.
    *   **Tasks for Videos:**
        *   `useMediaState` should request an initial display batch of sequential videos (e.g., 15) from `useMediaContent`'s sorted internal video cache.
        *   `handleNext` for videos cycles through this display batch.
        *   Implement logic to request more videos from `useMediaContent`'s cache to extend the display playlist *before* the current display batch runs out (maintaining the `madstrtvSPEC.md` display limit of e.g. 15 visible at a time but loading more into its local state).
        *   Determine `preloadVideoUrl` for the *actual next* video in the sequence for `useMediaElementPlayback`.
        *   Trigger continuous playback via `useMediaElementPlayback`.

4.  **Update `useMediaElementPlayback` for Preloading & Continuous Play:**
    *   **Goal:** Seamless video experience.
    *   **Task:** Ensure it correctly uses `preloadVideoUrl` (passed from `useMediaState`) to load the next video into a hidden element and handles the `onEnded` event to switch to and play the preloaded video.

**Medium Priority: UI & Feature Enhancements from `madstrtvSPEC.md`**

1.  **SettingsModal Enhancements:**
    *   Verify implementation of independent toggles for image/video fetching by tag (`fetchImagesByTagEnabled`, `fetchVideosByTagEnabled` in `useAuth`).
    *   Verify implementation of setting the default tip amount (`defaultTipAmount` in `useAuth`).
    *   Implement the "Tip Devs" button functionality.

2.  **Wallet Logout Backup Flow:**
    *   Ensure the mandatory wallet backup step on logout (QR display for 45s if balance > 0) is fully implemented in `useAuth` and `