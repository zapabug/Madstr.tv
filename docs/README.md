# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript and enable type-aware lint rules. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

---

# TugaTV Nostr Display Application

This application is designed to run on a display (like a TV) and show content from the Nostr network, including media slideshows, podcast episodes, and message boards.

## Key Components

### `App.tsx`
- Initializes the Nostr Development Kit (NDK) using `nostr-hooks` and connects to specified relays (`src/constants.ts`).
- Fetches the Kind 3 contact list (follows) for the TV's public key (`TV_PUBKEY_NPUB`).
- Passes the list of followed public keys (hex format) to the `MediaFeed` and `Podcastr` components.
- Renders the overall layout, including `MediaFeed`, `Podcastr`, and `MessageBoard`.
- Displays a QR code linking to the main chat thread (`MAIN_THREAD_NEVENT_URI`).

### `MediaFeed.tsx` (`src/components/MediaFeed.tsx`)
- **Purpose:** Displays a slideshow of recent images found in Nostr notes (Kind 1) posted by a specific list of authors.
- **Data Source:** Subscribes to Kind 1 notes from the hex public keys provided in the `authors` prop.
- **Media Extraction:** Scans the `content` of incoming notes for URLs ending in common image (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`) extensions.
- **Caching:** Caches metadata for up to **500** recent image notes in IndexedDB (`MediaFeedCache`).
- **Display:**
    - On load, **shuffles** the cached notes to provide variety.
    - Shows up to `MAX_SLIDES` (currently 30) unique images from the shuffled set, cycling automatically.
    - Includes navigation controls (Previous/Next).
    - Shows the poster's Nostr profile QR code.
    - _Note: Video display/playback logic exists but is currently disabled (only images are processed)._
- **Dependencies:** `useNdk`, `react-qr-code`.

### `Podcastr.tsx` (`src/components/Podcastr.tsx`)
- **Purpose:** Discovers, lists, and plays podcast episodes shared via Nostr notes (Kind 1).
- **Data Source:** Subscribes to Kind 1 notes from the hex public keys provided in the `authors` prop.
- **Podcast Discovery:** Scans the `content` of incoming notes for URLs ending in common audio formats (`.mp3`, `.m4a`, `.wav`).
- **Profile Fetching:** Fetches author profile information (Kind 0) using NDK. Handles variations in how NDK returns profile data (from `.content` string or direct properties).
- **Caching:**
    - Caches discovered podcast note details (URL, author pubkey, timestamp) in IndexedDB (`PodcastNoteCache`).
    - Uses a shared profile cache (`ProfileCache` via `src/utils/profileCache.ts`).
- **Display:**
    - Shows the current podcast's author profile picture and name.
    - Displays a scrollable, focusable list of discovered episodes, numbered with the most recent first (e.g., "Item 9 of 9").
    - Includes an HTML5 audio player with playback speed controls (0.75x - 2.0x).
- **Dependencies:** `useNdk`, `nostr-hooks` (indirectly via App), `@nostr-dev-kit/ndk`, `../utils/profileCache`.

### `MessageBoard.tsx` (`src/components/MessageBoard.tsx`)
- **Purpose:** Displays recent text notes (Kind 1) that are replies to a specific Nostr event or tag a specific public key.
- **Data Source:** Subscribes to Kind 1 notes based on filters (e.g., `#e` tag for replies, `#p` tag for mentions).
- **Display:** Shows a list of recent messages with sender avatar and name.
- **Dependencies:** `useNdk`, `useProfile` (from `nostr-hooks`).

### `profileCache.ts` (`src/utils/profileCache.ts`)
- Provides shared logic for caching and retrieving Nostr user profiles (Kind 0) using IndexedDB (`ProfileCache`).
- Includes functions to get, save, and delete the profile database.
- Used by `Podcastr.tsx` (and potentially other components) to reduce redundant profile fetches.

### `constants.ts` (`src/constants.ts`)
- Stores important configuration values:
    - `RELAYS`: List of Nostr relay URLs to connect to.
    - `MAIN_THREAD_EVENT_ID_HEX`: Hex ID of the root event for the message thread.
    - `MAIN_THREAD_NEVENT_URI`: Full `nevent` URI used for the QR code.
    - `TV_PUBKEY_HEX`: Hex public key of the TV instance.
    - `MAIN_POST_CONTENT`: Content for the initial post (not currently used for auto-posting).

## Caching

This application makes extensive use of **IndexedDB** for caching to improve performance and reduce network load:
- `MediaFeedCache`: Stores metadata for recent image notes.
- `PodcastNoteCache`: Stores metadata for discovered podcast episode notes.
- `ProfileCache`: Stores Nostr user profile data (Kind 0 events).

## Setup

1.  **Set Constants:** Before running, configure the necessary values in `src/constants.ts`:
    *   Publish a root note for your chat thread using a client associated with the TV's keys.
    *   Set `MAIN_THREAD_EVENT_ID_HEX` to the **hex ID** of that root note.
    *   Set `MAIN_THREAD_NEVENT_URI` to the full `nevent` URI of that root note (for the QR code).
    *   Set `TV_PUBKEY_HEX` to the hex public key corresponding to the `npub` defined in `App.tsx` (`TV_PUBKEY_NPUB`).
    *   Configure the desired `RELAYS`.
2.  **Install Dependencies:** `npm install` or `yarn install`.
3.  **Run Development Server:** `npm run dev` or `yarn dev`.
