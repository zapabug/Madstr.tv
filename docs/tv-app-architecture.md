# TV App Architecture Documentation (Updated for Applesauce Refactoring & Wallet Features)

## 1. Overview

This document describes the architecture of the React-based TV application designed for displaying media content (images, podcasts, videos) shared via the Nostr protocol. It is optimized for TV viewing with remote control navigation and includes features for user authentication, hashtag filtering, and Cashu-based tipping. The application has been refactored to primarily use the **Applesauce** toolkit for Nostr data management and signing.

**Key Features:**
*   Displays images, podcasts (audio), and videos.
*   Content is fetched from Nostr relays based on:
    *   **Author Follows:** By default, uses the authors followed by a predefined TV Npub (`TV_PUBKEY_NPUB` in `src/constants.ts`). If a user logs in, it **switches** to use the authors followed by the logged-in user (based on their Kind 3 list).
    *   **Followed Hashtags:** Additionally fetches content tagged with hashtags the user follows (managed in settings), acting as an *additive* source alongside author-based content (OR logic).
*   Image and video feeds are **randomized** (shuffled) within the `useMediaContent` hook.
*   Older content (images/videos) can be fetched dynamically ("infinite scroll" behavior) via callbacks provided by `useMediaContent`.
*   Uses a **split-screen layout**, hiding the bottom panel in fullscreen mode.
*   Enters **fullscreen mode** automatically after periods of inactivity or no new messages.
*   Supports user **authentication** via nsec (generation/login) or NIP-46 remote signer (using `useAuth` and Applesauce signers).
*   Allows users to **follow specific hashtags** (`#t` tags) to filter image/video content.
*   Includes an internal **Cashu wallet** for receiving deposits via encrypted DMs and **sending tips** (currently simplified, non-Zap standard) to content creators via encrypted DMs. Tipping is triggered by focusing the author QR code and pressing OK/Select.

**Operating Modes (`viewMode` state):**
*   `imagePodcast`: The main/top area displays the `ImageFeed` (`src/components/ImageFeed.tsx`), while the bottom-right panel displays the `podcastNotes` list and controls.
*   `videoPlayer`: The main/top area displays the `VideoPlayer` (`src/components/VideoPlayer.tsx`), while the bottom-right panel displays the `videoNotes` list and controls.

## 2. Core Technologies

*   **Frontend Framework:** React (`useState`, `useEffect`, `useRef`, `useCallback`)
*   **State Management & Side Effects:** Primarily custom hooks (`useAuth`, `useMediaState`, `useMediaContent`, etc.) and **Applesauce React hooks (e.g., `Hooks.useStoreQuery`)**. Core Nostr data state is managed by Applesauce's `EventStore` and `QueryStore`.
*   **Nostr Integration:**
    *   **Data/Cache:** `applesauce-core`, `applesauce-react`.
    *   **Signing:** `applesauce-signers` (for NIP-07/NIP-46 via `useAuth`).
    *   **Relay Communication:** **`nostr-tools/SimplePool`** (Instantiated in `main.tsx`, provided via context, feeds `EventStore`).
    *   **Utilities:** `nostr-tools` (for `nip19`, `Filter`, `NostrEvent` types).
*   **Cashu (Ecash) Integration:** `@cashu/cashu-ts`
*   **Caching:** IndexedDB via `idb` (`src/utils/idb.ts`) (`settings`, `nsec`, `cashuProofs`), **Applesauce's internal stores** (for profiles, events, etc.).
*   **Styling:** Tailwind CSS, `framer-motion` (for animations)
*   **Icons:** `react-icons`
*   **Utilities:** `shuffleArray` (`src/utils/shuffleArray.ts`), `react-qr-code`

## 3. Core Component Responsibilities & Layout

The main layout is defined in `App.tsx` (`src/App.tsx`) and consists of two primary sections within a padded border (removed in fullscreen):

*   **A. Top Media Area (`flex-grow`):** Displays the primary visual content (`ImageFeed` (`src/components/ImageFeed.tsx`) or `VideoPlayer` (`src/components/VideoPlayer.tsx`)).
*   **B. Bottom Split Panel (`h-1/3`, `flex-row`, *hidden in fullscreen*):** Contains secondary information and list controls.
    *   **B1. Left Panel (`w-2/3`):** `MessageBoard` component (`src/components/MessageBoard.tsx`).
    *   **B2. Right Panel (`w-1/3`):** `MediaPanel` component (`src/components/MediaPanel.tsx`) (acting as list/controls).

---

*   **`App.tsx` (`src/App.tsx`) (Root Component):**
    *   **Orchestrator:** Manages media element refs (`audioRef`, `videoRef`), defines the main JSX layout structure with Tailwind. Uses Applesauce's `Hooks.useStoreQuery(Queries.ContactsQuery, ...)` to fetch the current user's (or default TV user's) Kind 3 follow list. **Calls the `useMediaContent` hook**, passing it the derived `followedPubkeys` and `followedTags` (from `useAuth`). Receives processed/shuffled media notes and loading states from `useMediaContent`. Manages `SettingsModal` visibility. Passes state/props/callbacks down to child components and other hooks (`useMediaState`, `useMediaElementPlayback`, etc.).
    *   **State Held:** `initialPodcastTime`, settings modal visibility (`isSettingsOpen`). (Media note state is now managed within `useMediaContent`).
    *   **Refs Created:** `audioRef`, `videoRef`, `imageFeedRef`.
    *   **Hook Usage:**
        *   `Hooks.useStoreQuery` (from `applesauce-react`): **Used ONCE directly** to fetch the Kind 3 follow list (`Queries.ContactsQuery`).
        *   `useAuth` (`src/hooks/useAuth.ts`): Manages authentication state and provides `followedTags`.
        *   `useMediaContent` (`src/hooks/useMediaContent.ts`): **Delegated responsibility for fetching and processing all media notes (images, videos, podcasts) using Applesauce internally.** Returns notes, loading states, and fetcher callbacks.
        *   `useMediaState` (`src/hooks/useMediaState.ts`): Manages core UI state (`viewMode`, indices, `currentItemUrl`), provides navigation handlers. Receives notes and fetcher callbacks from `useMediaContent`.
        *   `useMediaElementPlayback` (`src/hooks/useMediaElementPlayback.ts`): Manages media playback.
        *   `useFullscreen` (`src/hooks/useFullscreen.ts`): Manages fullscreen state.
        *   `useKeyboardControls` (`src/hooks/useKeyboardControls.ts`): Sets up global keyboard listener.
        *   `useImageCarousel` (`src/hooks/useImageCarousel.ts`): Manages the image auto-advance timer.
        *   **(Removed `useNDKInit`, `ndk.ts`)**
    *   **Data Handling:**
        *   Fetches Kind 3 list using `Hooks.useStoreQuery`. Derives `followedPubkeys`.
        *   Gets `followedTags` from `useAuth`.
        *   **Passes `followedPubkeys` and `followedTags` to `useMediaContent`.**
        *   Receives `shuffledImageNotes`, `shuffledVideoNotes`, `podcastNotes`, loading states, and `fetchOlderImages`/`fetchOlderVideos` callbacks from `useMediaContent`.
        *   Passes notes and callbacks down to `useMediaState` and relevant components.
    *   **Rendering Logic:**
        *   Handles initial loading state based on Kind 3 fetch.
        *   Renders layout structure.
        *   Conditionally renders `ImageFeed` or `VideoPlayer` based on `viewMode`.
        *   Conditionally renders the Bottom Panel based on `isFullScreen`.
        *   Renders `MessageBoard`, `MediaPanel`, `SettingsModal`, `RelayStatus`.
        *   Passes necessary props (state, refs, callbacks) down.

*   **`ImageFeed.tsx` (`src/components/ImageFeed.tsx`):**
    *   **Purpose:** Displays the main image feed with author QR code and tipping interaction.
    *   **Rendered In:** Top Media Area (A) when `viewMode === 'imagePodcast'`.
    *   **Key Props:** `currentImageIndex`, `imageNotes` (received from `App.tsx` via `useMediaContent`).
    *   **Hook Usage:** Uses `useAuth`, `useWallet`, **Applesauce hooks (e.g., `Hooks.useStoreQuery(ProfileQuery, ...)` for author info).**
    *   **Functionality:** Displays images. Uses Applesauce profile fetching for author data. Handles tipping interaction (needs review for Applesauce signer/event store). Shows empty/loading state if `imageNotes` is empty.

*   **`VideoPlayer.tsx` (`src/components/VideoPlayer.tsx`):**
    *   **Purpose:** Displays the video player UI.
    *   **Rendered In:** Top Media Area (A) when `viewMode === 'videoPlayer'`.
    *   **Key Props:** `videoRef`, `src`, `isPlaying`, `togglePlayPause`, `autoplayFailed`, `isMuted`.
    *   **Hook Usage:** (Potentially `useAuth`, `useWallet`, **Applesauce profile hooks** if author info/tipping is re-added).
    *   **Functionality:** Renders the `<video>` element, controls playback state based on props. (Author info/tipping removed, can be re-added using Applesauce).

*   **`MediaPanel.tsx` (`src/components/MediaPanel.tsx`):**
    *   **Purpose:** Displays the relevant **list** (Podcasts or Videos via child components) and the **playback controls**. Acts as the interactive panel in the bottom-right.
    *   **Rendered In:** Bottom-Right Panel (B2) - *Rendered only when not fullscreen*.
    *   **Key Props:** `viewMode`, `audioRef`, `videoRef`, `podcastNotes`, `videoNotes` (receives notes from `App.tsx` via `useMediaContent`), indices, selection handlers, playback state/handlers, `setViewMode`, `currentItemUrl`.
    *   **Hook Usage (Internal):** Uses `useInactivityTimer`. Profile fetching happens within child components (`Podcastr`, `VideoList`).
    *   **Functionality:** Renders lists (`Podcastr` or `VideoList`), playback controls. Connects controls to props from `App`. Handles list item selection/navigation. Passes notes down to `Podcastr`/`VideoList`.

*   **`MessageBoard.tsx` (`src/components/MessageBoard.tsx`):**
    *   **Purpose:** Displays Nostr chat messages (Kind 1 replies) for a specific thread.
    *   **Rendered In:** Bottom-Left Panel (B1) - *Rendered only when not fullscreen*.
    *   **Key Props:** `neventToFollow`, `onNewMessage`.
    *   **Hook Usage (Internal):** **Uses Applesauce's `Hooks.useStoreQuery` hook twice:**
        *   Once to fetch Kind 1 replies based on an `#e` tag filter.
        *   Once within the `MessageItem` sub-component to fetch the Kind 0 profile for each message author.
    *   **Functionality:** Decodes `neventToFollow`. Fetches and renders messages using `MessageItem`.

*   **`Podcastr.tsx` (`src/components/Podcastr.tsx`) & `VideoList.tsx` (`src/components/VideoList.tsx`):**
    *   **Purpose:** Display scrollable lists of podcasts or videos.
    *   **Rendered In:** `MediaPanel.tsx`.
    *   **Key Props:** `notes` (array of `NostrNote` objects received from `MediaPanel`), selection handlers, current index.
    *   **Refactoring Needed:** **These components currently still contain NDK-based data fetching (`useNdk`, `useSubscribe`) and caching (`usePodcastNotes`, internal cache logic). This needs to be REMOVED. They should primarily be display components that render the `notes` array passed via props.** Profile fetching for list items should use Applesauce hooks (`Hooks.useStoreQuery(ProfileQuery, ...)`).

*   **`SettingsModal.tsx` (`src/components/SettingsModal.tsx`):**
    *   **Purpose:** Provides a UI for managing user identity, followed hashtags, and the internal Cashu wallet.
    *   **Rendered By:** `App.tsx` (`src/App.tsx`) (conditionally).
    *   **Key Props:** `isOpen`, `onClose`.
    *   **Hook Usage (Internal):** `useAuth`, `useWallet`.
    *   **Functionality:** Handles login/logout, hashtag management, wallet functions. Relies on `useAuth` and `useWallet` using Applesauce correctly.

*   **`RelayStatus.tsx` (`src/components/RelayStatus.tsx`):** Utility component. Includes settings button.

## 4. Core Hooks Deep Dive

*   **`applesauce-react` Hooks:**
    *   **`QueryStoreProvider` (in `main.tsx`):** Makes stores available.
    *   **`Hooks.useStoreQuery`:** Primary hook for fetching data based on filters (Kind 3, Kind 1, Kind 0, Timeline). Handles caching and updates via underlying stores.

*   **`useAuth` (`src/hooks/useAuth.ts`):** (Refactored)
    *   **Input:** Uses Applesauce stores internally. Calls `useNip46AuthManagement`.
    *   **Output:** Provides `activeSigner` (Applesauce signer), user state, auth functions, NIP-04 methods (using Applesauce signer), `followedTags`.
    *   **Function:** Manages authentication state using Applesauce signers.

*   **`useNip46AuthManagement` (`src/hooks/useNip46AuthManagement.ts`):** (Refactored)
    *   **Input:** Uses Applesauce `EventStore`. Requires `SimplePool` subscribe/publish methods.
    *   **Output:** NIP-46 state and connection functions.
    *   **Function:** Encapsulates NIP-46 logic using `NostrConnectSigner` (Applesauce signer).

*   **`useMediaContent` (`src/hooks/useMediaContent.ts`):** (Significantly Refactored)
    *   **Input:** `followedAuthorPubkeys: string[]`, `followedTags: string[]`.
    *   **Output:** `shuffledImageNotes`, `shuffledVideoNotes`, `podcastNotes`, `isLoadingImages`, `isLoadingVideos`, `isLoadingPodcasts`, `fetchOlderImages`, `fetchOlderVideos`.
    *   **Function:** **Primary hook for fetching and processing all media content.**
        *   **Fetching Strategy:**
            *   Primarily fetches general `Kind 1` events from `followedAuthorPubkeys`.
            *   Supplements this by also fetching specific `Kind 1063` (image) and `Kind 34235` (video) events using filters that combine `followedAuthorPubkeys` and `followedTags` (OR logic).
        *   **Event Processing (`processApplesauceEvent`):**
            *   For `Kind 1` events: Attempts to parse audio, image, or video URLs directly from the event `content` using regular expressions. Assigns a `mediaTypeHint` ('audio', 'image', 'video', or 'unknown').
            *   For `Kind 1063` / `Kind 34235` events: Extracts URLs from standard tags (e.g., 'url', 'media', 'image') and sets the appropriate `mediaTypeHint`.
        *   **Consolidated Processing & Deduplication:**
            *   A single `useEffect` hook manages all fetched events (`Kind 1`, `Kind 1063`, `Kind 34235`).
            *   All events are run through `processApplesauceEvent`.
            *   The resulting notes are deduplicated by `event.id` (with basic prioritization for specific kinds or notes with URLs over less specific/URL-less duplicates).
        *   **Categorization & Output:**
            *   Deduplicated notes are categorized into `podcastNotes`, `imageNotes`, and `videoNotes` based on their `mediaTypeHint` and the presence of an extracted `url`.
            *   `imageNotes` and `videoNotes` are then shuffled before being returned as `shuffledImageNotes` and `shuffledVideoNotes`.
            *   Provides callbacks for pagination (`fetchOlderImages`, `fetchOlderVideos`).
    *   **Stability:** Implements `useMemo` with `JSON.stringify` on the arrays returned by `Hooks.useStoreQuery` before they are used as dependencies in the main processing `useEffect`. This is to prevent re-render loops caused by unstable array references from the query hook.

*   **`useMediaState` (`src/hooks/useMediaState.ts`):**
    *   **Input:** Notes arrays (`initialImageNotes`, etc. from `useMediaContent`), fetcher callbacks (from `useMediaContent`), note lengths.
    *   **Output:** `viewMode`, indices, `currentItemUrl`, `currentNoteId`, navigation handlers.
    *   **Function:** Core UI state machine for view mode and current item selection.

*   **`useMediaElementPlayback` (`src/hooks/useMediaElementPlayback.ts`):** (Unchanged by Applesauce refactor)
    *   **Function:** Interacts directly with HTML media elements.

*   **`useFullscreen`, `useKeyboardControls`, `useImageCarousel`:** (Unchanged by Applesauce refactor)
    *   **Function:** UI interaction logic.

*   **`useWallet` (`src/hooks/useWallet.ts`):** (Partially Refactored / Needs Review)
    *   **Input:** Uses `useAuth()`, Applesauce stores internally.
    *   **Output:** Wallet state and functions.
    *   **Function:** Manages Cashu wallet. **DM listening uses `EventStore`. DM decryption uses `auth.decryptDm`. Tip sending needs review to ensure event signing uses `auth.activeSigner` and publishing uses `EventStore.add()`.**

*   **REMOVED Hooks:**
    *   `useNDKInit`, `ndk.ts`.
    *   (Still need to evaluate `usePodcastNotes` and remove if `useMediaContent` covers it).

## 5. Type Definitions

*   **`src/types/nostr.ts`:** Contains core Nostr-related type definitions for the application, including `NostrNote` which represents a processed Nostr event ready for display (often with an extracted `url` and other media-specific fields).
*   **`src/types/Events.ts`:** Defines additional event-related types, notably:
    *   `ApplesauceEvent`: Extends `NostrEvent` (from `nostr-tools`) to include common optional fields relevant for media content within the application context (e.g., `url`, `title`, `summary`, `image`, `duration`, `posterPubkey`). This type can be used for events that are in an intermediate processing stage or to standardize event structures before they become `NostrNote`s.
    *   `ContentExtraction`, `EventContent`, `Url`: Placeholder/utility types for event content handling.

## 6. Large Files (>500 Lines) - Potential Refactor Targets

*   `src/components/MediaPanel.tsx`
*   `src/components/SettingsModal.tsx`
*   `src/App.tsx`
*   `src/hooks/useAuth.ts`
*   `src/hooks/useWallet.ts`