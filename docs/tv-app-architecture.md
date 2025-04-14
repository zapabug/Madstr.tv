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
    *   **Rendering Logic:**
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
    *   **Functionality:** Renders the `<video>` element with `autoPlay`. Shows an overlay play button if `isPlaying` is false.

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
        *   **Does NOT render the `<audio>` element (uses `audioRef` for controls).**

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
    *   **Function:** Fetches Nostr notes (Kind 1) based on authors and specified Kinds (e.g., `IMAGE_KINDS`). Uses `limit`/`until` for pagination. Checks IndexedDB cache first, then subscribes via NDK. Accumulates notes over time if `limit`/`until` changes. Parses URLs/metadata. Caches new notes. **Returns raw, sorted notes.**

*   **`useMediaState`:**
    *   **Input:** `initialImageNotes`, `initialPodcastNotes`, `initialVideoNotes` (raw arrays from `useMediaNotes`), `fetchOlderImages`, `fetchOlderVideos` (callbacks from `App`), `shuffledImageNotesLength`, `shuffledVideoNotesLength`.
    *   **Output:** `viewMode`, `imageNotes`, `podcastNotes`, `videoNotes` (internal, sorted state copies), `isLoadingPodcastNotes`, `isLoadingVideoNotes`, `currentImageIndex`, `currentPodcastIndex`, `currentVideoIndex`, `selectedVideoNpub`, `currentItemUrl`, `handleVideoSelect`, `handlePrevious`, `handleNext`, `setViewMode`, `setCurrentPodcastIndex`.
    *   **Function:**
        *   Holds core UI state: `viewMode`, `current...Index`, `selectedVideoNpub`.
        *   Receives initial note arrays via props. Uses internal `useEffect` hooks watching these props to: sort them, update internal state (`imageNotes`, `podcastNotes`, `videoNotes`), set internal loading flags (`isLoading...Notes`) to `false`, and reset indices if necessary.
        *   Calculates `currentItemUrl` based on `viewMode` and current index/notes via `useEffect`.
        *   Provides navigation handlers (`handlePrevious`, `handleNext`). `handleNext` uses the passed `shuffled...Length` props to detect the end of the list and calls the appropriate `fetchOlder...` callback.
        *   Provides selection handlers: `handleVideoSelect` (updates video index/npub, crucially sets `viewMode = 'videoPlayer'`), `setCurrentPodcastIndex`.
        *   Provides `setViewMode` for explicit mode changes (e.g., toggle button).

*   **`useMediaElementPlayback`:**
    *   **Input:** `mediaElementRef` (`audioRef` or `videoRef` from `App`), `currentItemUrl` (from `useMediaState`), `onEnded` (callback, typically `handleNext`), `initialTime` (for resuming podcasts).
    *   **Output:** Playback state (`isPlaying`, `currentTime`, `duration`, `playbackRate`, `isSeeking`) and control functions (`setPlaybackRate`, `togglePlayPause`, `handleSeek`, `play`, `pause`, `setIsSeeking`).
    *   **Function:** Abstract layer over HTML `<audio>`/`<video>` elements. Attaches listeners, manages playback state, provides control functions.

## 5. Data Flow & State Management Summary

1.  **Init:** `App` starts `useMediaAuthors` -> `ndk`/`authors`.
2.  **Fetch:** `App` starts `useMediaNotes` (x3) with `authors`, `ndk`. Returns `imageNotes`, `podcastNotes`, `videoNotes`.
3.  **Shuffle:** `App` `useEffect` hooks watch fetched notes, call `shuffleArray`, update `shuffledImageNotes`/`shuffledVideoNotes` state in `App`.
4.  **State Hook:** `App` passes initial notes, fetchers, shuffled lengths to `useMediaState`. `useMediaState` processes initial notes, sets up internal state and URL calculation.
5.  **Render:** `App` renders layout based on `viewMode` from `useMediaState`.
    *   Top: `ImageFeed` (gets `shuffledImageNotes`) OR `VideoPlayer` (gets `videoRef`, `currentItemUrl`, playback state).
    *   Bottom-Left: `MessageBoard`.
    *   Bottom-Right: `MediaPanel` (gets `viewMode`, refs, `podcastNotes`, `shuffledVideoNotes`, playback state/handlers).
6.  **Interaction:**
    *   Controls in `MediaPanel` call handlers passed from `App` (originating in `useMediaState` / `useMediaElementPlayback`).
    *   Selecting video in `MediaPanel` calls `handleVideoSelect` -> `useMediaState` updates index/npub and sets `viewMode='videoPlayer'`.
    *   `App` re-renders, showing `VideoPlayer` top, `MediaPanel` shows video list bottom-right.
    *   Navigation (`handleNext`) -> `useMediaState` checks boundary -> calls `fetchOlder...` -> `App` updates `until` -> `useMediaNotes` fetches more -> `App` shuffles more -> `useMediaState` gets new initial notes -> UI updates.

## 6. Navigation and Focus Management

*   Focus management primarily handled within individual components (`ImageFeed`, `MediaPanel`).
*   Mode switching driven by user actions (video selection, toggle button) via `useMediaState`.
*   Pagination (`fetchOlder...`) triggered by `handleNext` boundary checks in `useMediaState`.

## 7. Areas for Potential Improvement/Review

*   **Bottom-Right Panel:** Confirm its dedicated purpose (list/controls).
*   **Podcast UI:** Determine if UI beyond `MediaPanel` controls is needed. Integrate `Podcastr.tsx` if required.
*   **`useMediaState` Complexity:** Could potentially be broken down further if logic becomes too complex.
*   **Npub Update on Next/Prev Video:** `handleNext`/`handlePrevious` in `useMediaState` currently only update the video index, not `selectedVideoNpub`. This might be fine if npub is only needed on direct selection (`handleVideoSelect`), but worth noting. Requires access to shuffled notes inside hook for proper npub lookup.
*   **Error Handling/Loading States:** Ensure comprehensive handling.
*   **Caching Strategy.**

## 8. Additional Notes

*   **Randomization:** Explicitly happens in `App` via `useEffect` after notes are fetched, before passing to UI.
*   **Persistence:** Podcast time (`localStorage`), video time (none).
*   **`<audio>` Element:** Assumed to be rendered invisibly in `App.tsx` (needs verification) and controlled via `audioRef` passed through `App`.

## Additional Notes

*   **URL Parsing:** Logic is now primarily within `useMediaState`'s URL effect.
*   **Prop Drilling:** Still necessary to connect `App` state/hooks to components.
*   **Persistence:** Podcast time saved via `localStorage`. Video position is not saved.
*   **Randomization:** Image/Video notes shuffled in `App`. 