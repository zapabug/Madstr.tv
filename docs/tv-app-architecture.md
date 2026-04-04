# TV App Architecture Documentation

## 1. Overview

This document describes the architecture of the React-based TV application designed for displaying media content (images, podcasts, videos) shared via the Nostr protocol. It is optimized for TV viewing with remote control navigation and includes features for user authentication, hashtag filtering, and mute list filtering.

**Key Features:**
*   Displays images, podcasts (audio), and videos.
*   Content is fetched from Nostr relays based on a list of followed authors (fetched via Kind 3, with improved reliability using a timeout) and optional hashtags.
*   **Image feeds** are **randomized** on load using `shuffleArray` for variety. Fetches a larger batch (e.g., 500) initially.
*   **Video feeds** are **deduplicated** by URL (keeping newest) and displayed **sequentially** (sorted by creation date). Videos shorter than 2 minutes are filtered out. Videos autoplay back-to-back with sound when in video mode. Fetches a smaller batch (e.g., 30) initially.
*   Older content (images/videos) can be fetched dynamically ("infinite scroll" behavior) by navigating past the end of the current list.
*   Uses a **split-screen layout**, hiding the bottom panel in fullscreen mode.
*   Enters **fullscreen mode** automatically after periods of inactivity or no new messages.
*   Supports user **authentication** via nsec (generation/login), NIP-46 remote signer, or browser extension (NIP-07).
*   Allows users to **follow specific hashtags** (`#t` tags) to filter image/video content.
*   **Mute list filtering** - Reads Kind 10000 events to filter out muted users.

**Operating Modes (`viewMode` state):**
*   `imagePodcast`: The main/top area displays the `ImageFeed`, while the bottom-right panel displays the `MediaPanel` (podcast controls/list).
*   `videoPlayer`: The main/top area displays the `VideoPlayer`, while the bottom-right panel displays the `MediaPanel` (video list/controls).

## 2. Core Technologies

*   **Frontend Framework:** React 19 (`useState`, `useEffect`, `useRef`, `useCallback`)
*   **Build Tool:** Vite
*   **State Management & Side Effects:** Custom hooks orchestrated by the root `App` component
*   **Nostr Integration:** `@nostr-dev-kit/ndk` v2, `nostr-tools`, `nostr-hooks`
*   **Caching:** IndexedDB via `idb` (`settings`, `mediaNoteCache`, `profileCache`)
*   **Styling:** Tailwind CSS, `framer-motion` (for animations)
*   **Icons:** `react-icons`
*   **Utilities:** `shuffleArray` (`src/utils/shuffleArray.ts`), `react-qr-code`

## 3. NDK Singleton Pattern

NDK is initialized as a singleton in `src/ndk.ts` and managed by `useNDKInit` hook:

```
src/ndk.ts → exports singleton NDK instance
     ↓
useNDKInit hook → manages connection state, returns ndkInstance
     ↓
useMediaAuthors → uses ndk for Kind 3 subscription
useMediaNotes → uses ndk for media note subscriptions
```

## 4. Core Component Responsibilities & Layout

The main layout is defined in `App.tsx` and consists of:

*   **A. Top Media Area (`flex-grow`):** Displays `ImageFeed` or `VideoPlayer` based on `viewMode`.
*   **B. Bottom Split Panel (`h-1/4`, hidden in fullscreen):**
    *   **B1. Left Panel (`w-2/3`):** `InfoPanel` component.
    *   **B2. Right Panel (`w-1/3`):** `MediaPanel` component.

---

### **`App.tsx` (Root Component):**

*   **Orchestrator:** Initializes core hooks, manages media element refs (`audioRef`, `videoRef`), defines main JSX layout, fetches initial data, handles image shuffling and video deduplication/sorting.
*   **NDK Initialization:** Uses `useNDKInit` to manage the singleton NDK connection state.
*   **State Held:** Fetch limits/timestamps, shuffled image notes, deduplicated video notes, settings modal visibility.
*   **Refs Created:** `audioRef`, `videoRef`, `imageFeedRef`.
*   **Hook Usage:**
    *   `useNDKInit`: Gets `ndkInstance`, connection state
    *   `useMediaAuthors`: Gets `mediaAuthors` using `ndkInstance` and `currentUserNpub`
    *   `useAuth`: Auth state, login/logout, signing, DM encryption, mute list
    *   `useMediaNotes`: Fetches `imageNotes`, `videoNotes`, `audioNotes` (podcasts)
    *   `useMediaState`: Core UI state machine
    *   `useMediaElementPlayback`: Audio/video playback (two instances)
    *   `useFullscreen`: Fullscreen management
    *   `useKeyboardControls`: Keyboard/remote input
    *   `useImageCarousel`: Image auto-advance
    *   `useCurrentAuthor`: Current author npub calculation

### **`ImageFeed.tsx`:**

*   **Purpose:** Displays main image feed with nevent QR code and profile image.
*   **Rendered In:** Top Media Area when `viewMode === 'imagePodcast'`.
*   **Key Props:** `isLoading`, `currentImageIndex`, `imageNotes`, `authorNpub`, `isFullScreen`, `ndkInstance`.
*   **Features:** nevent QR code (bottom-right), profile image (top-left), minimal styling.

### **`VideoPlayer.tsx`:**

*   **Purpose:** Displays video player with nevent QR code and profile image.
*   **Rendered In:** Top Media Area when `viewMode === 'videoPlayer'`.
*   **Key Props:** `videoRef`, `src`, `isPlaying`, `togglePlayPause`, `authorNpub`, `isMuted`, `noteId`, `posterPubkey`, `profilePicture`.
*   **Features:** nevent QR code (bottom-right), profile image (top-left), minimal styling, visible in fullscreen.

### **`MediaPanel.tsx`:**

*   **Purpose:** Displays podcast/video list and playback controls.
*   **Rendered In:** Bottom-Right Panel (B2) - hidden in fullscreen.
*   **Key Props:** `viewMode`, `audioNotes`, `videoNotes`, indices, playback state/handlers, `setViewMode`.

### **`InfoPanel.tsx`:**

*   **Purpose:** Displays note info (logged in) or login instructions (logged out).
*   **Rendered In:** Bottom-Left Panel (B1) - hidden in fullscreen.
*   **Key Props:** `note`, `viewMode`, `isLoggedIn`, `profileName`.
*   **Features:** 
    - Logged out: Shows "press # to access settings ← bottom left"
    - Logged in: Shows author (5 chars/npub) + note content preview (2-3 lines, links stripped)

### **`SettingsModal.tsx`:**

*   **Purpose:** User identity management (extension, NIP-46, nsec), app settings (hashtag toggles, tag management).

### **`RelayStatus.tsx`:** Utility component showing relay connection status and settings button.

## 5. Custom Hooks Deep Dive

### **`useNDKInit`:**
*   **Input:** None.
*   **Output:** `isConnecting`, `connectionError`, `ndkInstance` (singleton).
*   **Function:** Manages NDK singleton connection. Only calls `connect()` once.

### **`useMediaAuthors`:**
*   **Input:** `ndk` (NDK | undefined), `currentUserNpub` (optional - user's pubkey if logged in).
*   **Output:** `mediaAuthors` (array of pubkeys), `isLoadingAuthors`.
*   **Function:** Fetches Kind 3 contact list with 15s timeout fallback. Uses user's pubkey if logged in, otherwise falls back to TV pubkey.

### **`useMediaNotes`:**
*   **Input:** `authors`, `mediaType` ('image', 'audio', 'video'), `ndk`, `limit`, `until`, `followedTags`, `refreshKey`, `mutedPubkeys`.
*   **Output:** `notes` (array of `NostrNote`), `isLoading`.
*   **Function:** Fetches notes based on authors, kinds, and optional hashtag filters.
*   **Features:**
    *   Retry mechanism: Retries subscription up to 3 times with 2s delay on failure
    *   Video duration filter: Videos shorter than 2 minutes are filtered out
    *   Media kinds: Audio (1, 1063, 31338), Videos (1, 1063, 34235, 34236), Images (1, 1063)
    *   Client-side hashtag filtering when `followedTags` is provided
    *   **Hashtag Relay Discovery:** Separate subscription with `#t` filter for discovery mode
    *   **Mute List Filtering:** Filters out events from muted pubkeys
    *   **Blossom-Only Filter:** For hashtag discovery, only accepts content from allowed Blossom hosts
    *   **Kind 1 URL Extraction:** Supports URLs anywhere in content (including newlines)
*   **Audio Issues:** Audio URL extraction can return image URLs instead of audio. Most Nostr content is images/videos, audio files are rare.

### **`useMediaState`:**
*   **Input:** `initialImageNotes` (shuffled), `initialAudioNotes`, `initialVideoNotes` (deduplicated), `fetchOlderImages`, `fetchOlderVideos`, `shuffledImageNotesLength`, `shuffledVideoNotesLength`.
*   **Output:** `viewMode`, `imageNotes`, `audioNotes`, `videoNotes`, indices, `currentItemUrl`, navigation handlers.
*   **Function:** Core UI state machine. Manages view mode and current media indices.

### **`useMediaElementPlayback`:**
*   **Input:** `mediaElementRef`, `currentItemUrl`, `elementType`, `isActiveMode`, `onEnded`, `initialTime`, `autoplayEnabled`, `next`.
*   **Output:** Playback state (`isPlaying`, `currentTime`, etc.) and controls.
*   **Function:** Manages HTML media element playback state.
*   **Features:**
    *   Videos autoplay back-to-back when in videoPlayer mode with `autoplayEnabled: true`
    *   Videos start muted, unmute automatically on play for sound-enabled playback
    *   Audio elements NOT muted by default, unmute on play
    *   Saves playback position to IndexedDB

### **`useAuth`:**
*   **Input:** `ndkInstance` (optional).
*   **Output:** `currentUserNpub`, `currentUserNsec`, `isLoggedIn`, auth/loading states, NIP-46 functions, nsec functions, signer functions, `followedTags`, `mutedPubkeys`, `encryptDm`, `decryptDm`.
*   **Function:** User authentication, credential persistence, signing capabilities, NIP-44 encryption/decryption, mute list fetching.
*   **Authentication Methods:**
    *   **Browser Extension (NIP-07):** Detects `window.nostr`, auto-restores on page load
    *   **NIP-46 Remote Signer:** QR code flow (Amber Signer) and paste bunker URI flow
    *   **Local Key (nsec):** Generate new keys or login with existing nsec
*   **Mute List:**
    *   Fetches Kind 10000 events from user's pubkey on login
    *   Returns `mutedPubkeys` array for filtering
    *   Auto-refreshes feeds when mute list changes

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

## 6. Additional Components

### **Removed Components:**
The following components have been removed:
- `MessageBoard.tsx` - replaced by InfoPanel (functionality merged)
- `AuthorSelector.tsx` - replaced by InfoPanel (functionality merged)
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
useMediaAuthors    useMediaNotes    useAuth
     ↓            ↓            ↓
mediaAuthors   image/video/audio notes   auth ops + mutedPubkeys
     ↓            ↓
App.tsx combines data:
  - Shuffles imageNotes
  - Deduplicates videoNotes by URL
  - Filters by mutedPubkeys
  - Passes to useMediaState
     ↓
useMediaState → manages viewMode, indices, currentItemUrl
     ↓
┌────────────┬────────────┐
↓            ↓            ↓
ImageFeed   VideoPlayer   MediaPanel
   ↓            ↓            ↓
nevent QR     nevent QR    Lists/Controls
profile img   profile img
     ↓
InfoPanel (bottom-left)
  - Note info (logged in)
  - Login instructions (logged out)
```

## 8. Constants

Key constants in `src/constants.ts`:
*   `RELAYS`: Array of Nostr relay URLs
*   `HASHTAG_QUERY_RELAYS`: Relays for hashtag discovery (primal, nostr.wine, bitcoiner.social)
*   `ALLOWED_BLOSSOM_HOSTS`: Nostr-native Blossom servers for content filtering
*   `TV_PUBKEY_NPUB`: TV app's Nostr public key
*   `MAIN_THREAD_NEVENT_URI`: Thread URI for MessageBoard and reply QR code

## 9. Authentication & Session Management

### Login Methods

1. **Browser Extension (NIP-07)**
   - Detected via `window.nostr` availability
   - Uses `window.nostr.getPublicKey()` and `window.nostr.signEvent()`
   - Session auto-restored on page refresh
   - Best for desktop browsers with Nostr extensions (nos2x, Alby, etc.)

2. **NIP-46 Remote Signer (Amber Signer)**
   - QR Code Flow: Generate URI, scan with Amber Signer app
   - Paste Flow: Copy bunker URI and paste into app
   - Session persisted in IndexedDB
   - Works on TV without browser extension

3. **Local Key (nsec)**
   - Generate new keypair or login with existing nsec
   - Key stored in IndexedDB
   - Simple but less secure for some use cases

### Session Persistence

- Extension sessions: Automatically detected on page load
- NIP-46 sessions: Restored from IndexedDB on load
- Local key sessions: Restored from IndexedDB on load
- Settings (tags, toggles): Persisted in IndexedDB

## 10. Content Filtering Architecture

### Content Sources
| Source | Method | Content Filter |
|--------|--------|---------------|
| **Follows** | Kind 3 authors | Shows all content from followed users |
| **Hashtag Discovery** | Relay `#t` queries | Blossom-hosted content ONLY |

### Hashtag Discovery Flow
```
User enables hashtag toggle
     ↓
useMediaNotes creates TWO subscriptions:
     ↓
┌─────────────────────────────────────┐
│ Subscription 1: Author-based        │
│ { kinds, authors: authorsList }      │
│ ↓                                   │
│ Subscription 2: Hashtag discovery    │
│ { kinds, "#t": ["tag"] }           │
│ ↓                                   │
│ Only accept Blossom URLs             │
│ (filter out Twitter, etc.)           │
└─────────────────────────────────────┘
     ↓
Merge results, dedupe by ID
     ↓
Filter by mutedPubkeys
```

### Mute List Flow
```
User logs in (extension/bunker/nsec)
     ↓
useAuth fetches Kind 10000 from relays
     ↓
Extracts ["p", "<pubkey>"] tags
     ↓
Stores in mutedPubkeys state
     ↓
useMediaNotes filters:
- Cached content on load
- New events from subscriptions
- Hashtag discovery results
     ↓
Feed auto-refreshes when mute list updates
```

## 11. Relay Configuration

### Main Relays
```typescript
const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://nostr.wine',
  'wss://purplepag.es',
  'wss://relay.nostr.band',
  'wss://nsec.app',
];
```

### Hashtag Query Relays (10 relays for better coverage)
```typescript
const HASHTAG_QUERY_RELAYS = [
  'wss://relay.primal.net',
  'wss://nostr.wine',
  'wss://relay.bitcoiner.social',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://purplepag.es',
  'wss://relay.nostr.band',
  'wss://relay.snort.social',
  'wss://e.nu.zone',
  'wss://relay.olas.app',
];
```

### Allowed Blossom Hosts (Content Filter)
```typescript
const ALLOWED_BLOSSOM_HOSTS = [
  'blossom.primal.net', 'blossom.band', 'cdn.nostrcheck.me',
  'cdn.satellite.earth', '24242.io', 'blossom.azzamo.media',
  'blossom.yakihonne.com', 'cdn.sovbit.host', 'blossom.sector01.com',
  'blossom.poster.place', 'blossom.uid.ovh', 'blossom.nostr.hu',
  'blossom.nogood.studio', 'files.v0l.io', 'nosto.re', 'nostr.download',
   'blossom.nostrich.io', 'blossom.nevent.ninja', 'blossom.ditto.pub',
   'blossom.fiatjaf.com', 'blossom.obsidian.vip',
];
```

## 12. Related Documentation

See [`media-url-extraction.md`](./media-url-extraction.md) for detailed documentation on how Kind 1 content URLs are extracted for images, videos, and audio.
