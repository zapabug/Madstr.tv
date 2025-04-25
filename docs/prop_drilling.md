# Prop Drilling Refactor & Component Decomposition Documentation (Revised)

This document outlines the changes made to address prop drilling and improve component organization in the application. It covers the use of React Context API for `auth` and `wallet` state, standard `nostr-hooks` usage for the NDK instance, subsequent fixes, and the decomposition of the large `SettingsModal` component.

## Summary of Changes

1.  **Context Creation (`auth`, `wallet`):**
    *   Created `src/context/AuthContext.tsx` defining `AuthContext` and `AuthProvider`.
    *   Created `src/context/WalletContext.tsx` defining `WalletContext` and `WalletProvider`.
    *   Created consumer hooks `useAuthContext` and `useWalletContext`.

2.  **NDK Initialization (`App.tsx`):**
    *   The singleton NDK instance (`src/ndk.ts`) is initialized **once** at the top level in the main `App` component using the `useNDKInit` hook from `./hooks/useNDKInit.ts`.
    *   `App` handles NDK connection loading and error states before rendering the rest of the application.

3.  **Provider Implementation & NDK Access:**
    *   `AuthProvider` and `WalletProvider` were refactored.
    *   They **no longer** receive `ndkInstance` or `isNdkReady` as props.
    *   Their underlying custom hooks (`useAuth`, `useWallet`) were modified to use the `useNdk()` hook (from `nostr-hooks`) internally to access the singleton NDK instance when needed.

4.  **Component/Hook NDK Access:**
    *   Components and hooks (`AppContent`, `MessageBoard`, `VideoPlayer`, `useMediaNotes`, `useMediaAuthors`, etc.) that require direct access to the NDK instance were refactored.
    *   They **no longer** receive `ndkInstance` or `isNdkReady` as props.
    *   They now import and use the `useNdk()` hook (from `nostr-hooks`) to get the NDK instance directly (or receive it via props from a parent hook that uses `useNdk()`).

5.  **Removal of `NDKContext`:**
    *   The previously created `NDKContext`, `NDKProvider`, and `useNDKContext` were **removed** as they represented an unnecessary abstraction over the standard `useNdk()` hook provided by `nostr-hooks`.

6.  **Application Wrapping (`src/App.tsx`):**
    *   The top-level `App` component now directly wraps `AppContent` (the main application logic) with `<AuthProvider>` and `<WalletProvider>` after NDK initialization is complete.
    *   These providers no longer require NDK-related props.

7.  **Prop Removal:**
    *   Prop drilling for `auth` and `wallet` state was resolved by using `useAuthContext` and `useWalletContext` in child components.
    *   Prop drilling for `ndkInstance` and `isNdkReady` was resolved by removing these props and using `useNdk()` where needed.

8.  **Package & Hook Correction:**
    *   Identified that `nostr-hooks` was the installed package, not `ndk-hooks`.
    *   Corrected import paths across multiple files (`App.tsx`, `useAuth.ts`, `useWallet.ts`, `MessageBoard.tsx`, `VideoPlayer.tsx`).
    *   Corrected hook usage from `useNDK` to `useNdk` and `useUser` to `useProfile` where appropriate based on `nostr-hooks` exports.

9.  **Image URL Error Fix:**
    *   Addressed the "Error: Image URL not found for note" rendering error.
    *   Added a `.filter(note => !!note.url)` step to the `useEffect` hook in `src/App.tsx` that combines author and tag image notes into `combinedImageNotes`.
    *   This ensures that only notes with a valid `url` property reach the `ImageFeed` component, preventing the runtime error.

10. **`SettingsModal` Decomposition:**
    *   Identified `src/components/SettingsModal.tsx` as overly large (> 900 lines).
    *   Created a new directory `src/components/settings/`.
    *   Extracted distinct functionalities into separate components:
        *   `HashtagSettings.tsx`: Manages following/unfollowing hashtags.
        *   `AuthSettings.tsx`: Handles the logged-out view (key generation, NIP-46, nsec login).
        *   `WalletSettings.tsx`: Manages wallet configuration (Mint URL, default tip) and actions (deposit info, tipping devs).
    *   `SettingsModal.tsx` now primarily acts as a container, rendering these sub-components conditionally based on login state and managing modal-level concerns (open/close, error display, focus, logout backup/confirmation).
    *   Props like `setDisplayError` and `setDefaultMintUrl` are passed down from `SettingsModal` to the relevant child components.
    *   Reduced `SettingsModal.tsx` line count significantly (to ~440 lines).

## Refactoring Issues Encountered & Resolutions

*   **Initial `NDKContext` Approach:** An initial refactor introduced a custom `NDKContext`. This was later identified as **not recommended** according to NDK/`nostr-hooks` best practices and was subsequently removed in favor of using `useNdk()`.
*   **Hook Dependencies:** Several custom hooks (`useAuth`, `useWallet`, `useMediaNotes`, etc.) needed to be updated to use `useNdk()` internally instead of expecting `ndkInstance` as a prop/argument.
*   **Component Prop Removal:** Components like `VideoPlayer`, `MessageBoard`, and `MediaPanel` were updated to remove `ndkInstance`/`isNdkReady` props and use `useNdk()` if direct NDK access was required.
*   **Provider Prop Removal:** `AuthProvider` and `WalletProvider` were updated to remove `ndkInstance`/`isNdkReady` props.
*   **Linter Errors:** Multiple linter errors occurred during the refactoring related to incorrect props, missing dependencies in hooks after removing props, and incorrect assumptions about hook return types. These were resolved iteratively.
*   **Image URL Error:** Runtime error occurred in `ImageFeed` due to notes with missing `url` properties being passed down. Resolved by adding explicit filtering in `App.tsx`.
*   **`SettingsModal` Refactor:** Minor issues with moving constants/helpers between the modal and its new child components were encountered and resolved during the decomposition.

## Code Cleanup: Removed Unused Imports/Variables

Significant cleanup occurred during the refactoring phases.

*   **During Initial Prop Drilling Fix:**
    *   Removed unused NDK-related props and context (`NDKContext`).
    *   Removed unused imports related to `NDK` in context files.
*   **During `SettingsModal` Decomposition:**
    *   Removed state, refs, handlers, constants, and helper components from `SettingsModal` as they were moved to `HashtagSettings`, `AuthSettings`, or `WalletSettings`.
    *   Removed corresponding unused imports (e.g., `FiPlusCircle`, `FiXCircle`, `DEFAULT_MINT_URLS`) from `SettingsModal`.

The following represent specific cleanups noted in the previous version, some of which were addressed by the SettingsModal refactor:

*   **`src/components/SettingsModal.tsx` (Before Decomposition):**
    *   Imports: `FiSettings`, `FiHeart`
    *   Type Alias: `NDKInstance`
    *   Function: `truncateKey` (Moved)
    *   State Variables: `isTippingDevs`, `tipDevStatus`
    *   Handler Function: `handleNpubKeyDown`
*   **`src/hooks/useAuth.ts`:**
    *   Imports: `NDK`, `NDKUser`, `StoredNsecData`
    *   Variables: `relays`
    *   Helper Function: `loadNip46SignerSecret`
*   **`src/hooks/useWallet.ts`:**
    *   Imports: `NDK`, `NDKUser`, `NostrEvent`, `NDKKind`
    *   Destructured Variables: `currentUserNpub`, `getNdkSigner`
    *   Imports: `PayLnInvoiceResponse`, `TokenV3` (Changed to `TokenV2`)

## Current Status

*   Prop drilling for `auth`, `wallet`, and NDK instance/readiness is resolved using recommended context and `nostr-hooks` patterns.
*   `AuthContext` and `WalletContext` handle their respective states.
*   NDK is initialized centrally in `App.tsx` and accessed via `useNdk()` elsewhere.
*   The codebase avoids the anti-pattern of creating a custom context for the NDK instance.
*   **`SettingsModal` has been decomposed into smaller, more focused components (`HashtagSettings`, `AuthSettings`, `WalletSettings`), significantly improving maintainability and readability.**
*   Major linter errors related to imports, hook usage, type mismatches, null checks, and ref assignments have been fixed.
*   The runtime error related to missing image URLs in `ImageFeed` has been resolved by filtering notes in `App.tsx`.
*   Unused code has been significantly reduced.

## Persistent Issues / Next Steps

*   **Potentially Spurious Linter Error:**
    *   `Expected 0 arguments, but got 1.` (Referring to `<RelayStatus>` call in `App.tsx`): Remains flagged by the linter, but the component definition correctly accepts the provided props. **Action:** Continue monitoring; investigate further only if it causes runtime issues or hinders other refactoring.
*   **Initial Author Loading:**
    *   Observed instances where `useMediaAuthors` initially returned an empty list. **Action:** Monitor during testing. Consider increasing timeout or adding retry logic if persistent. **Note:** The `SettingsModal` refactor makes troubleshooting *related* settings easier, but doesn't directly address this data loading issue.
*   **Next Functional Steps:**
    1.  **Handle Navigation/Mode Keybindings:** Verify/reimplement logic for Previous/Next item navigation and View Mode switching. High priority.
    2.  **Thorough Testing:** Perform comprehensive testing of all features, especially around the newly refactored Settings modal components:
        *   Media loading (Images, Videos, Podcasts).
        *   Author/Tag fetching toggles.
        *   Authentication flows (NIP-07, NIP-46, Nsec Gen/Login/Logout, Backup QR).
        *   Wallet interactions (Mint URL, Default Tip, Balance, Deposit, Tipping).
        *   Hashtag management (Add/Remove/Suggestions).
        *   Message board interactions.
        *   Fullscreen mode, inactivity timer.
        *   Keyboard/remote controls.
        *   Responsiveness.
