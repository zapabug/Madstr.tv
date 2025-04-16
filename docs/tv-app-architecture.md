# TV App Architecture Documentation (Updated for Refactoring)

## 1. Overview

This document describes the architecture of the React-based TV application designed for displaying media content (images, podcasts, videos) shared via the Nostr protocol. It is optimized for TV viewing with remote control navigation.

**Key Features:**
*   Displays images, podcasts (audio), and videos.
*   Content is fetched from Nostr relays based on a list of followed authors.
*   Image and video feeds are **randomized** on load using `shuffleArray`.
*   Older content (images/videos) can be fetched dynamically ("infinite scroll" behavior) by navigating past the end of the current list.
*   Uses a **split-screen layout**, hiding the bottom panel in fullscreen mode.
*   Enters **fullscreen mode** automatically after periods of inactivity or no new messages.

**Operating Modes (`viewMode` state):**
*   `imagePodcast`: The main/top area displays the `ImageFeed`, while the bottom-right panel displays the `podcastNotes` list and controls.
*   `videoPlayer`: The main/top area displays the `VideoPlayer`, while the bottom-right panel displays the `videoNotes` list and controls.

## 2. Core Technologies

*   **Frontend Framework:** React (`useState`, `useEffect`, `useRef`, `useCallback`)
*   **State Management & Side Effects:** Primarily custom hooks (`useMediaAuthors`, `useMediaNotes`, `useMediaState`, `useMediaElementPlayback`, `useFullscreen`, `useKeyboardControls`, `useImageCarousel`, `useCurrentAuthor`) orchestrated by the root `App` component.
*   **Nostr Integration:** `@nostr-dev-kit/ndk`, `nostr-tools`, `nostr-hooks`
*   **Caching:** IndexedDB via `idb` (`mediaNoteCache`, `profileCache`)
*   **Styling:** Tailwind CSS, `framer-motion` (for animations)
*   **Utilities:** `shuffleArray`, `react-qr-code`

## 3. Core Component Responsibilities & Layout

The main layout is defined in `App.tsx` and consists of two primary sections within a padded border (removed in fullscreen):

*   **A. Top Media Area (`flex-grow`):** Displays the primary visual content (`ImageFeed` or `VideoPlayer`).
*   **B. Bottom Split Panel (`h-1/3`, `flex-row`, *hidden in fullscreen*):** Contains secondary information and list controls.
    *   **B1. Left Panel (`w-2/3`):** `MessageBoard` component.
    *   **B2. Right Panel (`w-1/3`):** `MediaPanel` component (acting as list/controls).

---

*   **`App.tsx` (Root Component):**
    *   **Orchestrator:** Initializes core hooks, manages media element refs (`audioRef`, `videoRef`), defines the main JSX layout structure with Tailwind, fetches initial data (via `useMediaAuthors`, `useMediaNotes`), shuffles image/video notes, and passes state/props/callbacks down to child components and hooks.
    *   **State Held:** Fetch limits/timestamps (`imageFetchLimit`, `videoFetchLimit`, `imageFetchUntil`, `videoFetchUntil`), shuffled notes (`shuffledImageNotes`, `shuffledVideoNotes`), initial podcast time (`initialPodcastTime`).
    *   **Refs Created:** `audioRef`, `videoRef`, `imageFeedRef`.
    *   **Hook Usage:**
        *   `useMediaAuthors`: Gets `ndk` instance and `mediaAuthors`.
        *   `useMediaNotes`: Fetches `imageNotes`, `podcastNotes`, `videoNotes`. Called multiple times.
        *   `useMediaState`: Manages core UI state (`viewMode`, indices, `currentItemUrl`), provides navigation handlers (`handlePrevious`, `handleNext`, etc.). Receives initial notes, fetcher callbacks, and note lengths.
        *   `useMediaElementPlayback`: Manages media playback (`isPlaying`, `currentTime`, etc.), receives active media ref and `currentItemUrl`.
        *   `useFullscreen`: Manages fullscreen state (`isFullScreen`) and provides `signalInteraction`/`signalMessage` callbacks.
        *   `useKeyboardControls`: Sets up global keyboard listener, receives state (`isFullScreen`, `viewMode`) and callbacks from other hooks/component state (`signalInteraction`, `setViewMode`, `togglePlayPause`, `handleNext`, `handlePrevious`, `focusImageFeedToggle`).
        *   `useImageCarousel`: Manages the image auto-advance timer, receives `isActive` flag and `handleNext` callback.
        *   `useCurrentAuthor`: Calculates the `npub` of the currently displayed author based on mode and index, receives indices and note lists.
    *   **Data Handling:**
        *   Receives raw notes from `useMediaNotes`.
        *   Uses `useEffect` to shuffle `imageNotes` and `videoNotes` into `shuffledImageNotes`/`shuffledVideoNotes` state. Shuffling happens here before passing to `useMediaState` and components.
        *   Defines `fetchOlderImages`/`fetchOlderVideos` callbacks (updates `Until` state) and passes them to `useMediaState`.
    *   **Rendering Logic:**
        *   Renders invisible `<audio>` element (`audioRef`).
        *   Renders layout structure (Top Area, Bottom Panel).
        *   Conditionally renders components based on `viewMode` (`ImageFeed` or `VideoPlayer`) in the Top Area.
        *   Conditionally renders the Bottom Panel based on `isFullScreen`.
        *   Renders `MessageBoard` and `MediaPanel` within the Bottom Panel.
        *   Passes necessary props (state, refs, callbacks from hooks) down to child components.
        *   Handles overall loading state display.

*   **`ImageFeed.tsx`:**
    *   **Purpose:** Displays the main image feed with author QR code.
    *   **Rendered In:** Top Media Area (A) when `viewMode === 'imagePodcast'`.
    *   **Key Props:** `shuffledImageNotes`, `isLoading`, `currentImageIndex`, `handlePrevious`, `handleNext`, `authorNpub`.
    *   **Functionality:** Displays images, handles internal focus, shows author QR code.

*   **`VideoPlayer.tsx`:**
    *   **Purpose:** Displays the video player UI with author QR code.
    *   **Rendered In:** Top Media Area (A) when `viewMode === 'videoPlayer'`.
    *   **Key Props:** `videoRef`, `src` (bound to `currentItemUrl`), `isPlaying`, `togglePlayPause`, `authorNpub`, `autoplayFailed`, `isMuted`.
    *   **Functionality:** Renders the `<video>` element (using `videoRef`), controls playback state based on props, shows overlay play button, shows author QR code.

*   **`MediaPanel.tsx`:**
    *   **Purpose:** Displays the relevant **list** (Podcasts or Videos) and the **playback controls**. Acts as the interactive panel in the bottom-right.
    *   **Rendered In:** Bottom-Right Panel (B2) - *Rendered only when not fullscreen*.
    *   **Key Props:** `viewMode`, `audioRef`, `videoRef`, `podcastNotes`, `videoNotes` (receives *shuffled* videos), loading states, indices, selection handlers, playback state/handlers (`isPlaying`, `currentTime`, etc.), `setViewMode`, `currentItemUrl`, `authors`.
    *   **Hook Usage (Internal):** Uses `useProfileData` to fetch profile info (name/pic) for authors in the lists. Uses `useInactivityTimer`.
    *   **Functionality:** Renders lists, playback controls, connects controls to props from `App`. Handles list item selection/navigation. Does **not** render media elements directly.

*   **`MessageBoard.tsx`:**
    *   **Purpose:** Displays Nostr chat messages for a specific thread.
    *   **Rendered In:** Bottom-Left Panel (B1) - *Rendered only when not fullscreen*.
    *   **Key Props:** `ndk`, `neventToFollow`, `authors`, `onNewMessage` (callback to signal fullscreen hook).

*   **`PlaybackControls.tsx` (Assumed Child of `MediaPanel.tsx`):**
    *   **Purpose:** Renders the actual buttons, sliders, and time displays for media control.
    *   **Rendered In:** `MediaPanel.tsx`.
    *   **Key Props:** Likely receives playback state (`isPlaying`, `currentTime`, `duration`, `playbackRate`, `isMuted`) and handlers (`togglePlayPause`, `handleSeek`, `setPlaybackRate`, `toggleMute`) from `MediaPanel`.

*   **`RelayStatus.tsx`, `QRCode.tsx`:** Utility components.

## 4. Custom Hooks Deep Dive

*   **`useMediaAuthors`:**
    *   **Input:** `relays` (array of relay URLs).
    *   **Output:** `ndk` instance, `mediaAuthors` (array of pubkeys), `isLoadingAuthors`.
    *   **Function:** Initializes NDK, connects to relays, fetches user's Kind 3 contact list, returns authors (user + followed) and NDK instance.

*   **`useMediaNotes`:**
    *   **Input:** `authors`, `mediaType` ('image', 'podcast', 'video'), `ndk`, `limit` (optional), `until` (optional).
    *   **Output:** `notes` (array of `NostrNote` objects, sorted by created_at descending), `isLoading`.
    *   **Function:** Fetches Nostr notes based on authors and specified Kinds/tags. Uses `limit`/`until` for pagination. Checks IndexedDB cache first, then subscribes via NDK. Accumulates notes. Parses URLs/metadata. Caches new notes. Returns raw, sorted notes.

*   **`useMediaState`:**
    *   **Input:** `initialImageNotes`, `initialPodcastNotes`, `initialVideoNotes` (expects shuffled image/video notes), `fetchOlderImages`, `fetchOlderVideos` (callbacks), `shuffledImageNotesLength`, `shuffledVideoNotesLength`.
    *   **Output:** `viewMode`, `imageNotes` (internal), `podcastNotes` (internal), `videoNotes` (internal), `isLoadingPodcastNotes`, `isLoadingVideoNotes`, `currentImageIndex`, `currentPodcastIndex`, `currentVideoIndex`, `selectedVideoNpub`, `currentItemUrl`, `handleVideoSelect`, `handlePrevious`, `handleNext`, `setViewMode`, `setCurrentPodcastIndex`.
    *   **Function:** Core UI state machine. Manages `viewMode`, current indices for each media type, and the `currentItemUrl` based on the mode and index. Handles navigation logic (`handlePrevious`, `handleNext`) respecting list boundaries and triggering fetch callbacks. Manages selection logic (`handleVideoSelect`, `setCurrentPodcastIndex`). Updates internal notes state based on props.

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
    *   **Function:** Adds a window `keydown` event listener. Calls `signalInteraction` on *any* key press. If *not* fullscreen, it checks the key and calls the appropriate callback (`onSetViewMode`, `onTogglePlayPause`, etc.), preventing default browser actions. If fullscreen, it only signals interaction (which causes `useFullscreen` to exit fullscreen).

*   **`useImageCarousel`:**
    *   **Input:** `isActive` (boolean), `onTick` (callback, e.g., `handleNext`), `intervalDuration`.
    *   **Output:** None (sets up side effect).
    *   **Function:** Sets up an interval timer using `setInterval`. Calls `onTick` every `intervalDuration` milliseconds, but only if `isActive` is true. Clears the interval on cleanup or when `isActive` becomes false.

*   **`useCurrentAuthor`:**
    *   **Input:** `viewMode`, `imageIndex`, `videoIndex`, `imageNotes` (shuffled), `videoNotes` (shuffled).
    *   **Output:** `currentAuthorNpub` (string | null).
    *   **Function:** Determines the currently active note based on `viewMode` and the corresponding index (`imageIndex` or `videoIndex`) within the provided note lists. Extracts the `pubkey` from the active note (if found) and returns its `npub` encoded string (e.g., "npub1..."). Returns `null` if no active note or pubkey is found. Used for displaying QR codes in `ImageFeed`/`VideoPlayer`.

*   **`useProfileData` (Used in `MediaPanel`):**
    *   **Input:** `notes` (array of `NostrNote`).
    *   **Output:** `profiles` (Record<string, ProfileData>), `fetchProfile` (function).
    *   **Function:** Extracts unique pubkeys from input notes. Fetches profile data (Kind 0) for these pubkeys, using caching (`profileCache`) and NDK lookups. Returns a map of pubkeys to profile details (name, picture, etc.).