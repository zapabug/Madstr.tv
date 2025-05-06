## Madstr TV App - Planning (Applesauce Native)

**Overall Goal:** Create a robust, user-friendly TV application for browsing Nostr media content, fully leveraging the Applesauce toolkit for all Nostr-related functionality and adhering to the detailed functional requirements in `madstrtvSPEC.md`.

**Reference Documents:**
*   `madstrtvSPEC.md`: The canonical functional specification for the application.
*   `docs/tv-app-architecture.md`: Describes the Applesauce-based implementation approach for the features in `madstrtvSPEC.md`.
*   `BUILD.MD`: Tracks development progress and key decisions.

## Current State & Recent Milestones (as of 2025-05-06)

1.  **Functional Specification Established:** `madstrtvSPEC.md` has been created, capturing the detailed intended features, user experience, and operational logic for the application. This serves as the primary reference for *what* the app should do.
2.  **Architecture Aligned with Spec:** `docs/tv-app-architecture.md` has been significantly updated. It now details how the Madstr TV app, using the Applesauce toolkit, will implement the functional requirements outlined in `madstrtvSPEC.md`.
3.  **Core Refactoring to Applesauce:** The application has undergone a foundational refactor to use Applesauce for Nostr data management (`EventStore`, `QueryStore`, `Hooks.useStoreQuery`), signing (`applesauce-signers` via `useAuth`), and DM handling (`useWallet`).
4.  **Video Content Debugging (Ongoing):**
    *   Confirmed that the `VIDEO_URL_REGEX` in `useMediaContent` *should* match direct `.mp4` links.
    *   Identified that the current fetching strategy (low initial limits for Kind 1, Kind 1063, Kind 34235) might not be retrieving older video content or a sufficient volume of notes to match the experience defined in `madstrtvSPEC.md`.
    *   The `madstrtvSPEC.md` outlines a more sophisticated fetching and caching strategy (large initial fetch of general notes, resampling for display, specific batch sizes for images/videos, deduplication, sequential video play, preloading) that `useMediaContent` and `useMediaState` need to implement.

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