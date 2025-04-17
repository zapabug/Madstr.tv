Okay, let's break down the requirements for adding a settings page, authentication, hashtag following, and a tipping wallet. This involves significant changes touching UI, state management, Nostr interactions, and security.

Here's a proposed plan of action, walking through the thought process for each step:

**Overall Goal:** Introduce user-specific settings, authentication, content filtering (#t tags), and the ability to send Zaps to content creators, all within the TV app's remote-controlled interface.

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

*   **Step 1.3: Implement Authentication Logic (`useAuth.ts` or `useWallet.ts`)**
    *   **Thought Process:** Authentication is central to user-specific settings and wallet functions. Handling keys (especially private keys) requires careful management and security considerations. Encapsulating this in a dedicated hook (`useAuth` or maybe `useWallet` if we combine concerns) is crucial. We need functions to generate keys, log in (load keys), log out (clear keys), and securely store the private key (nsec). **Storing nsec directly in `localStorage` is highly discouraged due to security risks.** IndexedDB is slightly better but still vulnerable in browser environments. We must warn the user heavily if we display the nsec *a greed but this is the easyest way to give tv user a new npub, nostr-conect via qr is recomended or using amber or someother key storage*
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

**Phase 3: Nostr Wallet & Tipping (Zaps)**

*   **Step 3.1: Enhance Wallet Hook (`useWallet.ts` or merge into `useAuth.ts`)**
    *   **Thought Process:** Tipping (sending Zaps) requires signing events with the user's private key and interacting with the Lightning Network (indirectly). This logic belongs in our dedicated auth/wallet hook. We need functions to construct Zap requests (NIP-57) and potentially interact with a NIP-07 browser extension if available (less likely in a pure TV context) or format requests for external wallet handling. Fetching the recipient's Lightning address (LNURL/Lud16) from their profile (Kind 0) is also necessary.
    *   **Implementation (`useWallet.ts`):**
        *   Ensure secure access to the user's `nsec`.
        *   Add function `getLnurlFromProfile(npub: string): Promise<string | null>`: Uses NDK to fetch the Kind 0 profile for the given `npub`, parses the `lud16` or `lud06` attribute. Cache results.
        *   Add function `prepareZapRequest(recipientNpub: string, amountMillisats: number, comment?: string, eventIdToZap?: string): Promise<NostrEvent | null>`:
            *   Fetches the recipient's LNURL using `getLnurlFromProfile`.
            *   If LNURL found, makes a request to the LNURL endpoint to get the Zap endpoint callback URL.
            *   Constructs the unsigned Zap request event (Kind 9734) according to NIP-57, including tags for recipient (`p`), amount (`amount`), relays, event (`e` if zapping a specific note), and comment.
            *   **Crucially, does NOT sign here directly** unless we are *certain* about the security context. It might return the unsigned event for handling by a NIP-07 extension or other secure signer. Or, if signing internally, use the securely stored `nsec` to sign the event using `nostr-tools` (`signEvent`).
        *   Add function `sendZap(zapRequestEvent: NostrEvent)`: Makes an HTTP request to the Zap endpoint callback URL obtained earlier, passing the signed `zapRequestEvent` as a query parameter (`?amount=...&nostr=...`).

*   **Step 3.2: Tipping UI Integration**
    *   **Thought Process:** Users need a way to initiate a tip for the currently displayed content/author. This likely involves adding a button near the author's information or the media item itself.
    *   **Implementation:**
        *   Decide *where* the "Tip" button should appear. Options:
            *   In `ImageFeed` / `VideoPlayer` near the author's QR code (visible only when logged in).
            *   In `MediaPanel` next to the selected list item (visible only when logged in).
        *   Add the "Tip" button, styled appropriately and focusable.
        *   When the button is clicked:
            *   Get the `npub` of the content author (already available via `useCurrentAuthor` or from the note data in `MediaPanel`).
            *   Potentially show a small overlay/prompt to enter the tip amount (in sats). Handle number input via remote.
            *   Call the `prepareZapRequest` function from the wallet hook.
            *   Handle the signing: If using NIP-07, trigger the extension. If signing internally, call the signing part.
            *   Call `sendZap` with the signed event.
            *   Provide UI feedback (e.g., "Tipping...", "Zap sent!", "Error fetching LNURL", "Zap failed").

**Phase 4: Refinement & Integration**

*   **Step 4.1: Context API for Global State**
    *   **Thought Process:** Passing auth state (`isLoggedIn`, `npub`) and potentially `followedTags` down through many components becomes cumbersome. Using React Context can simplify this.
    *   **Implementation:**
        *   Create `AuthContext` and/or `SettingsContext`.
        *   Wrap the `App` component (or relevant parts) in the Context Providers.
        *   Provide the necessary state and functions (`isLoggedIn`, `npub`, `followedTags`, `setFollowedTags`, `login`, `logout`, etc.) via the context value.
        *   Use `useContext` in components like `SettingsModal`, `App`, `useMediaNotes`, `ImageFeed`, `VideoPlayer`, `MediaPanel` to access the shared state and functions instead of prop drilling.

*   **Step 4.2: Error Handling & Loading States**
    *   **Thought Process:** All new async operations (key cgeneration, login, fetching LNURLs, sending zaps) need robust loading indicators and error handling displayed to the user.
    *   **Implementation:**
        *   Add loading states (`isLoading`) to relevant functions in `useAuth`/`useWallet`.
        *   Display loading spinners or messages in the UI during these operations.
        *   Catch errors in promises and display user-friendly error messages (e.g., "Failed to generate keys", "Invalid Nsec", "Could not find Lightning address for user", "Zap failed").

*   **Step 4.3: TV Navigation & Focus Polish**
    *   **Thought Process:** Ensure the new Settings modal and Tipping interactions are seamless using only a remote control. Focus management is key.
    *   **Implementation:**
        *   Thoroughly test D-pad navigation within the `SettingsModal` and any new Tipping UI elements.
        *   Ensure focus is correctly trapped within the modal when open and returned to the triggering element when closed.
        *   Verify focus states (`focus:ring`, etc.) are clear on all interactive elements.

---

## ✅ Refined Plan Summary (Based on User Notes)

*   **Modal:** Left-side overlay, D-pad navigation focused, triggered by existing settings button.
*   **Authentication:** NIP-46 (Nostr Connect) is the primary method. Nsec generation/storage via IndexedDB is a fallback with strong warnings and explicit user confirmation before saving.
*   **Identity:** App distinguishes between default TV npub (used when logged out) and `currentUserNpub` (used when logged in) for fetching follows etc.
*   **Nsec Handling:** Warn *before* generation, recommend external apps, only show QR on explicit request, require confirmation before saving to IndexedDB.
*   **Hashtag Following:** Store tags per user (replace default on login is recommended), auto-prefix '#' for filtering but store without '#'.
*   **Tipping/Zaps:** Use preset amounts (e.g., `[21, 110, 500, 1000, 5000]`), no custom amount input, default comment "⚡️ Madstr.tv".
*   **Dev Zap Split:** Attempt zap split (NIP-?) via extra `zap` tag, percentage configurable (10-25%+), UI feedback via emojis based on percentage is a later enhancement.
*   **Initial Focus:** Logged out -> "Connect Wallet" button. Logged in -> First setting after auth info. D-pad Up navigates to auth section.
*   **Npub Display:** Truncate npub text (`npub1abc...wxyz`). QR codes are for NIP-46 connection or nsec backup, not displaying user npub.
*   **Warnings:** Add specific warnings before nsec generation/display (e.g., "Guardian of the Keys: This nsec is your sovereign identity...").
*   **Nsec Backup Flow:** After initial generation and confirmation to save the nsec (fallback method), prompt the user *immediately* to back it up (showing the QR). Strongly recommend *disabling* any option to view the nsec again after this initial backup phase to minimize security risks.

---

## 🤔 Further Considerations & Edge Cases

Here are some additional points and potential edge cases to consider during implementation:

*   **NIP-46 Stability:** How should the app handle NIP-46 connection drops or timeouts post-login? Attempt reconnect? Log out? How should revoked signer permissions be handled gracefully (e.g., during a zap attempt)? What visual feedback is needed during connection attempts?
*   **Zap Failures:** Beyond LNURL fetch errors, how should we handle potential failures after sending the zap to the callback? How specific should error messages be (e.g., "Zap Failed" vs. "Couldn't reach LNURL endpoint")?
*   **Hashtag Input:** Add validation for tags (non-empty, allowed characters)? Evaluate complexity of different input methods (standard vs. multi-tap).
*   **Other Settings Ideas:**
    *   Custom Relay List: Allow users to manage the relays used for fetching notes?
    *   Playback Settings: Toggle for autoplay?
    *   Clear Cache: Button to clear IndexedDB for troubleshooting?
    *   About Page: Display app version, links, default TV npub?
    *   UI/Theme: Basic theme options (light/dark?) or accent color choices?

---

## ❓ Final Decisions Needed

Please answer these questions directly in this document to finalize the plan:

**Authentication & Security (useAuth.ts):**

1.  **NIP-46 Permissions:** What specific permissions should be requested? (e.g., `get_public_key`, `sign_event:9735`, `sign_event:1`, etc.) **[get_public_key, zap]**
2.  **NIP-46 Timeout:** How long (seconds) to wait for connection? (Suggest 60s) **[75s]**
3.  **NIP-46 Relays:** Which relays to use for connection setup? (Suggest `wss://relay.damus.io`, `wss://relay.primal.net`) **[wss://nsec.app, other are already added to the app -> Use `wss://nsec.app` primarily for the NIP-46 connection process. The connection URI might also hint at other relays specified by the signer app.] -> Corrected: When the TV app generates the `nostrconnect://` URI for the QR code, it *must* specify which relay(s) it will listen on for the signer's response. Recommend including at least `wss://nsec.app` and potentially `wss://relay.damus.io` in the URI parameters (e.g., `?relay=wss://nsec.app&relay=wss://relay.damus.io`). This is separate from the relays used for general data fetching.**
4.  **Nsec Re-Display Policy:** Should the user *ever* be able to view their generated nsec (via QR) again after the initial backup prompt? (Strongly recommend **No**) **[Yes after pressing 3 times, show focus on npub pressing ok 3 times will display nsec, (this is tv identitly unlikely its the users main id) -> Acknowledged. Implement a 3-press interaction on the focused npub display to reveal the nsec QR. Retain strong warnings about the security risk each time it's shown.]**

**Hashtag Following (#t):**

5.  **Tag Merging/Replacement:** On login, should user tags *replace* defaults or *merge*? (Recommend **replace**) **[Merge pressing ok will remove focused hastag.
this would be awesome to add the oldschool keyboard ussing numbers most remotes have letrs on numpad.(222666666555 for cool ) -> Okay, on login, the user's stored tags will be merged with the application's default tags. Input method using multi-tap on numpad keys (like old T9) is noted as a desired feature.]**
6.  **Tag Input:** Auto-prefix '#' internally, store without '#'? (Recommend **yes**) **[so your recomened method is user inputs keywords with out #, user can only add one at a time, but can focus each to delete -> Confirmed. Store tags without '#', auto-prefix internally for filtering. User adds one keyword at a time, list items are focusable for deletion via OK press.]**

**Tipping / Zaps (useWallet.ts / UI):**

7.  **Preset Tip Amounts:** Are `[21, 110, 500, 1000, 5000]` sats okay? **[21, 121, 2100, add a slider for more, and another slider, for tip split for devs with emogis under it -> Okay, will use fixed amounts 21, 121, 2100 sats, plus two sliders: one for custom Zap amount > 2100 sats, and another for dev tip split % (e.g., 0-25%). Add emoji indicators (e.g., 💸➡️💻) below the split slider corresponding to the percentage. hide this on more options display default or current tip of (121 is default) and a gear button for extra inputs these hide sliders -> Refined UI: Initially display only the current/default tip amount (defaulting to 121 sats) and a settings/gear icon (⚙️). Pressing the gear icon reveals the advanced options: fixed amounts (21, 121, 2100), custom amount slider (>2100), dev split % slider (0-25%), and emoji indicators (💸➡️💻) for the split.]**

**General UI/UX:**

8.  **Profanity Warning Text:** Is "Guardian of the Keys: This nsec is your sovereign identity. Guard it fiercely, share it never. Lose it, and your digital ghost wanders the void. Proceed?" okay for the nsec warning? **[add "it will be hard to add new follows for media]**

---

This plan document incorporates decisions made during our conversation and is ready to guide the implementation process. Please provide answers for the remaining questions (NIP-46 Timeout and Warning Text) when possible.

---

## 🛠️ Implementations (As of [Current Date/Time])

*   **Phase 1.1: Settings Modal Component (`SettingsModal.tsx`)**
    *   ✅ Created `src/components/SettingsModal.tsx`.
    *   ✅ Implemented basic structure with `framer-motion` for animation.
    *   ✅ Added title, close button, and placeholders for settings sections.
    *   ✅ Basic focusability added (`tabIndex={0}` on close button).
    *   ✅ Implemented focus trapping and initial focus logic.

*   **Phase 1.2: Modal Trigger and State (`App.tsx`, `RelayStatus.tsx`)**
    *   ✅ Added `isSettingsOpen` state to `App.tsx`.
    *   ✅ Conditionally rendered `<SettingsModal />` in `App.tsx`.
    *   ✅ Passed `isOpen` and `onClose` props to `SettingsModal`.
    *   ✅ Modal trigger moved to button within `RelayStatus` component.
    *   ✅ `useKeyboardControls` no longer handles modal toggle.

*   **Phase 1.3: Authentication Logic (`useAuth.ts`)**
    *   ✅ Created `src/hooks/useAuth.ts`.
    *   ✅ Added state for `currentUserNpub`, `currentUserNsec`, `nip46Signer`, `isLoadingAuth`, `authError`, `nip46ConnectUri`, `isGeneratingUri`.
    *   ✅ Implemented `loadNsecFromDb`, `saveNsecToDb`, `clearNsecFromDb` using specific `idb` helpers.
    *   ✅ Implemented `generateNewKeys` (with checks for `generateSecretKey` existence).
    *   ✅ Implemented `loginWithNsec`.
    *   ✅ Implemented `logout`.
    *   ✅ Added structure for `initiateNip46Connection` (URI generation) and `cancelNip46Connection`.
    *   ✅ Added placeholder `handleNip46Response`.
    *   ✅ Added `getNdkSigner` to provide appropriate signer (NIP-46 or nsec).
    *   ✅ Added `signEvent` using the current signer.
    *   ✅ Created `src/utils/idb.ts` with specific helper functions for interacting with IndexedDB stores (`settings`, `mediaNoteCache`, `profileCache`).
    *   ✅ Exported `UseAuthReturn` interface.
    *   ✅ Added state and persistence logic for `followedTags`.
    *   ✅ Aligned `ndkInstance` prop type to `NDK | undefined`.

*   **Phase 1.4: Auth UI (`SettingsModal.tsx`)**
    *   ✅ Integrated `useAuth` hook into `SettingsModal`.
    *   ✅ Added conditional rendering based on `auth.isLoggedIn`.
    *   ✅ Added "Generate New TV Identity (nsec)" button.
    *   ✅ Implemented flow: Generate -> Show NPub -> Show Nsec QR (button) -> Use This Identity (save/login).
    *   ✅ Added local state (`generatedNpub`, `generatedNsec`, `showNsecQR`, `generateError`) to manage the generation flow.
    *   ✅ Added basic error display (`displayError`).
    *   ✅ Added Logout button.
    *   ✅ Added NIP-46 connection UI (button, QR display, cancel button).
    *   ✅ Added UI for Login with existing nsec (input, button).
    *   ✅ Implemented Nsec QR display for logged-in users (3-press confirmation).
    *   ✅ Aligned `ndkInstance` prop type to `NDK | undefined`.

*   **Phase 2.1: Hashtag Management State & UI (`useAuth.ts`, `SettingsModal.tsx`)**
    *   ✅ Added `followedTags` state and persistence logic to `useAuth`.
    *   ✅ Added "Followed Hashtags" section to `SettingsModal` (visible when logged in).
    *   ✅ Added input field for adding new tags.
    *   ✅ Added "Add Tag" button.
    *   ✅ Displayed current `followedTags` list.
    *   ✅ Implemented tag removal via "OK" press on focused tag.
    *   ✅ Implemented D-pad navigation for tag input, button, and list.

*   **Phase 2.2: Integrate Hashtags into Data Fetching (`useMediaNotes.ts`, `App.tsx`)**
    *   ✅ Modified `useMediaNotes` props (`UseMediaNotesProps`) to accept optional `followedTags`.
    *   ✅ Implemented `#t` filtering logic within `useMediaNotes` based on `followedTags`.
    *   ✅ Passed `followedTags` from `useAuth` hook down to `useMediaNotes` calls in `App.tsx`.

*   **Phase 3: Nostr Wallet & Tipping (Zaps)**
    *   ❌ *Not yet implemented.* 

*   **Phase 4: Refinement & Integration**
    *   ❌ *Context API not yet implemented.*
    *   ❌ *Dedicated Zap error handling/loading states not yet implemented.*
    *   ⚠️ *Basic TV Navigation/Focus Polish done for implemented features, further refinement may be needed.* 

--- 

## ❗ Errors & Roadblocks

*   **NIP-46 Implementation:**
    *   ✅ URI generation implemented (manual construction in `useAuth`).
    *   ❌ Response listening and handling (`handleNip46Response` in `useAuth`) is still a placeholder and requires implementation (NDK subscription, event decryption, signer setup).

---
