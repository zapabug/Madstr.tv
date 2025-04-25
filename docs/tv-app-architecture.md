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
*   **State Management & Side Effects:** Primarily custom hooks (`useAuth`, `useMediaAuthors`, `useMediaNotes`, `useMediaState`, `useMediaElementPlayback`, `useFullscreen`, `useKeyboardControls`, `useImageCarousel`, `useCurrentAuthor`, `useWallet`, `useNDKInit`, `useUserProfile`) orchestrated by the root `App` component.
*   **Nostr Integration:** `@nostr-dev-kit/ndk`, `nostr-tools`
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
    *   **Orchestrator:** Initializes NDK via `useNDKInit`. Initializes core hooks, manages media element refs (`audioRef`, `videoRef`, `preloadVideoRef`), defines the main JSX layout structure with Tailwind, fetches initial data (via `useMediaAuthors`, `useMediaNotes` conditionally based on `useAuth` flags), handles image shuffling and video deduplication/sorting, manages `SettingsModal` visibility, and passes state/props/callbacks down to child components and hooks.
    *   **State Held:** Fetch limits/timestamps (`imageFetchLimit`, `videoFetchLimit`, `imageFetchUntil`, `videoFetchUntil`, `imageTagsFetchUntil`, `videoTagsFetchUntil`), combined image/video notes (`combinedImageNotes`, `combinedVideoNotes`), deduplicated/sorted unique video notes (`uniqueVideoNotes`), visible video count (`visibleVideoCount`), initial podcast time (`initialPodcastTime`), preload URL (`preloadVideoUrl`), settings modal visibility (`isSettingsOpen`).
    *   **Refs Created:** `audioRef`, `videoRef`, `preloadVideoRef`, `imageFeedRef`.
    *   **Hook Usage:**
        *   `useNDKInit`: Gets the primary `ndkInstance` and connection status.
        *   `useMediaAuthors`: Gets `mediaAuthors` using the `ndkInstance`.
        *   `useAuth`: Initializes authentication state, provides login/logout methods, NIP-46 handling, `followedTags`, tag fetching enable flags (`fetchImagesByTagEnabled`, `fetchVideosByTagEnabled`), signing capabilities, and NIP-04 helpers (`encryptDm`/`decryptDm`).
        *   `useWallet`: Manages internal Cashu wallet state, depends on `ndkInstance`.
        *   `useMediaNotes`: Called multiple times (for authors/tags, images/videos) to fetch notes, conditionally based on `useAuth` flags. Uses specific limits for authors vs tags (e.g., Images: 30/30, Videos: 15/15, Podcasts: 25).
        *   `useMediaState`: Manages core UI state (`viewMode`, indices, `currentItemUrl`), provides navigation handlers (`handlePrevious`, `handleNext`, etc.). Receives shuffled combined images and a *slice* of sequential unique videos (`visibleUniqueVideoNotes`). Uses modified `fetchOlderVideos`/`fetchOlderImages` callbacks.
        *   `useMediaElementPlayback`: Manages media playback (`isPlaying`, `currentTime`, etc.), receives active media ref, `currentItemUrl`, and props for controlling autoplay/continuous play (`autoplayEnabled`, `next`). Instantiated separately for audio and video.
        *   `useFullscreen`: Manages fullscreen state (`isFullScreen`) and provides `signalInteraction`/`signalMessage` callbacks.
        *   `useKeyboardControls`: Sets up global keyboard listener, uses correct `togglePlayPause` callback.
        *   `useImageCarousel`: Manages the image auto-advance timer.
        *   `useCurrentAuthor`: Calculates the `npub` of the currently displayed author based on combined/unique notes.
        *   `useUserProfile`: Fetches profile data for the `currentAuthorNpub`.
    *   **Data Handling:**
        *   Receives raw notes from multiple `useMediaNotes` calls (authors vs tags, images vs videos).
        *   Uses `useEffect` to combine/deduplicate author and tag notes (if fetched) into `combinedImageNotes` / `combinedVideoNotes`.
        *   Uses `useMemo` to shuffle `combinedImageNotes` into `shuffledImageNotes` state (used by `ImageFeed` and `useMediaState`).
        *   Uses `useEffect` to deduplicate `combinedVideoNotes` by URL and sort by date into `uniqueVideoNotes` state (used for `VideoPlayer` via `useMediaState`).
        *   Uses `useState` (`visibleVideoCount`) and `useMemo` (`visibleUniqueVideoNotes`) to limit the video playlist shown via `useMediaState`.
        *   Defines `fetchOlderImages`/`fetchOlderVideos` callbacks that conditionally fetch older author/tag notes based on `useAuth` flags and passes them to `useMediaState`. `fetchOlderVideos` handles expanding the visible video count from cache first.
        *   Uses `useEffect` to calculate the next video URL (`preloadVideoUrl`) based on `viewMode`, `currentVideoIndex`, and `uniqueVideoNotes`.
        *   Uses `useEffect` to set the `src` of the hidden `preloadVideoRef` and call `.load()` when `preloadVideoUrl` changes.
        *   Gets `followedTags` and enable flags from `useAuth` and passes them conditionally to `useMediaNotes` calls.
    *   **Rendering Logic:**
        *   Renders invisible `<audio>` element (`audioRef`) and hidden `<video>` element (`preloadVideoRef`).
        *   Renders layout structure (Top Area, Bottom Panel).
        *   Conditionally renders `ImageFeed` or `VideoPlayer` based on `viewMode`.
        *   Passes `currentItemUrl` from `useMediaState` directly to playback hooks and `VideoPlayer`.
        *   Passes necessary context (`ndkInstance`, `isNdkReady`, `auth`, `wallet`) to `VideoPlayer`.
        *   Conditionally renders the Bottom Panel based on `isFullScreen`.
        *   Renders `MessageBoard` and `MediaPanel` within the Bottom Panel.
        *   Renders `SettingsModal` and `RelayStatus`.
        *   Renders the current author's profile picture in the top-left corner.
        *   Passes necessary props down to child components.
        *   Handles overall loading state display based on NDK, authors, and relevant notes hooks.

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
    *   **Key Props:** `ndk`, `threadEventId`, `onNewMessage` (callback to signal fullscreen hook), `isReady`.

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
    *   **Input:** `ndk` (NDK | undefined).
    *   **Output:** `mediaAuthors` (array of pubkeys), `isLoadingAuthors`. (Note: No longer provides the primary NDK instance, which now comes from `useNDKInit`).
    *   **Function:** Fetches the user's Kind 3 contact list using `ndk.subscribe`. Includes timeout fallback. Returns the list of authors.

*   **`useMediaNotes`:**
    *   **Input:** `authors` (optional), `mediaType` ('image', 'podcast', 'video'), `ndk` (NDK | null), `limit` (optional, defaults vary), `until` (optional), `followedTags` (optional string array).
    *   **Output:** `notes` (array of `NostrNote`), `isLoading`.
    *   **Function:** Fetches Nostr notes based on filters. Builds filters using `authors` OR `followedTags` (passed conditionally by `App`). Uses `limit`/`until`. Caches/retrieves from `mediaNoteCache`. Returns raw, sorted notes for the specific source (authors or tags).

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

*   **`useUserProfile` (New usage in App.tsx):**
    *   **Input:** `hexPubkey` (string | null), `ndk` (NDK | undefined).
    *   **Output:** `profile` (NDKUserProfile | null), `isLoading` (boolean).
    *   **Function:** Fetches a single user's profile (Kind 0) using NDK's built-in caching and fetching mechanisms. Used in `App.tsx` to get the `currentAuthorProfile`.

*   **`useWallet`:** (No significant architecture changes noted, depends on NDK readiness)
    *   **Input:** `ndkInstance` (NDK | undefined), `isNdkReady` (boolean).
    *   **Output:** `UseWalletReturn` interface now includes `exportUnspentProofs: () => Promise<string | null>;`.
    *   **Function:** Manages internal Cashu wallet. Loads/stores proofs/mint URL. Calculates balance. Interacts with `cashuHelper`. Listens for DMs (Kind 4) using NDK subscription **only when NDK is ready**. Decrypts DMs using `useAuth` helper. Provides function to export current proofs as a JSON string for backup.

*   **`useNDKInit` (New Hook):**
    *   **Input:** None.
    *   **Output:** `ndkInstance` (NDK | undefined), `isConnecting` (boolean), `connectionError` (Error | null).
    *   **Function:** Responsible for creating the singleton NDK instance (`src/ndk.ts`), setting explicit relays, attempting connection, and managing connection state/errors. Provides the **primary NDK instance** used throughout the app.