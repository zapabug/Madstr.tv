Okay, let's break down the requirements for adding a settings page, authentication, hashtag following, and a tipping wallet. This involves significant changes touching UI, state management, Nostr interactions, and security.

Here's a proposed plan of action, walking through the thought process for each step:

**Overall Goal:** Introduce user-specific settings, authentication, content filtering (#t tags), and the ability to send simple Cashu tips to content creators via encrypted DMs, all within the TV app's remote-controlled interface.

**Phase 1: Settings Modal Foundation & Authentication**

*   **Step 1.1: Create the Settings Modal Component (`SettingsModal.tsx`)**
    *   **Thought Process:** We need a dedicated container for all settings. A modal is requested, which keeps it separate from the main viewing experience. It needs to be controllable via keyboard/remote.
    *   **Implementation:**
        *   Create a new file `src/components/SettingsModal.tsx`.
        *   Use `framer-motion` for entry/exit animations (e.g., scale/fade in).
        *   Style it with TailwindCSS, likely a left  overlay with a distinct background.
        *   Add basic structure: Title ("Settings"), Close and save button .
        *   Ensure all interactive elements within the modal are focusable and navigable via D-pad/keyboard (`tabIndex={0}`, proper focus styling). Add initial focus trapping/management logic (maybe using `focus-trap-react` or a custom hook).

*   **Step 1.2: Integrate Modal Trigger and State**
    *   **Thought Process:** The modal needs to be opened and closed. The `App.tsx` component is the central orchestrator, making it the logical place to manage the modal's visibility state. We also need a way to trigger it, likely a keyboard shortcut ***tv app setting button already implemented******.
    *   **Implementation: rework this dpad navigation only**
        *   Add state to `App.tsx`: `const [isSettingsOpen, setIsSettingsOpen] = useState(false);`.
        *   Conditionally render `<SettingsModal />` in `App.tsx`'s return JSX based on `isSettingsOpen`.
        *   Update `useKeyboardControls` hook: Add a key (e.g., 's' or a remote button equivalent) to toggle `isSettingsOpen`. Pass `setIsSettingsOpen` down as a prop/callback.
        *   Pass a `onClose={() => setIsSettingsOpen(false)}` prop to `SettingsModal`.

*   **Step 1.3: Implement Authentication Logic (`useAuth.ts`)**
    *   **Thought Process:** Authentication is central to user-specific settings and wallet functions. Handling keys (especially private keys) requires careful management and security considerations. Encapsulating this in a dedicated hook (`useAuth`) is crucial. We need functions to generate keys, log in (load keys), log out (clear keys), and securely store the private key (nsec). **Storing nsec directly in `localStorage` is highly discouraged due to security risks.** IndexedDB is slightly better but still vulnerable in browser environments. We must warn the user heavily if we display the nsec *a greed but this is the easyest way to give tv user a new npub, nostr-conect via qr is recomended or using amber or someother key storage*
    *   **Implementation:**
    *this app already has an npub set up, logging in will replace this one*
    *givig the user qr with nsec alows user to set up tvs follows for podcast/image/video content, hadndle wallet etc..*
        *   Create a new hook `src/hooks/useAuth.ts`.
        *   Inside the hook:
            *   Add state for `currentUserNpub: string | null`, `currentUserNsec: string | null` (handle with extreme care!), `isLoggedIn: boolean`.
            *   **Key Generation:** Add a function `generateNewKeys()` that uses `nostr-tools` (`generatePrivateKey`, `getPublicKey`) to create a new hex private key and public key, then converts them to nsec/npub using `nip19.encode`. Store these securely (see next point).
            *   **Secure Storage:**
            *Nostr Internet of things, giving npubs to tvs*
            Research and implement the *most secure client-side storage possible* within the TV environment constraints. This might involve IndexedDB with careful handling, or potentially leveraging platform-specific secure storage if available (unlikely in a standard web app context). **Crucially, clearly document the risks.** Consider if generating keys *on the TV* is wise vs. importing via NIP-07 or manual entry (which is hard on TV).
            *   **Login:** Add `login(nsec: string)` function. It decodes the nsec, gets the npub, validates the keypair, updates the state, and stores the key securely.
            *   **Logout:** Add `logout()` function. It clears the keys from state and secure storage.
            *   **Initialization:** Use `useEffect` to attempt loading keys from secure storage on hook mount.
        *   Return `currentUserNpub`, `isLoggedIn`, `generateNewKeys`, `login`, `logout`, and potentially a way to get the `currentUserNsec` *only when explicitly needed and handled securely* (e.g., for signing).

*   **Step 1.4: Add Auth UI to Settings Modal**
    *   **Thought Process:** The user needs buttons and displays within the Settings modal to interact with the authentication logic provided by `useAuth`. We need to handle the display of the nsec QR code *very carefully*.
    *   **Implementation:**
        *   In `SettingsModal.tsx`, import and use the `useAuth` hook.
        *   Conditionally display UI based on `isLoggedIn`:
            *   **If Logged Out:** Show "Generate New Keys" button and potentially an input field + "Login with Nsec" button (manual nsec input is awkward on TV, consider alternatives like NIP-07 bridging if possible later).
            *   **If Logged In:** Show "Logged in as: {currentUserNpub}", "Show Private Key (nsec) QR", and "Logout" button.
        *   **Key Generation:** Wire the "Generate New Keys" button to call `generateNewKeys`. After generation, perhaps briefly show the nsec QR code with strong warnings.
        *   **Nsec QR Code Display:** Add a section (initially hidden) containing the `<QRCode />` component. When the "Show Private Key QR" button is pressed (after confirmation/warning), display the QR code containing the `nsec` string. Add *very prominent warnings* about the security risk of someone photographing this code.
        *   **Logout:** Wire the "Logout" button to call `logout`.

**Phase 2: Hashtag Following**

*   **Step 2.1: Hashtag Management State & UI**
    *   **Thought Process:** Users need to add and remove hashtags they want to follow. This list needs to be stored persistently and used to filter content fetches. We'll add a dedicated section in the Settings Modal.
    *   **Implementation:**
    *maybe provide a list of trending?*
        *   Add state to manage the list of followed tags, potentially within `useAuth` or a new dedicated hook/context if preferred. For persistence, use `localStorage` or IndexedDB (less critical than nsec). Example state: `const [followedTags, setFollowedTags] = useState<string[]>([]);`. Load/save this state in `useEffect`.
        *   In `SettingsModal.tsx`, add a new section "Followed Hashtags".
        *   Add an input field for adding new tags (e.g., `#music`).
        *   Add a "Add Tag" button.
        *   Display the current `followedTags` list, with a "Remove" button next to each tag.
        *   Ensure keyboard/D-pad navigation works for the input field, add button, list items, and remove buttons.

*   **Step 2.2: Integrate Hashtags into Data Fetching**
    *   **Thought Process:** The core data fetching hook (`useMediaNotes`) needs to be aware of the followed hashtags to adjust its Nostr filters.
    *   **Implementation:**
        *   Modify `useMediaNotes`: Accept `followedTags: string[]` as an optional prop.
        *   Inside `useMediaNotes`, when constructing the `NDKFilter`:
            *   If `followedTags` is provided and not empty, add a `#t` filter property to the filter object: `filter['#t'] = followedTags;`.
        *   In `App.tsx`, get `followedTags` from the relevant state/hook/context and pass it down to the `useMediaNotes` calls (for images and videos, maybe not podcasts unless desired).

**Phase 3: Internal Cashu Wallet & DM Tipping (Simplified)**

*   **Step 3.1: Set up Internal Wallet Structure (`useWallet.ts`, `utils/idb.ts`, `utils/cashu.ts`)**
    *   **Thought Process:** The TV app needs to manage its own Cashu tokens (Nuts/proofs) internally. This requires secure storage, interaction with a Cashu library, and a way to track balance. We'll create a dedicated hook (`useWallet`) and helper utilities. Storing proofs client-side is inherently risky and needs strong warnings.
    *   **Implementation:**
        *   **Dependency:** Add `@cashu/cashu-ts` library (`npm install @cashu/cashu-ts`).
        *   **Storage (`utils/idb.ts`):** Define IndexedDB structures (`cashuProofs`) and helper functions (`addProofs`, `getProofsByMint`, `getAllProofs`, `removeProofs`, `clearProofs`) to store Cashu proofs, keyed by secret and indexed by mint URL.
        *   **Cashu Helper (`utils/cashu.ts`):** Create a helper module (`cashuHelper`) encapsulating `@cashu/cashu-ts` interactions: `initCashuWallet`, `redeemToken`, `createTokenForAmount`, `getProofsBalance`. Implemented with workarounds for potential type discrepancies in the library.
        *   **Wallet Hook (`useWallet.ts`):** Initialize state (`proofs`, `balanceSats`, `isListeningForDeposits`, `walletError`, `isLoadingWallet`, `configuredMintUrl`). Implement core wallet logic (`loadWalletState`) to fetch proofs from IDB and calculate balance.
            *   **Crucial Security Warning:** Add warnings in UI later about risks of browser proof storage.

*   **Step 3.2: Implement DM Deposit Listener (`useWallet.ts`, requires `useAuth`)**
    *   **Thought Process:** The wallet needs to receive funds via encrypted Nostr DMs (Kind 4) containing `cashuA...` tokens. `useWallet` needs `useAuth` for decryption.
    *   **Implementation (`useWallet.ts`):**
        *   Add internal function `handleIncomingDm` (defined within `startDepositListener`) to decrypt DMs using `auth.decryptDm`, find tokens via regex, redeem them using `cashuHelper.redeemToken`, add new proofs via `idb.addProofs`, pand reload wallet state.
        *   Add function `startDepositListener(auth: UseAuthReturn, ndk: NDK)`: Checks login status, subscribes via NDK to Kind 4 DMs to the user's pubkey, calls `handleIncomingDm` on events, handles EOSE and close events.
        *   Add function `stopDepositListener()`: Unsubscribes from NDK.
        *   Add `useEffect` cleanup to call `stopDepositListener` on unmount.

*   **Step 3.3: Implement Tipping Function (`sendCashuTipWithSplits`) in `useWallet.ts` (Simplified splits - 100% primary)**
    *   **Thought Process:** Tipping involves spending internal proofs, optionally handling splits (simplified for now), generating Cashu tokens, and sending them via encrypted DMs.
    *   **Implementation (`useWallet.ts`):**
        *   Add function `sendCashuTipWithSplits(params: SendTipParams)`:
            *   **1. Checks:** Verify balance, mint URL configuration, and necessary auth methods.
            *   **2. Splits:** Simplified to 100% to primary recipient (TODO: Zapsplit profile parsing).
            *   **3. Get Proofs:** Filter proofs for the `configuredMintUrl`.
            *   **4. Generate & Send Loop:** Iterate through recipients:
                *   Call `cashuHelper.createTokenForAmount`.
                *   Decode recipient npub to hex (`nip19.decode`).
                *   Construct DM plaintext.
                *   Call `auth.encryptDm`.
                *   Create Kind 4 `NDKEvent`, tag with recipient hex pubkey.
                *   Call `auth.signEvent`.
                *   Publish DM event using `dmEvent.publish()`.
                *   Includes robust try-catch blocks around token creation, encryption, and publishing.
            *   **5. Update State:** If all DMs sent successfully, calculate spent proofs by comparing initial proofs for the mint with the final `remainingProofsForOperation`, remove spent proofs using `idb.removeProofs`, and reload wallet state using `loadWalletState`.
            *   **6. Zap Receipt:** Skipped for now (TODO).

*   **Step 3.4: Tipping UI Integration (`ImageFeed.tsx`, `VideoPlayer.tsx`)**
    *   **Thought Process:** Implement the primary tipping mechanism via focusing the author's npub and pressing OK for a default amount. Optionally retain a button for more complex tips.
    *   **Implementation:**
        *   **Primary Interaction (Focus Npub + OK):**
            *   Make the author's `npub` display component within `ImageFeed.tsx` and `VideoPlayer.tsx` focusable (`tabIndex={0}`) and style its focused state clearly.
            *   Add an `onKeyDown` handler to the `npub` component.
            *   Inside the handler, check if the key pressed is the "OK" / Select key.
            *   If OK is pressed:
                *   Define a `DEFAULT_TIP_AMOUNT` (e.g., 121 sats - **Confirm this amount**).
                *   Check if `wallet.currentBalanceSats >= DEFAULT_TIP_AMOUNT`.
                *   If sufficient balance, call `wallet.sendCashuTipWithSplits({ primaryRecipientNpub: authorNpub, amountSats: DEFAULT_TIP_AMOUNT, eventIdToZap: currentNote?.id, auth, ndk })`.
                *   Provide immediate visual feedback:
                    *   Display a temporary status overlay (e.g., "Sending Tip...").
                    *   On **Success:** Briefly display a checkmark (✅) overlay in the center of the author's QR code.
                    *   On **Failure** (Insufficient Funds, Mint Error, etc.): Trigger a brief "disintegration" animation on the author's QR code and display an error message (e.g., "Tip Failed: Insufficient Balance").
            *   **Discoverability:** When `wallet.currentBalanceSats >= DEFAULT_TIP_AMOUNT`, display a small, persistent visual cue. **Implementation:** Overlay a small and discrete ⚡️ icon (styled with a golden outline and purple fill) in the center of the author's QR code. Ensure the QR code component is generated with a high error correction level (`level='H'`) to maintain scannability.
        *   **(Optional) Secondary Interaction (Button for Advanced Tips):**
            *   If needed, retain or add a separate "Tip Ecash" button, likely within `MediaPanel.tsx`.
            *   This button's click handler would show preset amounts `[21, 121, 2100]` (or others) for selection.
            *   Allow optional input for a DM comment.
            *   Call `wallet.sendCashuTipWithSplits` with the selected amount and comment.
            *   Provide loading/success/error feedback within the `MediaPanel` context.

*   **Step 3.5: Settings Modal Wallet UI (`SettingsModal.tsx`)**
    *   **Thought Process:** Display wallet info and deposit instructions clearly.
    *   **Implementation:**
        *   Add a "Wallet" section (visible when `auth.isLoggedIn`).
        *   Display TV's Identity: `auth.currentUserNpub`.
        *   Display Balance: `wallet.currentBalanceSats` sats.
        *   Display Instructions: "Deposit Instructions: Send a Cashu token (e.g., `cashuA...`) in an encrypted Nostr DM to the TV npub displayed above. Your balance will update automatically."
        *   Display Wallet Error: Show `wallet.walletError` if present.
        *   Display Loading State: Indicate if `isListeningForDeposits` is active or if deposit processing is happening.
        *   *(Optional)* Add button to manually check DMs (if real-time listener is unreliable).
        *   *(Optional)* Add setting to configure the `configuredMintUrl` for the TV's internal wallet.
        *   **Add prominent security warning text about storing funds in the browser.**

*   **Step 3.6: `useAuth` Enhancements**
    *   **Thought Process:** Need robust DM encryption/decryption helpers.
    *   **Implementation:**
        *   ✅ Added `encryptDm` and `decryptDm` methods to `useAuth` and `UseAuthReturn` interface.
        *   ✅ Implementation handles both `NDKPrivateKeySigner` (using `nip04`) and `NDKNip46Signer` (using `signer.encrypt`/`signer.decrypt`, creating `NDKUser` internally).

**Phase 4: Refinement & Integration**

*   **Step 4.1: Context API for Global State**
    *   **(Recommended)** Wrap `App` with `AuthProvider` and `WalletProvider` to make `auth` and `wallet` state/functions easily accessible via `useContext` hooks (`useAuthContext`, `useWalletContext`) in components like `SettingsModal`, `MediaPanel`, etc., reducing prop drilling.

*   **Step 4.2: Error Handling & Loading States**
    *   Implement comprehensive loading indicators (e.g., during DM checks, token generation, DM sending) and user-friendly error messages for all wallet operations (failed decryption, invalid token, mint errors, insufficient funds, publish errors).

*   **Step 4.3: TV Navigation & Focus Polish**
    *   Ensure all new UI elements in the Wallet section (buttons, potential settings) are fully navigable via D-pad and have clear focus states.

---

## 🤔 Further Considerations & Edge Cases (Updated for Cashu DM Wallet)

*   **DM Reliability & Syncing:** Nostr DM delivery isn't guaranteed or instant. How to handle missed deposit DMs? Provide a manual "Sync DMs" button? How far back should the listener query? (Currently checks last hour on start). *[Status: Basic listener implemented, no manual sync or extensive history check.]*
*   **Cashu Mint Downtime/Errors:** How robustly should the app handle errors when redeeming tokens or creating new ones if the configured mint is offline or returns errors? Retry logic? Clearer error messages needed? *[Status: Basic error handling implemented, no retry logic.]*
*   **Proof Management & Splitting:** `cashu-ts` handles much of this, but ensure edge cases like having many small proofs or needing specific denominations are handled gracefully. Potential for failed sends if the required proof combination isn't available, even if the total balance is sufficient. *[Status: Handled by `cashu-ts` / `cashuHelper`, potential edge cases not explicitly tested.]*
*   **Security Warnings:** Must be very clear and repeated. Storing spendable proofs in the browser is highly risky. *[Status: Warnings added to SettingsModal.]*
*   **Zapsplit Conventions:** Nostr standards for defining Zapsplits in profiles might evolve. How to handle errors if a split recipient's npub is invalid or doesn't have decryption keys? (DM would fail). *[Status: Zapsplits NOT implemented, simple 100% primary recipient tip only.]*
*   **Default Mint:** How is the TV's `configuredMintUrl` determined initially? Hardcoded default? User must set it? *[Status: Hardcoded default (`DEFAULT_MINT_URL`) used if none set in DB.]*
*   **Transaction History:** Consider adding a simple display of recent deposits/tips in the Settings Wallet section for better transparency (would require storing transaction records in IDB). *[Status: Not implemented.]*

---

## ❓ Final Decisions Needed (Updated for Cashu DM Wallet)

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

## 🛠️ Implementations (As of [Current Date/Time])

*   **Phase 1.1 - 1.4 (Auth Foundation & UI):** ✅ Completed.
*   **Phase 2.1 - 2.2 (Hashtag Following):** ✅ Completed.
*   **Phase 3 (Internal Cashu Wallet & DM Tipping):**
    *   ✅ Step 3.1: Wallet Structure Setup.
    *   ✅ Step 3.2: DM Deposit Listener.
    *   ✅ Step 3.3: Tipping Function (Simplified).
    *   ✅ Step 3.4: Tipping UI Integration (`ImageFeed`, `VideoPlayer`).
    *   ✅ Step 3.5: Settings Modal Wallet UI.
    *   ✅ Step 3.6: `useAuth` Enhancements (`encryptDm`/`decryptDm`).
*   **Phase 4 (Refinement & Integration):**
    *   ❌ Context API not implemented.
    *   ✅ Basic Error Handling & Loading States implemented.
    *   ✅ TV Navigation & Focus Polish implemented for new sections.
*   ✅ **NDK Singleton Refactor:** NDK initialization moved to a singleton (`src/ndk.ts`), instantiated outside React, and connected once in `App.tsx` to ensure a stable instance throughout the app.

---

## ❗ Known Issues & Workarounds (As of [Current Date/Time])

*   **Persistent Performance/Logging Issue:** Despite refactoring NDK to a stable singleton, the application still suffers from excessive logging and rapid scrolling/updates. The root cause is NOT the NDK instance stability itself. Investigation is now focused on other potential unstable dependencies (e.g., `mediaAuthors`, `followedTags` passed to hooks like `useMediaNotes`) or potential state update loops within `App.tsx` or related components/hooks.
*   **NIP-46 Signing:** Requires testing, especially regarding potential need for `signer.blockUntilReady()` in `getNdkSigner` (though current implementation seems okay).
*   **Cashu Library (`@cashu/cashu-ts@?`)**: Potential for brittleness if library API differs subtly from implementation in `utils/cashu.ts`. Type mismatches might still exist depending on exact library version and behaviour. Linter errors regarding proof types were worked around by adjusting types in `idb.ts`.
*   **Error Handling:** Tipping/Wallet function has basic error state, but could benefit from more granular UI feedback (e.g., specific error messages for mint vs. network vs. encryption issues).
*   **Zapsplits/Receipts:** Tipping currently sends 100% to primary recipient. Zapsplit parsing and optional Kind 9735 receipt publishing are not implemented.
*   **Mint Configuration:** Uses a hardcoded default if none saved. No UI validation beyond basic URL format check.
*   **NDK Instance Source:** Refactored to use a singleton pattern. A single NDK instance is created in `src/ndk.ts`, imported and connected in `App.tsx`, and then passed down as a prop to necessary hooks and components (`useMediaAuthors`, `useAuth`, `useMediaNotes`, `MessageBoard`, `SettingsModal`, etc.). This ensures a stable reference.
*   **Dependencies:** Ensure `react-icons` is installed (`npm install react-icons`).

---
