# TV App Architecture Documentation (Updated for Refactoring & Wallet Features)

## 1. Overview

This document describes the architecture of the React-based TV application designed for displaying media content (images, podcasts, videos) shared via the Nostr protocol. It is optimized for TV viewing with remote control navigation and includes features for user authentication, hashtag filtering, and Cashu-based tipping.

**Key Features:**
*   Displays images, podcasts (audio), and videos.
*   Content is fetched from Nostr relays based on a list of followed authors and optional hashtags.
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
*   **State Management & Side Effects:** Primarily custom hooks (`useAuth`, `useMediaAuthors`, `useMediaNotes`, `useMediaState`, `useMediaElementPlayback`, `useFullscreen`, `useKeyboardControls`, `useImageCarousel`, `useCurrentAuthor`, `useWallet`) orchestrated by the root `App` component.
*   **Nostr Integration:** `@nostr-dev-kit/ndk`, `nostr-tools`
*   **Cashu (Ecash) Integration:** `@cashu/cashu-ts`
*   **Caching:** IndexedDB via `idb` (`settings`, `mediaNoteCache`, `profileCache`, `cashuProofs`)
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
    *   **Orchestrator:** Initializes core hooks, manages media element refs (`audioRef`, `videoRef`), defines the main JSX layout structure with Tailwind, fetches initial data (via `useMediaAuthors`, `useMediaNotes`), shuffles image/video notes, manages `SettingsModal` visibility, and passes state/props/callbacks down to child components and hooks. **Crucially, it initializes `useMediaAuthors` which provides the main `ndk` instance used by many other hooks/components.**
    *   **State Held:** Fetch limits/timestamps (`imageFetchLimit`, `videoFetchLimit`, `imageFetchUntil`, `videoFetchUntil`), shuffled notes (`shuffledImageNotes`, `shuffledVideoNotes`), initial podcast time (`initialPodcastTime`), settings modal visibility (`isSettingsOpen`).
    *   **Refs Created:** `audioRef`, `videoRef`, `imageFeedRef`.
    *   **Hook Usage:**
        *   `useMediaAuthors`: Gets **primary `ndk` instance** and `mediaAuthors`. Called early.
        *   `useAuth`: Initializes authentication state, provides login/logout methods, NIP-46 handling, `followedTags`, signing capabilities, and NIP-04 helpers (`encryptDm`/`decryptDm`). Receives `ndk` instance *only if needed for initialization*, otherwise `undefined`. Does **not** provide the main `ndk` instance for general use.
        *   `useWallet`: Manages internal Cashu wallet state (`proofs`, `balanceSats`), handles DM deposits, and initiates tips (`sendCashuTipWithSplits`). Requires `useAuth` and `ndk` instance *passed to its methods* (`startDepositListener`, `sendCashuTipWithSplits`).
        *   `useMediaNotes`: Fetches `imageNotes`, `podcastNotes`, `videoNotes`. Called multiple times. Receives `ndk`, `mediaAuthors`, and `followedTags` from `useAuth`.
        *   `useMediaState`: Manages core UI state (`viewMode`, indices, `currentItemUrl`), provides navigation handlers (`handlePrevious`, `handleNext`, etc.). Receives initial notes, fetcher callbacks, and note lengths. Passes `currentNoteId` up for potential tipping context.
        *   `useMediaElementPlayback`: Manages media playback (`isPlaying`, `currentTime`, etc.), receives active media ref and `currentItemUrl`.
        *   `useFullscreen`: Manages fullscreen state (`isFullScreen`) and provides `signalInteraction`/`signalMessage` callbacks.
        *   `useKeyboardControls`: Sets up global keyboard listener, receives state (`isFullScreen`, `viewMode`) and callbacks from other hooks/component state (`signalInteraction`, `setViewMode`, `togglePlayPause`, `handleNext`, `handlePrevious`, `focusImageFeedToggle`). Settings modal trigger is now in `RelayStatus`.
        *   `useImageCarousel`: Manages the image auto-advance timer, receives `isActive` flag and `handleNext` callback.
        *   `useCurrentAuthor`: Calculates the `npub` of the currently displayed author based on mode and index, receives indices and note lists.
    *   **Data Handling:**
        *   Receives raw notes from `useMediaNotes`.
        *   Uses `useEffect` to shuffle `imageNotes` and `videoNotes` into `shuffledImageNotes`/`shuffledVideoNotes` state. Shuffling happens here before passing to `useMediaState` and components.
        *   Defines `fetchOlderImages`/`fetchOlderVideos` callbacks (updates `Until` state) and passes them to `useMediaState`.
        *   Gets `followedTags` from `useAuth` and passes them to image/video `useMediaNotes` calls.
    *   **Rendering Logic:**
        *   Renders invisible `<audio>` element (`audioRef`).
        *   Renders layout structure (Top Area, Bottom Panel).
        *   Conditionally renders components based on `viewMode` (`ImageFeed` or `VideoPlayer`) in the Top Area, passing necessary props including `currentNoteId`.
        *   Conditionally renders the Bottom Panel based on `isFullScreen`.
        *   Renders `MessageBoard` and `MediaPanel` within the Bottom Panel.
        *   Renders `SettingsModal` (conditionally based on `isSettingsOpen`), passing the `ndkInstance` from `useMediaAuthors`.
        *   Renders `RelayStatus` (provides trigger for settings modal).
        *   Passes necessary props (state, refs, callbacks from hooks) down to child components.
        *   Handles overall loading state display.

*   **`ImageFeed.tsx`:**
    *   **Purpose:** Displays the main image feed with author QR code and tipping interaction.
    *   **Rendered In:** Top Media Area (A) when `viewMode === 'imagePodcast'`.
    *   **Key Props:** `isLoading`, `handlePrevious`, `handleNext`, `currentImageIndex`, `imageNotes`, `authorNpub`.
    *   **Hook Usage:** Uses `useAuth`, `useWallet`, `useMediaAuthors` (to get `ndk` instance).
    *   **Functionality:** Displays images. Includes a grouped section for author display name, QR code, and timestamp. The author QR code container is focusable when logged in and tipping is possible (`canTip`). Pressing OK/Select triggers `handleTip` which calls `wallet.sendCashuTipWithSplits`. Displays a custom logged-in icon overlay and a ⚡️ icon overlay on the QR code when tipping is enabled. Shows loading/success/error overlays during/after tipping.

*   **`VideoPlayer.tsx`:**
    *   **Purpose:** Displays the video player UI with author QR code and tipping interaction.
    *   **Rendered In:** Top Media Area (A) when `viewMode === 'videoPlayer'`.
    *   **Key Props:** `videoRef`, `src`, `isPlaying`, `togglePlayPause`, `authorNpub`, `autoplayFailed`, `isMuted`, `currentNoteId`.
    *   **Hook Usage:** Uses `useAuth`, `useWallet`, `useMediaAuthors` (to get `ndk` instance).
    *   **Functionality:** Renders the `<video>` element (`videoRef`), controls playback state based on props, shows overlay play button if autoplay fails. Includes a grouped section for the author QR code. The author QR code container is focusable when logged in and tipping is possible (`canTip`). Pressing OK/Select triggers `handleTip` which calls `wallet.sendCashuTipWithSplits`. Displays a custom logged-in icon overlay and a ⚡️ icon overlay on the QR code when tipping is enabled. Shows loading/success/error overlays during/after tipping.

*   **`MediaPanel.tsx`:**
    *   **Purpose:** Displays the relevant **list** (Podcasts or Videos) and the **playback controls**. Acts as the interactive panel in the bottom-right.
    *   **Rendered In:** Bottom-Right Panel (B2) - *Rendered only when not fullscreen*.
    *   **Key Props:** `viewMode`, `audioRef`, `videoRef`, `podcastNotes`, `videoNotes` (receives *shuffled* videos), loading states, indices, selection handlers, playback state/handlers (`isPlaying`, `currentTime`, etc.), `setViewMode`, `currentItemUrl`, `authors`.
    *   **Hook Usage (Internal):** Uses `useProfileData` to fetch profile info (name/pic) for authors in the lists. Uses `useInactivityTimer`.
    *   **Functionality:** Renders lists, playback controls, connects controls to props from `App`. Handles list item selection/navigation. Does **not** render media elements directly. **(Note: Currently does not have integrated tipping functionality).**

*   **`MessageBoard.tsx`:**
    *   **Purpose:** Displays Nostr chat messages for a specific thread.
    *   **Rendered In:** Bottom-Left Panel (B1) - *Rendered only when not fullscreen*.
    *   **Key Props:** `ndk`, `neventToFollow`, `authors`, `onNewMessage` (callback to signal fullscreen hook).

*   **`PlaybackControls.tsx` (Assumed Child of `MediaPanel.tsx`):**
    *   **Purpose:** Renders the actual buttons, sliders, and time displays for media control.
    *   **Rendered In:** `MediaPanel.tsx`.
    *   **Key Props:** Likely receives playback state (`isPlaying`, `currentTime`, `duration`, `playbackRate`, `isMuted`) and handlers (`togglePlayPause`, `handleSeek`, `setPlaybackRate`, `toggleMute`) from `MediaPanel`.

*   **`SettingsModal.tsx`:**
    *   **Purpose:** Provides a UI for managing user identity (nsec generation/login, NIP-46 connection), application settings (followed hashtags), and the internal Cashu wallet.
    *   **Rendered By:** `App.tsx` (conditionally).
    *   **Key Props:** `isOpen`, `onClose`, `ndkInstance` (passed from `App` which gets it from `useMediaAuthors`).
    *   **Hook Usage (Internal):** `useAuth`, `useWallet`.
    *   **Functionality:** Handles user login/logout via nsec or NIP-46, displays QR codes for connection/backup (with warnings), allows adding/removing followed hashtags. Includes a "Wallet" section displaying balance, deposit instructions (DM to TV npub), allows configuring the Cashu mint URL, shows wallet status/errors, and includes security warnings about browser-based proof storage. Manages focus internally for TV navigation. Starts/stops the wallet's deposit listener when opened/closed while logged in.

*   **`RelayStatus.tsx`, `QRCode.tsx`:** Utility components. `RelayStatus` now includes the button to open the `SettingsModal`.

## 4. Custom Hooks Deep Dive

*   **`useAuth`:**
    *   **Input:** `ndkInstance` (NDK | undefined) - *Optional NDK instance for initialization tasks if needed, but not the primary source.*
    *   **Output:** `UseAuthReturn` (exported interface) containing:
        *   `currentUserNpub`, `currentUserNsec`: Current user identity.
        *   `isLoggedIn`: Boolean flag.
        *   `isLoadingAuth`, `authError`: Loading and error states.
        *   NIP-46 state: `nip46ConnectUri`, `isGeneratingUri`, `nip46UriExpirationTimer`.
        *   NIP-46 functions: `initiateNip46Connection`, `cancelNip46Connection`.
        *   Nsec functions: `generateNewKeys`, `loginWithNsec`, `logout`.
        *   Signer functions: `getNdkSigner`, `signEvent`.
        *   Hashtag state: `followedTags` (array of strings), `setFollowedTags` (function).
        *   NIP-04 Helpers: `encryptDm`, `decryptDm` (functions).
    *   **Function:** Manages user authentication state. Handles loading credentials (nsec) from IndexedDB, generating new keys, logging in via nsec or NIP-46 (initiation part implemented), logging out. Persists `followedTags` to IndexedDB, merging with defaults on login and resetting on logout. Provides access to the appropriate NDK signer based on login method. Provides a unified `signEvent` function and NIP-04 DM encryption/decryption helpers (`encryptDm`, `decryptDm`). **Does not return the main `ndk` instance.**

*   **`useMediaAuthors`:**
    *   **Input:** None (uses hardcoded `RELAYS` constant).
    *   **Output:** **`ndk` instance (primary instance used application-wide)**, `mediaAuthors` (array of pubkeys), `isLoadingAuthors`.
    *   **Function:** Initializes NDK, connects to relays, fetches user's Kind 3 contact list (if logged in), returns authors (user + followed) and the **primary NDK instance**.

*   **`useMediaNotes`:**
    *   **Input:** `authors`, `mediaType` ('image', 'podcast', 'video'), `ndk` (NDK | null), `limit` (optional), `until` (optional), `followedTags` (optional string array).
    *   **Output:** `notes` (array of `NostrNote` objects, sorted by created_at descending), `isLoading`.
    *   **Function:** Fetches Nostr notes based on authors and specified Kinds/tags. Uses `limit`/`until` for pagination. If `followedTags` are provided and not empty, adds a `#t` filter to the Nostr query (for 'image' and 'video' types typically). Checks IndexedDB cache first, then subscribes via NDK. Accumulates notes. Parses URLs/metadata. Caches new notes. Returns raw, sorted notes.

*   **`useMediaState`:**
    *   **Input:** `initialImageNotes`, `initialPodcastNotes`, `initialVideoNotes` (expects shuffled image/video notes), `fetchOlderImages`, `fetchOlderVideos` (callbacks), `shuffledImageNotesLength`, `shuffledVideoNotesLength`.
    *   **Output:** `viewMode`, `imageNotes` (internal), `podcastNotes` (internal), `videoNotes` (internal), `isLoadingPodcastNotes`, `isLoadingVideoNotes`, `currentImageIndex`, `currentPodcastIndex`, `currentVideoIndex`, `selectedVideoNpub`, `currentItemUrl`, `currentNoteId`, `handleVideoSelect`, `handlePrevious`, `handleNext`, `setViewMode`, `setCurrentPodcastIndex`.
    *   **Function:** Core UI state machine. Manages `viewMode`, current indices for each media type, and the `currentItemUrl` based on the mode and index. Exposes `currentNoteId` for the currently active image/video. Handles navigation logic (`handlePrevious`, `handleNext`) respecting list boundaries and triggering fetch callbacks. Manages selection logic (`handleVideoSelect`, `setCurrentPodcastIndex`). Updates internal notes state based on props.

*   **`useMediaElementPlayback`:**
    *   **Input:** `mediaElementRef` (active `<audio>` or `<video>` ref), `currentItemUrl`, `viewMode`, `onEnded` (callback, usually `handleNext`), `initialTime`.
    *   **Output:** `isPlaying`, `currentTime`, `duration`, `playbackRate`, `setPlaybackRate`, `togglePlayPause`, `handleSeek`, `play`, `pause`, `isSeeking`, `setIsSeeking`, `isMuted`, `autoplayFailed`, `toggleMute`.
    *   **Function:** Directly interacts with the HTML media element via the ref. Manages playback state, updates current time/duration, handles seeking, play/pause actions, mute, and playback rate. Detects autoplay failures.

*   **`useFullscreen`:**
    *   **Input:** `interactionTimeout` (optional), `messageTimeout` (optional), `checkInterval` (optional).
    *   **Output:** `isFullScreen` (boolean state), `signalInteraction` (callback), `signalMessage` (callback).
    *   **Function:** Manages fullscreen entry/exit. Tracks `lastInteractionTimestamp` and `lastMessageTimestamp`. Runs an interval timer (`checkInterval`). Enters fullscreen (`setIsFullScreen(true)`) if `interactionTimeout` or `messageTimeout` is exceeded. Exits fullscreen (`setIsFullScreen(false)`) when `signalInteraction` or `signalMessage` is called.

*   **`useKeyboardControls`:**
    *   **Input:** `isFullScreen`, `signalInteraction`, `onSetViewMode`, `onTogglePlayPause`, `onNext`, `onPrevious`, `onFocusToggle` (optional), `viewMode`.
    *   **Output:** None (sets up side effect).
    *   **Function:** Adds a window `keydown` event listener. Calls `signalInteraction` on *any* key press. If *not* fullscreen, it checks the key and calls the appropriate callback (`onSetViewMode`, `onTogglePlayPause`, etc.), preventing default browser actions. If fullscreen, it only signals interaction (which causes `useFullscreen` to exit fullscreen). Does not handle settings modal toggle.

*   **`useImageCarousel`:**
    *   **Input:** `isActive` (boolean), `onTick` (callback, e.g., `handleNext`), `intervalDuration`.
    *   **Output:** None (sets up side effect).
    *   **Function:** Sets up an interval timer using `setInterval`. Calls `onTick` every `intervalDuration` milliseconds, but only if `isActive` is true. Clears the interval on cleanup or when `isActive` becomes false.

*   **`useCurrentAuthor`:**
    *   **Input:** `viewMode`, `imageIndex`, `videoIndex`, `imageNotes` (shuffled), `videoNotes` (shuffled).
    *   **Output:** `currentAuthorNpub` (string | null).
    *   **Function:** Determines the currently active note based on `viewMode` and the corresponding index (`imageIndex` or `videoIndex`) within the provided note lists. Extracts the `pubkey` from the active note (if found) and returns its `npub` encoded string (e.g., "npub1..."). Returns `null` if no active note or pubkey is found. Used for displaying QR codes in `ImageFeed`/`VideoPlayer`.

*   **`useProfileData` (Used in `MediaPanel`, `ImageFeed`):**
    *   **Input:** `notes` (array of `NostrNote`).
    *   **Output:** `profiles` (Record<string, ProfileData>), `fetchProfile` (function).
    *   **Function:** Extracts unique pubkeys from input notes. Fetches profile data (Kind 0) for these pubkeys, using caching (`profileCache`) and NDK lookups (via the main `ndk` instance obtained likely via context or props). Returns a map of pubkeys to profile details (name, picture, etc.).

*   **`useWallet`:**
    *   **Input:** None.
    *   **Output:** `UseWalletReturn` (exported interface) containing:
        *   `proofs`: Array of stored Cashu proofs (`Proof & { mintUrl: string }[]`).
        *   `balanceSats`: Current total wallet balance (number).
        *   `isListeningForDeposits`: Boolean flag for DM listener status.
        *   `walletError`: String or null for wallet errors.
        *   `isLoadingWallet`: Boolean flag for initial loading/processing state.
        *   `configuredMintUrl`: Currently configured Cashu mint URL (string | null).
        *   `loadWalletState`: Function to load proofs/balance/mint from IDB.
        *   `startDepositListener`: Function to start the Nostr DM listener (needs `auth` and `ndk`).
        *   `stopDepositListener`: Function to stop the DM listener.
        *   `sendCashuTipWithSplits`: Function to initiate a Cashu tip via DMs (needs `SendTipParams` containing recipient, amount, auth, ndk, etc.).
        *   `setConfiguredMintUrl`: Function to set and save the mint URL.
    *   **Function:** Manages the internal Cashu wallet. Loads/stores proofs (`cashuProofs` store) and configured mint URL (`settings` store) in IndexedDB via `idb` helpers. Calculates balance using `cashuHelper.getProofsBalance`. Interacts with `cashuHelper` (`redeemToken`, `createTokenForAmount`) for Cashu operations. Listens for incoming Nostr DMs (Kind 4) tagged with the user's pubkey using `ndk.subscribe`. Attempts to decrypt DMs using `auth.decryptDm` and redeem `cashuA...` tokens found within using the `configuredMintUrl`. Provides the `sendCashuTipWithSplits` function to generate tokens (using `configuredMintUrl`) and send them via encrypted DMs (using `auth.encryptDm`, `auth.signEvent`, `ndk.publish`). Requires `UseAuthReturn` and the main `NDK` instance passed into `startDepositListener` and `sendCashuTipWithSplits`.