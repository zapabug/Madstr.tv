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