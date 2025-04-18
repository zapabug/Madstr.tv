# TV App Architecture Documentation (Updated for NDK Hooks Refactoring & Wallet Features)

## 1. Overview

This document describes the architecture of the React-based TV application designed for displaying media content (images, podcasts, videos) shared via the Nostr protocol. It is optimized for TV viewing with remote control navigation and includes features for user authentication, hashtag filtering, and Cashu-based tipping.

**Key Features:**
*   Displays images, podcasts (audio), and videos.
*   Content is fetched from Nostr relays based on:
    *   **Author Follows:** By default, uses the authors followed by a predefined TV Npub (`TV_PUBKEY_NPUB`). If a user logs in, it **switches** to use the authors followed by the logged-in user (based on their Kind 3 list).
    *   **Followed Hashtags:** Additionally fetches content tagged with hashtags the user follows (managed in settings), acting as an *additive* source alongside author-based content.
*   Image and video feeds are **randomized** on load using `shuffleArray`.
*   Older content (images/videos) can be fetched dynamically ("infinite scroll" behavior) by navigating past the end of the current list.
*   Uses a **split-screen layout**, hiding the bottom panel in fullscreen mode.
*   Enters **fullscreen mode** automatically after periods of inactivity or no new messages.
*   Supports user **authentication** via nsec (generation/login) or NIP-46 remote signer.
*   Allows users to **follow specific hashtags** (`#t` tags) to filter image/video content.
*   Includes an internal **Cashu wallet** for receiving deposits via encrypted DMs and **sending tips** (currently simplified, non-Zap standard) to content creators via encrypted DMs. Tipping is triggered by focusing the author QR code and pressing OK/Select.

**Operating Modes (`viewMode` state):**
*   `imagePodcast`: The main/top area displays the `ImageFeed`, while the bottom-right panel displays the `podcastNotes` list and controls.
*   `videoPlayer`: The main/top area displays the `VideoPlayer`, while the bottom-right panel displays the `videoNotes` list and controls.

## 2. Core Technologies

*   **Frontend Framework:** React (`useState`, `useEffect`, `useRef`, `useCallback`)
*   **State Management & Side Effects:** Primarily custom hooks (`useAuth`, `useMediaState`, `useMediaElementPlayback`, `useFullscreen`, `useKeyboardControls`, `useImageCarousel`, `useWallet`) and official NDK Hooks (`useNDK`, `useSubscribe`, `useProfile`, `useNDKInit`) orchestrated by the root `App` component.
*   **Nostr Integration:** `@nostr-dev-kit/ndk`, `@nostr-dev-kit/ndk-hooks`, `nostr-tools` (for `nip19` utils).
*   **Cashu (Ecash) Integration:** `@cashu/cashu-ts`
*   **Caching:** IndexedDB via `idb` (`settings`, `cashuProofs`), NDK's internal cache (for profiles, events).
*   **Styling:** Tailwind CSS, `framer-motion` (for animations)
*   **Icons:** `react-icons`
*   **Utilities:** `shuffleArray`, `react-qr-code`

## 3. Core Component Responsibilities & Layout

The main layout is defined in `App.tsx` and consists of two primary sections within a padded border (removed in fullscreen):

*   **A. Top Media Area (`flex-grow`):** Displays the primary visual content (`ImageFeed` or `VideoPlayer`).
*   **B. Bottom Split Panel (`h-1/3`, `flex-row`, *hidden in fullscreen*):** Contains secondary information and list controls.
    *   **B1. Left Panel (`w-2/3`):** `MessageBoard` component.
    *   **B2. Right Panel (`w-1/3`):** `MediaPanel` component (acting as list/controls).

---

*   **`App.tsx` (Root Component):**
    *   **Orchestrator:** Initializes the NDK singleton (`src/ndk.ts`), manages media element refs (`audioRef`, `videoRef`), defines the main JSX layout structure with Tailwind, uses `useSubscribe` to fetch initial media data (images, videos, podcasts), shuffles image/video notes, manages `SettingsModal` visibility, and passes state/props/callbacks down to child components and hooks. **The NDK instance is managed via a singleton and accessed using the `useNDK` hook.**
    *   **State Held:** Fetch limits/timestamps (`imageFetchLimit`, `videoFetchLimit`, `imageFetchUntil`, `videoFetchUntil`), shuffled notes (`shuffledImageNotes`, `shuffledVideoNotes`), initial podcast time (`initialPodcastTime`), settings modal visibility (`isSettingsOpen`).
    *   **Refs Created:** `audioRef`, `videoRef`, `imageFeedRef`.
    *   **Hook Usage:**
        *   `useNDKInit`: Initializes the NDK connection early in the component lifecycle.
        *   `useNDK`: Accesses the singleton NDK instance.
        *   `useAuth`: Initializes authentication state, provides login/logout methods, NIP-46 handling, `followedTags`, signing capabilities, and NIP-04 helpers (`encryptDm`/`decryptDm`). Receives the `ndk` instance via `useNDK`.
        *   `useWallet`: Manages internal Cashu wallet state (`proofs`, `balanceSats`), handles DM deposits, and initiates tips (`sendCashuTipWithSplits`). Uses `useAuth` and `useNDK`.
        *   `useSubscribe`: Fetches `imageNotes`, `podcastNotes`, `videoNotes` based on filters constructed using:
            *   Authors followed by `TV_PUBKEY_NPUB` (default) **or** the logged-in user (`currentUserNpub`) - *Note: User follow fetching is planned, currently only fetches TV follows.*
            *   `followedTags` from `useAuth` as an additional source.
        *   `useMediaState`: Manages core UI state (`viewMode`, indices, `currentItemUrl`), provides navigation handlers (`handlePrevious`, `handleNext`, etc.). Receives initial notes, fetcher callbacks, and note lengths. Passes `currentNoteId` up for potential tipping context.
        *   `useMediaElementPlayback`: Manages media playback (`isPlaying`, `currentTime`, etc.), receives active media ref and `currentItemUrl`.
        *   `useFullscreen`: Manages fullscreen state (`isFullScreen`) and provides `signalInteraction`/`signalMessage` callbacks.
        *   `useKeyboardControls`: Sets up global keyboard listener, receives state (`isFullScreen`, `viewMode`) and callbacks from other hooks/component state (`signalInteraction`, `setViewMode`, `togglePlayPause`, `handleNext`, `handlePrevious`, `focusImageFeedToggle`). Settings modal trigger is now in `RelayStatus`.
        *   `useImageCarousel`: Manages the image auto-advance timer, receives `isActive` flag and `handleNext` callback.
        *   (Removed `useMediaAuthors`, `useMediaNotes`, `useCurrentAuthor` as separate custom hooks - functionality integrated or replaced by `useSubscribe`/`useProfile`).
    *   **Data Handling:**
        *   Receives notes directly from `useSubscribe` calls.
        *   Uses `useEffect` to shuffle `imageNotes` and `videoNotes` into `shuffledImageNotes`/`shuffledVideoNotes` state. Shuffling happens here before passing to `useMediaState` and components.
        *   Defines `fetchOlderImages`/`fetchOlderVideos` callbacks (updates `Until` state, potentially triggering `useSubscribe` refetch) and passes them to `useMediaState`.
        *   Gets `followedTags` from `useAuth` and uses them to build filters for `useSubscribe`.
        *   Fetches Kind 3 list for `TV_PUBKEY_NPUB`. **(Planned: Fetch logged-in user's Kind 3 and use it preferentially).**
    *   **Rendering Logic:**
        *   Renders invisible `<audio>` element (`audioRef`).
        *   Renders layout structure (Top Area, Bottom Panel).
        *   Conditionally renders components based on `viewMode` (`ImageFeed` or `VideoPlayer`) in the Top Area, passing necessary props including `currentNoteId`.
        *   Conditionally renders the Bottom Panel based on `isFullScreen`.
        *   Renders `MessageBoard` and `MediaPanel` within the Bottom Panel.
        *   Renders `SettingsModal` (conditionally based on `isSettingsOpen`).
        *   Renders `RelayStatus` (provides trigger for settings modal).
        *   Passes necessary props (state, refs, callbacks from hooks) down to child components.
        *   Handles overall loading state display (Note: NDK Hooks aim to minimize explicit loading states).

*   **`ImageFeed.tsx`:**
    *   **Purpose:** Displays the main image feed with author QR code and tipping interaction.
    *   **Rendered In:** Top Media Area (A) when `viewMode === 'imagePodcast'`.
    *   **Key Props:** `isLoading` (potentially removed), `handlePrevious`, `handleNext`, `currentImageIndex`, `imageNotes`, `authorNpub`.
    *   **Hook Usage:** Uses `useAuth`, `useWallet`, `useNDK`, `useProfile` (for author info).
    *   **Functionality:** Displays images. Uses `useProfile` to get author data (name, picture) based on `authorNpub`. Includes a grouped section for author display name, QR code, and timestamp. The author QR code container is focusable when logged in and tipping is possible (`canTip`). Pressing OK/Select triggers `handleTip` which calls `wallet.sendCashuTipWithSplits`. Displays a custom logged-in icon overlay and a ⚡️ icon overlay on the QR code when tipping is enabled. Shows loading/success/error overlays during/after tipping.

*   **`VideoPlayer.tsx`:**
    *   **Purpose:** Displays the video player UI with author QR code and tipping interaction.
    *   **Rendered In:** Top Media Area (A) when `viewMode === 'videoPlayer'`.
    *   **Key Props:** `videoRef`, `src`, `isPlaying`, `togglePlayPause`, `authorNpub`, `autoplayFailed`, `isMuted`, `currentNoteId`.
    *   **Hook Usage:** Uses `useAuth`, `useWallet`, `useNDK`, `useProfile` (for author info).
    *   **Functionality:** Renders the `<video>` element (`videoRef`), controls playback state based on props, shows overlay play button if autoplay fails. Uses `useProfile` to get author data. Includes a grouped section for the author QR code. The author QR code container is focusable when logged in and tipping is possible (`canTip`). Pressing OK/Select triggers `handleTip` which calls `wallet.sendCashuTipWithSplits`. Displays a custom logged-in icon overlay and a ⚡️ icon overlay on the QR code when tipping is enabled. Shows loading/success/error overlays during/after tipping.

*   **`MediaPanel.tsx`:**
    *   **Purpose:** Displays the relevant **list** (Podcasts or Videos) and the **playback controls**. Acts as the interactive panel in the bottom-right.
    *   **Rendered In:** Bottom-Right Panel (B2) - *Rendered only when not fullscreen*.
    *   **Key Props:** `viewMode`, `audioRef`, `videoRef`, `podcastNotes`, `videoNotes` (receives *shuffled* videos), indices, selection handlers, playback state/handlers (`isPlaying`, `currentTime`, etc.), `setViewMode`, `currentItemUrl`. (Removed `authors` prop).
    *   **Hook Usage (Internal):** Uses `useProfile` directly within the list mapping or for the currently playing item's author info. Uses `useInactivityTimer`.
    *   **Functionality:** Renders lists, playback controls, connects controls to props from `App`. Handles list item selection/navigation. Uses `useProfile` to fetch and display author info (name, picture) for the currently playing item and potentially list items. Does **not** render media elements directly. **(Note: Currently does not have integrated tipping functionality).**

*   **`MessageBoard.tsx`:**
    *   **Purpose:** Displays Nostr chat messages (Kind 1 replies) for a specific thread.
    *   **Rendered In:** Bottom-Left Panel (B1) - *Rendered only when not fullscreen*.
    *   **Key Props:** `neventToFollow`, `onNewMessage` (callback to signal fullscreen hook). (Removed `ndk`, `authors` props).
    *   **Hook Usage (Internal):** Uses `useNDK`, `useSubscribe` (to fetch Kind 1 replies based on `#e` tag from `neventToFollow`), `useProfile` (within the `MessageItem` sub-component to get author info for each message).
    *   **Functionality:** Decodes `neventToFollow`. Uses `useSubscribe` to get messages. Renders messages using `MessageItem` which handles displaying author profile data via `useProfile`.

*   **`PlaybackControls.tsx` (Assumed Child of `MediaPanel.tsx`):**
    *   **Purpose:** Renders the actual buttons, sliders, and time displays for media control.
    *   **Rendered In:** `MediaPanel.tsx`.
    *   **Key Props:** Likely receives playback state (`isPlaying`, `currentTime`, `duration`, `playbackRate`, `isMuted`) and handlers (`togglePlayPause`, `handleSeek`, `setPlaybackRate`, `toggleMute`) from `MediaPanel`.

*   **`SettingsModal.tsx`:**
    *   **Purpose:** Provides a UI for managing user identity (nsec generation/login, NIP-46 connection), application settings (followed hashtags), and the internal Cashu wallet.
    *   **Rendered By:** `App.tsx` (conditionally).
    *   **Key Props:** `isOpen`, `onClose`. (No longer needs `ndkInstance` prop, uses `useNDK`).
    *   **Hook Usage (Internal):** `useAuth`, `useWallet`, `useNDK`.
    *   **Functionality:** Handles user login/logout via nsec or NIP-46, displays QR codes for connection/backup (with warnings), allows adding/removing followed hashtags. Includes a "Wallet" section displaying balance, deposit instructions (DM to TV npub), allows configuring the Cashu mint URL, shows wallet status/errors, and includes security warnings about browser-based proof storage. Manages focus internally for TV navigation. Starts/stops the wallet's deposit listener when opened/closed while logged in.

*   **`RelayStatus.tsx`, `QRCode.tsx`:** Utility components. `RelayStatus` now includes the button to open the `SettingsModal`.

## 4. Core Hooks Deep Dive

*   **`@nostr-dev-kit/ndk-hooks`:** Provides official hooks for interacting with NDK in React:
    *   **`useNDKInit`:** Initializes the NDK connection. Used once in `App.tsx`.
    *   **`useNDK`:** Accesses the singleton NDK instance. Used by components/hooks needing NDK.
    *   **`useSubscribe`:** Subscribes to Nostr events based on filters. Replaces `useMediaNotes`. Used in `App.tsx` for media notes and `MessageBoard.tsx` for replies. Handles caching and updates.
    *   **`useProfile`:** Fetches and subscribes to profile metadata (Kind 0) for a given pubkey. Replaces `useProfileData`. Used in `ImageFeed`, `VideoPlayer`, `MediaPanel`, and `MessageBoard` (via `MessageItem`). Handles caching and updates.

*   **`useAuth`:**
    *   **Input:** Uses `useNDK` internally.
    *   **Output:** `UseAuthReturn` (exported interface) containing:
        *   `currentUserNpub`, `currentUserNsecForBackup`: Current user identity state.
        *   `isLoggedIn`: Boolean derived from `ndk.signer`.
        *   `isLoadingAuth`, `authError`: Loading and error states.
        *   NIP-46 state: `nip46ConnectUri`, `isGeneratingUri`.
        *   NIP-46 functions: `initiateNip46Connection`, `cancelNip46Connection`.
        *   Nsec functions: `generateNewKeys`, `loginWithNsec`, `logout`.
        *   Hashtag state: `followedTags` (array of strings), `setFollowedTags` (function).
        *   NIP-04 Helpers: `encryptDm`, `decryptDm` (functions, use `ndk.signer` internally).
    *   **Function:** Manages user authentication state. Handles loading credentials (nsec/NIP-46 token) from IndexedDB, generating new keys, logging in/out. Persists `followedTags` to IndexedDB. Sets the `ndk.signer` based on login method. Provides NIP-04 DM encryption/decryption helpers. Relies on `ndk.signer` for signing operations implicitly.

*   **`useMediaState`:** (Largely unchanged, inputs may simplify slightly if `useSubscribe` returns notes directly).
    *   **Input:** `initialImageNotes`, `initialPodcastNotes`, `initialVideoNotes` (expects shuffled image/video notes), `fetchOlderImages`, `fetchOlderVideos` (callbacks), `shuffledImageNotesLength`, `shuffledVideoNotesLength`.
    *   **Output:** `viewMode`, `imageNotes` (internal), `podcastNotes` (internal), `videoNotes` (internal), `isLoadingPodcastNotes` (potentially removed), `isLoadingVideoNotes` (potentially removed), `currentImageIndex`, `currentPodcastIndex`, `currentVideoIndex`, `selectedVideoNpub` (potentially derived differently), `currentItemUrl`, `currentNoteId`, `handleVideoSelect`, `handlePrevious`, `handleNext`, `setViewMode`, `setCurrentPodcastIndex`.
    *   **Function:** Core UI state machine. Manages `viewMode`, current indices for each media type, and the `currentItemUrl` based on the mode and index. Exposes `currentNoteId` for the currently active image/video. Handles navigation logic (`handlePrevious`, `handleNext`) respecting list boundaries and triggering fetch callbacks. Manages selection logic (`handleVideoSelect`, `setCurrentPodcastIndex`). Updates internal notes state based on props.

*   **`useMediaElementPlayback`:** (Unchanged by NDK refactor)
    *   **Input:** `mediaElementRef` (active `<audio>` or `<video>` ref), `currentItemUrl`, `viewMode`, `onEnded` (callback, usually `handleNext`), `initialTime`.
    *   **Output:** `isPlaying`, `currentTime`, `duration`, `playbackRate`, `setPlaybackRate`, `togglePlayPause`, `handleSeek`, `play`, `pause`, `isSeeking`, `setIsSeeking`, `isMuted`, `autoplayFailed`, `toggleMute`.
    *   **Function:** Directly interacts with the HTML media element via the ref. Manages playback state, updates current time/duration, handles seeking, play/pause actions, mute, and playback rate. Detects autoplay failures.

*   **`useFullscreen`:** (Unchanged by NDK refactor)
    *   **Input:** `interactionTimeout` (optional), `messageTimeout` (optional), `checkInterval` (optional).
    *   **Output:** `isFullScreen` (boolean state), `signalInteraction` (callback), `signalMessage` (callback).
    *   **Function:** Manages fullscreen entry/exit. Tracks `lastInteractionTimestamp` and `lastMessageTimestamp`. Runs an interval timer (`checkInterval`). Enters fullscreen (`setIsFullScreen(true)`) if `interactionTimeout` or `messageTimeout` is exceeded. Exits fullscreen (`setIsFullScreen(false)`) when `signalInteraction` or `signalMessage` is called.

*   **`useKeyboardControls`:** (Unchanged by NDK refactor)
    *   **Input:** `isFullScreen`, `signalInteraction`, `onSetViewMode`, `onTogglePlayPause`, `onNext`, `onPrevious`, `onFocusToggle` (optional), `viewMode`.
    *   **Output:** None (sets up side effect).
    *   **Function:** Adds a window `keydown` event listener. Calls `signalInteraction` on *any* key press. If *not* fullscreen, it checks the key and calls the appropriate callback (`onSetViewMode`, `onTogglePlayPause`, etc.), preventing default browser actions. If fullscreen, it only signals interaction (which causes `useFullscreen` to exit fullscreen). Does not handle settings modal toggle.

*   **`useImageCarousel`:** (Unchanged by NDK refactor)
    *   **Input:** `isActive` (boolean), `onTick` (callback, e.g., `handleNext`), `intervalDuration`.
    *   **Output:** None (sets up side effect).
    *   **Function:** Sets up an interval timer using `setInterval`. Calls `onTick` every `intervalDuration` milliseconds, but only if `isActive` is true. Clears the interval on cleanup or when `isActive` becomes false.

*   **`useWallet`:** (Mostly unchanged, relies on `useAuth` and `useNDK` for needed instances)
    *   **Input:** Uses `useAuth`, `useNDK` internally.
    *   **Output:** `UseWalletReturn` (exported interface) containing:
        *   `proofs`: Array of stored Cashu proofs (`Proof & { mintUrl: string }[]`).
        *   `balanceSats`: Current total wallet balance (number).
        *   `isListeningForDeposits`: Boolean flag for DM listener status.
        *   `walletError`: String or null for wallet errors.
        *   `isLoadingWallet`: Boolean flag for initial loading/processing state.
        *   `configuredMintUrl`: Currently configured Cashu mint URL (string | null).
        *   `loadWalletState`: Function to load proofs/balance/mint from IDB.
        *   `startDepositListener`: Function to start the Nostr DM listener.
        *   `stopDepositListener`: Function to stop the DM listener.
        *   `sendCashuTipWithSplits`: Function to initiate a Cashu tip via DMs.
        *   `setConfiguredMintUrl`: Function to set and save the mint URL.
    *   **Function:** Manages the internal Cashu wallet. Loads/stores proofs (`cashuProofs` store) and configured mint URL (`settings` store) in IndexedDB via `idb` helpers. Calculates balance using `cashuHelper.getProofsBalance`. Interacts with `cashuHelper` (`redeemToken`, `createTokenForAmount`) for Cashu operations. Listens for incoming Nostr DMs (Kind 4) tagged with the user's pubkey using `ndk.subscribe`. Attempts to decrypt DMs using `auth.decryptDm` and redeem `cashuA...` tokens found within using the `configuredMintUrl`. Provides the `sendCashuTipWithSplits` function to generate tokens (using `configuredMintUrl`) and send them via encrypted DMs (using `auth.encryptDm`, `ndk.signer.signEvent`, `ndk.publish`).

*   **REMOVED Custom Hooks:**
    *   `useMediaAuthors`: Replaced by direct `useSubscribe` for Kind 3 in `App.tsx` and NDK singleton management.
    *   `useMediaNotes`: Replaced by `useSubscribe` calls in `App.tsx`.
    *   `useCurrentAuthor`: Functionality replaced by deriving pubkey from current note in `App.tsx` and using `useProfile` in rendering components (`ImageFeed`, `VideoPlayer`).
    *   `useProfileData`: Replaced by direct usage of `useProfile` hook in components (`MediaPanel`, `ImageFeed`, `MessageBoard`).