# Applesauce Key Learnings & Best Practices

This document summarizes key insights into the Applesauce toolkit's behavior, particularly relevant for building robust and performant applications. These points are based on a combination of direct codebase exploration (simulated) and observations during the development of the Madstr TV app.

## 1. Data Stability from `Hooks.useStoreQuery`

*   **Reference Stability is Not Guaranteed by Default for Arrays/Objects:**
    *   `Hooks.useStoreQuery` returns the latest emission from a query's RxJS observable pipeline.
    *   If the query's transformation logic (e.g., using `map` to process events) creates new array or object references, `Hooks.useStoreQuery` will return these new references, even if the underlying data content is identical to the previous emission.
    *   Standard Applesauce queries (e.g., `ContactsQuery`, `TimelineQuery`) generally do **not** include built-in deep `distinctUntilChanged` operators on their final output by default.

*   **Developer Responsibility for Stabilization:**
    *   If referential stability is critical for consuming components/hooks (e.g., to prevent re-render loops or optimize `useEffect` dependencies), the application developer must implement this stabilization layer.
    *   **Methods on the Consumer-Side:**
        1.  **`useMemo` with Content-Based Dependency:** Use `useMemo` to wrap the data from `Hooks.useStoreQuery`. The dependency array for `useMemo` should include a representation of the data's content (e.g., `JSON.stringify(data)`) or use a deep-comparison custom hook.
            ```typescript
            // Example:
            const rawData = Hooks.useStoreQuery(SomeQuery, queryArgs);
            const stableData = useMemo(() => rawData, [JSON.stringify(rawData)]);
            ```
        2.  **Custom Hook Wrapper:** Create a generic custom hook that wraps `Hooks.useStoreQuery`. This hook can internally use `useRef` to store the previous value and a deep-comparison function to decide whether to return the previous reference or the newly emitted one.
    *   **Ideal Location (If Modifying Applesauce Queries):** If contributing to or creating custom queries for the Applesauce core, an `distinctUntilChanged((prev, curr) => deepCompare(prev, curr))` operator should be added to the query's RxJS pipeline itself before returning the observable.

## 2. Callback Stability from Hooks

*   **Custom Hooks (Application Code):**
    *   For custom hooks created within the application (e.g., `useNip46AuthManagement.ts` in Madstr TV), any functions returned by the hook that are intended for use in React dependency arrays (`useEffect`, `useCallback`, `useMemo`) **must** be memoized using `useCallback`.
    *   The dependency array for these `useCallback` declarations must be correctly specified to ensure the callback reference only changes when truly necessary.
    *   Failure to do so can lead to unintended re-runs of effects that depend on these callbacks.

*   **Applesauce-Provided Hooks:**
    *   It is generally expected that hooks provided directly by `applesauce-react` (or similar official packages) follow React best practices and memoize their returned functions appropriately. However, always verify if a specific hook's documentation or source mentions callback stability guarantees if issues arise.

## 3. `EventStore` Filtering Logic (for `TimelineQuery`, `eventStore.timeline`, `eventStore.getAll`)

*   **Inter-Filter Logic (Array of Filters):** When an array of `Filter` objects is provided (e.g., `[filterA, filterB]`), the logic between these filter objects is **OR**. An event matches if it satisfies `filterA` OR `filterB`.

*   **Intra-Filter Logic (Conditions within a Single Filter Object):** Conditions specified *within* a single `Filter` object (e.g., `kinds`, `authors`, `#t`) are combined with **AND** logic. An event must satisfy all specified conditions within that filter object.

*   **Tag Matching Specifics (e.g., `"#t": ["value"]`):**
    *   The internal `matchFilter` helper relies on `getIndexableTags(event)` (from `packages/core/src/helpers/event.ts`).
    *   `getIndexableTags` primarily processes **single-letter tags** (e.g., `t`, `p`, `e`, `d`, `a`, `g`) and creates an internal representation like `"t:value"`, `"p:pubkey"`.
    *   Therefore, when specifying tag filters, use the single-letter format:
        *   Correct: `filter = { "#t": ["nostr"] }` (matches `["t", "nostr"]`)
        *   Correct: `filter = { "#d": ["identifier"] }` (matches `["d", "identifier"]`)
    *   Using longer tag names in the filter key (e.g., `"#event_id": ["some_id"]`) might not work as expected with the optimized `matchFilter` logic unless `getIndexableTags` is also designed to handle and index them in the same "tagName:value" format. For general compatibility and leveraging NIP-12 style indexing, stick to single-letter tag filters.

## 4. Advanced Debugging Techniques

*   **Standard Logging:**
    *   Use `localStorage.debug = "applesauce:*"` to enable all Applesauce logs.
    *   Use more specific targets like `localStorage.debug = "applesauce:ComponentName"` (e.g., "applesauce:NostrConnectSigner", "applesauce:EventStore") if the logger is extended within those components/modules.

*   **`EventStore` Inspection:**
    *   `eventStore.getAll(filters)`: Synchronously query the current cache with specific filters. Extremely useful for verifying if events *should* match a filter.
    *   `eventStore.getEvent(id)`: Retrieve a specific event by its ID.
    *   Direct Database Inspection (for deep debugging, use with caution): The `eventStore.database` public property exposes internal Maps:
        *   `eventsById: Map<string, NostrEvent>`
        *   `eventsByKind: Map<number, Set<NostrEvent>>`
        *   `eventsByAuthor: Map<string, Set<NostrEvent>>`
        *   `eventsByReplaceable: Map<string, NostrEvent[]>` (key is `${kind}:${pubkey}:${d || ""}`)
        *   `eventsByTagName: Map<string, Map<string, Set<NostrEvent>>>` (e.g., `db.eventsByTagName.get("t")?.get("somevalue")`)
        Accessing these directly helps understand the store's current state but should not be used for application logic.

*   **`QueryStore` Inspection:**
    *   `queryStore.queries: Map<QueryConstructor<any, any[]>, Map<string, Observable<any>>>`
        This public map shows active, cached observables. The outer map keys are query constructor functions, inner map keys are hashed query arguments.
    *   RxJS Debugging: Since queries are RxJS observables, standard RxJS debugging tools like the `tap()` operator can be inserted into query pipelines (if modifying query definitions) to log emissions.

This document should serve as a living reference for common pitfalls and advanced usage patterns when working with the Applesauce toolkit. 