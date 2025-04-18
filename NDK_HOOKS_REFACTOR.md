# NDK Hooks Refactoring Context

## Current State

1.  **Dependencies Updated:**
    *   `@nostr-dev-kit/ndk` is installed.
    *   `@nostr-dev-kit/ndk-hooks` is installed.
    *   `nostr-hooks` (ostyjs library) has been removed.
    *   `nostr-tools` import remains only for `nip19` utilities.
2.  **Package Manager:** Switched from `npm` to `bun`.
3.  **Refactoring Progress:** Steps 1, 3, 4, and 5 from the original plan are complete. Auth, Subscriptions, and Cleanup are partially addressed.

## Goal

Refactor the MadTrips TV App to utilize the official `@nostr-dev-kit/ndk-hooks` library, adhering to NDK best practices and philosophy. This aims to improve stability, performance, and maintainability.

## Key `ndk-hooks` Patterns & Philosophy

*   **NDK Singleton:** Instantiate `NDK` once (`src/ndk.ts`).
*   **Initialization Hook:** Use `useNDKInit()` in `App.tsx` `useEffect`.
*   **Context Access:** Use `const { ndk } = useNDK();`.
*   **Data Subscription:** Use `useSubscribe` (e.g., `App.tsx` for global notes, components for specific needs).
*   **Profile Fetching:** Use `useProfile` (e.g., `ImageFeed.tsx`, `MediaPanel.tsx`, `MessageItem.tsx`).
*   **Component-Level Subscriptions:** Fetch data in components that need it (e.g., `MessageBoard`).
*   **Local-First Rendering:** Avoid "loading" states; render based on data availability.
*   **Publishing:** Use `NDKEvent` instance and `event.publish()`. Optimistic updates handled by NDK.

## Refactoring Steps Status

1.  **Initialize NDK:** **[COMPLETED]**
    *   `NDK` singleton created in `src/ndk.ts`.
    *   Old `NostrProvider` removed from `src/main.tsx`.
    *   Official `useNDKInit` implemented in `src/App.tsx`.
    *   Removed associated loading states from `App.tsx`.
2.  **Replace `useAuth`:** **[PARTIALLY COMPLETED - BLOCKED]**
    *   Refactored to use `ndk.signer` as primary source of truth.
    *   Manages nsec login, NIP-46 connection initiation, NIP-04 encryption.
    *   NIP-46 session restoration logic was attempted but reverted due to NDK API/type inconsistencies.
    *   **[BLOCKED]** Requires investigation into the correct NDK pattern for NIP-46 token-based session restoration.
3.  **Replace `useMediaNotes`:** **[COMPLETED]**
    *   Replaced with `useSubscribe` calls in `src/App.tsx` for podcasts, videos, and images.
    *   Event processing logic (URL extraction) moved into `App.tsx`.
4.  **Replace `useMediaAuthors`/`useProfileData`:** **[COMPLETED]**
    *   `useMediaAuthors` replaced with `useSubscribe` for Kind 3 list in `src/App.tsx`.
    *   `useProfileData` replaced with direct `useProfile` calls in `ImageFeed.tsx` and `MediaPanel.tsx`.
    *   Hook files (`useMediaAuthors.ts`, `useProfileData.ts`) deleted.
    *   `Podcastr.tsx` refactored to use `useProfile`.
5.  **Replace `useCurrentAuthor`:** **[COMPLETED]**
    *   Hook removed entirely.
    *   Components (`ImageFeed`) now derive author `pubkey` from active note and use `useProfile`.
    *   `VideoPlayer` no longer displays author info directly.
6.  **Review Component-Level Subscriptions:** **[COMPLETED]**
    *   `MessageBoard.tsx`: Reviewed and `useSubscribe` enabled. Unused imports/variables removed.
    *   `MediaPanel.tsx`: Reviewed. Structure uses `useProfile` correctly, receives list data via props.
7.  **Clean Up:** **[COMPLETED - MINOR SKIPS]**
    *   Removed custom `profileCache` object store and helpers from `src/utils/idb.ts`.
    *   Removed `websocket-polyfill` import from `MessageBoard.tsx`.
    *   Confirmed remaining `nostr-tools` imports are for necessary `nip19` functions.
    *   Deleted `src/hooks/useMediaNotes.ts`.
    *   Refactored `Podcastr.tsx` to use `useProfile` (part of step 4).
    *   Removed old hook names from `src/frontend-config.json`.
    *   Cleaned up unused imports/state/props in `ImageFeed.tsx`.
    *   **Skipped:** Removal of minor commented-out lines in `VideoList.tsx`, `VideoPlayer.tsx`, `ImageFeed.tsx` due to edit tool issues.

## Next Steps (Planned)

1.  **Investigate NDK NIP-46 Restoration:** Determine the correct pattern in `ndk-js` for restoring a NIP-46 signer using a saved token and implement it in `useAuth.ts`. 