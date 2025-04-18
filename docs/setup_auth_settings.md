Okay, let's break down the requirements for adding a settings page, authentication, hashtag following, and a tipping wallet. This involves significant changes touching UI, state management, Nostr interactions, and security.

Here's a proposed plan of action, walking through the thought process for each step:

**Overall Goal:** Introduce user-specific settings, authentication, content filtering (#t tags), and the ability to send simple Cashu tips to content creators via encrypted DMs, all within the TV app's remote-controlled interface.

## 2. Core Technologies (Update based on refactor)

*   **Frontend Framework:** React
*   **State Management & Side Effects:** Primarily custom hooks (`useAuth`, `useMediaState`, `useMediaElementPlayback`, etc.) and **`@nostr-dev-kit/ndk-hooks` (`useNDK`, `useSubscribe`, `useProfile`, `useNDKInit`)**. Orchestrated by `App.tsx`.
*   **Nostr Integration:** **`@nostr-dev-kit/ndk`, `@nostr-dev-kit/ndk-hooks`**, `nostr-tools` (for `nip19`).
*   **Cashu Integration:** `@cashu/cashu-ts`.
*   **Caching:** IndexedDB via `idb` (`settings`, `cashuProofs`), **NDK's internal cache**. (Removed `profileCache`)
*   **Styling:** Tailwind CSS, `framer-motion`.
*   ...

## 3. Implementation Plan (Update Status)

**Phase 1: Settings Modal Foundation & Authentication**
*   Step 1.1: Create `SettingsModal.tsx` ✅
*   Step 1.2: Integrate Modal Trigger ✅
*   Step 1.3: Implement Auth Logic (`useAuth.ts`) - ✅ **Refactored to use `useNDK`.**
*   Step 1.4: Add Auth UI to Settings Modal ✅

**Phase 2: Hashtag Following**
*   Step 2.1: Hashtag Management State & UI ✅
*   Step 2.2: Integrate Hashtags into Data Fetching - ✅ **Refactored to use `useSubscribe` with filters.**

**Phase 3: Internal Cashu Wallet & DM Tipping**
*   Step 3.1: Setup Wallet Structure (`useWallet.ts`, `idb.ts`, `cashu.ts`) ✅
*   Step 3.2: Implement DM Deposit Listener ✅ (Uses `useAuth`, `useNDK`)
*   Step 3.3: Implement Tipping Function (`sendCashuTipWithSplits`) ✅ (Uses `useAuth`, `useNDK`)
*   Step 3.4: Tipping UI Integration (`ImageFeed`, `VideoPlayer`) ✅
*   Step 3.5: Settings Modal Wallet UI ✅
*   Step 3.6: `useAuth` Enhancements (DM Helpers) ✅

**Phase 4: Refinement & Integration**
*   Step 4.1: Context API - ❌ (Not implemented)
*   Step 4.2: Error Handling & Loading States ✅ (Basic implemented)
*   Step 4.3: TV Navigation & Focus Polish ✅
*   ✅ **NDK Hooks Refactoring:** Completed. Replaced custom hooks with `useSubscribe`, `useProfile`. Addressed NDK initialization and hook order issues.

---

## 🤔 Further Considerations & Edge Cases (Update caching)

*   ... (Keep relevant considerations)
*   **Caching:** App relies on NDK's internal caching for events/profiles and IndexedDB for wallet proofs/settings. Manual `profileCache` removed.
*   ...

---

## ❓ Final Decisions Needed (No change needed here)

Answers based on current implementation:

**(Authentication & Security - `useAuth.ts`)**
1.  NIP-46 Permissions: `get_public_key`, `sign_event:4`, `nip04_encrypt`, `nip04_decrypt`. (Kind 9735 permission not needed as Zap Receipts aren't implemented).
2.  NIP-46 Timeout: 75 seconds (Hardcoded in `useAuth`).
3.  NIP-46 Relays: Uses `wss://nsec.app` + others specified in connect URI params (Handled by `useAuth`).
4.  Nsec Re-Display Policy: Yes, via 3 OK presses on focused npub in Settings, with warnings (Implemented).

**(Hashtag Following - `#t`)**
5.  Tag Merging/Replacement: Merge on login, OK press removes focused tag (Implemented).
6.  Tag Input: Store without '#', add one keyword at a time, list items focusable for deletion via OK press (Implemented).

**(Internal Cashu Wallet & DM Tipping - `useWallet.ts` / UI)**
7.  **Default Mint URL:** Currently hardcoded (`DEFAULT_MINT_URL` in `useWallet.ts`). User can change this in settings. **[Current Default: `https://8333.space:3338` - CONFIRM IF THIS IS OK]**
8.  **Zapsplit Source & Defaults:** Zapsplits are NOT implemented. Tip goes 100% to the primary recipient npub.
9.  **Tip Amounts:** Only the default `DEFAULT_TIP_AMOUNT` (currently 121 sats) is used via the focus+OK interaction. No UI for selecting other amounts. **[CONFIRM IF 121 SATS IS OK]**
10. **Deposit DM Check:** Continuous listener implemented (`startDepositListener` in `useWallet.ts`), started/stopped by `SettingsModal`.
11. **Transaction History:** Not implemented.

**(General UI/UX)**
12. Profanity Warning Text (nsec): Current text used in `alert()` calls.
13. **Warning Text (Cashu Proofs):** Implemented in `SettingsModal`.

---

## ��️ Implementations (Update status)

*   ✅ **NDK Hooks Refactoring:** Completed.

---

## ❗ Known Issues & Workarounds (Update)

*   **NIP-46 Signing:** Requires testing.
*   **Cashu Library:** Potential for brittleness.
*   **Error Handling:** Could be more granular.
*   **Zapsplits/Receipts:** Not implemented.
*   **Mint Configuration:** Uses default if none saved.
*   **NDK Instance Source:** Refactored to use singleton and `useNDK` hook pattern.
*   *(Remove specific performance/logging issue mention unless still confirmed)*
*   *(Remove specific NDK instance stability issue mention)*

---
