# Audio Loading Debug Document

## Known Working Test Event

```
Event ID: 0eb1786f60f8c192269eb4b81cecc473375fbf82f553c4ae96d1e258e4e6d1a8
Pubkey: 9bde421491f3ead1ac21bd1d01667aab947f4c1c4aed87624cf2273b06ca052b
Kind: 1
Content: https://haven.sovereignengineering.io/e256db47fb840f116395e36ddb9dee41b17ac884602b2fdb028d056db00d1956.m4a
Tags: [["t","nosolutions"],["client","noStrudel",...]]
```

This event exists on relays and was confirmed working in noStrudel.

## What Was Tested

1. **Tag filtering removed** - Tags no longer filter subscription results (OR/AND issues)
2. **Hardcoded test pubkey** - Added author to mediaAuthors, still "No audio found"
3. **Video works perfectly** - Videos auto-start with sound, back-to-back playback works

## Possible Issues to Investigate

### 1. Subscription Not Reaching Relays
- Check if `ndk.subscribe()` is actually firing events
- Verify relay connectivity for this specific author
- **Fix**: Add logging at subscription start to confirm sub ID

### 2. Event Processing Skipping Valid Events
The `processEvent` function has multiple URL extraction paths:
```
NIP-94 m tag (audio/*) → url tag → media tag → content regex fallback
enclosure tag → url tag → media tag → audio regex
```
- **Fix**: Confirm which path the test event takes
- The test event has NO special tags, relies on content regex

### 3. URL Regex Not Matching
```typescript
const audioRegex = /https?:\/\/\S+\.(?:mp3|m4a|ogg|aac|wav)/i;
```
The test event URL is `.m4a` - verify this matches.

### 4. State Not Updating UI
- `useMediaNotes` returns notes → `useMediaState` processes them → `MediaPanel` displays
- Check if state is updating but not rendering

### 5. Wrong `mediaType` Being Used
Audio hook uses `mediaType: 'audio'` but something might be checking for 'podcast'

## Debugging Steps

### Step 1: Add Subscription Confirmation Log
In `useMediaNotes.ts`, after `ndk.subscribe()`:
```typescript
console.log(`useMediaNotes (${mediaType}): Subscription created. Sub ID:`, sub?.subId);
```

### Step 2: Add Event Receipt Log
```typescript
currentSubscription.current.on('event', (event: NDKEvent) => {
    console.log(`useMediaNotes (${mediaType}): RAW EVENT RECEIVED`, {
        id: event.id,
        kind: event.kind,
        pubkey: event.pubkey,
        content: event.content.substring(0, 100),
        tags: event.tags
    });
```

### Step 3: Verify URL Extraction
```typescript
console.log(`Audio regex test: ${audioRegex.test(testUrl)}`);
```

### Step 4: Check State Flow
Add logs at each step:
- `useMediaNotes` returns → `audioNotes.length`
- `useMediaState` effect runs → `audioNotes.length`
- `MediaPanel` receives → `audioNotes.length`

## Quick Fixes to Try

1. **Remove all filtering** - Even author filtering, just fetch all events
2. **Lower limit** - Try `limit: 10` instead of `limit: 25`
3. **Test with different URL formats** - .mp3 vs .m4a
4. **Check IndexedDB** - Is cached data interfering?
5. **Verify NDK singleton** - Is `ndkInstance` properly initialized?

## Files to Check

- `src/hooks/useMediaNotes.ts` - Subscription and URL extraction
- `src/hooks/useMediaState.ts` - State management
- `src/components/MediaPanel.tsx` - UI display
- `src/hooks/useMediaAuthors.ts` - Author list generation
