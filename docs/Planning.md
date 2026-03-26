# Development Planning Document

## Current Development Focus

### Loading State Improvements
- [x] Centralize loading states in App.tsx
- [x] Implement consistent loading UI across components
- [x] Add dynamic loading messages (funny messages)
- [x] Implement retry mechanisms for failed data fetches

### Media Playback
- [x] Implement basic video/audio playback controls
- [x] Add preloading for next video
- [x] Dual playback hooks (audio + video) working in parallel
- [x] **Add minimum video length filter (2 minutes minimum)**
- [x] **Implement back-to-back video playback with sound (autoplay next)**
- [x] **Fix video playback infinite loop bug (on "next video" click)**
- [ ] Improve buffering strategy
- [ ] Add quality selection for videos
- [ ] Implement adaptive bitrate streaming
- [ ] Add support for more media formats

### Nostr Integration
- [x] Basic NDK v2 integration with singleton pattern
- [x] Profile data fetching
- [x] Media note subscriptions (images, videos, audio)
- [x] Kind 3 contact list fetching with timeout fallback
- [x] NIP-94 File Metadata (kind 1063) support for images, audio, video
- [x] Fix podcast kinds (was 30402, now 1, 1063, 31338)
- [x] Implement retry mechanism for failed Nostr subscriptions
- [ ] Implement NIP-46 for remote signing (partial - UI exists, signer not implemented)
- [x] Add support for NIP-71 video events (kind 34235, 34236)
- [ ] Improve relay selection and fallback

### Cashu/eCash Wallet
- [x] Basic wallet implementation
- [x] Deposit via NIP-59 Gift Wrap DMs (Kind 1059) - **UPGRADED from Kind 4**
- [x] Fallback to NIP-04 DMs (Kind 4) for backwards compatibility
- [x] Send tips via NIP-59 Gift Wrap encrypted DMs
- [ ] Add zap-standard tipping support
- [ ] Multiple mint support UI improvements

## Nostr Media Center Features (v0.3.x)

### Content Sources
| Source | Method | Purpose |
|--------|--------|---------|
| **Follows** | Kind 3 authors | Auto-populate content from people you follow |
| **Extended Search** | Hashtag queries to relays | Find themed content from ANYONE |
| **Keywords** | Client-side content filter | Search within follows by keyword |

### Media Classification
| Media Type | Source Filter | Duration Filter |
|------------|---------------|-----------------|
| **Images** | Followed authors + hashtags | N/A |
| **Videos** | Followed authors + hashtags | ≥ 2 minutes (already implemented) |
| **Audio** | Followed authors + hashtags | ≥ 6 minutes (on preload) |
| **Music** | Followed authors + hashtags | < 6 minutes (on preload) |

### Duration Classification Approach
**Dynamic classification on preload (NOT persisted to DB)**
- Fetch all audio from follows
- On preload: estimate duration from file headers/size
- If < 6min → add to "music" bucket
- If ≥ 6min → add to "audio" bucket
- If can't estimate → default to music (can filter out if too long on playback)
- Pros: No DB schema changes, always current
- Cons: Re-estimates each session (acceptable for TV use case)

### Settings UI
- [x] Image hashtag toggle
- [x] Video hashtag toggle  
- [x] Music hashtag toggle
- [x] Keyword search input (searches follows content)
- [x] Tag management (add/remove followed tags)

## Technical Debt / Cleanup

### Unused Files (REMOVED)
- [x] `src/hooks/VideoFeed.tsx` - **REMOVED**
- [x] `src/hooks/usePodcastNotes.ts` - **REMOVED**
- [x] `src/components/InteractivePanel.tsx` - **REMOVED**
- [x] `src/components/Podcastr.tsx` - **REMOVED**
- [x] `src/components/VideoList.tsx` - **REMOVED**

### Dead Code
- [ ] Remove unused regex declarations in `useMediaState.ts` (imageRegex, videoRegex, audioRegex)
- [ ] Remove `docs/podcastr.md` (outdated documentation)

### Type Errors
- [ ] Fix ImageFeed prop mismatch (`handlePrevious`/`handleNext` not in MediaFeedProps)
- [ ] Fix MessageBoard prop mismatch (`onNewMessage` not in MessageBoardProps)

## Future Improvements

### User Experience
1. **Navigation**
   - [ ] Add keyboard shortcuts for common actions
   - [ ] Improve remote control navigation
   - [ ] Add gesture controls for touch interfaces

2. **Content Discovery**
   - [ ] Implement hashtag-based filtering (UI exists, needs refinement)
   - [ ] Add content recommendations
   - [ ] Create curated content lists

3. **Social Features**
   - [ ] Add comments on media
   - [ ] Implement sharing functionality
   - [ ] Add user following system

### Technical Improvements
1. **Performance**
   - [ ] Implement virtual scrolling for long lists
   - [ ] Add service worker for offline support
   - [ ] Optimize media loading and caching

2. **Architecture**
   - [ ] Implement proper error boundaries
   - [ ] Add comprehensive testing

3. **Security**
   - [ ] Implement proper key management
   - [ ] Add encryption for sensitive data
   - [ ] Improve authentication flow

## Notes

- All improvements should maintain the decentralized nature of the application
- Focus on TV-first experience while maintaining web compatibility
- Prioritize performance and reliability
- Keep user privacy as a top priority
- Maintain compatibility with Nostr protocol updates
- Duration classification is dynamic (not persisted) to reduce complexity

## Version Planning

### v0.2.0 (Completed)
- Loading state improvements
- Basic media playback
- Initial Nostr integration
- Cashu wallet integration
- NIP-59 Gift Wrap DMs
- NIP-94 File Metadata support

### v0.3.0 (Current)
- [x] Retry mechanisms for failed data fetches
- [x] Minimum video length filter (2 min)
- [x] Back-to-back video playback with sound
- [x] NIP-59 Gift Wrap DMs (NIP-04 fallback)
- [x] Hashtag toggles (Image/Video/Music)
- [x] Keyword search for follows
- [ ] **Fix video playback infinite loop bug**
- [ ] Duration classification (music <6min, podcast ≥6min)

### v0.4.0 (Future)
- Advanced content discovery
- Social features
- Performance optimizations
