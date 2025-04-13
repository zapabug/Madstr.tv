# Podcastr Component Documentation

## Overview

The `Podcastr` component is a React functional component designed to discover, display, and play podcast episodes shared via Nostr notes (Kind 1). It subscribes to notes from a specified list of authors, extracts podcast audio URLs, fetches author profile information, and presents a user interface optimized for navigation, potentially including TV remotes.

## Key Features

*   **Nostr Integration:** Uses `nostr-hooks` and `@nostr-dev-kit/ndk` to connect to the Nostr network.
*   **Podcast Discovery:** Subscribes to `Kind 1` (Text) notes from specified authors and parses note content for URLs matching common audio formats (`.mp3`, `.m4a`, `.wav`). 
    *   _Note:_ Discovery currently relies solely on finding audio URLs within the `content` of Kind 1 notes. It does not yet parse specific podcast-related tags (e.g., "episode", "title") or subscribe to dedicated podcast feed events (like potential future NIPs).
*   **Profile Fetching:** Retrieves author profile information (Kind 0 events) using NDK's `fetchProfile()` method. Handles potential variations in NDK response formats (data in `.content` string vs. direct properties).
*   **Caching:**
    *   **Podcast Notes:** Caches discovered podcast note details (URL, author pubkey, timestamp, etc.) in IndexedDB (`PodcastNoteCache`) for faster loading.
    *   **Profiles:** Utilizes a shared IndexedDB cache (`ProfileCache`, managed by `src/utils/profileCache.ts`) to store and retrieve author profile data, reducing redundant network requests.
*   **User Interface:**
    *   Displays the currently selected podcast's author name and profile picture (or initials).
    *   Shows a scrollable list of discovered podcast episodes, numbered with the most recent first.
    *   List items are focusable and clickable, facilitating navigation (e.g., with arrow keys or a remote).
    *   Includes a standard HTML5 audio player for playback.
    *   Features a playback speed control button with a dropdown menu (0.75x to 2.0x).
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
    *   Renders the scrollable list, displaying the reverse chronological number, author picture/initials, and author name for each item. Highlights the selected item.
    *   Renders the HTML audio player, updating its `src` when `currentItemIndex` changes.
    *   Renders the playback speed control.

## Dependencies

*   `react`
*   `nostr-hooks`
*   `@nostr-dev-kit/ndk`
*   `nostr-tools` (specifically `nip19` for potential future use, though not directly used in the snippet shown)
*   `../utils/profileCache` (for shared profile caching logic)

## Cache Structure

*   **Podcast Notes:** IndexedDB database `PodcastNoteCache`, object store `podcastNotes`, key path `id`. Stores `PodcastNote` objects.
*   **Profiles:** Uses shared IndexedDB mechanism defined in `src/utils/profileCache.ts` (likely database `ProfileCache`, object store `profiles`, key path `pubkey`). Stores `ProfileData` objects.
