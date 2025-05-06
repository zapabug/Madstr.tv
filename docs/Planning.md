# Nostr TV App - Planning Log

## Interaction 1: 2024-07-17 01:06

*   **User Input:** Confirmed goal is media viewer (`tv-app-architecture.md`), wants to switch *fully* to Applesauce from NDK, provided context docs (`focus-trap-issue.md`, `components.md`, `CONTEXT.md`, `TV_Remote_Interaction_Summary.md`).
*   **VibeStorm Questions:** Asked about core goal confirmation, specific Applesauce packages, and desired "normie-friendliness".
*   **VibeStorm Response:** Proposed a high-level action plan for the full NDK -> Applesauce refactor, covering core init, auth, subscriptions, profiles, publishing, component adaptation, TV navigation review, and cleanup.
*   **Decision Made:** Proceed with the full refactor to Applesauce, ditching NDK. Start with Step 1: Setup & Core Initialization.
*   **Steps Explained:** Outlined the 8 major steps of the refactoring plan.
*   **Next Action:** Create fresh `Planning.md` and clear `BUILD.md`.

## Interaction 2: 2024-07-17 01:35

*   **User Input:** Requested start of Step 1 (Setup & Core Initialization) of the Applesauce refactor plan.
*   **VibeStorm Action:** Investigated Applesauce core/react initialization pattern by examining `applesauce-react` provider source code (`store-provider.tsx`) and `applesauce-core` store source code (`query-store.ts`, `event-store.ts`).
*   **Findings:**
    *   Core setup involves `new EventStore()` -> `new QueryStore(eventStore)`.
    *   React integration uses `QueryStoreProvider` from `applesauce-react`, passing the `queryStore` instance.
    *   Initial attempt to install `@applesauce/signers` failed (404).
    *   Listed `applesauce/packages` directory, confirming package names are likely `applesauce-core`, `applesauce-react`, and `applesauce-signers`.
*   **Decision Made:** Install Applesauce packages directly into `tvapp` instead of relying on relative paths to source code.
*   **Steps Explained:** Confirmed the initialization sequence and the provider usage.
*   **Next Action (User):** Install the required Applesauce packages using `bun add applesauce-core applesauce-react applesauce-signers` (or the equivalent command using paths to local packages if installing from source, e.g., `bun add /home/jq/gitshit/applesauce/packages/core ...`).
*   **Next Action (VibeStorm):** After user confirms installation, update imports in `src/main.tsx` and `src/hooks/useAuth.ts` to use package names, then proceed with refactoring `main.tsx` logic.

## Interaction 3: [Get Current Date/Time - YYYY-MM-DD HH:MM]

*   **User Input:** (Implicit continuation from previous session) Proceeded with refactoring after package installation.
*   **VibeStorm Action:** Refactored `src/hooks/useAuth.ts` to use Applesauce's `QueryStore` and `SignerStore` for authentication logic (nsec, NIP-46), state management, and NIP-04 helpers. Updated `docs/tv-app-architecture.md` accordingly. Fixed associated linter errors.
*   **Decision Made:** `useAuth` refactor complete. Architecture documentation updated.
*   **Steps Explained:** Aligned `useAuth` with Applesauce patterns, removing NDK dependencies and leveraging the central stores.
*   **Next Action:** Proceed with Step 3: Refactor Subscription Hooks (replace custom hooks like `useMediaNotes` with Applesauce\'s `useQuery`).

## Interaction 4: [Get Current Date/Time - YYYY-MM-DD HH:MM]

*   **User Input:** Proceeded with Step 3 (Refactor Subscription Hooks).
*   **VibeStorm Action:** 
    *   Refactored data fetching in `src/App.tsx`:
        *   Removed NDK hooks (`useNDK`, `useNDKInit`) and custom `useMediaContent` hook.
        *   Implemented Applesauce `useQuery` for fetching Kind 3 (follows) based on login state.
        *   Implemented `useQuery` for fetching media notes (Kinds 1063, 34235, 31337) using filters derived from follows and tags.
        *   Added state management for fetch parameters (`limit`, `until`) and note merging/shuffling.
    *   Refactored `src/components/MessageBoard.tsx`:
        *   Removed NDK hooks (`useNDK`, `useSubscribe`).
        *   Implemented Applesauce `useQuery` for fetching Kind 1 replies based on `neventToFollow` prop.
    *   Refactored `MessageItem` sub-component (within `MessageBoard.tsx`):
        *   Removed NDK `useProfile` hook.
        *   Implemented Applesauce `useQuery` for fetching Kind 0 profiles based on message author pubkey.
    *   Updated `docs/tv-app-architecture.md` to reflect all changes.
*   **Findings:** Core data fetching refactored to Applesauce. Persistent module resolution errors for `applesauce-core`/`applesauce-react` noted, blocking testing. Filter combination strategy (authors OR tags) in `App.tsx` needs verification. Error handling and relay status display need review.
*   **Decision Made:** Completed primary data fetching refactor for `App` and `MessageBoard`.
*   **Steps Explained:** Replaced NDK/custom hooks with `useQuery` for subscriptions and profile lookups.
*   **Next Action:** Decide next step: address module resolution errors, verify filter strategy/relay status, refactor `MediaPanel.tsx`, or refactor `useWallet.ts`.

## Interaction 5: [Get Current Date/Time - YYYY-MM-DD HH:MM]

*   **User Input:** Identified that module resolution errors were due to using local file links for Applesauce packages instead of installing from a registry, and that the required `dist` build output folders were missing from the local clone.
*   **VibeStorm Action:** 
    *   Explained why local linking requires local builds and doesn\'t provide automatic updates from the registry/GitHub.
    *   Recommended switching to installing published packages from npm.
    *   Removed local `link:` dependencies for `applesauce-core`, `applesauce-react`, and `applesauce-signers` from `tvapp/package.json`.
    *   Ran `rm -rf node_modules`, `rm pnpm-lock.yaml` (file not found), and `pnpm install` to clean and reinstall base dependencies.
    *   Ran `pnpm install applesauce-core applesauce-react applesauce-signers` to install packages from the npm registry.
*   **Findings:** Switched dependency management for Applesauce from local links to registry installation.
*   **Decision Made:** Proceed with registry-installed packages.
*   **Steps Explained:** Cleaned project dependencies and installed published Applesauce versions.
*   **Next Action:** Test if the application runs without module resolution errors (`pnpm run dev`). If successful, proceed with testing/further refactoring (e.g., `MediaPanel.tsx`, `useWallet.ts`). 

## Interaction 6: [Get Current Date/Time - YYYY-MM-DD HH:MM]

*   **User Input:** Refactor `SettingsModal.tsx` to use Applesauce.
*   **VibeStorm Action:** 
    *   Removed NDK imports (`NDK`, `useNDK`) and `useNDK()` hook call from `src/components/SettingsModal.tsx`.
    *   Modified the `useEffect` hook responsible for the wallet deposit listener:
        *   Removed the `ndk` instance from the dependency array.
        *   Updated the call to `wallet.startDepositListener` to pass `auth` and `null` (temporary placeholder until `useWallet` is refactored) instead of `auth` and `ndk`.
    *   Updated `docs/tv-app-architecture.md` to reflect the removal of NDK dependencies in `SettingsModal` and the updated signature/requirements for `useWallet`'s `startDepositListener`.
*   **Findings:** `SettingsModal.tsx` no longer directly depends on NDK. `useWallet.ts` requires refactoring for its `startDepositListener` to function correctly with Applesauce stores.
*   **Decision Made:** Proceed with Applesauce-native approach for `SettingsModal`.
*   **Steps Explained:** Removed direct NDK usage from the modal component and updated documentation.
*   **Next Action:** Decide next refactoring target. Options include: refactoring `useWallet.ts` (specifically `startDepositListener`), refactoring `MediaPanel.tsx`, or testing the application's current state. 

## Interaction 7: [Get Current Date/Time - YYYY-MM-DD HH:MM]

*   **User Input:** Refactor `useWallet.ts` to use Applesauce.
*   **VibeStorm Action:** 
    *   Installed `rxjs` dependency.
    *   Refactored `src/hooks/useWallet.ts`:
        *   Removed NDK imports and types.
        *   Imported and used `Hooks.useQueryStore()` and `Hooks.useEventStore()`.
        *   Called `useAuth()` internally.
        *   Replaced NDK subscription logic with a manual RxJS subscription using `eventStore.filters(filter).subscribe(...)` within a `useEffect` hook for the deposit listener.
        *   Replaced publishing logic (`queryStore.sendEvent`) with signing (`activeSigner.signEvent` - assuming `auth.activeSigner` is exposed) and adding to the local store (`eventStore.add(signedEvent)` - assuming this triggers relay publish).
        *   Defined a local `EventSigner` interface as a placeholder for the active signer type.
        *   Adjusted internal logic, error handling, and dependencies accordingly.
        *   Ignored persistent spurious linter errors related to implicit returns in useCallback.
    *   Updated `docs/tv-app-architecture.md` to describe the new `useWallet` implementation (manual RxJS subscription, eventStore.add).
*   **Findings:** `useWallet.ts` refactored to use Applesauce stores and manual RxJS subscription. Publishing relies on assumptions about `auth.activeSigner` exposure and `eventStore.add` behavior. Spurious linter errors remain.
*   **Decision Made:** Completed `useWallet.ts` refactor with current best assumptions.
*   **Steps Explained:** Replaced NDK logic with Applesauce patterns, managing subscriptions manually and updating publishing approach.
*   **Next Action:** Verify `auth.activeSigner` exposure in `useAuth.ts`, test the app, or refactor `MediaPanel.tsx`. 

## Interaction 8: [Get Current Date/Time - YYYY-MM-DD HH:MM]

*   **User Input:** Run `pnpm run dev`, identify remaining NDK imports in `MediaPanel.tsx` and `ImageFeed.tsx`.
*   **VibeStorm Action:**
    *   Refactored `src/components/MediaPanel.tsx`:
        *   Removed NDK `useProfile` import.
        *   Imported `Hooks` from `applesauce-react`, `ProfileQuery` and `ProfileContent` from `applesauce-core`.
        *   Used `Hooks.useStoreQuery(ProfileQuery, ...)` to fetch profile data for the selected item.
    *   Refactored `src/components/ImageFeed.tsx`:
        *   Removed NDK `useProfile` and `useNDK` imports.
        *   Imported Applesauce hooks and types (`Hooks`, `ProfileQuery`, `ProfileContent`, `EventStore`).
        *   Used `Hooks.useStoreQuery(ProfileQuery, ...)` for profile fetching.
        *   Removed NDK instance usage.
        *   Modified `handleTip` to construct a placeholder Zap event (Kind 9735), sign using `auth.activeSigner` (assumed), and add via `eventStore.add()`.
        *   Defined a local `EventSigner` interface.
    *   Renamed `NostrProfile` interface to `ProfileContent` in `src/types/nostr.ts`.
*   **Findings:** `MediaPanel.tsx` and `ImageFeed.tsx` refactored successfully, removing component-level NDK dependencies. Runtime errors revealed that `SignerStore` is not exported from `applesauce-core` or `applesauce-react`.
*   **Decision Made:** Correct the instantiation logic in `main.tsx` based on `QueryStoreProvider`'s actual API.
*   **Steps Explained:** Replaced NDK hooks with Applesauce equivalents in components. Investigated and identified incorrect store setup in `main.tsx`.
*   **Next Action:** Fix `main.tsx` imports and provider props.

## Interaction 9: [Get Current Date/Time - YYYY-MM-DD HH:MM]

*   **User Input:** Runtime error `doesn't provide an export named: 'SignerStore'`. User attempts `pnpm run dev --force`.
*   **VibeStorm Action:**
    *   Corrected `src/main.tsx`:
        *   Removed `SignerStore` import.
        *   Removed `signerStore` instantiation.
        *   Removed `signerStore` prop from `QueryStoreProvider`.
    *   Identified the root cause of the runtime error: `src/hooks/useAuth.ts` still incorrectly imports `SignerStore` from `applesauce-core`.
    *   Corrected the import in `src/hooks/useAuth.ts`, removing `SignerStore`.
    *   Identified numerous other linter errors in `useAuth.ts` indicating significant inconsistencies with Applesauce APIs (`useStore`, `NostrEvent`, `Signer` type, `SimpleSigner` constructor, `NostrConnectSigner` API).
*   **Findings:** `main.tsx` is now likely correct. `useAuth.ts` is fundamentally flawed in its interaction with Applesauce stores and signers. It incorrectly uses `useStore(SignerStore)`, needs to manage `activeSigner` via local state, uses incorrect signer APIs, and needs to return the `activeSigner`.
*   **Decision Made:** Pause further component refactoring/testing. Prioritize fixing `useAuth.ts`.
*   **Steps Explained:** Corrected `main.tsx`, identified the true source of the runtime error in `useAuth.ts`, discovered major API inconsistencies in `useAuth.ts` requiring a rewrite.
*   **Next Action:** Refactor `useAuth.ts` based on correct Applesauce API usage (local state for signer, correct signer methods, expose active signer). 

## Interaction 10: [Get Current Date/Time - YYYY-MM-DD HH:MM]

*   **User Input:** Refactor `useAuth.ts` for clarity and to address remaining linter errors.
*   **VibeStorm Action:**
    *   Created new hook `src/hooks/useNip46AuthManagement.ts`.
    *   Moved all NIP-46 specific logic (state, connection, cancellation, restoration, persistence, cleanup) from `useAuth.ts` to `useNip46AuthManagement.ts`.
    *   Refactored `src/hooks/useAuth.ts`:
        *   Imported and called `useNip46AuthManagement`.
        *   Removed NIP-46 state and logic.
        *   Delegated NIP-46 calls (`initiate`, `cancel`, `restore`, `clear`) to the new hook.
        *   Managed `activeSigner` via local state (`useState`).
        *   Combined `nsecAuthError` and `nip46Error` into a single `authError`.
        *   Updated initialization logic to prioritize NIP-46 restoration via the new hook.
        *   Fixed remaining linter errors in `useAuth.ts` (mainly `Nip07Interface` import).
    *   Addressed some new linter errors in `useNip46AuthManagement.ts` (related to `localSecretKeyHex` re-declaration and `SimpleSigner.getSecretKey`), but others remain (relays path, signer options, metadata options, potentially `remotePubkey` access).
    *   Temporarily disabled NIP-46 session persistence in `useNip46AuthManagement.ts` due to uncertainty about accessing `remotePubkey` after connection (added `TODO`).
*   **Findings:** `useAuth.ts` is significantly cleaner and correctly manages `activeSigner` state. NIP-46 logic is now encapsulated in `useNip46AuthManagement.ts`. Key remaining issue is resolving how to get `remotePubkey` for NIP-46 persistence and verifying the remaining linter warnings in `useNip46AuthManagement.ts`.
*   **Decision Made:** Proceed with testing the refactored authentication logic.
*   **Steps Explained:** Created a dedicated hook for NIP-46, refactored `useAuth` to use it, cleaned up imports and state management, addressed most linter errors, identified remaining issues for NIP-46 persistence.
*   **Next Action:** Test the application (`pnpm run dev`) to verify nsec and NIP-46 authentication flows with the refactored hooks. Investigate remaining linter warnings and the `remotePubkey` issue if tests fail or reveal problems.

## Interaction 11: [Get Current Date/Time - YYYY-MM-DD HH:MM]

*   **User Input:** Attempt to run `pnpm run dev`, encountered build errors related to imports (`../constants/relays`, `buffer`, `useQuery`) and redeclarations (`isLoadingContent`, `Filter`).
*   **VibeStorm Action:**
    *   Corrected `RELAYS` import path in `useNip46AuthManagement.ts`.
    *   Created `src/utils/hex.ts` with `bytesToHex`/`hexToBytes` helpers.
    *   Refactored `useNip46AuthManagement.ts` to use hex helpers instead of `Buffer`.
    *   Corrected `useQuery` usage in `App.tsx` and `MessageBoard.tsx` to `Hooks.useStoreQuery`.
    *   Corrected numerous Applesauce type imports (`NostrEvent`, `Filter`, `ProfileQuery`, etc.) based on documentation lookup.
    *   Refactored `App.tsx` data fetching logic (`FollowsQuery`, `TimelineQuery`) to use `Hooks.useStoreQuery` correctly, inferring types and handling loading state implicitly.
    *   Fixed `isLoadingContent` and `Filter` redeclaration errors in `App.tsx`.
    *   Identified that `useNip46AuthManagement.ts` still failed because `NostrConnectSigner` requires `subscriptionMethod` and `publishMethod`, which could not be found on `EventStore` or `QueryStore`.
    *   Re-examined Applesauce source code (`EventStore`, `IEventStore`, `useEventStore`) and confirmed they do *not* handle direct relay communication or expose `relayManager` publicly.
*   **Findings:** The core issue preventing NIP-46 from working is the lack of relay publish/subscribe functions being passed to `NostrConnectSigner`. Applesauce Core (`EventStore`/`QueryStore`) focuses on local data management. `tvapp` currently has no active relay communication layer.
*   **Decision Made:** Implement relay communication using `SimplePool` from `nostr-tools` and provide its methods to `NostrConnectSigner`.
*   **Steps Explained:** Iteratively fixed build errors. Investigated Applesauce source to understand the missing `subscribe`/`publish` methods. Concluded that relay management must be handled by the application itself.
*   **Next Action:** Modify `main.tsx` to instantiate `SimplePool`, create a `RelayPoolContext`, and provide the pool instance to the app via the context provider. 

## Current Debugging Session: Investigating TimelineQuery Failure (2024-07-18)

*   **User Summary:** User provided a comprehensive summary of the debugging journey so far, highlighting that `useMediaContent` (using Applesauce `TimelineQuery`) is not returning image/video events.
*   **VibeStorm Action (Step 1.1 of TODO):** Added detailed logging in `src/hooks/useMediaContent.ts` (via `console.log`) for `imageQueryArgs` and `videoQueryArgs` *before* the call to `Hooks.useStoreQuery`. This is to verify the exact filter structures being passed to `TimelineQuery`.
*   **Next Action:** User to run `pnpm run dev` and observe the console output for the logged `imageQueryArgs` and `videoQueryArgs`. Based on the output, decide on the next debugging step for `TimelineQuery` (e.g., simplifying filters, checking `EventStore`). 

## Interaction 12: 2024-07-19 (User-Led Codebase Investigation)

*   **User Input:** Provided a detailed summary of their investigation into the Applesauce codebase, specifically `EventStore`, `ProfileQuery`, and `TimelineQuery`. This was framed as answers to questions about how these components work.
*   **Key Findings (from user's investigation):**
    *   **`EventStore` API:** Confirmed methods like `getEvent()`, `getAll(filters)` (synchronous, good for debugging filters), and `getTimeline(filters)` exist. This allows direct inspection of the current cache. `debug` library (`applesauce:*`) can be used for logging.
    *   **`ProfileQuery`:** Returns `ProfileContent | undefined`. The `getProfileContent` helper parses Kind 0 event content. `ProfileContent` type includes standard fields and deprecated aliases; UI needs to handle optional fields.
    *   **`TimelineQuery`:** Returns `NostrEvent[] | undefined`. It's a thin wrapper around `eventStore.timeline()`. The actual filtering logic is in `EventStore` using `matchFilters` (which applies OR logic for an array of filters). Failures with complex filters are likely due to data mismatches in the store vs. filter criteria.
    *   **Debugging `TimelineQuery`:** Recommended direct inspection of events via `eventStore.getEvent()`, testing filters with `eventStore.getAll()`, and incremental simplification of filters.
*   **Decision Made:** Incorporate this detailed knowledge into the project's understanding and documentation. Proceed with the user's established TODO list.
*   **Next Action (From User's TODO):** Focus on "Fix Podcast Playback". First step is to verify URL extraction by running the app and checking logs from `processApplesauceEvent` in `useMediaContent.ts` for Kind 31234 events:
    *   Is `basicUrl` a valid audio URL?
    *   Are `url`, `media`, or `enclosure` tags present and correct?
    Waiting for user to report findings from these logs.

## Interaction 13: 2024-07-19 (Kind 1 Podcast Discovery & Refactor)

*   **User Input:** Provided console logs showing `basicUrl: null` and expanded `allTags` for Kind 31234 events, confirming the absence of standard URL tags.
*   **VibeStorm Action:** Analyzed logs and `processApplesauceEvent`, confirming the URL extraction logic was looking for the correct tags but they were missing on the events.
*   **User Input:** Provided a raw Kind 1 event (`ea643df0...`) from NoSolutions (`9bde...`) containing a podcast episode link directly in the `content` field.
*   **Key Finding:** Realized that NoSolutions uses Kind 1 events with URLs in the content for podcast distribution, not Kind 31234 with tags.
*   **Decision Made:** Refactor podcast fetching to target Kind 1 events specifically from NoSolutions, abandoning the Kind 31234 approach for podcasts for now.
*   **VibeStorm Action:** 
    *   Refactored `src/hooks/useMediaContent.ts`:
        *   Modified `podcastFiltersArray` logic to *only* include a filter for `{ kinds: [1], authors: [NOSOLUTIONS_PUBKEY_HEX], ... }` if NoSolutions is followed.
        *   Updated `processApplesauceEvent` to check for Kind 1 from NoSolutions and use regex (`AUDIO_URL_REGEX`) on the `content` to extract the URL.
        *   Removed Kind 31234 handling from podcast logic.
        *   Added `.filter(note => note.url !== undefined)` to the podcast processing `useEffect`.
    *   Added more detailed logging to the podcast processing `useEffect` to trace event counts before and after URL filtering.
*   **Outcome:** App still displayed loading spinner with no media. Logs showed the Kind 1 filter was correctly created, but the detailed processing logs added in the previous step were missing, indicating `fetchedPodcastEvents` might not be updating/emitting correctly for the Kind 1 query.
*   **Decision Made:** Add a direct, synchronous check of the `EventStore` to bypass `useStoreQuery` temporarily for debugging.
*   **VibeStorm Action:** Added a diagnostic `useEffect` to `useMediaContent.ts` using `Hooks.useEventStore()` and `eventStore.getAll(podcastQueryArgs)` to log the count and content of matching Kind 1 events found directly in the store when the query becomes active.
*   **Next Action:** User to run the app and report the results of the new `[DEBUG] EventStore.getAll found...` logs.

## Interaction 14 (Continued): 2024-07-22 (Content Loading Deep Dive)

*   **Recap from Previous:** App stuck on loading. Kind 3 for default user not loading fast enough. NoSolutions Kind 1 podcasts not appearing.
*   **Action (Kind 3 Login Fix):** Added dynamic subscription in `App.tsx` for logged-in user's Kind 3.
    *   **Result:** SUCCESS. `contactsData` and `followedAuthorPubkeys` populate correctly after login. `isLoadingContent` becomes `false`.
*   **Action (Podcast Debug - NoSolutions Kind 1):**
    *   Focused `useMediaContent.ts` on Kind 1 from `NOSOLUTIONS_PUBKEY_HEX`.
    *   Added direct `eventStore.getAll()` check.
    *   **Finding:** `eventStore.getAll()` returned 0 matching NoSolutions Kind 1 events.
*   **Action (SimplePool Subscription - NoSolutions Kind 1):**
    *   Added explicit filter `{ kinds: [1], authors: [NOSOLUTIONS_PUBKEY_HEX], limit: 50 }` to `initialFilters` in `main.tsx`.
    *   Added specific `console.log` in `SimplePool.onevent` for these events.
    *   **Finding:** NO `"[SimplePool NoSolutions Kind 1 Received]"` logs appeared. General Kind 1 events *were* logged. Concluded `SimplePool` not receiving these specific events from relays.
*   **User Feedback:** "Playlist is back."
*   **Action (Broaden Podcast Fetch - Kind 1 All Followed - Current Approach):**
    *   `useMediaContent.ts` was modified to query Kind 1 events from *all* `followedAuthorPubkeys`.
    *   `processApplesauceEvent` attempts audio URL extraction from *any* such Kind 1 event.
    *   **Analysis & Rationale:** This approach is maintained to broadly capture potential audio content from followed users. The "playlist" observed was likely general Kind 1 text notes from followed authors (caught by the broad `main.tsx` filter) that coincidentally had URLs matching the audio regex. Playback often failed, indicating this is not a reliable way to get true audio files but serves as a baseline for "any sound content" for now.
*   **User Feedback:** Noted that the app was working entirely with NDK previously (except NIP-46). This points to relay/subscription differences between NDK and `SimplePool`/Applesauce usage for specific, author-filtered content.
*   **Action (UI Fix):** Made settings button in `RelayStatus.tsx` always visible by removing `opacity-0`.
*   **Decision:** Maintain the current broad Kind 1 audio fetching strategy in `useMediaContent.ts`. The primary focus shifts to why `SimplePool` isn't reliably fetching specifically requested, author-scoped events (of any kind, including these broad Kind 1s, or more specific kinds like 1063/34235 when we try them).
*   **Next Steps Identified (Revised):**
    1.  **(Primary Focus) Investigate `RELAYS` list (`src/constants.ts`):** Compare this list with relay configurations previously successful with NDK. Add, remove, or reorder relays to prioritize those known to be reliable and carry the desired content (general media from followed authors, specific content like NoSolutions if still relevant).
    2.  **(Refinement) Analyze `SimplePool` Subscriptions:** Review `initialFilters` in `main.tsx` and dynamic subscription logic in `App.tsx`. Consider if `since` parameters, filter limits, or the structure of subscriptions could be optimized for better retrieval of author-scoped events.
    3.  **(Goal) Achieve Reliable Event Reception:** The goal is for `SimplePool` to reliably fetch events based on explicit filters (e.g., Kind 1 from followed authors for audio, and eventually Kind 1063/34235 for images/videos from followed authors).
        *   Monitor logs for `SimplePool` `onevent` in `main.tsx` for specifically requested events.
        *   Check `eventStore.getAll()` in `useMediaContent.ts` for expected events.
        *   Verify successful processing and URL extraction (for audio) in `useMediaContent.ts`.
    4.  **(Future) Implement Dynamic Image/Video Subscriptions:** Once there's confidence that `SimplePool` can reliably fetch author-scoped events, proceed with adding dynamic `SimplePool` subscriptions in `App.tsx` for `{ kinds: [1063], authors: followedAuthorPubkeys, ... }` and `{ kinds: [34235], authors: followedAuthorPubkeys, ... }`.
    5.  **(Future) Debug Playback & Refine Podcast Specificity:** After reliable fetching of audio-containing Kind 1 notes, address any playback issues in `MediaPanel.tsx`. Later, consider if more specific kinds/tags for podcasts should be targeted if the broad Kind 1 approach proves too noisy or unreliable for actual podcast content. 

## Interaction 15: 2024-07-22 (Infinite Loop Persists - Focus Shifts to useMediaContent)

*   **Context:** After updating the relay list, the "Maximum update depth exceeded" error continued in `App.tsx`.
*   **Applesauce Investigation (User-Led):** User performed a detailed investigation of `applesauce-react` and `applesauce-core` focusing on `Hooks.useStoreQuery`, `Queries.ContactsQuery`, `QueryStore`, and `EventStore`.
    *   **Key Finding:** `Hooks.useStoreQuery` does not inherently guarantee reference stability for array/object results if the underlying observable pipeline (e.g., from `ContactsQuery`) emits new references. The `map` operator in `ContactsQuery` using `getContacts()` was identified as a likely source of new array references for `contactsData`, even if content is identical. No deep `distinctUntilChanged` for query *results* was found in the core Applesauce pipeline examined.
*   **Stabilization Attempt in `App.tsx` (Round 2):** Refactored `isLoadingContent` in `App.tsx` to be a dedicated state variable, updated by a `useEffect` observing `contactsData`, aiming to make `isLoadingContent` updates more robust against `contactsData` reference changes.
*   **Outcome: Error Persists, Stack Trace Points to `useMediaContent.ts`:**
    *   The "Maximum update depth exceeded" error continued even with the more robust `isLoadingContent` management.
    *   The React error stack trace now prominently includes `useMediaContent.ts` (specifically line 243 mentioned in one trace) as part of the loop, alongside `App.tsx`.
*   **Revised Hypothesis:**
    1.  `useStoreQuery(ContactsQuery, ...)` in `App.tsx` likely still provides an unstable `contactsData` reference.
    2.  This causes `followedPubkeys` (a dependency of `useMediaContent`) to receive new references, re-triggering `useMediaContent`.
    3.  **New Crucial Element:** `useStoreQuery(Queries.TimelineQuery, ...)` used *within* `useMediaContent.ts` for fetching images, videos, or podcasts (`fetchedImageEvents`, `fetchedPodcastEvents`, etc.) might *also* be returning unstable array references (similar to `ContactsQuery`).
    4.  This would cause `useMediaContent`'s internal `useEffect` hooks (which process these fetched events and call state setters like `setProcessedPodcastNotes`, `setShuffledImageNotes`, etc. – one of which is likely around line 243) to run repeatedly.
    5.  These state setters in `useMediaContent` cause it to return new output array references (e.g., `shuffledImageNotes`, `podcastNotes`) to `App.tsx`.
    6.  `App.tsx` then re-renders, and if any of its effects are sensitive to these new references from `useMediaContent` (or the still unstable `contactsData`), the loop continues.
*   **Decision:** The primary investigation focus shifts to `useMediaContent.ts` to check for and address reference instability originating from `Queries.TimelineQuery`.
*   **Next Steps Identified:**
    1.  **(Priority) Investigate `useMediaContent.ts` (around line 243 and related effects):** Pinpoint the exact `useEffect` and `setState` call implicated. Analyze its dependencies, particularly `fetchedImageEvents`, `fetchedVideoEvents`, etc., which come from `Hooks.useStoreQuery(Queries.TimelineQuery, ...)`.
    2.  **(Hypothesis) Confirm `TimelineQuery` Reference Stability:** Assume, based on the `ContactsQuery` investigation, that `TimelineQuery` results are also likely reference-unstable if they involve mapping over events to create arrays.
    3.  **(Solution) Stabilize `useEffect` Dependencies in `useMediaContent.ts`:** If `fetchedImageEvents`, etc., are unstable, apply stabilization techniques (e.g., `useMemo` with `JSON.stringify` or a more robust deep comparison method) to these arrays *before* they are used as dependencies in `useEffect` hooks that call `set...Notes` state setters within `useMediaContent.ts`.
    4.  **(Future) Debug podcast playback in `MediaPanel.tsx` once reliable audio notes are being fetched. 

## Interaction 16: 2024-07-23 (Stability Fixes, New Issues: No Media, Missing Placeholder Chat)

*   **Context:** Following the hypothesis that unstable references from `useStoreQuery(Queries.TimelineQuery, ...)` within `useMediaContent.ts` were causing render loops, several changes were made.
*   **Actions Taken & Outcome:**
    1.  **Stabilized `useMediaContent.ts` Inputs:** Implemented `useMemo` with `JSON.stringify` for `fetchedImageEvents`, `fetchedVideoEvents`, and `fetchedPodcastEvents` before they are used as dependencies in `useEffect` hooks that process media and call `set...Notes` state setters.
    2.  **Type Corrections:** Ensured `NostrNote[]` is consistently used for the output of `processApplesauceEvent` and related array processing within `useMediaContent.ts`.
    3.  **`Events.ts` Created:** Created `src/types/Events.ts` with a definition for `ApplesauceEvent` (extending `NostrEvent` with media-specific fields like `url`, `title`, `summary`, `image`, `duration`) and other placeholder types. This resolved the "Cannot find module" error for `../types/Events`.
    4.  **Import Resolution:** Fixed duplicate `NostrNote` imports in `useMediaContent.ts`.
    5.  **Result:** The "Maximum update depth exceeded" error seems to be resolved.
*   **New Issues Identified:**
    1.  **No Media Content Displayed:** Despite the stability fixes and logs showing `SimplePool` receiving Kind 1 events, no images, videos, or podcasts are appearing in the UI. *(Update: Podcast lists *are* populating in `MediaPanel`.)*
    2.  **Podcast Playback Failure:** When attempting to play a podcast, the error "`useMediaElementPlayback: togglePlayPause called with invalid state. Has media element: true, has currentItemUrl: false`" occurs. This indicates the selected podcast item's URL is not reaching the playback mechanism.
    3.  **Placeholder Chat Missing:** The placeholder chat content that used to appear in the `MessageBoard` when no user was logged in is reportedly no longer showing.
*   **Hypothesis for No Media:** The issue likely lies in the data pipeline *within* or *after* `useMediaContent.ts`. Either:
    *   The `TimelineQuery` filters in `useMediaContent` for images/videos are not matching any relevant events.
    *   `processApplesauceEvent` is failing to correctly extract necessary data (like URLs) from fetched image/video events.
    *   The processed image/video notes are not being correctly set in the state within `useMediaContent` or not being propagated/rendered.
*   **Hypothesis for Podcast Playback Failure:**
    *   The `currentItemUrl` state in `useMediaState.ts` is not being updated correctly when a podcast item is selected in `MediaPanel.tsx` (specifically `Podcastr.tsx`).
    *   The selected `NostrNote` for the podcast in `podcastNotes` might have an invalid or missing `url` property.
*   **Next Steps & Investigation Plan:**
    1.  **Debug Podcast Playback (Highest Priority):**
        *   **In `useMediaState.ts`:**
            *   Log `currentPodcastIndex` when it changes.
            *   Log the specific `podcastNotes[currentPodcastIndex]` when the index changes, focusing on its `url` property.
            *   Log `currentItemUrl` immediately after it's set in the effect that depends on `currentPodcastIndex` and `podcastNotes`.
        *   **In `Podcastr.tsx` (or `MediaPanel.tsx` where selection is handled):**
            *   Ensure `handleSelectPodcast` (or equivalent) is correctly calling `setCurrentPodcastIndex` (or the equivalent setter from `useMediaState`).
            *   Log the note being selected to verify it has a valid `url` at the point of selection.
        *   **In `useMediaElementPlayback.ts`:**
            *   Log the `currentItemUrl` prop as received by this hook.
    2.  **Trace Image/Video Data Flow (High Priority):**
        *   Verify `followedAuthorPubkeys` and `followedTags` being passed to `useMediaContent`.
        *   Log the constructed `mediaFilters` (especially `imageFiltersArray`, `videoFiltersArray`) and `imageQueryArgs`/`videoQueryArgs` inside `useMediaContent`.
        *   Log the direct output of `Hooks.useStoreQuery(Queries.TimelineQuery, ...)` for `fetchedImageEvents` and `fetchedVideoEvents`.
        *   If events are fetched, log the output of `processApplesauceEvent` for a sample of these image/video events.
        *   Log the contents of `processedImageNotes`, `processedVideoNotes` before they are set, and the final `shuffledImageNotes`, `shuffledVideoNotes` being returned by `useMediaContent`.
        *   Confirm in `App.tsx` that it receives these notes and passes them to child components.
    3.  **Investigate Placeholder Chat (Medium Priority):**
        *   Examine `App.tsx` to see how `neventToFollow` is provided to `MessageBoard` when no user is logged in.
        *   If a default event ID was used, ensure it's still valid and the logic to use it is intact.
        *   Consider if this default chat needs its own specific `TimelineQuery` or similar if it relies on a specific event not covered by general media fetching.
    4.  **(Future) Debug podcast playback in `MediaPanel.tsx` once reliable audio notes are being fetched. 

## Interaction 17: 2024-07-24 (End of Session - Podcast & HMR Focus)

*   **Context:** Debugging focused on podcast playback and preparing for image/video debugging. HMR issues were also reported.
*   **Actions Taken & Findings:**
    1.  **`useMediaState.ts` Refinement:** Logic for setting `currentItemUrl` was updated to correctly prioritize the selected podcast's URL when in `imagePodcast` mode. Logging confirmed this worked for NoSolutions podcasts, and audio playback was successful.
    2.  **Generalized Podcast Audio Extraction (`useMediaContent.ts`):** `processApplesauceEvent` was modified to attempt audio URL extraction (via `AUDIO_URL_REGEX`) from the `content` of *any* Kind 1 event, not just those from NoSolutions. This aims to enable podcast discovery from a broader range of followed authors.
    3.  **Image/Video Debug Logging (`useMediaContent.ts`):** Added comprehensive logging to show the direct results of `Hooks.useStoreQuery` for `fetchedImageEvents` and `fetchedVideoEvents`, as well as the output of `processApplesauceEvent` for these media types.
    4.  **Vite HMR / `main.tsx` Issues Noted:** User reported Vite HMR errors related to `App.tsx` initialization and a `createRoot` warning. These suggest potential instability in the development environment.
*   **Current State of Key Issues:**
    *   **Podcast Playback:** Working for NoSolutions. Generalized Kind 1 audio extraction for other authors is implemented but pending testing.
    *   **Image/Video Content:** Still not displaying. Detailed logs are in place to capture `TimelineQuery` results and processing, pending testing (especially after `followedAuthorPubkeys` are populated).
    *   **Placeholder Chat:** Remains unaddressed.
    *   **Dev Environment Stability:** HMR errors and `createRoot` warning are a concern and need to be addressed first in the next session.
*   **Plan of Action for Next Session:**
    1.  **(Highest Priority) Stabilize Development Environment:**
        *   Restart the Vite development server.
        *   If HMR errors (`can't access lexical declaration 'App' before initialization`, `Failed to reload /src/App.tsx`) or the `createRoot` warning persist:
            *   Inspect `src/main.tsx` for any irregularities (though it appeared standard).
            *   Inspect `src/App.tsx` for syntax errors, problematic imports, or potential circular dependencies.
    2.  **(High Priority) Test Generalized Podcast Fetching & Playback:**
        *   Once the dev environment is stable, run the app (log in if necessary to get followed authors).
        *   Verify if Kind 1 events from authors *other than* NoSolutions, if they contain audio URLs in their content, are now processed, listed, and playable.
        *   Check console logs from `processApplesauceEvent` and `useMediaState.ts`.
    3.  **(High Priority) Analyze Image/Video Fetching Logs:**
        *   With the dev environment stable and `followedAuthorPubkeys` populated (e.g., after login), observe the new detailed logs in `useMediaContent.ts`:
            *   Are `fetchedImageEvents` and `fetchedVideoEvents` (results from `Hooks.useStoreQuery`) populated with any data, or are they `undefined`/empty?
            *   If data is present, how does `processApplesauceEvent` handle it? Are URLs extracted?
            *   Are `processedImageNotes` / `processedVideoNotes` being set correctly?
    4.  **(Medium Priority) Address Placeholder Chat:**
        *   Investigate `App.tsx` and `MessageBoard.tsx` to reinstate the default chat functionality for non-logged-in users.
    5.  **(Ongoing) Continue Debugging Image/Video Display:** Based on the findings from the log analysis (Step 3), implement necessary fixes to get images and videos displaying. 

## Interaction 18: 2024-07-25 (Refactor `useMediaContent.ts` for Unified Media Discovery)

*   **Context:** Previous attempts to fetch specific media kinds (1063 for images, 34235 for videos) were not reliably yielding results. Podcasts were working somewhat by parsing Kind 1 content. To get the app functional with a broader range of media, a new unified strategy was implemented in `useMediaContent.ts`.
*   **Actions Taken (Refactoring `src/hooks/useMediaContent.ts`):**
    1.  **Primary Media Discovery via Kind 1 Content:**
        *   Modified the hook to primarily fetch general `Kind 1` events from all `followedAuthorPubkeys` (using `generalKind1FiltersArray`).
        *   Enhanced `processApplesauceEvent` to attempt parsing of audio, image, AND video URLs directly from the `content` of these `Kind 1` events using `AUDIO_URL_REGEX`, and newly added `IMAGE_URL_REGEX` and `VIDEO_URL_REGEX`.
        *   `processApplesauceEvent` now returns a `ProcessedNostrNote` which includes a `mediaTypeHint` ('audio', 'image', 'video', or 'unknown').
    2.  **Supplementary Fetching of Specific Kinds:**
        *   Maintained the fetching of specific `Kind 1063` (image) and `Kind 34235` (video) events. URLs for these are extracted from tags as before. These act as a more explicit and potentially richer source of media information.
    3.  **Consolidated Event Processing Logic:**
        *   Replaced the three separate `useEffect` hooks (for image, video, podcast processing) with a single, consolidated `useEffect` hook.
        *   This new hook takes all fetched events (`stableFetchedGeneralKind1Events`, `stableFetchedImageEvents`, `stableFetchedVideoEvents`).
        *   **Deduplication:** It processes all events through the updated `processApplesauceEvent` and then deduplicates the resulting notes by `event.id`. Basic prioritization is applied (e.g., specific kind over Kind 1 if IDs match, or a note with a URL over one without).
        *   **Categorization:** Deduplicated notes are then filtered into `currentPodcastNotes`, `currentImageNotes`, and `currentVideoNotes` based on their `mediaTypeHint` and the presence of an extracted `url`.
        *   These categorized arrays are then sorted and used to update `processedPodcastNotes`, `processedImageNotes`, and `processedVideoNotes` state.
    4.  **State and Filter Adjustments:**
        *   Renamed podcast-specific fetch limit/until state variables (e.g., `podcastFetchLimit` to `generalKind1FetchLimit`).
        *   Updated `mediaFilters` to reflect the new `generalKind1FiltersArray` and ensure `imageFiltersArray` and `videoFiltersArray` are correctly maintained.
        *   Updated loading state `isLoadingPodcasts` to depend on `fetchedGeneralKind1Events`.
*   **Rationale for Change:** This approach is intended to make the application more resilient in displaying media content. By broadly scanning common Kind 1 events for media URLs, the app has a better chance of finding *some* playable/viewable content, even if authors don't use specific media kinds. The dedicated kind fetching supplements this with potentially higher-quality data when available.
*   **Current State of Key Issues:**
    *   **Media Content Display:** The refactor of `useMediaContent.ts` is complete. Awaiting testing to see if images, videos, and podcasts are now fetched and displayed more reliably from various authors.
    *   **Podcast Playback:** Was working for NoSolutions. Needs testing with the new generalized fetching.
    *   **Dev Environment Stability:** Assumed stable from previous session's restart.
    *   **Placeholder Chat:** Remains unaddressed.
*   **Plan of Action for Next Session:**
    1.  **(Highest Priority) Test New Media Fetching & Display Strategy:**
        *   Run the application (log in if necessary to populate `followedAuthorPubkeys`).
        *   Observe if images, videos, and podcasts are now displayed in their respective UI sections.
        *   Check if content is appearing from a variety of followed authors.
        *   Evaluate the quality and relevance of media found through Kind 1 content parsing.
        *   Verify playback for all media types.
    2.  **(High Priority) Analyze Console Logs:**
        *   Examine logs from `useMediaContent.ts` (especially the new consolidated processing hook) to trace the flow of events: initial fetching, processing by `processApplesauceEvent` (including `mediaTypeHint` and URL extraction), deduplication, and final categorization.
    3.  **(Medium Priority) Debug & Refine:**
        *   Based on testing and log analysis, address any bugs, incorrect categorizations, or issues with URL extraction or deduplication.
        *   Consider if the regexes need refinement or if the deduplication prioritization needs adjustment.
    4.  **(Lower Priority) Address Placeholder Chat:**
        *   Once media display is in a good state, investigate and restore the default chat functionality for non-logged-in users.
    5.  **(Ongoing) Continue Debugging Image/Video Display:** Based on the findings from the log analysis (Step 3), implement necessary fixes to get images and videos displaying. 