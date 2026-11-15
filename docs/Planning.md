# Development Planning Document

## Current Development Focus

### Own audio sources (feat-own-audio, branch `feat/own-audio`)
- [x] RSS feeds and local music folders feed the audio list (see `feat-own-audio.md`)
- [ ] Device-test the folder picker and local playback
- [ ] Next feat: Wavlake / Nostr music intake on top of this list

### Audio Discovery Issues (OPEN)
- [ ] **Images being detected as audio** - URL extraction returning image URLs (.jpg, .png, .webp) for audio notes
- [ ] **Few audio events from follows** - Most followed users post images/videos, not audio files
- [ ] **Audio URL regex issues** - Need to verify regex correctly filters non-audio URLs
- [ ] **Audio playback was muted by default** - Fixed: audio now unmutes on play
- [ ] **Limited audio discovery** - Relays not returning many audio files from followed users

**Root Cause**: Most Nostr content is images/videos. Audio files on Nostr are rare - most podcasters don't cross-post to Nostr kind:1 events.

**Potential Solutions**:
1. Query relays directly for kind:1 events with audio extensions (no author filter)
2. Use known podcast hosts as fallback (fountain.fm, anchor.fm, etc.)
3. Filter by NIP-94 events (kind 1063) which are structured audio metadata
4. Accept that Nostr audio is rare and focus on hashtag discovery

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
- [x] Expanded hashtag query relays (10 relays for better discovery)

### Content Discovery & Responsiveness
- [x] 10 relays for hashtag queries (was 3)
- [x] Show cache immediately on load (no loading spinner if cache exists)
- [x] Debounced UI updates (500ms) for smooth content merging
- [x] Seen notes tracking in IndexedDB
- [x] Unseen content prioritized in display (unseen first, then by recency)
- [x] Mark notes as seen on playback start

### UI Components
- [x] InfoPanel (replaces MessageBoard + AuthorSelector)
  - Logged out: Shows "press # to access settings ← bottom left"
  - Logged in: Author (5 chars/npub) + note content preview (2-3 lines)
- [x] nevent QR codes on ImageFeed and VideoPlayer (opens note in external app)
- [x] Profile images on ImageFeed and VideoPlayer (top-left)
- [x] Relay status shows actual connected count (not static)
- [x] Removed reply QR code from main UI

### NIP-46 Session Management
- [x] Generate connect URI for QR code flow
- [x] Parse bunker URIs (bunker:// and nostrconnect://)
- [x] Manual handshake implementation (bypasses buggy NDK blockUntilReady)
- [x] Session persistence via IndexedDB
- [x] Session restoration on app load

### Content Filtering Architecture

#### Hashtag Discovery (WORKING v0.3.x)
```
When hashtags enabled:
- Subscription 1 (Author-based): { kinds: ALL_MEDIA_KINDS, authors: authorsList, limit: 100 }
- Subscription 2 (Hashtag discovery): { kinds: ALL_MEDIA_KINDS, "#t": ["tag1"], limit: 200 }
  ^ NO author restriction - full relay discovery

Results merged and deduplicated by note ID.
```

#### Hashtag Query Relays (10 relays for better coverage)
```typescript
const HASHTAG_QUERY_RELAYS = [
  'wss://relay.primal.net',
  'wss://nostr.wine',
  'wss://relay.bitcoiner.social',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://purplepag.es',
  'wss://relay.nostr.band',
  'wss://relay.snort.social',
  'wss://e.nu.zone',
  'wss://relay.olas.app',
];
```

#### Hashtag Discovery Content Filter
For hashtag discovery, we **only accept content from Nostr-native Blossom servers** to:
- Avoid Twitter/centralized CDN tracking
- Force Nostr-native media hosting
- Clean content for TV display

```typescript
const ALLOWED_BLOSSOM_HOSTS = [
  'blossom.primal.net', 'blossom.band', 'cdn.nostrcheck.me',
  'cdn.satellite.earth', '24242.io', 'blossom.azzamo.media',
  'blossom.yakihonne.com', 'cdn.sovbit.host', 'blossom.sector01.com',
  'blossom.poster.place', 'blossom.uid.ovh', 'blossom.nostr.hu',
  'blossom.nogood.studio', 'files.v0l.io', 'nosto.re', 'nostr.download',
  // plus: nostrich.io, nevent.ninja, ditto.pub, fiatjaf.com, obsidian.vip
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
| **Images** | Followed authors + hashtags (Blossom only) | N/A | Random carousel (intended) |
| **Videos** | Followed authors + hashtags (Blossom only) | ≥ 2 minutes | Sequential, NOT random |
| **Audio** | Followed authors + hashtags | ≥ 6 minutes | Resume from position |
| **Music** | Followed authors + hashtags | < 6 minutes | Resume from position |

### Display Behavior (INTENDED)
- **Images**: Random shuffle, auto-advance carousel - good and intended
- **Videos**: Sequential order, user-controlled navigation - good and intended
- **Audio**: Resumes from last position - FIXED: unmutes on play, needs more audio content
- **Music**: Resumes from last position - FIXED: unmutes on play, needs more audio content

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
- [x] Add "Clear seen videos" button in Settings
- [ ] Persist podcast/music position to IndexedDB (for consistency)

## User Session Management
- [x] NIP-46 QR code flow (Amber Signer compatibility)
- [x] NIP-46 paste flow (manual bunker URI)
- [x] Extension session (window.nostr - NIP-07)
- [x] Auto-restore extension session on page refresh
- [ ] Auto-restore NIP-46 bunker session on page refresh

### Mute List (Kind 10000)
- [x] Fetch mute list from user's Kind 10000 events on login
- [x] Filter cached and new content by muted pubkeys
- [x] Auto-refresh feeds when mute list changes
- **Flow**: TV reads Kind 10000 from relays to get muted pubkeys
- **Usage**: User mutes people on phone (via Amber or any Nostr app), TV picks up the mute list automatically

## Technical Debt / Cleanup

### Unused Files (REMOVED)
- [x] `src/hooks/VideoFeed.tsx` - **REMOVED**
- [x] `src/hooks/usePodcastNotes.ts` - **REMOVED**
- [x] `src/components/InteractivePanel.tsx` - **REMOVED**
- [x] `src/components/Podcastr.tsx` - **REMOVED**
- [x] `src/components/VideoList.tsx` - **REMOVED**
- [x] `src/components/MessageBoard.tsx` - **REMOVED** (replaced by InfoPanel)
- [x] `src/components/AuthorSelector.tsx` - **REMOVED** (replaced by InfoPanel)

### Dead Code
- [x] Remove unused regex declarations in `useMediaState.ts` (imageRegex, videoRegex, audioRegex)
- [ ] Remove `docs/podcastr.md` (outdated documentation)

### Lint Cleanup (Completed v0.3.x)
- [x] Fix all unused variable warnings in App.tsx
- [x] Fix all unused variable warnings in ImageFeed.tsx
- [x] Fix all unused variable warnings in MediaPanel.tsx
- [x] Fix all unused variable warnings in SettingsModal.tsx
- [x] Fix all unused variable warnings in VideoPlayer.tsx
- [x] Fix all unused variable warnings in useAuth.ts
- [x] Fix all unused variable warnings in useKeyboardControls.ts
- [x] Fix all unused variable warnings in useMediaState.ts
- [x] Fix all unused variable warnings in useProfileData.ts
- [x] Fix all unused variable warnings in useMediaElementPlayback.ts
- [x] Fix all unused variable warnings in useMediaNotes.ts
- [x] Fix nostr.ts parsing error (emoji in property name)
- [x] Remove unused RELAYS import from main.tsx
- [x] Configure eslint to allow underscore-prefixed unused parameters

### Kind 1 URL Extraction Fix (v0.3.x)
- [x] Audio URLs now detected from Kind 1 content (including newlines)
- [x] Two-step extraction: find URL, then check format
- [x] Video hashtag mode: only tag-based URLs (no content regex fallback)
- [x] Audio: full content URL extraction enabled
- [x] Added debug logging for URL extraction troubleshooting

### Cache Management
- [x] Cache version bumped to clear old data on migration
- [x] Extension session clears old TV notes from cache
- [x] Add cache clear button in Settings for debugging

## Future Improvements

### User Experience
1. **Navigation**
   - [ ] Add keyboard shortcuts for common actions
   - [x] **Fullscreen exit issue** - Fixed stale closure by using ref for isFullScreen check
   - [ ] Add gesture controls for touch interfaces

2. **Content Discovery**
   - [x] Hashtag-based filtering UI (relay-level implementation working)
   - [x] Hashtag-only relay subscription for discovery
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
- Hashtag discovery ONLY accepts Blossom-hosted content (Nostr-native)
- Mute list synced automatically from user's Kind 10000 events

## Version Planning

### v0.2.0 (Completed)
- Loading state improvements
- Basic media playback
- Initial Nostr integration
- NIP-94 File Metadata support

### v0.3.0 (Current - COMPLETED)
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
- [x] Hashtag-only relay subscription for discovery mode
- [x] Blossom-only content filter for hashtag discovery
- [x] Mute list filtering (Kind 10000)
- [x] Duration classification (music <6min, podcast ≥6min)
- [x] Add "Clear seen videos" button

### v0.4.0 (PLANNED)
- [ ] Podcast position persistence to IndexedDB
- [ ] **Audio content discovery improvements** - query relays directly for audio files
- [ ] Social features
- [ ] Performance optimizations
