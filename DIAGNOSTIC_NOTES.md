# Diagnostic Notes - Max Update Depth Debugging (Session Ending 2024-05-XX)

This document tracks temporary code modifications made to diagnose and resolve the "Maximum update depth exceeded" error and subsequent re-render loops.

## Part 1: "Maximum Update Depth Exceeded" Error

**Initial Finding:** The primary trigger for the hard "Maximum update depth exceeded" error was identified as the `Hooks.useStoreQuery(Queries.ContactsQuery, ...)` call within `src/App.tsx`. Bypassing this query resolved the hard error.

---
## Part 2: Persistent `App.tsx` Re-Render Loop Investigation

**New Symptom After Part 1 Fix:** Even with the hard error gone, `App.tsx` was found to be re-rendering repeatedly. This was evidenced by a `useEffect` hook within `useAuth.ts` logging its execution multiple times, indicating `useAuth()` was being re-invoked due to `App.tsx` re-renders.

**Debugging Steps & Findings for `App.tsx` Re-Render Loop (Summary):**

1.  **`App.tsx` Stability Achieved:** After extensive, systematic neutralization of hooks and state within `App.tsx`, its child components, and `useAuth.ts`, `App.tsx` was stabilized. The critical change that stopped an earlier loop (while `App.tsx` was calling a highly inert `useAuth.ts`) was commenting out the `useState` for `isLoadingContent` and its related `useEffect` within `App.tsx`.

2.  **`useAuth.ts` Phased Reactivation & Loop Re-emergence:**
    *   The `loadAllSettings` `useEffect` (with all its internal `setState` calls active) and the `loadTags` `useEffect` (with its `setState` call active) in `useAuth.ts` were re-enabled. `App.tsx` remained stable.
    *   `Hooks.useQueryStore()` and the call to `useNip46AuthManagement()` (though its returned functions weren't heavily used yet) in `useAuth.ts` were re-enabled. `App.tsx` remained stable.
    *   **Loop Returned:** The re-render loop in `App.tsx` (evidenced by `[App.tsx] Function body execution START` logging multiple times) re-emerged when the *content* of the `initializeAuth` `async` function (within its `useEffect`) in `useAuth.ts` was restored. This function handles loading stored credentials and calling `setActiveSigner` and `setIsLoadingAuth`.
    *   **`setIsLoadingAuth` Neutralized:** Commenting out all `setIsLoadingAuth` calls within the `initializeAuth` effect and its surrounding `useEffect` logic did **not** stop the loop. `App.tsx` continued to re-render multiple times, and the `initializeAuth` effect itself was observed to re-run.

3.  **Current Hypothesis for Loop (as of this update):**
    *   The `initializeAuth` `useEffect` in `useAuth.ts` has `[queryStore, activeSigner, restoreNip46Session]` as its original dependencies.
    *   When `initializeAuth` successfully logs in a user (e.g., by loading an nsec and calling `setActiveSigner`), the change in `activeSigner` correctly causes this `useEffect` to re-evaluate.
    *   If, upon this re-evaluation, the `restoreNip46Session` callback (from `useNip46AuthManagement`) has a new reference (i.e., it's not a stable `useCallback` from its source), the `useEffect` might run its logic again unnecessarily.
    *   The calls to `setActiveSigner` within `initializeAuth` change the `activeSigner` state. Since `activeSigner` is a dependency for the `useMemo` that wraps `useAuth`'s return object, `useAuth` returns a new `auth` object reference to `App.tsx`.
    *   `App.tsx` re-renders due to the new `auth` object reference. This chain, potentially facilitated by an unstable `restoreNip46Session` causing `initializeAuth` to re-run more than strictly necessary after login, leads to the loop.

**Current Diagnostic State (as of this summary update - Awaiting Test Results):**

*   **`src/App.tsx`:**
    *   `useState` for `loadingMessageIndex` & `isLoadingContent`: **COMMENTED OUT** (values are static dummies) - This was the change that stabilized `App.tsx` when `useAuth` was inert.
    *   `useEffect` that set `isLoadingContent`: **COMMENTED OUT**.
    *   `useAuth()` call: **ACTIVE**.
    *   All other custom hooks, Applesauce data hooks, and `setInterval` `useEffect`: Still **COMMENTED OUT / DUMMIED**.
    *   Data inputs like `rawContactsData`, `viewMode`: Still **HARDCODED**.
*   **`src/hooks/useAuth.ts` (Target of Current Test):**
    *   `loadAllSettings` `useEffect` & `loadTags` `useEffect`: **Fully active** internally.
    *   `Hooks.useQueryStore()` & `useNip46AuthManagement()`: **ACTIVE**.
    *   `initializeAuth` `async` function: **Content RESTORED**.
        *   `setIsLoadingAuth` calls within `initializeAuth` and its surrounding `useEffect` logic: **COMMENTED OUT**.
        *   **Dependency array of `initializeAuth` `useEffect`:** Changed from `[queryStore, activeSigner, restoreNip46Session]` to **`[queryStore, activeSigner]`** (temporarily removing `restoreNip46Session` to test its stability impact).
    *   `useEffect` for `updateNpub` & `isLoadingAuth` fallback: Still **COMMENTED OUT / EMPTIED**.
    *   Return object of `useAuth`: Wrapped in `useMemo` with a full dependency list.
*   **Calls to `useAuth()` in `useWallet.ts`, `ImageFeed.tsx`, `SettingsModal.tsx`**: Still **COMMENTED OUT / DUMMIED**.

**Immediate Next Step (Pending):**
*   Run the application with the modified `initializeAuth` `useEffect` dependency array.
*   Observe console logs (`[App.tsx] Function body execution START`, `Auth Hook...` logs, `initializeAuth` effect logs) to see if `App.tsx` stabilizes (logs only 1-2 times). If it does, it points to `restoreNip46Session`'s reference instability as a key contributor to the loop.

## Summary of Findings (as of this document's creation):
The primary trigger for the render loop was identified as the `Hooks.useStoreQuery(Queries.ContactsQuery, ...)` call within `src/App.tsx`. Bypassing this specific query (by hardcoding `rawContactsData = null;` in `App.tsx`) resolved the "Maximum update depth exceeded" error, even when `useAuth` and `useWallet` were fully active. This indicates an issue with how this query's results are provided or consumed, leading to cascading re-renders.

## Current Temporary Modifications in Code:

**1. `src/App.tsx`:**
   - `useAuth()` call and its destructured variables are **ACTIVE** (diagnostic bypass removed).
   - `rawContactsData` is **HARDCODED to `null`** (bypassing `Hooks.useStoreQuery(Queries.ContactsQuery, ...)`):
     ```typescript
     // const rawContactsData = Hooks.useStoreQuery(Queries.ContactsQuery, contactsQueryKey); // DIAGNOSTIC: Bypass Hooks.useStoreQuery
     const rawContactsData = null; // DIAGNOSTIC: Hardcode rawContactsData to null
     ```
   - `viewMode` is **HARDCODED to `'imagePodcast'`**:
     ```typescript
     // const { viewMode, ... } = useMediaState({...});
     const viewMode = 'imagePodcast'; // DIAGNOSTIC: Hardcode viewMode
     ```
   - `ImageFeed` props `imageNotes` and `currentImageIndex` are **HARDCODED**:
     ```typescript
     <ImageFeed 
       imageNotes={[]} // DIAGNOSTIC: Hardcode to empty array
       currentImageIndex={0} // DIAGNOSTIC: Hardcode to 0
     />
     ```
   - `AnimatePresence` and `motion.div` wrappers around `ImageFeed` are **REMOVED**.

**2. `src/components/ImageFeed.tsx`:**
   - The main image display uses a standard `<img>` tag instead of `motion.img` and is not wrapped by `AnimatePresence` *within `ImageFeed.tsx` itself*.
     ```typescript
     // --- DIAGNOSTIC: Temporarily replace framer-motion animation with simple img ---
     <img
       // key={currentNoteId || currentImageIndex} // DIAGNOSTIC: Key was removed
       className="absolute top-0 left-0 w-full h-full object-contain select-none"
       src={imageUrl}
       alt={`Nostr Media ${currentImageNote?.id}`}
       style={{ opacity: 1, transform: 'scale(1)' }} 
     />
     ```
   - Tipping is disabled (`canTip = false;`, `handleTip` is a no-op).

**3. `src/hooks/useAuth.ts`:**
   - `DIAGNOSTIC_DISABLE_FUNCTIONALITY` flag is set to **`false`** (hook is active).

**4. `src/hooks/useWallet.ts`:**
   - `DIAGNOSTIC_DISABLE_FUNCTIONALITY` flag is set to **`false`** (hook is active).

## Next Steps:
1.  Focus on understanding and stabilizing the data flow from `Hooks.useStoreQuery(Queries.ContactsQuery, ...)` in `App.tsx`.
2.  Gradually revert other diagnostic changes once `ContactsQuery` is stable. 

---
## Update (Session Continuing - Post "Max Update Depth" Fix)

**New Symptom:** While the hard "Maximum update depth exceeded" error is gone, `App.tsx` is re-rendering repeatedly. This is evidenced by the `useEffect` hook within `useAuth.ts` (the one containing `loadAllSettings`, which has `[]` deps and now makes no `setState` calls) logging its execution multiple times.

**Current Diagnostic State Leading to App.tsx Re-Renders:**

**1. `src/App.tsx` (Highly Neutralized):**
   - **`useEffect` for `loadingMessageIndex` (with `setInterval`)**: **COMMENTED OUT**.
   - **`useRelayPool()` and `Hooks.useEventStore()`**: Calls **COMMENTED OUT** and replaced with static dummy `useMemo`