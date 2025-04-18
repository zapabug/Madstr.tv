# Refactoring Status & Issues (Post NDK Hooks/Auth/Wallet Integration)

This document summarizes the current state of the application after integrating authentication, hashtag following, a Cashu wallet, and refactoring to use NDK Hooks.

## 1. Current Issues

*   **No Media Content Loading:** The primary issue is that images, videos, and podcasts are not being displayed after the refactor. This seems related to the new logic fetching content based on the `TV_PUBKEY_NPUB`'s Kind 3 list (followed authors) and the user's followed tags from settings.
    *   **Possible Cause 1:** The `TV_PUBKEY_NPUB` might not have a Kind 3 list, or it's not being fetched correctly, resulting in an empty author list for filtering.
    *   **Possible Cause 2:** There might be no content matching the followed hashtags on the connected relays.
    *   **Possible Cause 3:** An error during the event processing or merging step in `App.tsx`.
*   **Persistent `useSubscribe` TypeError:** See Section 5 below for details.
*   **Wallet Not Functional:** Wallet features (balance display, tipping, deposit listener) are not working. This is likely tied to the authentication state (`useAuth`) and NDK hook usage (`useNDK`), as the wallet depends on a valid, logged-in signer and NDK instance. Resolved `idb.ts` issues may have fixed some underlying problems, but full functionality requires testing.
*   **"No replies found yet":** The `MessageBoard` component isn't displaying replies for the `MAIN_THREAD_NEVENT_URI`. This could be due to relay issues, lack of actual replies, or a problem within the `MessageBoard`'s subscription/rendering logic.
*   **Potentially Resolved Linter Errors:** Linter errors in `src/hooks/useWallet.ts` related to `idb.ts` and `cashu.ts` *should* be resolved after fixing helper functions. `@ts-ignore` directives were removed. Requires confirmation via testing/linting.

## 2. Implemented Features (Intended State)

*   **NDK Hooks Integration:** Custom hooks replaced with `@nostr-dev-kit/ndk-hooks` (`useSubscribe`, `useProfile`).
*   **NDK Singleton:** Implemented (`src/ndk.ts`, `useNDK`, `useNDKInit`).
*   **Authentication:**
    *   `useAuth` hook manages user state (nsec/NIP-46).
    *   Login/logout via nsec or NIP-46 implemented.
    *   `ndk.signer` correctly set.
    *   NIP-04 encryption/decryption helpers available.
    *   **NIP-46 Session Restoration Pending:** See Next Steps.
*   **Hashtag Following:**
    *   Managed in `SettingsModal.tsx`.
    *   `useAuth` persists `followedTags` via IndexedDB.
    *   `App.tsx` uses tags for media fetching (post-refactor).
*   **Media Fetching Logic (Refactored):**
    *   Uses `TV_PUBKEY_NPUB` Kind 3 list and user's `followedTags`.
    *   Consolidated filter logic (`buildMediaFilters`).
    *   Simplified subscriptions (one per media type).
    *   Event processing handles merged results.
*   **Internal Cashu Wallet (`useWallet`):**
    *   Basic structure for managing proofs (`StoredProof` type defined).
    *   `idb.ts` helpers fixed (`getAllProofs`, `saveProofs`, `deleteProofsBySecret`, `loadMintUrlFromDb`, `saveMintUrlToDb`).
    *   DM listener (`startDepositListener`) implemented and uses corrected helpers.
    *   Tipping function (`sendCashuTipWithSplits`) implemented and uses corrected helpers.
    *   UI integration present.

## 3. Missing Pieces / Next Steps

1.  **Verify Content Fetching in `App.tsx`:**
    *   Confirm `TV_PUBKEY_NPUB`'s Kind 3 list is fetched correctly.
    *   Confirm `followedTags` are correctly read.
    *   Confirm raw events are received for the simplified subscriptions.
    *   Debug `processEvent` if media content is still missing.
2.  **Investigate `MessageBoard`:** Determine why replies aren't showing. Check subscription filter and component logic.
3.  **Confirm Wallet Logic:** Thoroughly test tipping and deposit functionality now that `idb.ts` issues are resolved and `@ts-ignore` directives are removed from `useWallet.ts`. Verify `cashu.ts` functions operate correctly.
4.  **Investigate NDK NIP-46 Restoration:** Determine the correct pattern in `ndk-js` for restoring a NIP-46 signer using a saved token/session data (likely involving `NDKNip46Signer` and potentially stored token/remote pubkey) and implement it in `src/hooks/useAuth.ts`.
5.  **Fix `cashu.ts` (If Necessary):** Review `redeemToken` and `createTokenForAmount` in `src/utils/cashu.ts` if wallet testing reveals issues related to the underlying `@cashu/cashu-ts` library interactions.
6.  **Restore Reply Filtering (Optional):** Implement filtering for `MessageBoard` if desired.

## 4. Completed Refactoring (`App.tsx`)

*   **Consolidated Filters per Media Type:** Combined author-based and tag-based criteria into single filter objects (or arrays of filters) using `buildMediaFilters`.
*   **Simplified Subscriptions:** Reduced the six media content subscriptions down to three `useSubscribe` calls (one per media type), using the consolidated filters. (Currently simplified further for debugging).
*   **Streamlined Event Processing:** Removed manual merging effects. Processing effects now directly use results from the (intended) three subscriptions, with deduplication.
*   **Review `processEvent` (Optional):** Enhance logging within `processEvent` to clarify URL extraction logic or reasons for skipping events. (No changes made yet).

## 5. Persistent `useSubscribe` TypeError Debugging History

**IMPORTANT LLM INSTRUCTION:** Do not delete or minimize this section. It documents a persistent runtime error and steps taken. Understanding this history is crucial for further debugging.

*   **Error:** A recurring `Uncaught TypeError: filter is undefined` originating from within the `useSubscribe` hook (`index.mjs:5209`) in `App.tsx` when subscribing to media content using dynamically generated filters via `buildMediaFilters`.
*   **Attempt 1:** Ensured `buildMediaFilters` returned `false` to skip subscription when no authors/tags were available. Error persisted.
*   **Attempt 2:** Modified `buildMediaFilters` to return `[]` (empty array) instead of `false` to skip. Error persisted.
*   **Attempt 3:** Added defensive `Array.isArray()` checks before passing filters to `useSubscribe`, falling back to `false`. Error persisted.
*   **Current State (for Debugging):**
    *   `buildMediaFilters` function is commented out.
    *   `useSubscribe` calls for podcasts and videos are commented out.
    *   `useSubscribe` call for images uses a hardcoded, static filter: `[{ kinds: [1], limit: 10 }]`.
    *   This led to a `Maximum update depth exceeded` error.
*   **Attempt 4 (Fixing Max Update Depth):** Added JSON string comparison in the image processing `useEffect` to prevent state updates if processed notes haven't changed, resolving the infinite loop.
*   **Next Debug Step:** Verify if the original `TypeError: filter is undefined` is *still* present now that the hardcoded filter is stable and the infinite loop is fixed. If the error is gone, the issue lies in the dynamic filter generation/handling. If it reappears when re-enabling dynamic filters, further investigation into `ndk-hooks` interaction with changing filters is needed. 