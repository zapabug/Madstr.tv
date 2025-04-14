# Component Descriptions

This document provides a summary of the React components found in `src/components`.

## `Podcastr.tsx`

*   **Purpose:** Acts as a podcast player. Fetches and displays a list of podcast episodes ("notes") based on selected authors. Users can navigate and select episodes from a scrollable list, and control playback using standard audio controls (play/pause, seek bar, speed). Includes profile picture display and inactivity fade-out for controls.
*   **Buttons & Layout:**
    *   **Podcast List Items:** Vertical list where each item (`<div role="option">`) acts as a button to select the podcast.
    *   **Playback Controls Bar:** Bottom bar, fades with inactivity.
        *   **Play/Pause Button:** Far left of the bar (icon changes state).
        *   **Speed Button:** Far right of the bar (text shows speed, e.g., "1.0x"), toggles speed menu.
        *   **Speed Menu Buttons:** Popup menu above the Speed Button with columnar buttons for different playback rates (0.5x, 1.0x, etc.).

## `MediaFeed.tsx`

*   **Purpose:** Fetches and displays a slideshow of *image* media from Nostr based on authors. Shows one image at a time with a blurred background version. Caches media using IndexedDB. Displays a QR code for the poster's profile. Conditionally renders based on `mediaMode`.
*   **Buttons & Layout:**
    *   **Previous/Next Navigation:** Implicit; controlled externally via `handlePrevious`/`handleNext` props (likely by parent component keybinds).
    *   **Toggle Mode Button:** Bottom-right corner (left of QR code). Text dynamically changes ("Videos" or "Podcasts"). Calls `toggleInteractiveMode` prop on click.

## `VideoPlayer.tsx`

*   **Purpose:** Plays a single video specified by a `url` prop. Displays a QR code for the poster (`posterNpub`). Manages playback state internally (`useVideoPlayback`) but allows external control via `appIsPlayingRequest` prop. Handles `onEnded` event. Includes inactivity timer for controls fade-out.
*   **Buttons & Layout:**
    *   **Toggle Mode Button:** Bottom-right corner (left of QR code), fades with inactivity. Text dynamically changes ("Videos" or "Podcasts"). Calls `toggleInteractiveMode` prop on click.
    *   **Play/Pause:** Implicit/External; no visible button within this component. Controlled by parent via props/hooks.

## `VideoList.tsx`

*   **Purpose:** Fetches and displays a list of *video* notes from Nostr based on authors. Manages its own IndexedDB cache for video notes. Subscribes to new video events. Displays a scrollable list.
*   **Buttons & Layout:**
    *   **Video List Items:** Vertical, scrollable list. Each item (`<div key={note.id}>`) acts as a button. Clicking calls the `onVideoSelect` prop with video details.
    *   **No Other Controls:** Purely for listing and selection.

## `InteractivePanel.tsx`

*   **Purpose:** Container component that switches between displaying `Podcastr` or `VideoList` based on its internal `interactiveMode` state.
*   **Buttons & Layout:**
    *   **Toggle Mode Button:** Top-right corner of the panel container. Text dynamically changes ("Videos" or "Podcasts"). Clicking toggles the internal state to switch the displayed component (`Podcastr` or `VideoList`).

## `MessageBoard.tsx`

*   **Purpose:** Fetches and displays Nostr notes (replies) to a specific target event (`neventToFollow`), filtered by specified `authors`. Fetches and displays author profile information (name, picture) using a shared cache.
*   **Buttons & Layout:**
    *   **No Buttons:** Purely display-only. Renders a vertical list of messages with author info.

## `PodcastPlayer.tsx` (Exports `Podcastr`)

*   **Purpose:** Fetches and displays podcast notes (audio files) from Nostr for given authors. Uses its own cache and shared profile cache. Displays author info and provides standard HTML audio controls. Allows navigation between tracks. *Note: This seems distinct from the component in `Podcastr.tsx`.*
*   **Buttons & Layout:**
    *   **Audio Element Controls:** Uses `<audio controls>`, rendering the browser's default UI (play/pause, seek, volume, time). Centered layout.
    *   **Previous Button:** Text button "Prev" on the bottom-left.
    *   **Next Button:** Text button "Next" on the bottom-right.

## `RelayStatus.tsx`

*   **Purpose:** Displays the number of configured Nostr relays. Text color indicates connection status (`isReceivingData` prop) and relay count.
*   **Buttons & Layout:**
    *   **No Buttons:** Purely informational display in the bottom-left corner. 