# Error Log and Debugging History

This document tracks errors encountered during development and debugging.

## Issue 1: `Uncaught TypeError: filter is undefined` (Resolved)

*   **Symptom:** Runtime error originating from `useSubscribe` (`index.mjs:5209`) when dynamically generated filters were passed.
*   **Cause:** Likely passing `undefined`, `null`, or `false` directly to `useSubscribe` instead of a valid `NDKFilter[]` or an empty array `[]`.
*   **Resolution:** Refactored media fetching into `useMediaContent.ts`. Ensured that `buildMediaFilters` returns `null` if no valid filter can be created, and the calling code uses nullish coalescing (`?? []`) to pass an empty array `[]` to `useSubscribe` in such cases. Similar safe handling was confirmed in `MessageBoard.tsx`.
*   **Status:** Resolved. The error no longer appears in recent console logs.

## Issue 2: No Media Content or Message Board Replies Loading (Ongoing)

*   **Symptom:** Application loads but displays no images, videos, or podcasts. The `MessageBoard` component shows "No replies found yet".
*   **Cause Investigation:**
    *   **Initial State:** When the app starts logged out, `useMediaContent` fetches the Kind 3 list for the default `TV_PUBKEY_NPUB` (currently `npub1a5v...`). This fetch appears to be delayed or returning no data (Kind 3 logs missing).
    *   **Fallback Filters:** Consequently, the initial media subscriptions are based *only* on `followedTags` (`#memes`, `#landscape`, etc.).
    *   **Empty Subscriptions:** Console logs (`Received 0 raw ... events from useSubscribe.`) confirm that both the tag-only filters *and* the `MessageBoard`'s `#e` tag filter are returning **zero** events from the connected relays.
*   **Possible Root Causes:**
    1.  **Missing Kind 3 for Default Pubkey:** The default account (`npub1a5v...`) may not have a published Kind 3 contact list on the connected relays. This prevents author-based filtering.
    2.  **No Matching Tagged Content:** There might be no content matching the specified `followedTags` and media kinds on the connected relays.
    3.  **No Message Board Replies:** There might genuinely be no replies tagging the target event (`#e` tag: `3afe59...`) on the connected relays.
    4.  **Relay Issues:** The connected relays might be unreliable, not storing the relevant kinds/tags, or failing to return events for the specific subscriptions.
*   **Next Debugging Steps:**
    1.  Verify externally if `npub1a5ve...` has a published Kind 3 list.
    2.  Check console logs for Kind 3 filter construction and result after adding specific logging.
    3.  Verify if content matching the `followedTags` actually exists on the relays.
    4.  Verify if replies tagging the `MessageBoard` event exist on the relays.
*   **Status:** Ongoing. 