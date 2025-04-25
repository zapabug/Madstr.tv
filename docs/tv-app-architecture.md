# TV App Architecture Documentation (Updated for Recent Fixes)

## 1. Overview

This document describes the architecture of the React-based TV application designed for displaying media content (images, podcasts, videos) shared via the Nostr protocol. It is optimized for TV viewing with remote control navigation and includes features for user authentication, hashtag filtering, and Cashu-based tipping.

**Key Features:**
*   Displays images, podcasts (audio), and videos.
*   Content is fetched from Nostr relays based on a list of followed authors (fetched via Kind 3, with improved reliability using a timeout) and/or **optionally** based on followed hashtags (`#t` tags).
    *   **Users can toggle image and video fetching by hashtag independently** via the Settings modal.
*   **Image feeds** are **randomized** on load using `shuffleArray` for variety. Fetches a batch (e.g., 30 from authors, 30 from tags) initially.
*   **Video feeds** are **deduplicated** by URL (keeping newest) and displayed **sequentially** (sorted by creation date). Fetches a smaller batch (e.g., 15 from authors, 15 from tags) initially.
*   **Video playlist limited:** Initially shows a subset (e.g., 15) of videos, loading more from the cache on demand before fetching older videos from relays.
*   **Video preloading:** Proactively loads the next video in the sequence using a hidden video element.
*   **Continuous video playback:** Automatically plays the next video after the current one finishes.
*   Older content (images/videos) can be fetched dynamically ("infinite scroll" behavior) by navigating past the end of the current list (respecting author/tag fetch settings).
*   Uses a **split-screen layout**, hiding the bottom panel in fullscreen mode.
*   Enters **fullscreen mode** automatically after periods of inactivity.
*   Supports user **authentication** via nsec (generation/login) or NIP-46 remote signer.
    *   **Logout includes a mandatory wallet backup step:** If the user has a Cashu balance, logout displays a QR code of the wallet proofs for 45 seconds, followed by a confirmation step before proceeding.
*   Allows users to **follow specific hashtags** (`#t` tags) to be used for filtering if enabled.
*   Includes an internal **Cashu wallet** for receiving deposits via encrypted DMs and **sending tips** (currently simplified, non-Zap standard) to content creators via encrypted DMs. Tipping is triggered by focusing the author QR code and pressing OK/Select.

**Operating Modes (`viewMode` state):**
*   `imagePodcast`: The main/top area displays the `ImageFeed`, while the bottom-right panel displays the `podcastNotes` list and controls.
*   `videoPlayer`: The main/top area displays the `VideoPlayer`, while the bottom-right panel displays the `videoNotes` list and controls.

## 2. Core Technologies

*   **Frontend Framework:** React (`useState`, `useEffect`, `useRef`, `useCallback`, `useMemo`)
*   **State Management & Side Effects:** Primarily custom hooks (`useAuth`, `useMediaAuthors`, `useMediaNotes`, `useMediaState`, `useMediaElementPlayback`, `useFullscreen`, `useKeyboardControls`, `useImageCarousel`, `useCurrentAuthor`, `useWallet`, `useNDKInit`, `useUserProfile`) orchestrated by the root `App` component. **Note:** `useProfile` from `nostr-hooks` is still used specifically for the `MessageBoard` component's `currentUser` prop.
*   **Nostr Integration:** `@nostr-dev-kit/ndk`, `nostr-tools`, `nostr-hooks` (for `useProfile`)
*   **Cashu (Ecash) Integration:** `@cashu/cashu-ts`
*   **Caching:** IndexedDB via `idb` (`settings`, `mediaNoteCache`, `profileCache`, `cashuProofs`)
*   **Styling:** Tailwind CSS, `framer-motion` (for animations)
*   **Icons:** `react-icons`
*   **Utilities:** `shuffleArray`, `react-qr-code`

## 3. Core Component Responsibilities & Layout

The main layout is defined in `App.tsx` and consists of two primary sections within a padded border (removed in fullscreen):

*   **A. Top Media Area (`flex-grow`):** Displays the primary visual content (`ImageFeed` or `VideoPlayer`). Also shows the current author's profile picture.
*   **B. Bottom Split Panel (`h-1/4`, `flex-row`, *hidden in fullscreen*):** Contains secondary information and list controls.
    *   **B1. Left Panel (`w-2/3`):** `MessageBoard` component.
    *   **B2. Right Panel (`w-1/3`):** `MediaPanel` component (acting as list/controls).

---

*   **`App.tsx` (Root Component):**
    *   **Orchestrator:** Initializes NDK connection state via `useNDKInit`. **Gets the singleton `ndkInstance` and the reliable `isReady` flag from `useNDKInit`.** Wraps `AppContent` with providers (`AuthProvider`, `WalletProvider`). **Passes `ndkInstance` and `isReady` as props to `AppContent`.** Manages overall loading/error states based on `useNDKInit`.
    *   **State Held:** None directly related to core app logic (managed in `AppContent`).
    *   **Refs Created:** None.
    *   **Hook Usage:**
        *   `useNDKInit`: Initializes connection, provides `ndkInstance` and `isReady` flag (true after first relay connects).
    *   **Data Handling:** None directly (delegated to `AppContent`).
    *   **Rendering Logic:**
        *   Displays initial loading/error states based on `useNDKInit`.
        *   Renders providers (`AuthProvider`, `WalletProvider`) and the main `AppContent` component, passing `ndkInstance` and `isReady` props.

*   **`AppContent.tsx` (Main Logic Component):**
    *   **Purpose:** Contains the core application logic, UI structure, and hook orchestration previously handled by `App.tsx`.
    *   **Props:** Receives `ndkInstance` (NDK) and `isNdkReady` (boolean) from `App`.
    *   **Orchestrator:** Uses the passed `ndkInstance` and `isNdkReady` props. Initializes core hooks (`useAuthContext`, `useWalletContext`, `useMediaAuthors`, `useMediaNotes`, `useMediaState`, etc.), manages media element refs, defines layout, handles data fetching/processing (combining notes, shuffling, deduplication), manages `SettingsModal`, and passes state/props down.
    *   **State Held:** Fetch limits/timestamps, combined/unique/shuffled note arrays, visible video count, preload URL, settings modal visibility, **relay connection stats (`relayStats` derived from `ndkInstance.pool`)**.
    *   **Refs Created:** `audioRef`, `videoRef`, `preloadVideoRef`, `imageFeedRef`.
    *   **Hook Usage:**
        *   Uses props: `ndkInstance`, `isNdkReady`.
        *   Context Hooks: `useAuthContext`, `useWalletContext`.
        *   Core Hooks: `useMediaAuthors`, `useMediaNotes`, `useMediaState`, `useMediaElementPlayback`, `useFullscreen`, `useKeyboardControls`, `useImageCarousel`, `useCurrentAuthor`, `useUserProfile` (for author profile), `useProfile` (from `nostr-hooks`, for logged-in user profile for `MessageBoard`).
        *   **Relay Stats:** Uses `useEffect` with the `ndkInstance` prop to listen for `relay:connect`/`relay:disconnect` events and poll `ndkInstance.pool.stats()` to update `relayStats` state.
    *   **Data Handling:** (As previously described, now using passed `ndkInstance`).
    *   **Rendering Logic:**
        *   (As previously described)
        *   Passes `relayStats.connected` to `RelayStatus` component.
        *   **Passes `ndkInstance` prop to `MessageBoard`.**
        *   **Passes profile data from `useProfile` (nostr-hooks) to `MessageBoard`'s `currentUser` prop.**

*   **`ImageFeed.tsx`:**
    *   **Purpose:** Displays the main image feed with author QR code and tipping interaction.
    *   **Rendered In:** Top Media Area (A) when `viewMode === 'imagePodcast'`.
    *   **Key Props:** `isLoading`, `handlePrevious`, `handleNext`, `currentImageIndex`, `imageNotes` (receives *shuffled combined* notes), `authorNpub`, `authorProfilePictureUrl`. Also receives placeholder playback props.
    *   **Hook Usage:** Uses `useAuth`, `useWallet`, `useMediaAuthors` (to get `ndk` instance).
    *   **Functionality:** Displays images. Includes a grouped section for author display name, QR code, and timestamp. Tipping interaction via QR code focus/select.

*   **`VideoPlayer.tsx`:**
    *   **Purpose:** Displays the video player UI with author QR code and tipping interaction.
    *   **Rendered In:** Top Media Area (A) when `viewMode === 'videoPlayer'`.
    *   **Key Props:** `videoRef`, `src` (receives `currentItemUrl` from `App`), playback state (`isPlaying`, `isMuted`, `autoplayFailed`), playback controls (`togglePlayPause`, `play`, `pause`, `toggleMute`), `authorNpub`, `currentNoteId`, `ndkInstance`, `isNdkReady`, `auth`, `wallet`.
    *   **Hook Usage:** None (receives necessary context/state via props).
    *   **Functionality:** Renders the `<video>` element. Reflects playback state. Tipping interaction via QR code focus/select. Overlay play button shown correctly when paused.

*   **`MediaPanel.tsx`:**
    *   **Purpose:** Displays the relevant **list** (Podcasts or Videos) and the **playback controls**. Acts as the interactive panel in the bottom-right.
    *   **Rendered In:** Bottom-Right Panel (B2) - *Rendered only when not fullscreen*.
    *   **Key Props:** `viewMode`, `audioRef`, `videoRef`, `podcastNotes`, `videoNotes` (receives *sliced unique sequential* video notes from `useMediaState`), loading states, indices, selection handlers, playback state/handlers, `setViewMode`, `currentItemUrl`, `authors`, `signalInteraction`, `ndkInstance`.
    *   **Hook Usage (Internal):** `useProfileData`, `useInactivityTimer`.
    *   **Functionality:** Renders lists, playback controls. Handles list item selection/navigation.

*   **`MessageBoard.tsx`:**
    *   **Purpose:** Displays Nostr chat messages for a specific thread.
    *   **Rendered In:** Bottom-Left Panel (B1) - *Rendered only when not fullscreen*.
    *   **Key Props:** `currentUser` (**receives profile object from `useProfile` (nostr-hooks)**), `threadEventId`, `onNewMessage` (callback to signal fullscreen hook).
    *   **Note:** Uses `useNdk()` internally to access the NDK instance if needed.

*   **`PlaybackControls.tsx` (Child of `MediaPanel.tsx`):**
    *   **Purpose:** Renders the actual buttons, sliders, and time displays for media control.

*   **`SettingsModal.tsx`:**
    *   **Purpose:** Provides a UI for managing user identity (login/logout/generate/NIP-46), followed hashtags, **independent toggles for fetching images/videos by tag**, setting the **default tip amount** via preset buttons, and the internal Cashu wallet (mint URL, balance, deposit QR). Includes a **Tip Devs** button.
    *   **Hook Usage:** `useAuth`, uses `wallet` prop.
    *   **Functionality:** Renders different sections based on login state.
        *   **Logged Out:** Displays options for NIP-46 connection, generating a new identity (nsec), or logging in with an existing nsec.
        *   **Logged In:** Displays wallet balance at the top, followed by Wallet Settings (Mint URL, Deposit QR, etc.), Fetch Toggles, Hashtag Following, Default Tip Amount, Tip Devs, and finally the Logout button at the bottom.
        *   Handles key generation/login flows.
        *   Manages adding/removing hashtags (showing suggestions when empty).
        *   Allows toggling `fetchImagesByTagEnabled` and `fetchVideosByTagEnabled` via `useAuth` setters.
        *   Manages Cashu mint URL settings and displays balance/deposit info from `wallet` prop.
        *   Allows setting `defaultTipAmount` via `useAuth` setter using preset buttons.
        *   Triggers tipping the app developer.
        *   **Logout Flow:** Initiating logout first triggers `wallet.exportUnspentProofs`. If proofs exist, a modal overlay appears showing a QR code of the proofs with a 45-second countdown. After the countdown, confirmation buttons ("Log Out" / "Cancel") are shown. If no proofs existed, logout proceeds directly.

*   **`RelayStatus.tsx`, `QRCode.tsx`:** Utility components. `RelayStatus` now includes the button to open the `SettingsModal`.

## 4. Custom Hooks Deep Dive

*   **`useAuth`:**
    *   **Input:** `ndkInstance` (NDK | undefined)
    *   **Output:** `UseAuthReturn` (exported interface) containing:
        *   User Identity: `currentUserNpub`, `currentUserNsec`, `isLoggedIn`.
        *   Loading/Error: `isLoadingAuth`, `authError`.
        *   NIP-46 State & Functions: `nip46ConnectUri`, `isGeneratingUri`, `initiateNip46Connection`, etc.
        *   Nsec Functions: `generateNewKeys`, `loginWithNsec`, `logout`.
        *   Signer: `getNdkSigner`, `signEvent`.
        *   Hashtag State: `followedTags` (array), `setFollowedTags` (function).
        *   **Tag Fetching Toggles:** `fetchImagesByTagEnabled` (boolean), `setFetchImagesByTagEnabled` (function), `fetchVideosByTagEnabled` (boolean), `setFetchVideosByTagEnabled` (function).
        *   **Default Tip Amount:** `defaultTipAmount` (number), `setDefaultTipAmount` (function).
        *   NIP-04 Helpers: `encryptDm`, `decryptDm`.
    *   **Function:** Manages authentication state via IDB. Persists `followedTags`, **tag fetching enable flags**, and **default tip amount** to IDB (`settings` store). Provides NDK signer access and NIP-04 helpers.

*   **`useMediaAuthors`:**
    *   **Input:** `ndk` (NDK | undefined), `isReady` (boolean).
    *   **Output:** `mediaAuthors` (array of pubkeys), `isLoadingAuthors`.
    *   **Function:** Fetches the user's Kind 3 contact list using `ndk.subscribe` **only when `ndk` is provided and `isReady` is true**. Includes timeout fallback. Corrected dependency array to `[ndk, pubkey, isReady]`.

*   **`useMediaNotes`:**
    *   **Input:** `authors` (optional), `mediaType` ('image', 'podcast', 'video'), `ndk` (NDK | undefined), `limit` (optional, defaults vary), `until` (optional), `followedTags` (optional string array).
    *   **Output:** `notes` (array of `NostrNote`), `isLoading`.
    *   **Function:** Fetches Nostr notes based on filters **only when `ndk` is provided and authors/tags criteria met**. Builds filters using `authors` OR `followedTags`. Uses `limit`/`until`. Caches/retrieves from `mediaNoteCache`. Stabilized `processEvent` callback using corrected dependencies `[mediaType, getUrlRegexForMediaType]`.

*   **`useMediaState`:**
    *   **Input:** `initialImageNotes` (shuffled combined), `initialPodcastNotes`, `initialVideoNotes` (deduplicated, *sliced* unique), `fetchOlderImages`, `fetchOlderVideos` (callbacks), `shuffledImageNotesLength`, `shuffledVideoNotesLength` (length of *sliced* videos).
    *   **Output:** `viewMode`, internal note states (`imageNotes`, `podcastNotes`, `videoNotes`), loading states, indices, `currentItemUrl`, `currentNoteId`, navigation/selection handlers.
    *   **Function:** Core UI state machine. Manages `viewMode`, indices, `currentItemUrl`. Handles navigation, triggering fetch callbacks. `fetchOlderVideos`/`fetchOlderImages` now handle fetching from appropriate sources (authors/tags based on flags in `App`).

*   **`useMediaElementPlayback`:**
    *   **Input:** `mediaElementRef`, `currentItemUrl`, `elementType`, `isActiveMode`, `onEnded`, `initialTime`, `autoplayEnabled` (boolean), `next` (boolean).
    *   **Output:** Playback state (`isPlaying`, `currentTime`, etc.) and controls (`togglePlayPause`, `handleSeek`, etc.).
    *   **Function:** Interacts with HTML media element. Manages state. Receives `currentItemUrl`. Handles autoplay (audio) and continuous playback (video) based on `autoplayEnabled` and `next` props, using `isEndedRef`.

*   **`useFullscreen`:** (No significant changes noted, still uses message/interaction timeouts)
    *   **Input:** `interactionTimeout` (optional), `messageTimeout` (optional), `checkInterval` (optional).
    *   **Output:** `isFullScreen` (boolean state), `signalInteraction` (callback), `signalMessage` (callback).
    *   **Function:** Manages fullscreen entry/exit. Tracks `lastInteractionTimestamp` and `lastMessageTimestamp`. Runs an interval timer (`checkInterval`). Enters fullscreen (`setIsFullScreen(true)`) if `interactionTimeout` or `messageTimeout` is exceeded. Exits fullscreen (`setIsFullScreen(false)`) when `signalInteraction` or `signalMessage` is called.

*   **`useKeyboardControls`:** (No significant changes noted)
    *   **Input:** `isFullScreen`, `signalInteraction`, `onSetViewMode`, `onTogglePlayPause` (receives `activePlayback.togglePlayPause` from `App`), `onNext`, `onPrevious`, `onFocusToggle` (optional), `viewMode`.
    *   **Output:** None (sets up side effect).
    *   **Function:** Adds `keydown` listener. Correctly calls `activePlayback.togglePlayPause` for play/pause actions when not fullscreen. Calls other appropriate callbacks based on key presses.

*   **`useImageCarousel`:** (No significant changes noted)
    *   **Input:** `isActive` (boolean), `onTick` (callback, e.g., `handleNext`), `intervalDuration`.
    *   **Output:** None (sets up side effect).
    *   **Function:** Sets up an interval timer using `setInterval`. Calls `onTick` every `intervalDuration` milliseconds, but only if `isActive` is true. Clears the interval on cleanup or when `isActive` becomes false.

*   **`useCurrentAuthor`:**
    *   **Input:** `viewMode`, `imageIndex`, `videoIndex`, `imageNotes` (shuffled combined), `videoNotes` (unique sequential).
    *   **Output:** `currentAuthorNpub` (string | null).
    *   **Function:** Determines active note from the correct list (`imageNotes` for image mode, `videoNotes` for video mode) and returns author `npub`.

*   **`useProfileData`:** (**REPLACED by `useUserProfile` in `App.tsx` for the current author**)
    *   ~~**Input:** `notes` (array of `NostrNote`).~~
    *   ~~**Output:** `profiles` (Record<string, ProfileData>), `fetchProfile` (function).~~
    *   ~~**Function:** Extracts unique pubkeys. Fetches profiles using caching and NDK lookups.~~

*   **`useUserProfile` (Used for Author Profile):**
    *   **Input:** `hexPubkey` (string | null), `ndk` (NDK | undefined).
    *   **Output:** `profile` (**ProfileData** | null), `isLoading` (boolean).
    *   **Function:** Fetches a single user's profile (Kind 0) using NDK lookups and caching (`profileCache`). Used in `AppContent` to get the `currentAuthorProfileData`.

*   **`useWallet`:** (No significant architecture changes noted, depends on NDK readiness)
    *   **Input:** `ndkInstance` (NDK | undefined), `isNdkReady` (boolean).
    *   **Output:** `UseWalletReturn` interface now includes `exportUnspentProofs: () => Promise<string | null>;`.
    *   **Function:** Manages internal Cashu wallet. Loads/stores proofs/mint URL. Calculates balance. Interacts with `cashuHelper`. Listens for DMs (Kind 4) using NDK subscription **only when NDK is ready**. Decrypts DMs using `useAuth` helper. Provides function to export current proofs as a JSON string for backup.

*   **`useNDKInit` (New Hook):**
    *   **Input:** None.
    *   **Output:** `ndkInstance` (NDK), `isReady` (boolean), `connectionError` (Error | null).
    *   **Function:** Responsible for creating the singleton NDK instance (`src/ndk.ts`), setting explicit relays, **initiating** the connection (`ndk.connect()`), and managing connection state/errors. **Crucially, sets `isReady` to `true` only *after* the first `relay:connect` event is received from the `ndk.pool`, ensuring a more reliable readiness signal.** Provides the **primary NDK instance** and `isReady` flag used by `App`.