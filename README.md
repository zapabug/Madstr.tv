# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript and enable type-aware lint rules. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

---

# TugaTV Nostr Display Application

This application is designed to run on a display (like a TV) and show content from the Nostr network.

## Key Components

### `App.tsx`
- Initializes the Nostr Development Kit (NDK) using `nostr-hooks` and connects to specified relays (`src/constants.ts`).
- Fetches the Kind 3 contact list (follows) for the TV's public key (`TV_PUBKEY_NPUB`).
- Passes the list of followed public keys (hex format) to the `MediaFeed` component.
- Renders the overall layout, including the `MediaFeed` and `MessageBoard`.
- Displays a QR code linking to the main chat thread (`MAIN_THREAD_NEVENT_URI`).

### `MediaFeed.tsx` (`src/components/MediaFeed.tsx`)
- **Purpose:** Displays a slideshow of recent images and videos found in Nostr notes (Kind 1) posted by a specific list of authors.
- **Data Source:** Subscribes to Kind 1 notes from the hex public keys provided in the `authors` prop (received from `App.tsx`, based on the TV's Kind 3 list).
- **Media Extraction:** Scans the `content` of incoming notes for URLs ending in common image (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`) or video (`.mp4`, `.mov`, `.webm`) extensions.
- **Display:**
    - Shows up to `MAX_SLIDES` (currently 30) unique media items, sorted newest first by note creation time.
    - Includes navigation controls (Previous/Next).
    - Provides Play/Pause and Mute/Unmute controls for videos.
    - Videos attempt to autoplay muted.
    - Shows the poster's Nostr profile picture and name (via `useProfile`).
- **Dependencies:** `useNdk`, `useProfile` (from `nostr-hooks`), `nostr-tools`.

### `MessageBoard.tsx` (`src/components/MessageBoard.tsx`)
- **Purpose:** Displays recent text notes (Kind 1) that are replies to a specific Nostr event or tag a specific public key.
- **Data Source:** Subscribes to Kind 1 notes based on filters defined within the component (currently set to filter by `#p` tag pointing to `TV_PUBKEY_HEX` in `src/constants.ts`).
- **Display:** Shows a list of the most recent messages, including the sender's avatar and name, with profile data and images successfully loaded for all authors via streaming subscriptions.
- **Dependencies:** `useNdk`, `useProfile` (from `nostr-hooks`).

### `constants.ts` (`src/constants.ts`)
- Stores important configuration values:
    - `RELAYS`: List of Nostr relay URLs to connect to.
    - `MAIN_THREAD_EVENT_ID_HEX`: Hex ID of the root event for the message thread.
    - `MAIN_THREAD_NEVENT_URI`: Full `nevent` URI used for the QR code.
    - `TV_PUBKEY_HEX`: Hex public key of the TV instance.
    - `MAIN_POST_CONTENT`: Content for the initial post (not currently used for auto-posting).

## Setup

1.  **Set Constants:** Before running, configure the necessary values in `src/constants.ts`:
    *   Publish a root note for your chat thread using a client associated with the TV's keys.
    *   Set `MAIN_THREAD_EVENT_ID_HEX` to the **hex ID** of that root note.
    *   Set `MAIN_THREAD_NEVENT_URI` to the full `nevent` URI of that root note (for the QR code).
    *   Set `TV_PUBKEY_HEX` to the hex public key corresponding to the `npub` defined in `App.tsx` (`TV_PUBKEY_NPUB`).
    *   Configure the desired `RELAYS`.
2.  **Install Dependencies:** `npm install` or `yarn install`.
3.  **Run Development Server:** `npm run dev` or `yarn dev`.
