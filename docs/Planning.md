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