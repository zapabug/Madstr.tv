# TV App Architecture Documentation (Updated for Recent Fixes)

## 1. Overview

This document describes the architecture of the React-based TV application designed for displaying media content (images, podcasts, videos) shared via the Nostr protocol. It is optimized for TV viewing with remote control navigation and includes features for user authentication, hashtag filtering, and Cashu-based tipping.

**Key Features:**
*   Displays images, podcasts (audio), and videos.
*   Content is fetched from Nostr relays based on a list of followed authors (fetched via Kind 3, with improved reliability using a timeout) and optional hashtags.
*   **Image feeds** are **randomized** on load using `shuffleArray` for variety. Fetches a larger batch (e.g., 500) initially.
*   **Video feeds** are **deduplicated** by URL (keeping newest) and displayed **sequentially** (sorted by creation date). Fetches a smaller batch (e.g., 30) initially.
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

*   **A. Top Media Area (`flex-grow`):** Displays the primary visual content (`ImageFeed` or `VideoPlayer`). Correctly renders based on `viewMode` (fixed).
*   **B. Bottom Split Panel (`h-1/3`, `flex-row`, *hidden in fullscreen*):** Contains secondary information and list controls.
    *   **B1. Left Panel (`w-2/3`):** `MessageBoard` component.
    *   **B2. Right Panel (`w-1/3`):** `MediaPanel` component (acting as list/controls).

---

*   **`App.tsx` (Root Component):**
    *   **Orchestrator:** Initializes core hooks, manages media element refs (`audioRef`, `videoRef`), defines the main JSX layout structure with Tailwind, fetches initial data (via `useMediaAuthors`, `useMediaNotes`), handles image shuffling and video deduplication/sorting, manages `SettingsModal` visibility, and passes state/props/callbacks down to child components and hooks. **Crucially, it initializes `useMediaAuthors` which provides the main `ndk` instance used by many other hooks/components.**
    *   **State Held:** Fetch limits/timestamps (`imageFetchLimit` = 500, `videoFetchLimit` = 30, `imageFetchUntil`, `videoFetchUntil`), shuffled image notes (`shuffledImageNotes`), deduplicated/sorted video notes (`uniqueVideoNotes`), initial podcast time (`initialPodcastTime`), settings modal visibility (`isSettingsOpen`).
    *   **Refs Created:** `audioRef`, `videoRef`, `imageFeedRef`.
    *   **Hook Usage:**
        *   `useMediaAuthors`: Gets **primary `ndk` instance** and `mediaAuthors`. Called early. (Kind 3 fetching logic improved).
        *   `useAuth`: Initializes authentication state, provides login/logout methods, NIP-46 handling, `followedTags`, signing capabilities, and NIP-04 helpers (`encryptDm`/`decryptDm`).
        *   `useWallet`: Manages internal Cashu wallet state.
        *   `useMediaNotes`: Fetches `imageNotes`, `podcastNotes`, `videoNotes` using adjusted limits (Podcasts: 25).
        *   `useMediaState`: Manages core UI state (`viewMode`, indices, `currentItemUrl`), provides navigation handlers (`handlePrevious`, `handleNext`, etc.). Receives shuffled images and sequential videos.
        *   `useMediaElementPlayback`: Manages media playback (`isPlaying`, `currentTime`, etc.), receives active media ref and `currentItemUrl` (passed directly from `useMediaState`).
        *   `useFullscreen`: Manages fullscreen state (`isFullScreen`) and provides `signalInteraction`/`signalMessage` callbacks.
        *   `useKeyboardControls`: Sets up global keyboard listener, uses correct `togglePlayPause` callback.
        *   `useImageCarousel`: Manages the image auto-advance timer.
        *   `useCurrentAuthor`: Calculates the `npub` of the currently displayed author.
    *   **Data Handling:**
        *   Receives raw notes from `useMediaNotes`.
        *   Uses `useEffect` to shuffle `imageNotes` into `shuffledImageNotes` state.
        *   Uses `useEffect` to deduplicate `videoNotes` by URL and sort by date into `uniqueVideoNotes` state (no shuffling).
        *   Defines `fetchOlderImages`/`fetchOlderVideos` callbacks (updates `Until` state) and passes them to `useMediaState`.
        *   Gets `followedTags` from `useAuth` and passes them to image/video `useMediaNotes` calls.
    *   **Rendering Logic:**
        *   Renders invisible `<audio>` element (`audioRef`).
        *   Renders layout structure (Top Area, Bottom Panel).
        *   Conditionally renders `ImageFeed` or `VideoPlayer` based on `viewMode` (uncommented/fixed).
        *   Passes `currentItemUrl` from `useMediaState` directly to playback hooks and `VideoPlayer`.
        *   Passes necessary context (`ndkInstance`, `auth`, `wallet`) to `VideoPlayer`.
        *   Conditionally renders the Bottom Panel based on `isFullScreen`.
        *   Renders `MessageBoard` and `MediaPanel` within the Bottom Panel.
        *   Renders `SettingsModal` and `RelayStatus`.
        *   Passes necessary props down to child components, including placeholder props to `ImageFeed` to satisfy type requirements.
        *   Handles overall loading state display.

*   **`ImageFeed.tsx`:**
    *   **Purpose:** Displays the main image feed with author QR code and tipping interaction.
    *   **Rendered In:** Top Media Area (A) when `viewMode === 'imagePodcast'`.
    *   **Key Props:** `isLoading`, `handlePrevious`, `handleNext`, `currentImageIndex`, `imageNotes` (receives *shuffled* notes), `authorNpub`. Also receives `isPlaying`, `togglePlayPause`, `isFullScreen`, `signalInteraction` (passed from App, potentially unused internally - requires review).
    *   **Hook Usage:** Uses `useAuth`, `useWallet`, `useMediaAuthors` (to get `ndk` instance).
    *   **Functionality:** Displays images. Includes a grouped section for author display name, QR code, and timestamp. Tipping interaction via QR code focus/select.

*   **`VideoPlayer.tsx`:**
    *   **Purpose:** Displays the video player UI with author QR code and tipping interaction.
    *   **Rendered In:** Top Media Area (A) when `viewMode === 'videoPlayer'`.
    *   **Key Props:** `videoRef`, `src` (receives `currentItemUrl` from `App`), `isPlaying`, `togglePlayPause`, `authorNpub`, `autoplayFailed`, `isMuted`, `currentNoteId`, `ndkInstance`, `isNdkReady`, `auth`, `wallet`.
    *   **Hook Usage:** None (receives necessary context via props).
    *   **Functionality:** Renders the `<video>` element. Reflects playback state. Tipping interaction via QR code focus/select.

*   **`MediaPanel.tsx`:**
    *   **Purpose:** Displays the relevant **list** (Podcasts or Videos) and the **playback controls**. Acts as the interactive panel in the bottom-right.
    *   **Rendered In:** Bottom-Right Panel (B2) - *Rendered only when not fullscreen*.
    *   **Key Props:** `viewMode`, `audioRef`, `videoRef`, `podcastNotes`, `videoNotes` (receives *sequential* video notes from `useMediaState`), loading states, indices, selection handlers, playback state/handlers, `setViewMode`, `currentItemUrl`, `authors`, `signalInteraction`.
    *   **Hook Usage (Internal):** `useProfileData`, `useInactivityTimer`.
    *   **Functionality:** Renders lists, playback controls. Handles list item selection/navigation.

*   **`MessageBoard.tsx`:**
    *   **Purpose:** Displays Nostr chat messages for a specific thread.
    *   **Rendered In:** Bottom-Left Panel (B1) - *Rendered only when not fullscreen*.
    *   **Key Props:** `ndk`, `threadEventId`, `onNewMessage` (callback to signal fullscreen hook), `isReady`.

*   **`PlaybackControls.tsx` (Assumed Child of `MediaPanel.tsx`):**
    *   **Purpose:** Renders the actual buttons, sliders, and time displays for media control.

*   **`SettingsModal.tsx`:**
    *   **Purpose:** Provides a UI for managing user identity, application settings, and the internal Cashu wallet.

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
    *   **Input:** `ndk` (NDK | undefined).
    *   **Output:** **`ndk` instance (primary instance used application-wide)**, `mediaAuthors` (array of pubkeys), `isLoadingAuthors`.
    *   **Function:** Initializes NDK, connects to relays. Fetches the user's Kind 3 contact list using `ndk.subscribe` with `closeOnEose: false`. Includes a timeout (e.g., 15s) to wait for the event before falling back to using only the TV's pubkey if the Kind 3 is not found. Returns the list of authors (TV pubkey + followed pubkeys) and the **primary NDK instance**.

*   **`useMediaNotes`:**
    *   **Input:** `authors`, `mediaType` ('image', 'podcast', 'video'), `ndk` (NDK | null), `limit` (optional, defaults vary by type: Image=500, Video=30, Podcast=25), `until` (optional), `followedTags` (optional string array).
    *   **Output:** `notes` (array of `NostrNote` objects, sorted by created_at descending), `isLoading`.
    *   **Function:** Fetches Nostr notes based on authors and specified Kinds/tags. Uses `limit`/`until` for pagination/initial fetch size. Adds `#t` filter if `followedTags` are provided. Checks IndexedDB cache first, then subscribes via NDK. Accumulates notes. Parses URLs/metadata. Caches new notes. Returns raw, sorted notes.

*   **`useMediaState`:**
    *   **Input:** `initialImageNotes` (shuffled), `initialPodcastNotes`, `initialVideoNotes` (deduplicated, sequential), `fetchOlderImages`, `fetchOlderVideos` (callbacks), `shuffledImageNotesLength`, `shuffledVideoNotesLength` (length of sequential videos).
    *   **Output:** `viewMode`, `imageNotes` (internal, shuffled), `podcastNotes` (internal), `videoNotes` (internal, sequential), loading states, indices, `selectedVideoNpub`, `currentItemUrl`, `currentNoteId`, navigation/selection handlers.
    *   **Function:** Core UI state machine. Manages `viewMode`, current indices for each media type, and the `currentItemUrl` (passed directly to playback hooks). Handles navigation logic (`handlePrevious`, `handleNext`) respecting list boundaries and triggering fetch callbacks based on the correct list lengths (shuffled images, sequential videos). Updates internal notes state based on props (using ref comparison to avoid unnecessary updates).

*   **`useMediaElementPlayback`:**
    *   **Input:** `mediaElementRef`, `currentItemUrl` (receives URL directly from `useMediaState` via `App`), `elementType`, `isActiveMode`, `onEnded`, `initialTime`, `autoplayEnabled`, `next`.
    *   **Output:** Playback state (`isPlaying`, `currentTime`, etc.) and controls (`togglePlayPause`, `handleSeek`, etc.).
    *   **Function:** Directly interacts with the HTML media element. Manages playback state. Receives `currentItemUrl` directly. Handles autoplay and auto-advance logic based on props.

*   **`useFullscreen`:**
    *   **Input:** `interactionTimeout` (optional), `messageTimeout` (optional), `checkInterval` (optional).
    *   **Output:** `isFullScreen` (boolean state), `signalInteraction` (callback), `signalMessage` (callback).
    *   **Function:** Manages fullscreen entry/exit. Tracks `lastInteractionTimestamp` and `lastMessageTimestamp`. Runs an interval timer (`checkInterval`). Enters fullscreen (`setIsFullScreen(true)`) if `interactionTimeout` or `messageTimeout` is exceeded. Exits fullscreen (`setIsFullScreen(false)`) when `signalInteraction` or `signalMessage` is called.

*   **`useKeyboardControls`:**
    *   **Input:** `isFullScreen`, `signalInteraction`, `onSetViewMode`, `onTogglePlayPause` (receives `activePlayback.togglePlayPause` from `App`), `onNext`, `onPrevious`, `onFocusToggle` (optional), `viewMode`.
    *   **Output:** None (sets up side effect).
    *   **Function:** Adds `keydown` listener. Correctly calls `activePlayback.togglePlayPause` for play/pause actions when not fullscreen. Calls other appropriate callbacks based on key presses.

*   **`useImageCarousel`:**
    *   **Input:** `isActive` (boolean), `onTick` (callback, e.g., `handleNext`), `intervalDuration`.
    *   **Output:** None (sets up side effect).
    *   **Function:** Sets up an interval timer using `setInterval`. Calls `onTick` every `intervalDuration` milliseconds, but only if `isActive` is true. Clears the interval on cleanup or when `isActive` becomes false.

*   **`useCurrentAuthor`:**
    *   **Input:** `viewMode`, `imageIndex`, `videoIndex`, `imageNotes` (shuffled), `videoNotes` (sequential).
    *   **Output:** `currentAuthorNpub` (string | null).
    *   **Function:** Determines the currently active note based on `viewMode` and index within the appropriate note list (shuffled images or sequential videos). Extracts and returns the author's `npub`.

*   **`useProfileData`:**
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