# Prop Drilling Refactor & Component Decomposition Documentation (Revised)

This document outlines the changes made to address prop drilling and improve component organization in the application. It covers the use of React Context API for `auth` and `wallet` state, standard `nostr-hooks` usage for the NDK instance, subsequent fixes, and the decomposition of the large `SettingsModal` component.

## Summary of Changes

1.  **Context Creation (`auth`, `wallet`):**
    *   Created `src/context/AuthContext.tsx` defining `AuthContext` and `AuthProvider`.
    *   Created `src/context/WalletContext.tsx` defining `WalletContext` and `WalletProvider`.
    *   Created consumer hooks `useAuthContext` and `useWalletContext`.

2.  **NDK Initialization (`App.tsx`):**
    *   The singleton NDK instance (`src/ndk.ts`) is obtained along with a reliable readiness flag (`isReady`) using the `useNDKInit` hook **once** in the main `App` component.
    *   `App` handles NDK connection loading and error states before rendering the rest of the application.

3.  **Provider Implementation & NDK Access:**
    *   `AuthProvider` and `WalletProvider` were refactored.
    *   They **now accept `ndkInstance` and `isNdkReady` as props** from the parent `App` component.
    *   They pass these props down to their underlying custom hooks (`useAuth`, `useWallet`).

4.  **Component/Hook NDK Access:**
    *   Hooks requiring NDK state (`useAuth`, `useWallet`) **now accept `ndkInstance` and `isNdkReady` as parameters** instead of calling `useNdk()` internally.
    *   Other components and hooks (`AppContent`, `useMediaNotes`, `useMediaAuthors`, `useUserProfile`, etc.) that require direct access to the NDK instance receive it via props passed down from `App` and `AppContent`.

5.  **Removal of `NDKContext`:**
    *   The previously created `NDKContext`, `NDKProvider`, and `useNDKContext` were **removed** as they represented an unnecessary abstraction and were replaced by the prop-passing pattern.

6.  **Application Wrapping (`src/App.tsx`):**
    *   The top-level `App` component now wraps `AppContent` (the main application logic) with `<AuthProvider>` and `<WalletProvider>` after NDK initialization is complete.
    *   **`AuthProvider` and `WalletProvider` receive `ndkInstance` and `isNdkReady` as props** from `App`.
    *   `AppContent` also receives `ndkInstance` and `isNdkReady` as props from `App`.

7.  **Prop Removal/Flow:**
    *   Prop drilling for `auth` and `wallet` state was resolved by using `useAuthContext` and `useWalletContext` in child components.
    *   Prop drilling for `ndkInstance` and `isNdkReady` was resolved by passing them down from `App` to the providers and `AppContent`, and then into the hooks that need them, eliminating internal `useNdk()` calls within those hooks.

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
*   **Internal `useNdk()` Instability:** Using `useNdk()` inside multiple custom hooks (`useAuth`, `useWallet`) led to inconsistencies in NDK readiness state. **Resolved by removing internal `useNdk()` calls and passing `ndkInstance`/`isNdkReady` down as props** from the central `useNDKInit` call in `App.tsx` through the providers (`AuthProvider`, `WalletProvider`) to the hooks.
*   **Hook Dependencies:** Several custom hooks (`useAuth`, `useWallet`, `useMediaNotes`, etc.) needed to be updated to accept `ndkInstance`/`isNdkReady` as props/arguments instead of expecting them implicitly or calling `useNdk()`.
*   **Component Prop Removal/Addition:** Components and providers were updated to accept or remove `ndkInstance`/`isNdkReady` props as needed during the refactoring.
*   **Linter Errors:** Multiple linter errors occurred during the refactoring related to incorrect props, missing dependencies in hooks after removing props, incorrect assumptions about hook return types, and import errors (like NDK type import). These were resolved iteratively.
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

*   Prop drilling for `auth`, `wallet` state is resolved using context.
*   **NDK state (`ndkInstance`, `isReady`) is managed centrally by `useNDKInit` in `App.tsx` and consistently passed down via props to providers and components/hooks, eliminating internal `useNdk()` calls in `useAuth` and `useWallet`.**
*   `AuthContext` and `WalletContext` handle their respective states.
*   The codebase avoids the anti-pattern of creating a custom context for the NDK instance or relying on unstable internal hook calls.
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
    2.  **Thorough Testing:** Perform comprehensive testing of all features, especially around the newly refactored Settings modal components and the **now-stable authentication flows**:
        *   Media loading (Images, Videos, Podcasts).
        *   Author/Tag fetching toggles.
        *   Authentication flows (NIP-07, NIP-46, Nsec Gen/Login/Logout, Backup QR).
        *   Wallet interactions (Mint URL, Default Tip, Balance, Deposit, Tipping).
        *   Hashtag management (Add/Remove/Suggestions).
        *   Message board interactions.
        *   Fullscreen mode, inactivity timer.
        *   Keyboard/remote controls.
        *   Responsiveness.
