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
- [x] **Video position persistence via IndexedDB**
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
- [x] NIP-46 QR code flow (manual handshake - working)
- [x] NIP-46 paste flow (NDK blockUntilReady - working)
- [x] Extension detection (window.nostr)
- [x] Extension session auto-restore on page load
- [x] Add support for NIP-71 video events (kind 34235, 34236)
- [ ] Improve relay selection and fallback

### NIP-46 Session Management
- [x] Generate connect URI for QR code flow
- [x] Parse bunker URIs (bunker:// and nostrconnect://)
- [x] Manual handshake implementation (bypasses buggy NDK blockUntilReady)
- [x] Session persistence via IndexedDB
- [x] Session restoration on app load

### Content Filtering Architecture

#### Current Behavior (v0.3.x - WORKING)
```
1. Fetch Kind 3 (follows) from user's pubkey
2. mediaAuthors = [user's pubkey] (if no follows)
3. Fetch media from authors only
4. Client-side hashtag filter applied

INTENDED BEHAVIOR:
- No follows + Hashtags OFF → Nothing (correct)
- No follows + Hashtags ON → Nothing (BUG - should get relay content)
- Has follows + Hashtags OFF → User's follows content
- Has follows + Hashtags ON → User's follows + hashtag filtered content
```

#### Implementation (v0.3.x)
```
When hashtags enabled:
- Subscription 1 (Author-based): { kinds: ALL_MEDIA_KINDS, authors: authorsList, limit: 100 }
- Subscription 2 (Hashtag discovery): { kinds: ALL_MEDIA_KINDS, "#t": ["tag1"], limit: 200 }
  ^ NO author restriction - full relay discovery

Results merged and deduplicated by note ID.
```

#### Hashtag Query Relays
```typescript
const HASHTAG_QUERY_RELAYS = [
  'wss://relay.primal.net',
  'wss://nostr.wine',
  'wss://relay.bitcoiner.social',
];
```

#### Hashtag Discovery Content Filter
For hashtag discovery, we **only accept content from Nostr-native Blossom servers** to:
- Avoid Twitter/centralized CDN tracking
- Force Nostr-native media hosting
- Clean content for TV display

```typescript
const ALLOWED_BLOSSOM_HOSTS = [
  'blossom.primal.net',
  'blossom.nostrich.io',
  'blossom.nevent.ninja',
  'blossom.ditto.pub',
  'blossom.fiatjaf.com',
  'blossom.obsidian.vip',
];
```

Follows are NOT filtered - shows all content from followed users.

## Nostr Media Center Features (v0.3.x)

### Content Sources
| Source | Method | Purpose |
|--------|--------|---------|
| **Follows** | Kind 3 authors | Auto-populate content from people you follow |
| **Extended Search** | Hashtag queries to relays | Find themed content from ANYONE (DISCOVERY MODE) |
| **Keywords** | Client-side content filter | Search within follows by keyword |

### Media Classification
| Media Type | Source Filter | Duration Filter | Display Mode |
|------------|---------------|-----------------|--------------|
| **Images** | Followed authors + hashtags | N/A | Random carousel (intended) |
| **Videos** | Followed authors + hashtags | ≥ 2 minutes | Sequential, NOT random |
| **Audio** | Followed authors + hashtags | ≥ 6 minutes | Resume from position |
| **Music** | Followed authors + hashtags | < 6 minutes | Resume from position |

### Display Behavior (INTENDED)
- **Images**: Random shuffle, auto-advance carousel - good and intended
- **Videos**: Sequential order, user-controlled navigation - good and intended
- **Audio**: Resumes from last position - working, needs improvement
- **Music**: Resumes from last position - working, needs improvement

### Duration Classification Approach
**Dynamic classification on preload (NOT persisted to DB)**
- Fetch all audio from follows
- On preload: estimate duration from file headers/size
- If < 6min → add to "music" bucket
- If ≥ 6min → add to "audio" bucket
- If can't estimate → default to music (can filter out if too long on playback)
- Pros: No DB schema changes, always current
- Cons: Re-estimates each session (acceptable for TV use case)

## Settings UI
- [x] Image hashtag toggle (ON/OFF buttons)
- [x] Video hashtag toggle (ON/OFF buttons)
- [x] Music hashtag toggle (ON/OFF buttons) - Renamed to "Music Keyword Filtering"
- [x] Keyword search input (searches follows content)
- [x] Tag management (add/remove followed tags)
- [x] Extension detection and "Connect with Extension" button
- [x] Settings modal auto-refreshes feeds on close

## Playback Position Persistence
- [x] Video position saved to IndexedDB (`MadstrTvAppDB`)
- [x] Audio position saved to localStorage
- [x] Resume from position on next session
- [ ] Add "Clear seen videos" button in Settings
- [ ] Persist podcast/music position to IndexedDB (for consistency)

## User Session Management
- [x] NIP-46 QR code flow (Amber Signer compatibility)
- [x] NIP-46 paste flow (manual bunker URI)
- [x] Extension session (window.nostr - NIP-07)
- [x] Auto-restore extension session on page refresh
- [ ] Auto-restore NIP-46 bunker session on page refresh

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
- [ ] Fix MessageBoard prop mismatch (`onNewMessage` not in MessageBoardProps)

### Cache Management
- [x] Cache version bumped to clear old data on migration
- [x] Extension session clears old TV notes from cache
- [ ] Add cache clear button in Settings for debugging

## Future Improvements

### User Experience
1. **Navigation**
   - [ ] Add keyboard shortcuts for common actions
   - [ ] Improve remote control navigation
   - [ ] Add gesture controls for touch interfaces

2. **Content Discovery**
   - [x] Hashtag-based filtering UI (needs relay-level implementation)
   - [ ] **Add hashtag-only relay subscription for discovery**
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
- Display modes are intentional: images = random, videos = sequential

## Version Planning

### v0.2.0 (Completed)
- Loading state improvements
- Basic media playback
- Initial Nostr integration
- NIP-94 File Metadata support

### v0.3.0 (Current - IN PROGRESS)
- [x] Retry mechanisms for failed data fetches
- [x] Minimum video length filter (2 min)
- [x] Back-to-back video playback with sound
- [x] Hashtag toggles (Image/Video/Music) - ON/OFF buttons
- [x] Keyword search for follows
- [x] NIP-46 remote signing (QR + paste flow)
- [x] Extension detection and session management
- [x] Extension session auto-restore on page load
- [x] Video position persistence
- [x] Settings modal auto-refresh on close
- [x] **Hashtag-only relay subscription for discovery mode**
- [ ] Duration classification (music <6min, podcast ≥6min)
- [ ] **Add "Clear seen videos" button**

### v0.4.0 (PLANNED)
- [ ] Add cache clear button in Settings
- [ ] Podcast position persistence to IndexedDB
- [ ] Advanced content discovery
- [ ] Social features
- [ ] Performance optimizations
