# Podcastr Component Documentation

## Overview

The `Podcastr` component is a React functional component designed to discover, display, and play podcast episodes shared via Nostr notes (Kind 1). It subscribes to notes from a specified list of authors, extracts podcast audio URLs, fetches author profile information, and presents a user interface optimized for navigation, potentially including TV remotes.

## Key Features

*   **Nostr Integration:** Uses `nostr-hooks` and `@nostr-dev-kit/ndk` to connect to the Nostr network.
*   **Podcast Discovery:** Subscribes to `Kind 1` (Text) notes from specified authors and parses note content for URLs matching common audio formats (`.mp3`, `.m4a`, `.wav`).
    *   _Note:_ Discovery currently relies solely on finding audio URLs within the `content` of Kind 1 notes. It does not yet parse specific podcast-related tags (e.g., "episode", "title") or subscribe to dedicated podcast feed events (like potential future NIPs).
    *   **_IMPORTANT UPDATE (Regarding Current Implementation):_** The data fetching logic described in this document is **outdated**. The actual podcast fetching now happens in the parent `App.tsx` component. That component subscribes to **Kind 1 and Kind 30402** events from the specified authors and attempts to extract audio URLs from the `content` or specific tags (`url`, `enclosure`) of those events. **Crucially, the current system does NOT use Kind 0 (profile metadata) events to discover podcast episode URLs.** This difference might be relevant to ongoing issues with podcast discovery.
*   **Profile Fetching:** Retrieves author profile information (Kind 0 events) using NDK's `fetchProfile()` method. Handles potential variations in NDK response formats (data in `.content` string vs. direct properties).
*   **Caching:**
    *   **Podcast Notes:** Caches discovered podcast note details (URL, author pubkey, timestamp, etc.) in IndexedDB (`PodcastNoteCache`) for faster loading.
    *   **Profiles:** Utilizes a shared IndexedDB cache (`ProfileCache`, managed by `src/utils/profileCache.ts`) to store and retrieve author profile data, reducing redundant network requests.
*   **User Interface:**
    *   Displays the currently selected podcast's author name and profile picture (or initials).
    *   Shows a scrollable list of discovered podcast episodes, numbered with the most recent first.
    *   List items are focusable (`tabIndex={0}`) and clickable, facilitating direct D-pad/arrow key navigation between items.
    *   **Includes an explicitly rendered standard HTML5 `<audio>` element** for reliable playback control and event handling.
    *   Features playback controls including a Play/Pause button, a **seek bar (slider)**, and a playback speed control button with a dropdown menu (0.75x to 2.0x).
*   **Focus Management:**
    *   Leverages native browser focus for list item navigation.
    *   **Implements specific `onKeyDown` handlers on controls like the seek bar and speed button to manage focus transitions.** 
        *   The **seek bar** handles `ArrowUp` (via `handleLeft` prop) and `ArrowDown` (via `onFocusBottomEdge` prop) to allow focus to escape upwards or downwards (typically to the `MediaFeed` toggle).
        *   The **speed button** handles `ArrowRight` (via `onFocusRightEdge` prop) to allow focus to escape rightwards (typically to the `MediaFeed` toggle).
*   **State Management:** Leverages React hooks (`useState`, `useEffect`, `useRef`, `useCallback`) to manage component state, side effects (data fetching, subscriptions), and references to DOM elements.

## Core Logic Flow

1.  **Initialization:**
    *   On mount, attempts to load previously discovered podcast notes from the `PodcastNoteCache` (IndexedDB).
    *   Sets initial state, including an empty list of notes and profiles.
2.  **NDK Subscription:**
    *   Once the note cache is loaded and `ndk` instance is available, it subscribes to `Kind 1` events from the provided `authors` list.
    *   Uses a persistent subscription (`closeOnEose: false`) to receive ongoing updates.
3.  **Note Processing:**
    *   When new `Kind 1` events arrive:
        *   Extracts potential podcast URLs using a regex.
        *   Creates `PodcastNote` objects containing relevant data (ID, URL, author pubkey, creation time).
        *   Adds new, unique notes to the component's state (`podcastNotes`) and the `notesById` ref map.
        *   Sorts notes by creation time (newest first).
        *   Saves newly discovered notes to the `PodcastNoteCache`.
4.  **Profile Fetching (`fetchPodcastAuthorProfile`):**
    *   Triggered by changes in `podcastNotes` (to fetch profiles for all unique authors in the list) and `currentItem` (to ensure the current item's profile is fetched).
    *   Checks if a profile fetch for a given `pubkey` is already in progress or if the profile data (with a name) already exists in the state.
    *   Checks the shared `ProfileCache` first. If a valid profile is found, updates the state and exits.
    *   If not cached or invalid, initiates a network request using `ndk.getUser({ pubkey }).fetchProfile()`.
    *   Handles the response:
        *   Checks if profile data is in `profileEvent.content` (stringified JSON) and parses it.
        *   If not, checks if data exists as direct properties on the `profileEvent` object (`name`, `picture`, etc.).
        *   Constructs a `ProfileData` object.
    *   If valid data is obtained:
        *   Updates the `profiles` state.
        *   Saves the profile data to the shared `ProfileCache`.
    *   Manages loading states (`isLoading`) for profiles.
5.  **Rendering:**
    *   Displays loading indicators while cache or profiles are loading.
    *   Shows a message if no podcasts are found.
    *   Renders the current item's profile info (picture, name) at the top.
    *   Renders the scrollable list, applying focus styles (`focus:`) directly to list items.
    *   Renders the **HTML `<audio>` element**, updating its `src` when `currentItemIndex` changes.
    *   Renders the playback controls (Play/Pause, Seek Bar, Speed Control).

## Dependencies

*   `react`
*   `nostr-hooks`
*   `@nostr-dev-kit/ndk`
*   `nostr-tools` (specifically `nip19` for potential future use, though not directly used in the snippet shown)
*   `../utils/profileCache` (for shared profile caching logic)

## Cache Structure

*   **Podcast Notes:** IndexedDB database `PodcastNoteCache`, object store `podcastNotes`, key path `id`. Stores `PodcastNote` objects.
*   **Profiles:** Uses shared IndexedDB mechanism defined in `src/utils/profileCache.ts` (likely database `ProfileCache`, object store `profiles`, key path `pubkey`). Stores `ProfileData` objects.
