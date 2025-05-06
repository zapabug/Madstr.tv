## 2024-07-18

*   **Investigate `TimelineQuery` Failure (useMediaContent.ts):**
    *   Added `console.log` statements for `imageQueryArgs` and `videoQueryArgs` to inspect the exact filters being passed to `Hooks.useStoreQuery`.
    *   Observation: Logs showed that `imageQueryArgs` and `videoQueryArgs` were initially (and persistently) constructed without `authors` or `tags`, because `followedAuthorPubkeys` and `followedTags` props were empty when `useMediaContent` first ran. This is likely due to `ContactsQuery` in `App.tsx` not having resolved yet.
    *   Added `console.log` at the beginning of `useMediaContent` to inspect the `followedAuthorPubkeys` and `followedTags` props upon each invocation.
    *   **Observation 2:** Subsequent logs confirmed that `useMediaContent` *does* receive the populated `followedAuthorPubkeys` array after `ContactsQuery` resolves. The `imageQueryArgs` and `videoQueryArgs` are then correctly reconstructed to include the `authors` list.
    *   **Problem Persists:** Despite correct filters with authors eventually being used, `TimelineQuery` still returns 0 image/video events.
    *   **Next Step Hypothesis:** Issue might be with `TimelineQuery` handling of a single filter object with many authors, or no recent matching events for that specific set of authors in the `EventStore`. 