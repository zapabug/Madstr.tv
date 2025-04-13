# Nostr TV App Interface

[![React](https://img.shields.io/badge/React-^18-blue?logo=react)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-^5-blue?logo=vite)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-^5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-^3-blue?logo=tailwindcss)](https://tailwindcss.com/)
[![Nostr](https://img.shields.io/badge/Nostr-purple?logo=nostr)](https://nostr.com/)

A web-based TV interface for browsing and playing media content (podcasts, videos) shared on the Nostr network. Designed with TV navigation and usability in mind.

## Features

*   **Media Feeds:** Displays feeds of video and podcast content fetched from specified Nostr authors.
*   **Podcast Player (`Podcastr`):**
    *   Fetches Kind 1 notes with podcast audio URLs (`.mp3`, `.m4a`, `.wav`).
    *   Scrollable list of podcasts with author profile pictures and names.
    *   Keyboard/Remote navigation (Up/Down/Enter/Space).
    *   Custom playback controls (Play/Pause, Progress Bar, Time Display).
    *   Playback speed adjustment.
    *   Playback position saving (resumes from last position via localStorage).
    *   Inactivity fade-out for controls.
*   **Video Player (`VideoPlayer`):**
    *   Plays video URLs found in Nostr notes.
    *   Basic Play/Pause controls.
    *   Displays QR code for the poster's `npub`.
    *   Inactivity fade-out for controls.
*   **Nostr Integration:**
    *   Uses `@nostr-dev-kit/ndk` and `nostr-hooks` for interaction with relays.
    *   Fetches Kind 0 profile data.
    *   Fetches Kind 1 notes based on authors.
    *   Robust profile and note caching using IndexedDB and utility functions.
*   **TV-Friendly UI:**
    *   Focus management for keyboard/remote navigation.
    *   Layouts suitable for larger screens.
    *   Tailwind CSS for styling.

## Tech Stack

*   **Framework:** React 18+
*   **Build Tool:** Vite
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS
*   **Nostr:** `@nostr-dev-kit/ndk`, `nostr-hooks`, `nostr-tools`
*   **State Management:** React Hooks (`useState`, `useEffect`, `useRef`, `useCallback`), Custom Hooks
*   **Other:** `react-qr-code`

## Getting Started

### Prerequisites

*   Node.js (v18 or later recommended)
*   npm, yarn, or pnpm

### Installation

1.  Clone the repository:
    ```bash
    git clone <your-repository-url>
    cd <repository-directory>
    ```
2.  Install dependencies:
    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```

### Running the Development Server

1.  Start the Vite development server:
    ```bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    ```
2.  Open your browser and navigate to the URL provided (usually `http://localhost:5173` or similar).

## Usage

Once the app is running, you can typically:

*   Select authors or feeds (depending on the main App component's implementation).
*   Use keyboard arrow keys (Up/Down) to navigate lists like the podcast player.
*   Use Enter or Spacebar to select items or activate focused buttons (Play/Pause, Speed).
*   Use the mouse to click on interactive elements.
*   The controls will fade out after 45 seconds of inactivity and reappear on interaction.

*(Adjust the Usage section based on how the main App component orchestrates the different views).*

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

todo list

lets add a setting page to add a feature to query the relays for hastag data