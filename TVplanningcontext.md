You are absolutely correct, and I apologize for not fully integrating that understanding into my previous responses. My focus became too narrow on the "TV Npub follows" aspect for video fetching.

Thank you for the reminder about the broader functionality and the hashtag search. I need to keep the entire pre-existing functionality in mind as we debug the Applesauce integration.

**Let's re-confirm what was working with NDK (before the Applesauce refactor for NIP-46):**

*   **Content Display:** Images, podcasts, and videos were generally displaying.
*   **Content Sources:**
    *   **Default Mode (TV Npub's Follows):** The app would use the follow list of the `TV_PUBKEY_NPUB` to find content creators.
    *   **Logged-in Mode:** If a user logged in, it would switch to use their own follow list.
    *   **Hashtag Search:** Users could define hashtags to follow, and content matching these hashtags would *also* be fetched and displayed. This acted as an *additive* source (OR logic with author-based content, as per `tv-app-architecture.md`).
*   **UI:**
    *   `RelayStatus.tsx` was visible and functional (showing relay count and providing access to settings).
    *   The general layout with `ImageFeed`, `VideoPlayer`, `MediaPanel`, `MessageBoard` was in place.
*   **Other Features:**
    *   Nsec login was working.
    *   The internal Cashu wallet (DM deposits/tipping) was working to some extent.
    *   Placeholder chat was working.

**The NIP-46 remote signer was the primary piece *not* working with NDK, which prompted the switch to Applesauce.**

My apologies for losing sight of the hashtag functionality and the overall previous working state. The fact that these things *were* working with NDK is a strong indicator that the relay connections and the general event fetching capabilities were present.

**This refined understanding impacts our debugging strategy:**

1.  **`followedAuthorPubkeys` in `useMediaContent`**: This prop is indeed primarily for authors derived from a Kind 3 list (TV Npub's or logged-in user's).
2.  **`followedTags` in `useMediaContent`**: This prop is equally important and is the input for the hashtag-based content search. The `tv-app-architecture.md` states:
    > `useMediaContent` ... fetches specific `Kind 1063` (image) and `Kind 34235` (video) events using filters that combine `followedAuthorPubkeys` **and** `followedTags` (OR logic).

    This means `useMediaContent` *should* be constructing filters like:
    *   `{ kinds: [1063], authors: [pubkey1, pubkey2], ... }`
    *   `{ kinds: [1063], '#t': [tag1, tag2], ... }`
    *   And similar for videos (Kind 34235) and potentially for Kind 1s (though the architecture doc implies Kind 1s are mainly from `followedAuthorPubkeys`).

**Current Issues in Light of This:**

*   **No Videos/Few Images:**
    *   If TV Npub's follow list isn't yielding video creators, OR
    *   If the `followedTags` list (which might have hardcoded defaults or user-set values) isn't yielding video/image content from your relays,
    *   ...then media will be sparse.
*   **`RelayStatus.tsx` Invisibility:** Still likely a prop issue (`relayCount`) or styling, potentially affected by how `SimplePool` data is now accessed in `App.tsx` compared to NDK.

**Revised Plan & Information Needed:**

The core need remains to inspect `App.tsx` to understand how both `followedAuthorPubkeys` AND `followedTags` are being derived and passed to `useMediaContent`.

1.  **`TV_PUBKEY_NPUB` and `followedAuthorPubkeys` Derivation (as before):**
    *   Value of `TV_PUBKEY_NPUB` from `src/constants.ts`.
    *   `App.tsx` code for:
        *   Choosing the curator (default TV Npub vs. logged-in user).
        *   `ContactsQuery` call.
        *   Processing `contactsData` into `followedAuthorPubkeys`.

2.  **`followedTags` Derivation in `App.tsx`:**
    *   How are default hashtags initialized?
    *   How are user-defined hashtags (from `useAuth` or settings) incorporated into the `followedTags` array passed to `useMediaContent`?

3.  **`RelayStatus.tsx` Usage in `App.tsx` (as before):**
    *   How `relayCount` is derived and passed.

I understand you want to update the documentation. I can make more effective updates once I see how `App.tsx` handles these two distinct content streams (author-based and tag-based) that feed into `useMediaContent`.

Let's get that `App.tsx` code related to:
a. Fetching/processing the Kind 3 to get `followedAuthorPubkeys`.
b. Determining/managing `followedTags`.
c. Rendering `RelayStatus` and its `relayCount`.

This will give us a much clearer picture of the input to `useMediaContent` and help diagnose why the previously working multifaceted content fetching (authors + tags) might be failing for videos now with Applesauce.

