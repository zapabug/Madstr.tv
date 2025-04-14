# TV App Architecture Documentation

## Overview

This document describes the architecture of the React-based TV application designed for displaying media content (images, podcasts, videos) shared via the Nostr protocol. The application utilizes a split-screen layout and operates primarily in two modes: an Image/Podcast view and a dedicated Video Player view. **Image and video content is randomized on load, and older content can be fetched dynamically.** It's optimized for TV viewing and remote control navigation.

## Core Technologies

*   **Frontend Framework:** React
*   **State Management:** React Hooks (`useState`, `useEffect`, `useRef`, `useCallback`), custom hooks (`useMediaAuthors`, `useMediaState`, `useMediaElementPlayback`, `useMediaNotes`). State is largely centralized in the root `App` component.
*   **Nostr Integration:** `@nostr-dev-kit/ndk` for connecting to relays, subscribing to events, and fetching data. `nostr-tools` for utility functions (e.g., `nip19`).
*   **Caching:** IndexedDB via `idb` library (`mediaNoteCache`, `profileCache`).
*   **Styling:** Tailwind CSS
*   **Utilities:** `shuffleArray` for randomizing content order.

## Key Components and Responsibilities

*   **`App.tsx` (Root Component):**
    *   Orchestrates the entire application and defines the main layout structure.
    *   **Layout:** Renders a top "media area" (taking most vertical space) and a bottom "split panel" (fixed height, containing `MessageBoard` on the left and `MediaPanel` on the right).
    *   Initializes Nostr connection (`NDK`) via `useMediaAuthors`.
    *   Holds state for fetch parameters (`limit`, `until`) passed to `useMediaNotes`.
    *   Uses the `useMediaNotes` hook to fetch notes for podcasts, videos, and images.
    *   **Holds state for shuffled image and video notes.**
    *   **Shuffles `imageNotes` and `videoNotes`** using `shuffleArray` after they are fetched by `useMediaNotes`.
    *   Manages the core UI state (`viewMode`, indices) via `useMediaState`, passing initial notes, fetcher functions, and shuffled list lengths.
    *   Manages playback state via `useMediaElementPlayback`, passing the appropriate media ref (`audioRef` or `videoRef`).
    *   Derives `currentItemUrl` based on `viewMode` and indices.
    *   Defines `fetchOlderImages`/`fetchOlderVideos` callbacks.
    *   Handles global keyboard events.
    *   **Top Media Area Rendering:** Conditionally renders `ImageFeed` (if `viewMode === 'imagePodcast'`) or `MediaPanel` (if `viewMode === 'videoPlayer'`, passing `displayContext="main"`) in the top section.
    *   **Bottom Panel Rendering:** Renders `MessageBoard` (left 2/3) and `MediaPanel` (right 1/3, passing `displayContext="panel"`) in the bottom split panel.
    *   Passes shuffled notes, state, and handlers down to child components as needed.
*   **`ImageFeed.tsx`:**
    *   Displayed in the top media area when `viewMode` is `'imagePodcast'`.
    *   Displays a feed of images based on `shuffledImageNotes`.
    *   Manages internal focus and navigation within the image list.
*   **`MediaPanel.tsx`:**
    *   **Used in two contexts:** In the top media area (`displayContext="main"`) for video playback, and in the bottom-right panel (`displayContext="panel"`) for displaying lists and controls.
    *   Receives `viewMode`, `displayContext`, shuffled notes (`podcastNotes`, `shuffledVideoNotes`), media refs (`audioRef`, `videoRef`), playback state, indices, and handlers from `App.tsx`.
    *   **Always renders the appropriate list (podcast or video) and shared playback controls (Play/Pause, Seek Bar, Mode Toggle).**
    *   **Conditionally renders the `<video>` element ONLY when `displayContext === 'main'` AND `viewMode === 'videoPlayer'`.**
    *   Dynamically adjusts the height of the list based on whether the video element is being displayed.
    *   Manages focus within its list and controls.
*   **`Podcastr.tsx`:**
    *   (Previously assumed to be part of `MediaPanel`) This component's role needs clarification. It's not explicitly rendered by `App` or `MediaPanel` in the current structure. Playback is handled by `useMediaElementPlayback` connected to the `audioRef` managed in `App` and passed to `MediaPanel`. If specific podcast UI beyond the shared controls in `MediaPanel` is needed, its integration point needs review.
*   **`MessageBoard.tsx`:**
    *   Displays messages related to `MAIN_THREAD_NEVENT_URI` in the bottom-left panel.
*   **`RelayStatus.tsx`:**
    *   Displays the connection status to Nostr relays.
*   **`QRCode.tsx`:**
    *   Displays a QR code linking to `MAIN_THREAD_NEVENT_URI`.

## Custom Hooks

*   **`useMediaAuthors`:** Initializes `NDK`, connects to relays, fetches authors.
*   **`useMediaNotes`:** Fetches media notes based on authors, type, and pagination.
*   **`useMediaState`:**
    *   Manages `viewMode`, indices (`currentImageIndex`, `currentPodcastIndex`, `currentVideoIndex`).
    *   **Accepts `initialImageNotes`, `initialPodcastNotes`, `initialVideoNotes` arrays directly as props.**
    *   Accepts `fetchOlderImages`/`fetchOlderVideos` callbacks and `shuffledImageNotesLength`/`shuffledVideoNotesLength` props.
    *   Processes initial notes internally (sorting, setting loading state, resetting index if needed).
    *   Provides `currentItemUrl` based on `viewMode`.
    *   Provides navigation handlers (`handlePrevious`, `handleNext`).
    *   `handleNext` triggers `fetchOlder...` callbacks.
    *   Provides `handleVideoSelect` (sets video index, npub, and switches `viewMode` to `videoPlayer`).
    *   Provides `setCurrentPodcastIndex`.
    *   Provides `setViewMode`.
*   **`useMediaElementPlayback`:** Generic hook for HTML5 media playback.

## Data Flow and State Management

1.  **Initialization:** `useMediaAuthors` -> `ndk`/`authors`. `App` initializes fetch params. `useMediaNotes` fetches initial notes.
2.  **State Hook Init:** `App` passes initial notes, fetchers, shuffled lengths to `useMediaState`. `useMediaState` processes initial notes via internal `useEffect`.
3.  **Shuffle (`App`):** `App` uses `useEffect` to watch fetched notes (`imageNotes`, `videoNotes`) and updates `shuffledImageNotes`/`shuffledVideoNotes` state.
4.  **URL Derivation (`useMediaState`):** Calculates `currentItemUrl` based on `viewMode` and indices.
5.  **Rendering (`App`):**
    *   Top Area: Renders `ImageFeed` or `MediaPanel` (`displayContext="main"`) based on `viewMode`.
    *   Bottom Panel: Renders `MessageBoard` and `MediaPanel` (`displayContext="panel"`).
    *   Props (state, shuffled notes, handlers, refs) are passed down.
6.  **`MediaPanel` Internal Rendering:**
    *   If `displayContext="main"` & `viewMode="videoPlayer"`, renders `<video>`.
    *   Renders list (podcast or video) and controls. List height adjusts based on video visibility.
7.  **User Interaction:**
    *   Navigation calls `handlePrevious`/`handleNext` in `useMediaState`.
    *   `handleNext` triggers `fetchOlder...` in `App` via callback if needed.
    *   Selecting a video list item calls `handleVideoSelect` in `useMediaState`, changing `viewMode`.
    *   Mode Toggle button calls `setViewMode`.
    *   Playback controls interact with `useMediaElementPlayback`.

## Navigation and Focus Management

*   **Mode Switching:** Occurs via `handleVideoSelect` or the Mode Toggle button in `MediaPanel`.
*   **Intra-Component Navigation:** Handled within components (`ImageFeed`, `MediaPanel`) on their respective lists/controls.
*   **Fetching Older Content:** Triggered by `handleNext` -> `fetchOlder...` callback -> `App` updates `until` state -> `useMediaNotes` refetches.
*   **Remote Control:** Handled globally in `App` or within focused components.

## Areas for Potential Improvement/Review (Based on Analysis)

*   **Bottom-Right Panel Purpose:** The `MediaPanel` in the bottom-right currently shows the relevant list (podcast/video) and controls. Confirm if this is the desired permanent UI or if other content might go there.
*   **Podcast UI:** Clarify if specific UI beyond the shared controls in `MediaPanel` is needed for podcasts, and where `Podcastr.tsx` (if used) should be integrated.
*   **Metadata Extraction:** `useMediaNotes` could be enhanced.
*   **Caching Strategy:** Review for large author histories.
*   **Error Handling:** Ensure robustness.

## Additional Notes

*   **URL Parsing:** Logic is now primarily within `useMediaState`'s URL effect.
*   **Prop Drilling:** Still necessary to connect `App` state/hooks to components.
*   **Persistence:** Podcast time saved via `localStorage`. Video position is not saved.
*   **Randomization:** Image/Video notes shuffled in `App`. 