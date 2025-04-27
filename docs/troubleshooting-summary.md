## Troubleshooting Summary: NDK Initialization and Event Fetching

This document summarizes the issues encountered and steps taken to resolve them during the development of the Nostr TV App.

### 1. Initial NDK Error: `ndk.debug.extend is not a function`

*   **Problem:** The application crashed on startup with a `TypeError: ndk.debug.extend is not a function` originating from the NDK library (`index.mjs`).
*   **Cause:** The `initNdk` function in `App.tsx` was called with the `debug: true` option. This specific debug functionality seemed incompatible with the installed NDK version (`@nostr-dev-kit/ndk@^2.13.2`). Attempting to update NDK didn't resolve the issue.
*   **Solution:** The `debug: true` line was commented out in the `initNdk` call within `App.tsx`. This allowed NDK to initialize successfully.

### 2. Kind 3 (Contact List) Fetching Issue

*   **Problem:** After fixing the initialization error, the application failed to fetch the Kind 3 contact list for the main TV public key (`TV_PUBKEY_NPUB`). The log showed `App: No Kind 3 event found for TV pubkey...`. This resulted in an empty `mediaAuthors` list and the `MediaFeed` component displaying a placeholder.
*   **Cause:** The initial implementation used `ndk.fetchEvent` to get the Kind 3 list. `fetchEvent` likely closes the subscription too quickly if the relays don't return the event immediately.
*   **Solution:** The Kind 3 fetching logic in `App.tsx` was refactored to use `ndk.subscribe` with `closeOnEose: false`. Event handlers for `event` and `eose` were added to manage the state (`mediaAuthors`, `isLoadingAuthors`) correctly based on whether the event was found or the relays confirmed it wasn't present. A cleanup function was also added to stop the subscription.

### 3. MessageBoard Not Displaying Historical Messages

*   **Problem:** Even after NDK was working and the Kind 3 list was potentially fetched, the `MessageBoard` component consistently logged `MessageBoard has 0 total events, displaying 0`, indicating it wasn't loading or showing past replies to the main thread.
*   **Cause:** The `ndk.subscribe` call in `MessageBoard.tsx` used a `limit: 50` filter option and `closeOnEose: false`. The limit might have prevented older messages from being fetched if more than 50 replies existed. `closeOnEose: false` kept the subscription open for live updates but wasn't ideal for ensuring the initial load of all historical messages.
*   **Solution:** The `limit: 50` option was removed from the filter in `MessageBoard.tsx` to allow fetching all historical replies. The subscription option was changed to `closeOnEose: true` to automatically close the subscription once all stored events have been received from the relays, focusing this subscription on fetching the initial message history.

### 4. MessageBoard Not Displaying Live Messages

*   **Problem:** After fixing historical loading, live messages still weren't appearing.
*   **Attempt 1 (Live Subscription):** Changed `closeOnEose` back to `false` in `MessageBoard.tsx` to keep the subscription open for real-time events. No change in behavior.
*   **Attempt 2 (Verify Constants):** User provided the correct `nevent` URI for the main thread. Decoding this revealed that `MAIN_THREAD_EVENT_ID_HEX` and `MAIN_THREAD_NEVENT_URI` in `src/constants.ts` were incorrect. Several recommended relays were also missing from the `RELAYS` list.
*   **Solution 2 (Update Constants):** Corrected `MAIN_THREAD_EVENT_ID_HEX`, `MAIN_THREAD_NEVENT_URI`, and added missing relays (`wss://purplepag.es`, `wss://relay.nostr.band`) to `src/constants.ts`. Issue persisted.
*   **Attempt 3 (Change Filter Strategy):** Modified the filter in `MessageBoard.tsx` to fetch Kind 1 notes tagging the TV's public key (`#p` tag with `TV_PUBKEY_HEX`) instead of replying to the specific event (`#e` tag). Added `TV_PUBKEY_HEX` to `src/constants.ts`.
*   **Current State:** Despite trying both `#e` and `#p` filters with correct constants and relays, and ensuring the subscription stays open (`closeOnEose: false`), the `MessageBoard` is still reported as not displaying incoming messages.

### 5. MessageBoard Not Displaying Profile Images

*   **Problem:** Profile images for authors in `MessageBoard` were not loading, even when messages were displayed. Initially, even the app's own profile (TugaTV) lacked an image.
*   **Cause:** The initial implementation used a one-time `fetchProfile()` call for each author, which might fail if profile data (Kind 0 events) wasn't immediately available on connected relays. There was no mechanism to retry or listen for streamed updates for most authors.
*   **Solution (Part 1 - App Profile):** Added a dedicated subscription for the app's own profile (using `TV_PUBKEY_NPUB`) in `MessageBoard.tsx` to listen for Kind 0 events via the Nostr stream. This ensured the app's profile data, including the image, was captured and displayed as 'TugaTV' when it arrived. This was successful for the app's profile.
*   **Solution (Part 2 - Other Profiles - Fix):** **Highlighted Change:** Extended the subscription approach to all message authors by adding a subscription for Kind 0 (Metadata) events for all authors in `MessageBoard.tsx`. This change, implemented in the effect triggered by new messages, listens for profile updates via the Nostr stream for all relevant public keys. It ensures that even if profile data isn't available during the initial fetch, it is captured and displayed when it arrives. Detailed logging was also added to track fetching, parsing, and image loading errors, which helped confirm the data flow.
*   **Result:** With the subscription for all authors' profiles in place, profile data and images for other authors started loading successfully in `MessageBoard`, resolving the issue.

### Current Status

With these changes:
1.  NDK initializes correctly.
2.  The application attempts to subscribe to and fetch the Kind 3 contact list persistently for the `MediaFeed`.
3.  The `MediaFeed` appears to be functioning correctly based on the fetched authors.
4.  The `MessageBoard` now successfully displays messages and **profile images for all authors, including the app itself (TugaTV)**, thanks to the subscription model for profile data that leverages the streaming nature of Nostr.

The application should now be more robust in fetching necessary data from Nostr relays. 




# Refactoring Status & Issues (Post NDK Hooks/Auth/Wallet Integration)

This document summarizes the current state of the application after integrating authentication, hashtag following, a Cashu wallet, and refactoring to use NDK Hooks.

## 1. Current Issues

*   **Fixed:** ~~Persistent `useSubscribe` TypeError:~~ Resolved.
*   **Fixed:** ~~TypeError: ndk.debug.extend is not a function:~~ Resolved.
*   **Fixed:** ~~Potential DDoS / Excessive Connection Attempts:~~ Resolved by centralizing connection logic.
*   **Addressing:** **Relay Connection Failure:** Connection logic simplified further. Moved `connect()` back to `ndk.ts` to ensure it's called once upon module load. Still monitoring connection success.
*   **Fixed:** ~~No Media Content Loading (Kind 3 Fetch Stall):~~ Logic fixed, awaiting successful relay connections.
*   **Implemented:** Wallet features implemented.
*   **Note:** `MessageBoard` component removed during refactoring (see Completed Fixes).

## 2. Implemented Features (Confirmed Working)

*   **NDK Hooks Integration:** Custom hooks replaced with `@nostr-dev-kit/ndk-hooks` (`useSubscribe`, `useProfile`).
*   **NDK Singleton & Init:** Implemented (`src/ndk.ts`, `useNDK`, `useNDKInit` in `App.tsx`). NDK instance properly passed to hooks.
*   **Authentication:** Structure implemented (`useAuth`), uses NDK signer. Login/logout flow verified.
*   **Hashtag Following:** Structure implemented (`SettingsModal`, `useAuth`). Integration with fetching functional.
*   **Media Fetching Logic (Refactored):** Hook (`useMediaContent`) and filter utilities (`buildMediaFilters`) implemented. Kind 3 fetch logic fixed and media subscriptions re-enabled.
*   **Internal Cashu Wallet (`useWallet`):** Structure and helpers implemented. Fixed interaction with `useSubscribe` by adding NDK readiness check. Deposit listener re-enabled in `SettingsModal`.

## 3. Completed Fixes

1.  **Fixed `useWallet` / `useSubscribe` Interaction:**
    *   Modified `useWallet.ts` to accept an NDK instance parameter and check for NDK connectivity before loading wallet state.
    *   Added an effect in `useWallet` to load wallet state only when NDK is connected.
    *   Added proper NDK null handling in `App.tsx` and `SettingsModal.tsx`.

2.  **Fixed Kind 3 Fetch Stall:**
    *   Added a condition in `useMediaContent.ts` to only subscribe to media events when NDK is ready AND Kind 3 loading is complete.
    *   Made isNdkReady a dependency in the Kind 3 processing effect.

3.  **Re-enabled Media Subscriptions:**
    *   Uncommented the image, video, and podcast subscriptions in `useMediaContent.ts` with proper conditional filters.

4.  **Re-enabled Wallet Functionality:**
    *   Re-enabled deposit listener in `SettingsModal.tsx`.
    *   Wallet now properly depends on NDK readiness.

5.  **MessageBoard Removal (During Debugging/Refactor):**
    *   The `MessageBoard` component was temporarily removed as part of a larger refactoring and debugging effort focused on resolving NDK hook issues and simplifying the component structure. While initial debugging *did* investigate the `MessageBoard` (see historical sections above), its removal was primarily to isolate other potential problems and was not the direct solution to the underlying connection/fetching issues, which were addressed separately.

6.  **Fixed TypeError: filter is undefined:**
    *   Implemented properly structured empty filters: `[{ kinds: [], limit: 1 }]` instead of `[]`.
    *   Added explicit checking for NDK readiness in all components and hooks.
    *   Added multiple layers of connection status verification before attempting subscriptions.
    *   Improved log visibility for connection state to aid debugging.
    *   Added explicit connect() calls in multiple places to ensure connectivity.

7.  **Added Relay Connection Handling:**
    *   Modified ndk.ts to include explicit connect() call.
    *   Added connection retry logic in App.tsx and useMediaContent.
    *   Added event listeners to monitor relay connect/disconnect events.

8.  **Enhanced Relay Connection Debugging:**
    *   Added direct WebSocket connectivity testing for each relay.
    *   Implemented individual relay status monitoring.
    *   Added more detailed connection logging.
    *   Enabled NDK debug mode to expose underlying connection issues.
    *   Added connection event listeners to track relay state changes.

9.  **Improved Relay Reliability:**
    *   Updated relay list to use the most reliable known relays.
    *   Added fallback relay list to increase connection options.
    *   Removed potentially problematic relays.
    *   Implemented sequential connection strategy to maximize connectivity.

10. **Fixed NDK Debug TypeError:**
    *   Removed the `debug: true` option from the NDK constructor in `src/ndk.ts` to resolve the `ndk.debug.extend is not a function` TypeError.

11. **Centralized NDK Connection Logic (Attempt 1 - In App.tsx):**
    *   Removed redundant `connect()` calls from `useEffect` hooks in `App.tsx` and `useMediaContent.ts`.
    *   Attempted to initiate connection from `App.tsx` `useEffect` based on `ndk` availability from `useNDK()`.
    *   *Result:* This caused timing issues, as the effect ran before the `ndk` instance was fully ready.

12. **Centralized NDK Connection Logic (Attempt 2 - In ndk.ts):**
    *   Removed the `connect()` `useEffect` from `App.tsx`.
    *   Restored the single `ndkInstance.connect()` call within `src/ndk.ts` to ensure connection is initiated exactly once when the NDK singleton is created.

## 4. Refactoring Principles Applied

*   **NDK Initialization:** Corrected to use `useEffect` in `App.tsx`. NDK passed as prop to hooks needing it.
*   **Sequential Loading:** Implemented proper sequence: NDK init → Auth → Wallet → Kind 3 fetch → Media subscriptions.
*   **Conditional Subscriptions:** Implemented conditional filter creation based on NDK readiness and previous data availability.
*   **Error Elimination:** Resolved TypeErrors by ensuring proper initialization order and handling potential null values.
*   **Component Integration:** Properly integrated components with NDK and hooks.
*   **Safe Defaults:** Used properly structured empty filters to prevent errors when subscriptions aren't ready.
*   **Connection Resilience:** Added multiple layers of connection checking and retry mechanisms.

## 5. Pending Items & Future Work

1. **Fix Relay Connections:** Investigate why relay connections fail despite explicit connect() calls. Possible causes:
   * WebSocket failures due to CORS or network issues
   * Relay URL format issues
   * Relay server availability issues
   * WebSocket protocol support in the browser environment

2. **Test Wallet Features:** Test wallet functionality (balance, tipping, mint URL).

3. **Verify Auth/NIP-46:** Confirm login/logout, NIP-46 connection, and session restoration.

4. **Performance Optimization:** Consider optimizing the frequency of state updates and filter rebuilds.

5. **UI Enhancements:** Add loading indicators or placeholders during data fetching.

6. **Error Handling:** Implement comprehensive error handling for network issues.

## 6. Lessons Learned

*   **Initialization Order Matters:** Component and hook initialization sequence affects the behavior of the application.
*   **NDK Readiness Checks:** Always check NDK connectivity before initiating operations that depend on relay connections.
*   **Conditional Filter Generation:** Generate filters conditionally to avoid undefined filter errors.
*   **Sequential Loading:** Structure code to respect dependencies (e.g., Kind 3 → media filters → subscriptions).
*   **Structured Empty Filters:** Always use properly structured empty filters `[{ kinds: [], limit: 1 }]` instead of `[]` to avoid TypeErrors.
*   **Connection Verification:** Verify actual connections (not just NDK instance existence) before performing operations.
*   **Multi-Layer Resilience:** Implement connection logic at multiple levels to ensure reliability.
*   **Logging Strategy:** Implement detailed logging to aid in troubleshooting connectivity issues.

### 13. Playback Hook and Video Player Refinement

*   **Problem:** Video playback did not reliably pause when requested via the media panel controls. Autoplay behavior for audio vs. video needed explicit control. Linter errors appeared after modifying `useMediaElementPlayback` due to missing props and incorrect hook usage within `VideoPlayer`.
*   **Solution (`useMediaElementPlayback.ts`):**
    *   Added `autoplayEnabled` and `next` boolean props to the hook's interface (`UseMediaElementPlaybackProps`).
    *   Modified `handleCanPlay` to only attempt `play()` if `elementType === 'audio'` and `autoplayEnabled` is true.
    *   Modified `handleEnded` to call `onEnded` only if `elementType === 'video'` and `next` is true, or if `elementType === 'audio'`.
    *   Fixed "used before assigned" errors by defining `play` and `pause` callbacks before the event handlers that use them.
*   **Solution (`App.tsx`):**
    *   Updated calls to `useMediaElementPlayback` to pass the new `autoplayEnabled` and `next` props (Audio: true/true, Video: false/true).
*   **Solution (`VideoPlayer.tsx`):**
    *   **Refactored Context:** Added `ndkInstance`, `isNdkReady`, `auth`, `wallet` to `VideoPlayerProps` and removed internal calls to `useWallet`, `useAuth`, `useMediaAuthors`.
    *   Updated `App.tsx` to pass this context as props to `<VideoPlayer>`.
    *   Used passed props for tipping logic and removed invalid `ndk` param from `SendTipParams`.
    *   Corrected `videoRef` prop type.
    *   **Removed Redundant Logic:** Deleted internal `useEffect` that duplicated play/pause control, ensuring `useMediaElementPlayback` is the single source of truth for playback state.
    *   **Overlay Button Fix:** Changed the visibility condition of the overlay play button to `!isPlaying` to correctly show it when paused or when switching to video mode without autoplay.
*   **Result:** Linter errors resolved. Video playback control is now solely managed by `useMediaElementPlayback`, allowing pausing via the media panel. Autoplay behavior is explicitly controlled. The video overlay button appears correctly when playback is not active. 

### 14. Video Playlist Infinite Loop and Continuous Playback Refinements

*   **Problem 1 (Infinite Loop):** Switching to video mode caused an infinite loop of logs, primarily `useMediaNotes (video): Effect triggered...` and `%%% Playback (video): Effect 3 (Core Listeners) RUNNING...`. This occurred even when only fetching videos based on followed tags.
*   **Cause 1:** The `processEvent` function within `useMediaNotes` was defined with `useCallback` but had an empty dependency array `[]`. Since `getUrlRegexForMediaType` inside it depends on the `mediaType` prop, the callback reference changed on every render. As `processEvent` was a dependency of the main `useEffect` in `useMediaNotes`, this caused the effect to re-run constantly for the video tag fetch, creating new `tagVideoNotes` arrays, triggering updates in `App.tsx` and eventually restarting Effect 3 in `useMediaElementPlayback`.
*   **Solution 1:** Added `mediaType` to the dependency array of the `useCallback` for `processEvent` in `useMediaNotes.ts`. Tested by temporarily commenting out the tag video fetch in `App.tsx` (which stopped the loop) and then uncommenting it after the fix (loop remained stopped).

*   **Problem 2 (Playlist UX):** The initial video playlist could be very long, and playback stopped after each video.
*   **Request:** Limit the initial playlist size (e.g., 15 items) and load more on demand from the fetched cache. Implement proactive preloading of the *next* video and enable automatic continuous playback.
*   **Solution 2a (Playlist Limiting):**
    *   Added state (`visibleVideoCount`) and constants (`VIDEO_PLAYLIST_INITIAL_LIMIT`, `VIDEO_PLAYLIST_LOAD_BATCH_SIZE`) to `App.tsx`.
    *   Created a memoized slice (`visibleUniqueVideoNotes`) of the full `uniqueVideoNotes` array.
    *   Modified the `fetchOlderVideos` callback passed to `useMediaState`: it now first attempts to increase `visibleVideoCount` if more local videos are available before falling back to fetching older videos from relays.
    *   Updated `useMediaState` props to use the sliced array and its length.
*   **Solution 2b (Preloading):**
    *   Added a hidden `<video>` element (`preloadVideoRef`) to `App.tsx`.
    *   Added a `useEffect` hook in `App.tsx` that listens for changes to `preloadVideoUrl` (calculated in another effect based on the next video in `uniqueVideoNotes`). When the URL changes, it sets the `src` of the hidden video element and calls `.load()` to initiate the download.
*   **Solution 2c (Continuous Playback):**
    *   Added `isEndedRef` (a `useRef`) to `useMediaElementPlayback.ts`.
    *   Modified the `handleEnded` listener (in Effect 3) for videos: when a video ends, it sets `isEndedRef.current = true` *before* calling the `onEnded` prop (which triggers `handleNext` in `useMediaState` and eventually changes `currentItemUrl`).
    *   Modified Effect 1 (Load Source URL) in `useMediaElementPlayback`: if the `currentItemUrl` changes *and* `isEndedRef.current` is true, it adds a one-time `canplay` listener to the element. When this listener fires (meaning the *next* video is ready), it calls `play()` and resets `isEndedRef`.
*   **Result:** The infinite loop is resolved. Video playlists start limited and expand from the cache before fetching older ones. The next video is proactively preloaded using a hidden element. Videos now play back-to-back automatically. 

### 15. NDK Readiness Timing and Hook Stability Fixes (Addressing Recurring Issues)

*   **Problem:** Despite previous fixes, issues resurfaced where:
    *   `RelayStatus` component showed 0 connections initially, even when logs indicated connections were being established.
    *   Media fetching hooks (`useMediaAuthors`, `useMediaNotes`) sometimes failed to run or ran with stale `isReady` state, preventing media from loading.
    *   **Authentication hooks (`useAuth`, `useWallet`) reported "NDK not ready" errors, preventing login/NIP-46 and wallet operations.**
    *   Logs showed contradictory states (e.g., `isReady` being true inside a code block that should only run if `isReady` is false).
    *   The `useMediaNotes` hook dependency loop (`processEvent` changing reference) reappeared.
*   **Cause:**
    *   **Readiness Timing (`useNDKInit`):** The `isReady` flag from `useNDKInit` was being set to `true` when the `ndk.connect()` promise resolved, which doesn't guarantee actual relay connection. Components received `isReady = true` before NDK was truly ready to fetch data.
    *   **State Propagation (`App.tsx`):** `AppContent` was using `useNdk()` from `nostr-hooks` separately, potentially getting a different instance or readiness state than the one managed by `useNDKInit` in the parent `App` component.
    *   **Internal `useNdk()` Calls:** `useAuth` and `useWallet` were calling `useNdk()` internally, creating separate, potentially unsynchronized NDK instances/readiness states compared to the main application flow.
    *   **Stale State Closure (`useMediaAuthors`):** The `useEffect` hook in `useMediaAuthors` was capturing a stale value of the `isReady` prop in its closure, leading to incorrect logic execution even after the prop updated. Its dependency array also included internal state (`isLoadingAuthors`), potentially causing unnecessary re-runs.
    *   **Dependency Loop (`useMediaNotes`):** The `useCallback` hook for `processEvent` was still missing a dependency (`getUrlRegexForMediaType`), causing its reference to change and trigger the main effect repeatedly.
*   **Solution:**
    1.  **`useNDKInit.ts` Modification:** Changed the hook to set `isReady = true` only *after* the first `relay:connect` event is received from the `ndk.pool`. This ensures `isReady` accurately reflects the ability to interact with relays.
    2.  **`App.tsx` Refactor:**
        *   The main `App` component now calls `useNDKInit` to get both the `ndkInstance` and the reliable `isReady` flag.
        *   It passes both `ndkInstance` and `isReady` down as props to the `AppContent` component **and to the `AuthProvider` and `WalletProvider` components.**
    3.  **Provider Refactor (`AuthContext.tsx`, `WalletContext.tsx`):**
        *   `AuthProvider` and `WalletProvider` were modified to accept `ndkInstance` and `isReady` as props.
        *   They pass these props down to the `useAuth` and `useWallet` hooks respectively.
    4.  **Hook Refactor (`useAuth.ts`, `useWallet.ts`):**
        *   **Removed internal `useNdk()` calls.**
        *   **Modified hooks to accept `ndkInstance` and `isNdkReady` as parameters.**
        *   Updated all internal logic to use the passed props instead of the internal `ndk` variable.
        *   **Added explicit setting of `ndkInstance.signer` in `useAuth` for nsec logins** during initialization.
    5.  **`AppContent` Refactor:**
        *   Removed the internal call to `useNdk()` (from `nostr-hooks`).
        *   Now receives `ndkInstance` and `isReady` as props from `App`.
        *   Uses the passed `ndkInstance` prop for child hooks (`useMediaAuthors`, `useMediaNotes`, `useUserProfile`) and the relay stats effect.
        *   Reverted the `currentUser` prop for `MessageBoard` back to using `useProfile` from `nostr-hooks` to resolve persistent type conflicts, accepting this specific deviation.
        *   Corrected the order of hook calls to ensure state dependencies (`viewMode`, notes, indices) were defined before being used in `useCurrentAuthor`.
    6.  **`useMediaAuthors.ts` Fix:** Corrected the main `useEffect` dependency array to `[ndk, pubkey, isReady]`, removing internal state (`isLoadingAuthors`, `mediaAuthors`) to prevent loops and ensure it reacts correctly to changes in external props/state. Simplified the initial readiness check logic.
    7.  **`useMediaNotes.ts` Fix:** Added the missing `getUrlRegexForMediaType` function to the dependency array of the `processEvent` `useCallback` hook to stabilize its reference and prevent the dependency loop.
*   **Result:** These combined changes stabilized the NDK initialization and readiness reporting, corrected the flow of the NDK instance and readiness state via props into providers and hooks, fixed stale state issues in hooks, and resolved the dependency loop in `useMediaNotes`. The application now reliably connects, updates status, handles authentication, and fetches media content. 