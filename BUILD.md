I'll summarize our chat and create a todo list based on our discussion and the documentation.

**Chat Summary:**
1. We identified that `App.tsx` had grown too large and needed refactoring.
2. Created `useAppMediaNotes` hook to encapsulate media fetching logic, combining author and tag-based fetches.
3. Refactored `App.tsx` to use the new hook, significantly reducing code duplication.
4. Fixed TypeScript linter errors by removing unused imports and variables.
5. Improved `useMediaAuthors` to properly handle both TV app's default npub and logged-in user's npub for Kind 3 contact lists.

**Current State:**
- Images are loading but podcasts and videos are not appearing consistently.
- The app uses `@cashu/cashu-ts` which needs updating.
- Code has been cleaned up but some components might still be too large.
- Authentication flow supports both default TV npub and user login.

**Todo List:**

1. **Media Loading Issues:**
   - [ ] Add logging to `useMediaNotes` to verify Kind filters for podcasts/videos
   - [ ] Verify that `fetchPodcastsByTagEnabled` and `fetchVideosByTagEnabled` are working correctly
   - [ ] Check if content is being published with the expected Kinds:
     - Videos: `[1, 1063, 34235, 21, 22]`
     - Podcasts: `[1, 30315, 1063, 31234]`

2. **Cashu Integration:**
   - [ ] Check current version of `@cashu/cashu-ts`
   - [ ] Update to latest version: `bun add @cashu/cashu-ts@latest`
   - [ ] Review and update `src/utils/cashu.ts` for any breaking changes
   - [ ] Test wallet functionality:
     - [ ] Balance display
     - [ ] Deposit via DMs
     - [ ] Tipping
     - [ ] Proof export during logout

3. **Code Organization:**
   - [ ] Consider splitting `MediaPanel.tsx` into smaller components
   - [ ] Review and potentially refactor `SettingsModal.tsx`
   - [ ] Create separate components for video/podcast lists
   - [ ] Document component hierarchy in `docs/`

4. **Authentication & User Experience:**
   - [ ] Add loading indicators for media fetching
   - [ ] Improve error handling for failed media loads
   - [ ] Add user feedback for tag fetching toggles
   - [ ] Consider adding a "Sync DMs" button for manual deposit checks

5. **Performance Optimization:**
   - [ ] Review and optimize media preloading strategy
   - [ ] Consider implementing virtual scrolling for long lists
   - [ ] Add caching for frequently accessed profiles
   - [ ] Optimize URL deduplication logic

6. **Documentation:**
   - [ ] Update `docs/tv-app-architecture.md` with recent changes
   - [ ] Document the new `useAppMediaNotes` hook
   - [ ] Create flow diagrams for media fetching
   - [ ] Document Cashu integration and tipping flow

7. **Testing:**
   - [ ] Add tests for `useAppMediaNotes`
   - [ ] Test media loading with different Nostr event kinds
   - [ ] Test authentication flows
   - [ ] Test wallet functionality with updated Cashu library

8. **Future Enhancements:**
   - [ ] Consider implementing Zap receipts (Kind 9735)
   - [ ] Add transaction history for tips/deposits
   - [ ] Implement profile-based Zapsplits
   - [ ] Add trending hashtag suggestions

Would you like me to focus on any particular area from this list? I can help with implementation details or further planning for any of these tasks.
