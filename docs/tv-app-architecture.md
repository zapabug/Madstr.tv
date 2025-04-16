# TV App Architecture Documentation (LLM Context Version)

## 1. Overview

This document describes the architecture of the React-based TV application designed for displaying media content (images, podcasts, videos) shared via the Nostr protocol. It is optimized for TV viewing with remote control navigation.

**Key Features:**
*   Displays images, podcasts (audio), and videos.
*   Content is fetched from Nostr relays based on a list of followed authors.
*   Image and video feeds are **randomized** on load using `shuffleArray`.
*   Older content (images/videos) can be fetched dynamically ("infinite scroll" behavior) by navigating past the end of the current list.
*   Uses a **split-screen layout**.

**Operating Modes (`viewMode` state):**
*   `imagePodcast`: The main/top area displays the `ImageFeed`, while the bottom-right panel displays the `podcastNotes` list and controls.
*   `videoPlayer`: The main/top area displays the `VideoPlayer`, while the bottom-right panel displays the `videoNotes` list and controls.

## 2. Core Technologies

*   **Frontend Framework:** React (`useState`, `useEffect`, `useRef`, `useCallback`)
*   **State Management:** Primarily custom hooks (`useMediaAuthors`, `useMediaState`, `useMediaElementPlayback`, `useMediaNotes`) orchestrated by the root `App` component.
*   **Nostr Integration:** `@nostr-dev-kit/ndk`, `nostr-tools`
*   **Caching:** IndexedDB via `idb` (`mediaNoteCache`, `profileCache`)
*   **Styling:** Tailwind CSS
*   **Utilities:** `shuffleArray`

## 3. Core Component Responsibilities & Layout

The main layout is defined in `App.tsx` and consists of two primary sections within a padded border:

*   **A. Top Media Area (`flex-grow`):** Displays the primary visual content.
*   **B. Bottom Split Panel (`h-1/3`, `flex-row`):** Contains secondary information and list controls.
    *   **B1. Left Panel (`w-2/3`):** `MessageBoard` component.
    *   **B2. Right Panel (`w-1/3`):** `MediaPanel` component (acting as list/controls).

---

*   **`App.tsx` (Root Component):**
    *   **Orchestrator:** Initializes hooks, manages refs, defines layout, fetches data (via hooks), shuffles data, and passes props down.
    *   **State Held:** `imageFetchLimit`, `videoFetchLimit`, `imageFetchUntil`, `videoFetchUntil`, `shuffledImageNotes`, `shuffledVideoNotes`, `initialPodcastTime`.
    *   **Refs Created:** `audioRef`, `videoRef`, `imageFeedRef`.
    *   **Hook Usage:**
        *   `useMediaAuthors`: Gets `ndk` instance and `mediaAuthors`.
        *   `useMediaNotes`: Fetches `imageNotes`, `podcastNotes`, `videoNotes` based on authors and fetch parameters.
        *   `useMediaState`: Manages `viewMode` and indices. Receives initial notes (raw from `useMediaNotes`), fetcher callbacks, and shuffled list lengths. Returns state like `viewMode`, `currentItemUrl`, indices, and handlers.
        *   `useMediaElementPlayback`: Manages actual playback state (`isPlaying`, `currentTime`, etc.) based on `currentItemUrl` and the active media ref (`audioRef` or `videoRef`).
    *   **Data Handling:**
        *   Receives `imageNotes`, `videoNotes` from `useMediaNotes`.
        *   Uses `useEffect` to call `shuffleArray` on these notes and updates `shuffledImageNotes`/`shuffledVideoNotes` state. **Shuffling happens here because the UI components need the shuffled order.**
        *   Uses a `useEffect` hook to monitor `viewMode` changes. When the mode switches to `'videoPlayer'`, it automatically triggers the `fetchOlderVideos` callback to fetch the next batch of older videos in the background.
    *   **Rendering Logic:**
        *   Renders an invisible `<audio>` element associated with `audioRef`. This element is controlled by `useMediaElementPlayback`.
        *   **Top Area (A):** Renders `ImageFeed` (if `viewMode === 'imagePodcast'`) OR `VideoPlayer` (if `viewMode === 'videoPlayer'`). Passes relevant props (e.g., `shuffledImageNotes` to `ImageFeed`, `videoRef`/`currentItemUrl`/playback state to `VideoPlayer`).
        *   **Bottom Panel (B1):** Renders `MessageBoard`, passing `ndk`, `authors`.
        *   **Bottom Panel (B2):** Renders `MediaPanel`, passing `viewMode`, `audioRef`, `videoRef`, `podcastNotes`, `shuffledVideoNotes`, indices, playback state/handlers, etc.
    *   **Callbacks:** Defines `fetchOlderImages`/`fetchOlderVideos` (update `until` state) and passes them to `useMediaState`.
    *   **Global Handlers:** Handles global key events (e.g., Back).

*   **`ImageFeed.tsx`:**
    *   **Purpose:** Displays the main image feed.
    *   **Rendered In:** Top Media Area (A) when `viewMode === 'imagePodcast'`.
    *   **Key Props:** `shuffledImageNotes`, `isLoading`, `currentImageIndex`, `handlePrevious`, `handleNext`.
    *   **Functionality:** Displays images, handles internal list navigation/focus.

*   **`VideoPlayer.tsx`:**
    *   **Purpose:** Displays the video player UI.
    *   **Rendered In:** Top Media Area (A) when `viewMode === 'videoPlayer'`.
    *   **Key Props:** `videoRef`, `src` (bound to `currentItemUrl`), `isPlaying`, `togglePlayPause`.
    *   **Functionality:** 
        * Renders the `<video>` element with `autoPlay`.
        * Shows a centered, circular overlay play button (`absolute p-4 rounded-full...`) if `isPlaying` is false.
        * **Note on Dual Play Buttons:** This centered button co-exists with the Play/Pause button in the `MediaPanel`'s control bar. While potentially redundant, the centered button is retained for specific edge cases, such as allowing direct interaction with the video player when controls are hidden or when autoplay fails and immediate user action is desired.

*   **`MediaPanel.tsx`:**
    *   **Purpose:** Displays the relevant **list** (Podcasts or Videos) and the **playback controls**. Acts as the interactive panel in the bottom-right.
    *   **Rendered In:** Bottom-Right Panel (B2) - *Always rendered here*.
    *   **Key Props:** `viewMode`, `audioRef`, `videoRef`, `podcastNotes`, `shuffledVideoNotes`, `isLoadingPodcastNotes`, `isLoadingVideoNotes`, `currentPodcastIndex`, `currentVideoIndex`, `setCurrentPodcastIndex`, `onVideoSelect`, playback state (`isPlaying`, `currentTime`, etc.) and handlers (`togglePlayPause`, `handleSeek`, `setPlaybackRate`, `setViewMode`).
    *   **Functionality:**
        *   Uses `viewMode` to determine which list (`podcastNotes` or `shuffledVideoNotes`) and loading state (`isLoading...`) to use.
        *   Renders the appropriate list items.
        *   Renders shared playback controls (Play/Pause, Seek, Time, Speed [only for podcasts], Mode Toggle button ["Images"/"Videos"]).
        *   Connects controls to handlers/state passed from `App` (originating from `useMediaState` and `useMediaElementPlayback`).
        *   Handles list item selection/navigation (e.g., calls `setCurrentPodcastIndex` or `onVideoSelect`).
        *   **Does NOT render the `<video>` element.**
        *   **Does NOT render the `<audio>` element (uses `audioRef` passed from `App` for controls).**

*   **`MessageBoard.tsx`:**
    *   **Purpose:** Displays Nostr chat messages for a specific thread.
    *   **Rendered In:** Bottom-Left Panel (B1).
    *   **Key Props:** `ndk`, `neventToFollow`, `authors`.

*   **`RelayStatus.tsx`, `QRCode.tsx`:** Utility components for displaying relay status and QR code.

*   **`Podcastr.tsx`:** **ASSUMPTION:** This component appears unused in the current implementation. Podcast playback is handled via `App` -> `useMediaElementPlayback` -> `audioRef` -> `MediaPanel` controls.

## 4. Custom Hooks Deep Dive

*   **`useMediaAuthors`:**
    *   **Input:** None.
    *   **Output:** `ndk` instance, `mediaAuthors` (array of pubkeys), `isLoadingAuthors`.
    *   **Function:** Initializes NDK, connects to RELAYS, fetches user's Kind 3 contact list (pubkeys), returns authors (user + followed) and NDK instance.

*   **`useMediaNotes`:**
    *   **Input:** `authors`, `mediaType` ('image', 'podcast', 'video'), `ndk`, `limit` (optional), `until` (optional).
    *   **Output:** `notes` (array of `NostrNote` objects, sorted by created_at descending), `isLoading`.
    *   **Function:** Fetches Nostr notes based on authors and specified Kinds. Uses `limit`/`until` for pagination. Checks IndexedDB cache first, then subscribes via NDK. Accumulates notes over time if `limit`/`until` changes. Parses URLs/metadata. Caches new notes. **Returns raw, sorted notes.**
    *   **URL Parsing Logic:**
        *   For **videos**: Prioritizes checking for an `m` tag (MIME type, e.g., `["m", "video/mp4"]`). If found, it confirms the event as video and looks for the URL in `url` or `media` tags (or content as last resort). If no `m` tag is found, it falls back to checking `url`, `media` tags, and finally event `content` against a regex for video file extensions (`.mp4`, `.mov`, etc.).
        *   For **podcasts/images**: Primarily checks specific tags (`enclosure`/`image`) and the `url`/`media` tags, falling back to content regex matching audio/image file extensions.

*   **`useMediaState`:**
    *   **Input:** `initialImageNotes`, `initialPodcastNotes`, `initialVideoNotes` (raw arrays from `useMediaNotes`), `fetchOlderImages`, `