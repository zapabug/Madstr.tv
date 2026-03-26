# TV App Architecture Documentation

## 1. Overview

This document describes the architecture of the React-based TV application designed for displaying media content (images, podcasts, videos) shared via the Nostr protocol. It is optimized for TV viewing with remote control navigation and includes features for user authentication, hashtag filtering, and Cashu-based tipping.

**Key Features:**
*   Displays images, podcasts (audio), and videos.
*   Content is fetched from Nostr relays based on a list of followed authors (fetched via Kind 3, with improved reliability using a timeout) and optional hashtags.
*   **Image feeds** are **randomized** on load using `shuffleArray` for variety. Fetches a larger batch (e.g., 500) initially.
*   **Video feeds** are **deduplicated** by URL (keeping newest) and displayed **sequentially** (sorted by creation date). Videos shorter than 2 minutes are filtered out. Videos autoplay back-to-back with sound when in video mode. Fetches a smaller batch (e.g., 30) initially.
*   Older content (images/videos) can be fetched dynamically ("infinite scroll" behavior) by navigating past the end of the current list.
*   Uses a **split-screen layout**, hiding the bottom panel in fullscreen mode.
*   Enters **fullscreen mode** automatically after periods of inactivity or no new messages.
*   Supports user **authentication** via nsec (generation/login) or NIP-46 remote signer.
*   Allows users to **follow specific hashtags** (`#t` tags) to filter image/video content.
*   Includes an internal **Cashu wallet** for receiving deposits via **NIP-59 Gift Wrap DMs** (Kind 1059) and **sending tips** (currently simplified, non-Zap standard) to content creators via encrypted DMs. Tipping is triggered by focusing the author QR code and pressing OK/Select. **NIP-04 DMs (Kind 4) are also supported for backwards compatibility.**

**Operating Modes (`viewMode` state):**
*   `imagePodcast`: The main/top area displays the `ImageFeed`, while the bottom-right panel displays the `MediaPanel` (podcast controls/list).
*   `videoPlayer`: The main/top area displays the `VideoPlayer`, while the bottom-right panel displays the `MediaPanel` (video list/controls).

## 2. Core Technologies

*   **Frontend Framework:** React 19 (`useState`, `useEffect`, `useRef`, `useCallback`)
*   **Build Tool:** Vite
*   **State Management & Side Effects:** Custom hooks orchestrated by the root `App` component
*   **Nostr Integration:** `@nostr-dev-kit/ndk` v2, `nostr-tools`, `nostr-hooks`
*   **Cashu (Ecash) Integration:** `@cashu/cashu-ts`
*   **Caching:** IndexedDB via `idb` (`settings`, `mediaNoteCache`, `profileCache`, `cashuProofs`)
*   **Styling:** Tailwind CSS, `framer-motion` (for animations)
*   **Icons:** `react-icons`
*   **Utilities:** `shuffleArray`, `react-qr-code`

## 3. NDK Singleton Pattern

NDK is initialized as a singleton in `src/ndk.ts` and managed by `useNDKInit` hook:

```
src/ndk.ts → exports singleton NDK instance
     ↓
useNDKInit hook → manages connection state, returns ndkInstance
     ↓
useMediaAuthors → uses ndk for Kind 3 subscription
useMediaNotes → uses ndk for media note subscriptions
useWallet → uses ndk for deposit listening and tip sending
```

## 4. Core Component Responsibilities & Layout

The main layout is defined in `App.tsx` and consists of:

*   **A. Top Media Area (`flex-grow`):** Displays `ImageFeed` or `VideoPlayer` based on `viewMode`.
*   **B. Bottom Split Panel (`h-1/4`, hidden in fullscreen):**
    *   **B1. Left Panel (`w-2/3`):** `MessageBoard` component.
    *   **B2. Right Panel (`w-1/3`):** `MediaPanel` component.

---

### **`App.tsx` (Root Component):**

*   **Orchestrator:** Initializes core hooks, manages media element refs (`audioRef`, `videoRef`), defines main JSX layout, fetches initial data, handles image shuffling and video deduplication/sorting.
*   **NDK Initialization:** Uses `useNDKInit` to manage the singleton NDK connection state.
*   **State Held:** Fetch limits/timestamps, shuffled image notes, deduplicated video notes, settings modal visibility.
*   **Refs Created:** `audioRef`, `videoRef`, `imageFeedRef`.
*   **Hook Usage:**
    *   `useNDKInit`: Gets `ndkInstance`, connection state
    *   `useMediaAuthors`: Gets `mediaAuthors` using `ndkInstance`
    *   `useAuth`: Auth state, login/logout, signing, DM encryption
    *   `useWallet`: Cashu wallet state and operations
    *   `useMediaNotes`: Fetches `imageNotes`, `videoNotes` (podcasts use separate hook)
    *   `useMediaState`: Core UI state machine
    *   `useMediaElementPlayback`: Audio/video playback (two instances)
    *   `useFullscreen`: Fullscreen management
    *   `useKeyboardControls`: Keyboard/remote input
    *   `useImageCarousel`: Image auto-advance
    *   `useCurrentAuthor`: Current author npub calculation

### **`ImageFeed.tsx`:**

*   **Purpose:** Displays main image feed with author QR code and tipping.
*   **Rendered In:** Top Media Area when `viewMode === 'imagePodcast'`.
*   **Key Props:** `isLoading`, `handlePrevious`, `handleNext`, `currentImageIndex`, `imageNotes`, `authorNpub`, `isFullScreen`, `signalInteraction`.

### **`VideoPlayer.tsx`:**

*   **Purpose:** Displays video player with author QR code and tipping.
*   **Rendered In:** Top Media Area when `viewMode === 'videoPlayer'`.
*   **Key Props:** `videoRef`, `src`, `isPlaying`, `togglePlayPause`, `authorNpub`, `autoplayFailed`, `isMuted`, `ndkInstance`, `auth`, `wallet`.

### **`MediaPanel.tsx`:**

*   **Purpose:** Displays podcast/video list and playback controls.
*   **Rendered In:** Bottom-Right Panel (B2) - hidden in fullscreen.
*   **Key Props:** `viewMode`, `audioRef`, `videoRef`, `podcastNotes`, `videoNotes`, indices, playback state/handlers, `setViewMode`.

### **`MessageBoard.tsx`:**

*   **Purpose:** Displays Nostr chat messages for a specific thread.
*   **Rendered In:** Bottom-Left Panel (B1) - hidden in fullscreen.
*   **Key Props:** `ndk`, `threadEventId`, `onNewMessage`, `isReady`.

### **`SettingsModal.tsx`:**

*   **Purpose:** User identity management, app settings, Cashu wallet configuration.

### **`RelayStatus.tsx`:** Utility component showing relay connection status and settings button.

## 5. Custom Hooks Deep Dive

### **`useNDKInit`:**
*   **Input:** None.
*   **Output:** `isConnecting`, `connectionError`, `ndkInstance` (singleton).
*   **Function:** Manages NDK singleton connection. Only calls `connect()` once.

### **`useMediaAuthors`:**
*   **Input:** `ndk` (NDK | undefined).
*   **Output:** `mediaAuthors` (array of pubkeys), `isLoadingAuthors`.
*   **Function:** Fetches Kind 3 contact list with 15s timeout fallback. Returns TV pubkey + followed pubkeys.

### **`useMediaNotes`:**
*   **Input:** `authors`, `mediaType` ('image', 'podcast', 'video'), `ndk`, `limit`, `until`, `followedTags`.
*   **Output:** `notes` (array of `NostrNote`), `isLoading`.
*   **Function:** Fetches notes based on authors, kinds, and optional hashtag filters.
*   **Features:**
    *   Retry mechanism: Retries subscription up to 3 times with 2s delay on failure
    *   Video duration filter: Videos shorter than 2 minutes are filtered out
    *   Media kinds: Podcasts (1, 1063, 31338), Videos (1, 1063, 34235, 34236), Images (1, 1063)

### **`useMediaState`:**
*   **Input:** `initialImageNotes` (shuffled), `initialPodcastNotes`, `initialVideoNotes` (deduplicated), `fetchOlderImages`, `fetchOlderVideos`, `shuffledImageNotesLength`, `shuffledVideoNotesLength`.
*   **Output:** `viewMode`, `imageNotes`, `podcastNotes`, `videoNotes`, indices, `currentItemUrl`, navigation handlers.
*   **Function:** Core UI state machine. Manages view mode and current media indices.

### **`useMediaElementPlayback`:**
*   **Input:** `mediaElementRef`, `currentItemUrl`, `elementType`, `isActiveMode`, `onEnded`, `initialTime`, `autoplayEnabled`, `next`.
*   **Output:** Playback state (`isPlaying`, `currentTime`, etc.) and controls.
*   **Function:** Manages HTML media element playback state.
*   **Features:**
    *   Videos autoplay back-to-back when in videoPlayer mode with `autoplayEnabled: true`
    *   Videos unmute automatically on play for sound-enabled playback
    *   Saves playback position to localStorage

### **`useAuth`:**
*   **Input:** `ndkInstance` (optional).
*   **Output:** `currentUserNpub`, `currentUserNsec`, `isLoggedIn`, auth/loading states, NIP-46 functions, nsec functions, signer functions, `followedTags`, `encryptDm`, `decryptDm`, `wrapDirectMessage`, `unwrapGiftWrap`.
*   **Function:** User authentication, credential persistence, signing capabilities, NIP-59 Gift Wrap encryption/decryption.
*   **NIP-59 Methods:**
    *   `wrapDirectMessage(recipientPubkey, content)`: Creates a NIP-59 Gift Wrap DM (Kind 1059)
    *   `unwrapGiftWrap(giftWrapEvent)`: Decrypts and unwraps a Gift Wrap DM, returns content and sender pubkey

### **`useWallet`:**
*   **Input:** `ndkInstance`, `isNdkReady`.
*   **Output:** `proofs`, `balanceSats`, `isListeningForDeposits`, `walletError`, `configuredMintUrl`, wallet functions.
*   **Function:** Cashu wallet management, deposit listening via NIP-59 Gift Wrap DMs (Kind 1059) with NIP-04 fallback, tip sending via NIP-59 Gift Wrap encrypted DMs.

### **`useFullscreen`:**
*   **Input:** `interactionTimeout`, `messageTimeout`, `checkInterval`.
*   **Output:** `isFullScreen`, `signalInteraction`, `signalMessage`.
*   **Function:** Auto-enters fullscreen on inactivity/timeout.

### **`useKeyboardControls`:**
*   **Input:** `isFullScreen`, `signalInteraction`, `onSetViewMode`, `onTogglePlayPause`, `onNext`, `onPrevious`, `viewMode`.
*   **Output:** None (side effect only).
*   **Function:** Global keyboard/remote input handling.

### **`useImageCarousel`:**
*   **Input:** `isActive`, `onTick`, `intervalDuration`.
*   **Output:** None (side effect only).
*   **Function:** Auto-advances images on interval.

### **`useCurrentAuthor`:**
*   **Input:** `viewMode`, `imageIndex`, `videoIndex`, `imageNotes`, `videoNotes`.
*   **Output:** `currentAuthorNpub`.
*   **Function:** Returns npub of currently displayed media author.

### **`useProfileData`:**
*   **Input:** `notes` (array of `NostrNote`).
*   **Output:** `profiles` (Record<string, ProfileData>).
*   **Function:** Fetches/caches Kind 0 metadata for note authors.

### **`useInactivityTimer`:**
*   **Input:** `timeout` (ms).
*   **Output:** `[isInactive, resetTimer]`.
*   **Function:** Tracks user inactivity for UI interactions.

### **`useVideoPlayback`:**
*   **Input:** None.
*   **Output:** `appIsPlayingRequest`, `videoIsPlayingActual`, handlers.
*   **Function:** Syncs app play state with video element state.

## 6. Additional Components

### **Removed Components (previously unused):**
The following components have been removed from the codebase as they were not used:
- `InteractivePanel.tsx` - was a wrapper for Podcastr/VideoList
- `Podcastr.tsx` - was a self-contained podcast player
- `VideoList.tsx` - was a self-contained video list
- `VideoFeed.tsx` - was a legacy video component
- `usePodcastNotes.ts` - was a dedicated podcast fetching hook

## 7. Data Flow Summary

```
NDK Singleton (ndk.ts)
     ↓
useNDKInit → provides ndkInstance
     ↓
┌────────────┼────────────┐
↓            ↓            ↓
useMediaAuthors    useMediaNotes    useWallet
     ↓            ↓            ↓
mediaAuthors   image/video notes   wallet ops
     ↓            ↓
App.tsx combines data:
  - Shuffles imageNotes
  - Deduplicates videoNotes by URL
  - Passes to useMediaState
     ↓
useMediaState → manages viewMode, indices, currentItemUrl
     ↓
┌────────────┬────────────┐
↓            ↓            ↓
ImageFeed   VideoPlayer   MediaPanel
     ↓            ↓            ↓
  QR/Tipping  QR/Tipping   Lists/Controls
```

## 8. Constants

Key constants in `src/constants.ts`:
*   `RELAYS`: Array of Nostr relay URLs
*   `TV_PUBKEY_NPUB`: TV app's Nostr public key
*   `MAIN_THREAD_NEVENT_URI`: Thread URI for MessageBoard and reply QR code
