# TV App Architecture Documentation (Applesauce Native - Aligned with madstrtvSPEC.md)

## 1. Overview

This document describes the architecture of the React-based TV application designed for displaying media content (images, podcasts, videos) shared via the Nostr protocol. It is optimized for TV viewing with remote control navigation. The application primarily uses the **Applesauce** toolkit for Nostr data management, signing, and adheres to the functional requirements outlined in `madstrtvSPEC.md`.

**Key Features (Refer to `madstrtvSPEC.md` for full details):**
*   Displays images, podcasts (audio), and videos.
*   Content fetching strategy (managed by `useMediaContent` using Applesauce queries):
    *   **Followed Authors:** Fetches from authors in the user's Kind 3 list (or default TV user's list).
    *   **Followed Hashtags (Optional):** Fetches content tagged with user-followed hashtags if respective toggles are enabled in settings. This acts as an *additive* source.
    *   **Independent Toggles:** Users can toggle image and video fetching by hashtag independently in `SettingsModal`.
*   Media Feed Handling (primarily by `useMediaContent` and `useMediaState`):
    *   **Image Feeds:**
        *   Fetched in batches (e.g., spec suggests 30 from authors, 30 from tags).
        *   **Randomized** using `shuffleArray` for display variety.
        *   Supports "infinite scroll" by fetching older images from relays.
    *   **Video Feeds:**
        *   Fetched in smaller batches (e.g., spec suggests 15 from authors, 15 from tags).
        *   **Deduplicated** by URL (keeping newest).
        *   Displayed **sequentially** (sorted by creation date).
        *   **Playlist Limited:** Initially shows a subset (e.g., spec suggests 15), loading more from a larger internal cache on demand before fetching older videos from relays.
        *   **Video Preloading:** Proactively loads the next video in sequence.
        *   **Continuous Playback:** Automatically plays the next video.
        *   Supports "infinite scroll" for older videos.
    *   **Large Initial Fetch & Resampling (Goal from `madstrtvSPEC.md`):** The ideal is to fetch a large initial pool of general notes (e.g., 500-1000) via `useMediaContent`, categorize them, and then `useMediaState` would manage displaying random subsets (e.g., 30 images at a time), reshuffling from this large internal cache for an "infinite feel" before needing to fetch genuinely older content from relays.
*   **Layout & UI:**
    *   **Split-screen layout**, bottom panel hidden in fullscreen.
    *   Automatic **fullscreen mode** after inactivity or no new messages.
*   **User Authentication (via `useAuth` using Applesauce signers):**
    *   Supports nsec (generation/login) or NIP-46 remote signer.
    *   **Logout includes mandatory wallet backup:** If Cashu balance exists, displays QR of proofs for 45s, then confirmation.
*   **Hashtag Following (via `useAuth`):**
    *   Users can manage followed hashtags (`#t` tags) in `SettingsModal`.
*   **Cashu Wallet (via `useWallet` using Applesauce for DMs):**
    *   Internal wallet for deposits (via encrypted DMs) and tips (simplified, non-Zap, via encrypted DMs).
    *   Tipping triggered by focusing author QR code.
    *   Manages default tip amount (set in `SettingsModal`).
    *   Developer tipping option in `SettingsModal`.

**Operating Modes (`viewMode` state managed by `useMediaState`):**
*   `imagePodcast`: Top area shows `ImageFeed`, bottom-right shows podcast list/controls.
*   `videoPlayer`: Top area shows `VideoPlayer`, bottom-right shows video list/controls.

## 2. Core Technologies

*   **Frontend Framework:** React (`useState`, `useEffect`, `useRef`, `useCallback`, `useMemo`)
*   **State Management & Side Effects:** Primarily custom hooks (`useAuth`, `useMediaState`, `useMediaContent`, etc., all refactored for Applesauce) and **Applesauce React hooks (e.g., `Hooks.useStoreQuery`)**. Core Nostr data state is managed by Applesauce's `EventStore`, `QueryStore`, and potentially `ProfileStore`.
*   **Nostr Integration (Applesauce Toolkit):**
    *   **Data/Cache/Queries:** `applesauce-core` (`EventStore`, `QueryStore`, `ProfileStore`, `Queries`), `applesauce-react` (`Hooks.useStoreQuery`, `QueryStoreProvider`).
    *   **Signing:** `applesauce-signers` (for NIP-07/NIP-46 via `useAuth`).
    *   **Relay Communication:** `nostr-tools/SimplePool` (instantiated in `main.tsx`, provided via context, feeds `EventStore`).
    *   **Utilities:** `nostr-tools` (for `nip19`, `Filter`, `NostrEvent` types).
*   **Cashu (Ecash) Integration:** `@cashu/cashu-ts`
*   **Caching (beyond Applesauce stores):** IndexedDB via `idb` (`src/utils/idb.ts`) for `settings` (including followed tags, fetch toggles, default tip amount), user's `nsec`, and `cashuProofs`.
*   **Styling:** Tailwind CSS, `framer-motion` (for animations)
*   **Icons:** `react-icons`
*   **Utilities:** `shuffleArray` (`src/utils/shuffleArray.ts`), `react-qr-code`

## 3. Core Component Responsibilities & Layout

The main layout is defined in `App.tsx` (`src/App.tsx`). It sets up Applesauce providers (`QueryStoreProvider`) and then renders the main application content, likely within an `AppContent` component.

*   **A. Top Media Area (`flex-grow`):** Displays `ImageFeed` or `VideoPlayer`. May show current author's profile picture.
*   **B. Bottom Split Panel (`h-1/3` or `h-1/4` as per spec, hidden in fullscreen):**
    *   **B1. Left Panel (`w-2/3`):** `MessageBoard` component.
    *   **B2. Right Panel (`w-1/3`):** `MediaPanel` component.

---

*   **`App.tsx` (Root Component):**
    *   **Orchestrator:** Initializes Applesauce context (e.g., `QueryStoreProvider`, `SimplePool` via context). Manages top-level application state if any (e.g., error boundaries). Renders `AppContent` or the main application structure.
    *   **Hook Usage:**
        *   May use `useAuth` to get initial user state for deciding on default `followedAuthorPubkeys`.
        *   Sets up `QueryStoreProvider` and other global Applesauce contexts.
    *   **Relay Stats:** May use `useEffect` with `SimplePool` instance to listen for relay events and update global relay status, passing to `RelayStatus` component.

*   **`AppContent.tsx` (Conceptual Main Logic Component if `App.tsx` is minimal):**
    *   **Purpose:** Contains core application logic, UI structure, and hook orchestration.
    *   **Hook Usage:**
        *   `useAuth`: Manages auth state, provides `followedTags`, `fetchImagesByTagEnabled`, `fetchVideosByTagEnabled`, `activeSigner`.
        *   `Hooks.useStoreQuery(Queries.ContactsQuery, ...)`: To fetch the current user's (or default TV user's) Kind 3 follow list, deriving `followedAuthorPubkeys`.
        *   `useMediaContent`: Receives `followedAuthorPubkeys`, `followedTags`, and tag fetch toggles. Responsible for fetching and processing all media notes according to `madstrtvSPEC.md`.
        *   `useMediaState`: Manages `viewMode`, current item indices, `currentItemUrl`, navigation. Receives notes from `useMediaContent`.
        *   `useMediaElementPlayback`: Manages media playback for `audioRef` and `videoRef`.
        *   `useFullscreen`, `useKeyboardControls`, `useImageCarousel`: UI interaction hooks.
        *   `useWallet`: Manages Cashu wallet.
        *   `Hooks.useStoreQuery(Queries.ProfileQuery, ...)`: For fetching author profiles for display.
    *   **State Held:** Media element refs (`audioRef`, `videoRef`, `preloadVideoRef` as per spec). Settings modal visibility.
    *   **Data Handling:** Orchestrates data flow from `useMediaContent` to `useMediaState` and then to rendering components.
    *   **Rendering Logic:** Renders main layout, `ImageFeed`/`VideoPlayer`, `MessageBoard`, `MediaPanel`, `SettingsModal`, `RelayStatus`.

*   **`ImageFeed.tsx`:**
    *   **Purpose:** Displays main image feed, author QR, tipping. (Functionality per `madstrtvSPEC.md`).
    *   **Key Props:** `currentImageIndex`, `imageNotes` (shuffled, from `useMediaState`), `authorProfile` (from Applesauce profile query), loading states.
    *   **Hook Usage:** `useAuth`, `useWallet` (for tipping context). `Hooks.useStoreQuery(Queries.ProfileQuery, ...)` if author profile isn't passed as prop.
    *   **Functionality:** Displays images, author info (name, QR, timestamp). Tipping interaction.

*   **`VideoPlayer.tsx`:**
    *   **Purpose:** Displays video player, author QR, tipping. (Functionality per `madstrtvSPEC.md`).
    *   **Key Props:** `videoRef`, `preloadVideoRef` (for preloading next), `src` (`currentItemUrl`), playback state/controls, `authorProfile`, `currentNoteId`.
    *   **Hook Usage:** `useAuth`, `useWallet` (for tipping context).
    *   **Functionality:** Renders `<video>` elements (main and hidden preload). Handles playback, tipping.

*   **`MediaPanel.tsx`:**
    *   **Purpose:** Displays podcast/video lists and playback controls. (Functionality per `madstrtvSPEC.md`).
    *   **Key Props:** `viewMode`, refs, notes (podcasts; videos - sliced, sequential, unique), indices, handlers, `setViewMode`, `currentItemUrl`.
    *   **Hook Usage (Internal):** `useInactivityTimer`. Author profiles for list items via `Hooks.useStoreQuery(Queries.ProfileQuery, ...)`.
    *   **Functionality:** Renders `PodcastrList` / `VideoList` (display components), `PlaybackControls`.

*   **`MessageBoard.tsx`:**
    *   **Purpose:** Displays Kind 1 replies for a thread. (Functionality per `madstrtvSPEC.md`).
    *   **Key Props:** `threadEventId` (or `neventToFollow`), `onNewMessage`. `currentUserProfile` (logged-in user's profile from Applesauce).
    *   **Hook Usage (Internal):** `Hooks.useStoreQuery` (for Kind 1 replies based on `#e` tag; and for author profiles for each message via `Queries.ProfileQuery`).

*   **`PodcastrList.tsx` / `VideoList.tsx` (Conceptual Child Components of `MediaPanel`):**
    *   **Purpose:** Purely display components for scrollable lists of podcasts or videos.
    *   **Key Props:** `notes` array, selection handlers, current index.
    *   **Hook Usage:** Minimal, primarily for item-specific profile fetching using `Hooks.useStoreQuery(Queries.ProfileQuery, ...)` if not handled by `MediaPanel`.
    *   **Refactoring Note:** These should not contain their own fetching logic but render props.

*   **`SettingsModal.tsx`:**
    *   **Purpose:** UI for identity, hashtag management, **tag fetch toggles, default tip amount**, Cashu wallet. (Functionality per `madstrtvSPEC.md`).
    *   **Key Props:** `isOpen`, `onClose`.
    *   **Hook Usage (Internal):** `useAuth`, `useWallet`.
    *   **Functionality:** Handles login/logout (with wallet backup via `useWallet().exportUnspentProofs()`), hashtag management, tag fetch toggles (`setFetchImagesByTagEnabled`, etc. from `useAuth`), default tip amount (`setDefaultTipAmount` from `useAuth`), wallet functions.

*   **`RelayStatus.tsx`:** Utility component. Includes settings button. Displays relay connection stats.

## 4. Core Hooks Deep Dive (Applesauce Implementation of `madstrtvSPEC.md` features)

*   **Applesauce React Hooks (`Hooks.useStoreQuery`, `QueryStoreProvider`):**
    *   Central to data fetching. `QueryStoreProvider` in `main.tsx` (or `App.tsx`).
    *   `Hooks.useStoreQuery` used with `Queries.ContactsQuery` (Kind 3), `Queries.TimelineQuery` (Kind 1, 1063, 34235, etc.), `Queries.ProfileQuery` (Kind 0).

*   **`useAuth` (`src/hooks/useAuth.ts`):**
    *   **Inputs:** Applesauce stores accessed internally. May call `useNip46AuthManagement`.
    *   **Outputs (aligned with `madstrtvSPEC.md`):**
        *   `activeSigner` (Applesauce signer), user identity (`currentUserNpub`, `isLoggedIn`).
        *   Auth functions (login, logout - incorporating wallet backup flow).
        *   NIP-04 methods (using `activeSigner.nip04Encrypt`, `activeSigner.nip04Decrypt`).
        *   `followedTags`, `setFollowedTags`.
        *   `fetchImagesByTagEnabled`, `setFetchImagesByTagEnabled`.
        *   `fetchVideosByTagEnabled`, `setFetchVideosByTagEnabled`.
        *   `defaultTipAmount`, `setDefaultTipAmount`.
        *   (Loading/error states).
    *   **Function:** Manages auth state (IDB for nsec, settings). Uses Applesauce signers. Persists settings to IDB.

*   **`useNip46AuthManagement` (`src/hooks/useNip46AuthManagement.ts`):**
    *   **Inputs:** Uses Applesauce `EventStore`, `SimplePool` methods.
    *   **Function:** Encapsulates NIP-46 logic using `NostrConnectSigner` from `applesauce-signers`.

*   **`useMediaContent` (`src/hooks/useMediaContent.ts`):**
    *   **Inputs:** `followedAuthorPubkeys: string[]`, `followedTags: string[]`, `fetchImagesByTagEnabled: boolean`, `fetchVideosByTagEnabled: boolean`, potentially desired batch sizes (e.g., `imageBatchSize`, `videoBatchSize`, `generalNotesTargetCacheSize`).
    *   **Outputs (aligned with `madstrtvSPEC.md`):**
        *   `shuffledImageNotes` (full internal cache of all fetched/processed images, shuffled once when content changes significantly).
        *   `shuffledVideoNotes` (full internal cache of all fetched/processed, deduplicated, sorted videos, copied once when content changes significantly).
        *   `podcastNotes` (full internal cache, sorted, updated when content changes significantly).
        *   Loading states (`isLoadingImages`, `isLoadingVideos`, `isLoadingPodcasts`).
        *   Callbacks for fetching genuinely older content beyond the initial large cache (`fetchOlderImagesFromRelays`, `fetchOlderVideosFromRelays`).
        *   Callback to signal a desire to reshuffle/resample displayable notes from the internal cache (e.g., `requestNewImageBatchFromCache`).
    *   **Function (Primary data fetching and processing, implementing `madstrtvSPEC.md` logic):**
        *   **Fetching Strategy (using `Hooks.useStoreQuery` with `Queries.TimelineQuery`):**
            *   **Initial Large Fetch (Goal):** Fetch a large number of general Kind 1 events (e.g., 500-1000) from `followedAuthorPubkeys` (+ tags if enabled) to build a substantial in-memory cache.
            *   **Specific Kind Fetches (Current & Spec):** Fetch Kind 1063 (images) and Kind 34235 (videos) based on `followedAuthorPubkeys` AND/OR `followedTags` (if respective `fetch...ByTagEnabled` flags are true). Batch sizes as per spec (e.g., images: 30 authors + 30 tags; videos: 15 authors + 15 tags, or configurable).
        *   **Event Processing (`processApplesauceEvent` internal helper):**
            *   Categorizes events (audio, image, video, unknown) based on Kind and content (regex for URLs in Kind 1).
        *   **Consolidation, Deduplication, Sorting:**
            *   Combines all fetched notes.
            *   Deduplicates (e.g., by event ID, or by URL for videos as per spec, keeping newest).
            *   Sorts videos by creation date (descending for newest first).
        *   **Caching & Stability:** Stores all processed notes in internal state variables. Uses `JSON.stringify` comparisons before setting these internal state arrays (`processedImageNotes`, `processedVideoNotes`, `processedPodcastNotes`) to ensure new references are created only when content actually changes. Similarly, the final output arrays (`shuffledImageNotes`, `shuffledVideoNotes`) are also derived via effects that use stringify comparisons to maintain reference stability if the shuffling/copying results in identical content structure. The hook aims to return a stable object reference if its underlying data hasn't changed reference.
        *   **Pagination:** `fetchOlder...FromRelays` callbacks would use `Hooks.useStoreQuery` with `until` parameter based on the oldest known event.
        *   **Resampling for Display (feeds `useMediaState`):** Provides functions or derived state that `useMediaState` can use to get a "display batch" (e.g., 30 random images, 15 sequential videos) from the larger internal caches.

*   **`useMediaState` (`src/hooks/useMediaState.ts`):**
    *   **Inputs:**
        *   `fullImageCache` (from `useMediaContent`'s `shuffledImageNotes`).
        *   `fullPodcastCache` (from `useMediaContent`'s `podcastNotes`).
        *   `fullVideoCache` (from `useMediaContent`'s `shuffledVideoNotes`).
        *   Callbacks from `useMediaContent` to fetch older content from relays.
    *   **Outputs (aligned with `madstrtvSPEC.md`):**
        *   `viewMode`, current display indices (`currentImageIndex`, `currentVideoIndex`).
        *   `currentItemUrl`, `currentNoteId`.
        *   Navigation handlers (`handleNext`, `handlePrevious`).
        *   Currently displayed notes for components (`shuffledImageNotesForDisplay`, `sequentialVideoNotesForDisplay`).
        *   `preloadVideoUrl` (for the next video in sequence).
    *   **Function:** Core UI state machine.
        *   Manages `viewMode`, current item selection.
        *   **Stability:** Uses `JSON.stringify` comparisons before setting its internal display batch states (`imageNotesForDisplay`, `videoNotesForDisplay`, `podcastNotesForDisplay`) to ensure these only get new references if their content, derived from the full caches, actually changes. This helps stabilize the `handleNext`/`handlePrevious` callbacks that depend on them.
        *   Handles `handleNext`/`handlePrevious`:
            *   For images: cycles through `shuffledImageNotesForDisplay`. When at end, calls `requestNewImageBatchFromCache` from `useMediaContent`. If cache exhausted for "new" batches, then calls `fetchOlderImagesFromRelays`.
            *   For videos: cycles through `sequentialVideoNotesForDisplay`. When near end, calls `requestMoreVideosFromCache` to extend the playlist. If cache exhausted, then calls `fetchOlderVideosFromRelays`.
        *   Determines `preloadVideoUrl` based on current video and `sequentialVideoNotesForDisplay`.
        *   Manages the "video playlist limit" for display (e.g., shows 15, loads more into `sequentialVideoNotesForDisplay` from `useMediaContent`'s cache).

*   **`useMediaElementPlayback` (`src/hooks/useMediaElementPlayback.ts`):**
    *   **Inputs:** `mediaElementRef`, `preloadMediaElementRef` (for video), `currentItemUrl`, `preloadItemUrl`, `onEnded` (to trigger continuous playback).
    *   **Functionality:** Manages HTML media elements. Handles continuous video playback by using `onEnded` to advance to `preloadItemUrl`. Handles video preloading by setting `src` on `preloadMediaElementRef`.

*   **`useFullscreen`, `useKeyboardControls`, `useImageCarousel`:** (Largely as before, but ensuring interaction with Applesauce-based state where needed). `useImageCarousel` would trigger `useMediaState.handleNext` for images.

*   **`useWallet` (`src/hooks/useWallet.ts`):**
    *   **Inputs:** `useAuth()` for `activeSigner` and NIP-04 methods. Applesauce `EventStore` for listening to DMs and adding outgoing tip events.
    *   **Outputs (aligned with `madstrtvSPEC.md`):** Wallet state, functions, `exportUnspentProofs: () => Promise<string | null>`.
    *   **Function:** Manages Cashu wallet.
        *   DM listening: `Hooks.useStoreQuery(Queries.Kind4DmsQuery, ...)` or direct `EventStore` subscription.
        *   DM decryption: `activeSigner.nip04Decrypt()`.
        *   Tip sending: Creates Kind 4 event, encrypts with `activeSigner.nip04Encrypt()`, signs with `activeSigner.signEvent()`, publishes with `EventStore.add(event)`.
        *   Implements `exportUnspentProofs` for logout backup.

*   **REMOVED Hooks (from NDK era):** `useNDKInit`, `useMediaAuthors`, `useMediaNotes` (functionality absorbed into `useMediaContent` or direct Applesauce queries), `useUserProfile` (replaced by `Hooks.useStoreQuery(Queries.ProfileQuery, ...)`).

## 5. Type Definitions

*   `src/types/nostr.ts`: `NostrNote` remains central.
*   `src/types/Events.ts`: `ApplesauceEvent` (if still needed for intermediate processing before `NostrNote`) and other helpers.

## 6. Large Files (>500 Lines) - Potential Refactor Targets
*   `src/components/SettingsModal.tsx`
*   `src/hooks/useMediaContent.ts` (Given the expanded responsibilities from `madstrtvSPEC.md`)
*   `src/hooks/useMediaState.ts` (Given expanded playlist and cache management)
*   `src/hooks/useAuth.ts`
*   `src/hooks/useWallet.ts`