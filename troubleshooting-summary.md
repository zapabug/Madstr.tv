## Troubleshooting Summary: NDK Initialization and Event Fetching

This document summarizes the issues encountered and steps taken to resolve them during the development of the Nostr TV App.

### 1. Initial NDK Error: `ndk.debug.extend is not a function`

*   **Problem:** The application crashed on startup with a `TypeError: ndk.debug.extend is not a function` originating from the NDK library (`index.mjs`).
*   **Cause:** The `initNdk` function in `App.tsx` was called with the `debug: true` option. This specific debug functionality seemed incompatible with the installed NDK version (`@nostr-dev-kit/ndk@^2.13.2`). Attempting to update NDK didn't resolve the issue.
*   **Solution:** The `debug: true` line was commented out in the `initNdk` call within `App.tsx`. This allowed NDK to initialize successfully.

### 2. Kind 3 (Contact List) Fetching Issue

*   **Problem:** After fixing the initialization error, the application failed to fetch the Kind 3 contact list for the main TV public key (`TV_PUBKEY_NPUB`). The log showed `App: No Kind 3 event found for TV pubkey...`. This resulted in an empty `mediaAuthors` list and the `MediaFeed` component displaying a placeholder.
*   **Cause:** The initial implementation used `ndk.fetchEvent` to get the Kind 3 list. `fetchEvent` likely closes the subscription too quickly if the relays don't return the event immediately.
*   **Solution:** The Kind 3 fetching logic in `App.tsx` was refactored to use `ndk.subscribe` with `closeOnEose: false`. Event handlers for `event` and `eose` were added to manage the state (`mediaAuthors`, `isLoadingAuthors`) correctly based on whether the event was found or the relays confirmed it wasn't present. A cleanup function was also added to stop the subscription.

### 3. MessageBoard Not Displaying Historical Messages

*   **Problem:** Even after NDK was working and the Kind 3 list was potentially fetched, the `MessageBoard` component consistently logged `MessageBoard has 0 total events, displaying 0`, indicating it wasn't loading or showing past replies to the main thread.
*   **Cause:** The `ndk.subscribe` call in `MessageBoard.tsx` used a `limit: 50` filter option and `closeOnEose: false`. The limit might have prevented older messages from being fetched if more than 50 replies existed. `closeOnEose: false` kept the subscription open for live updates but wasn't ideal for ensuring the initial load of all historical messages.
*   **Solution:** The `limit: 50` option was removed from the filter in `MessageBoard.tsx` to allow fetching all historical replies. The subscription option was changed to `closeOnEose: true` to automatically close the subscription once all stored events have been received from the relays, focusing this subscription on fetching the initial message history.

### 4. MessageBoard Not Displaying Live Messages

*   **Problem:** After fixing historical loading, live messages still weren't appearing.
*   **Attempt 1 (Live Subscription):** Changed `closeOnEose` back to `false` in `MessageBoard.tsx` to keep the subscription open for real-time events. No change in behavior.
*   **Attempt 2 (Verify Constants):** User provided the correct `nevent` URI for the main thread. Decoding this revealed that `MAIN_THREAD_EVENT_ID_HEX` and `MAIN_THREAD_NEVENT_URI` in `src/constants.ts` were incorrect. Several recommended relays were also missing from the `RELAYS` list.
*   **Solution 2 (Update Constants):** Corrected `MAIN_THREAD_EVENT_ID_HEX`, `MAIN_THREAD_NEVENT_URI`, and added missing relays (`wss://purplepag.es`, `wss://relay.nostr.band`) to `src/constants.ts`. Issue persisted.
*   **Attempt 3 (Change Filter Strategy):** Modified the filter in `MessageBoard.tsx` to fetch Kind 1 notes tagging the TV's public key (`#p` tag with `TV_PUBKEY_HEX`) instead of replying to the specific event (`#e` tag). Added `TV_PUBKEY_HEX` to `src/constants.ts`.
*   **Current State:** Despite trying both `#e` and `#p` filters with correct constants and relays, and ensuring the subscription stays open (`closeOnEose: false`), the `MessageBoard` is still reported as not displaying incoming messages.

### Current Status

With these changes:
1.  NDK initializes correctly.
2.  The application attempts to subscribe to and fetch the Kind 3 contact list persistently for the `MediaFeed`.
3.  The `MediaFeed` appears to be functioning correctly based on the fetched authors.
4.  The `MessageBoard` attempts to subscribe to Kind 1 notes mentioning the TV's public key (`#p` tag) using `closeOnEose: false`, but is **currently not displaying messages** for reasons yet to be determined.

The application should now be more robust in fetching necessary data from Nostr relays. 