# MadTrips TV App Debugging & Refactoring Context

## Project Overview

*   **Application:** MadTrips TV App
*   **Framework:** React, TypeScript, Vite
*   **Styling:** TailwindCSS
*   **Core Functionality:** Displaying Nostr-based media (images, podcasts, videos) with remote control navigation.
*   **Key Libraries:** `@nostr-dev-kit/ndk`, `nostr-hooks`, `@cashu/cashu-ts`, `idb`.
*   **Features Added:** Authentication (nsec/NIP-46), Hashtag Following, Internal Cashu Wallet (DM Deposits/Tipping).

## Initial Problem

After integrating the Authentication, Hashtag Following, and Cashu Wallet features, the application became unstable, exhibiting:

*   Excessive console logging.
*   Rapid, seemingly continuous re-rendering of components.
*   UI glitches like flickering or images not displaying correctly, potentially due to render loops interrupting the UI update process.

## Troubleshooting Summary

1.  **NDK Instance Management:** Explored various ways to manage the NDK instance, including a direct singleton, a custom `useNDKInit` hook, and attempts to use provider patterns (`NDKProvider`, `NostrProvider`).
2.  **Dependency Analysis:** Investigated potential unstable dependencies in hooks like `useAuth`, `useMediaNotes`, and `useMediaState` that could trigger re-renders (e.g., array reference changes for `followedTags`, `mediaAuthors`, `notes`). Added logging to track effect triggers.
3.  **Feedback Loop Identification:** Found a feedback loop where `App.tsx` shuffling effects created new array references, passed them to `useMediaState`, which reprocessed them due to reference changes, causing further state updates.
4.  **Feedback Loop Mitigation:** Modified `useMediaState` to compare prop references (`initial...Notes`) using `useRef`, preventing reprocessing if only the reference changed.
5.  **Critical Bug Fix:** Corrected a bug in `useMediaState` where the `currentItemUrl` effect incorrectly used podcast state/indices when in image mode. Fixed the logic and dependencies.
6.  **Library Identification:** Confirmed the project uses `nostr-hooks` (v4.3.3) for React integration, not `ndk-hooks` or `@nostr-dev-kit/ndk-react`.

## Current Status & Roadblock

*   The feedback loop mitigation in `useMediaState` (reference checking) seems partially effective (`Skipping... notes processing` logs appeared).
*   The critical `currentItemUrl` bug in `useMediaState` has been fixed.
*   **However, the core instability (excessive logging, rapid updates) persists.**
*   Attempts to refactor `src/main.tsx` to use the standard Provider pattern from `nostr-hooks` (assuming `<NostrProvider>`) failed due to incorrect export/usage. **We need to determine the correct way to initialize and use `nostr-hooks` throughout the app.**
*   Received expert guidance emphasizing adherence to Nostr principles (local-first, component-level subscriptions) and using the patterns provided by the chosen hooks library (`nostr-hooks` in this case) instead of custom fetching/state management for Nostr data.

## Overall Goal

1.  **Stabilize the Application:** Eliminate the render loops and excessive updates.
2.  **Refactor to `nostr-hooks` Best Practices:**
    *   Implement the correct setup/provider pattern for `nostr-hooks`.
    *   Replace custom hooks (`useMediaNotes`, `useMediaAuthors`, `useProfileData`) with the appropriate hooks from `nostr-hooks` (e.g., `useSubscribe`, `useUserProfile`).
    *   Refactor components/hooks to consume Nostr data via `nostr-hooks` directly.
    *   Embrace local-first rendering (remove unnecessary loading states).

## Next Steps

1.  Determine the correct way to initialize and use the `nostr-hooks` library (Provider component name, context hook name).
2.  Refactor `src/main.tsx` with the correct setup.
3.  Begin replacing custom Nostr data fetching hooks with `nostr-hooks` equivalents, starting perhaps with `useMediaNotes` -> `useSubscribe`. 