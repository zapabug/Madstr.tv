# Media URL Extraction from Kind 1 Notes

## Overview

Nostr Kind 1 notes (text events) often contain media URLs embedded in the content. This document explains how the TV app extracts and processes media URLs from these notes.

## The Challenge

Kind 1 notes have no standardized media tags. Content looks like:

```
"Just recorded this episode!\nhttps://example.com/podcast.mp3\n#podcast"
```

The URL can appear anywhere in the content:
- On the same line as text
- On a new line
- At the end after hashtags
- Mixed with other URLs (images, links, etc.)

## URL Extraction Strategy

### Priority Order

1. **Media Tags** (for structured events like Kind 1063)
   - `url` tag - NIP-94 file metadata
   - `media` tag - Alternative media location
   - `enclosure` tag - Podcast RSS-style enclosure
   - `image` tag - Preview/thumbnail
   - `m` tag - MIME type with associated URL

2. **Content Fallback** (for plain Kind 1 notes)
   - Extract any URL from content
   - Verify it matches expected media format
   - Accept if format extension found

### Two-Step Content Extraction

```typescript
// Step 1: Extract any URL from content (including newlines)
const anyUrlRegex = /https?:\/\/[^\s<>"\]]+/gi;
const allUrls = event.content.match(anyUrlRegex);

// Step 2: Check each URL for media format
for (const foundUrl of allUrls) {
    if (audioRegex.test(foundUrl)) {
        // Found audio URL
    }
}
```

## Media Format Regexes

### Image
```typescript
/\.png|\.jpg|\.jpeg|\.gif|\.webp/ix
```
Images typically have extensions at end of URL.

### Video
```typescript
/https?:\/\/[^\s]*(?:\.mp4|\.mov|\.webm|\.m3u8)(?:\?[^\s]*)?/ix
```
- Allows query params (e.g., `?token=abc`)
- Allows paths before extension

### Audio
```typescript
/https?:\/\/[^\s]*(?:\.mp3|\.m4a|\.ogg|\.aac|\.wav)(?:\?[^\s]*)?/ix
```
- Same pattern as video
- Handles streaming URLs with query params

## Hashtag Discovery vs Follows Mode

### Follows Mode (Author-Based)
- Uses Kind 3 contact list to get followed authors
- Subscribes to those authors' events
- **Full URL extraction**: Content regex fallback enabled
- Shows all media from followed users

### Hashtag Discovery Mode (Relay Queries)
- Queries relays with `#t` tag filter
- Gets events from ANY author with that hashtag
- **Strict filtering**:
  - Images/Videos: Only Blossom-hosted content
  - Videos: Only tag-based URLs (no content regex fallback)
  - Audio: Full URL extraction enabled
- Prevents spam and ensures quality content

## Why Audio Gets Full Content Extraction

Audio content is different from images/videos:

1. **No Tracking Concerns**: Unlike Twitter video embeds, audio streaming URLs don't carry cross-site tracking cookies
2. **Self-Hosting**: Podcasters typically self-host on their own domains (not Blossom)
3. **Format Variety**: Audio URLs often have query params, tokens, or unusual formats

## Common Audio URL Patterns

### Standard File
```
https://example.com/podcast.mp3
https://cdn.provider.com/audio/episode-42.m4a
```

### With Query Params
```
https://example.com/audio.mp3?token=abc123&expires=123456
https://cdn.provider.com/file.m4a?signature=xyz
```

### Self-Hosted
```
https://haven.sovereignengineering.io/episode-id.m4a
https://podcaster.example/e256db47fb840f...m4a
```

### CDN with Paths
```
https://cdn.hosting-provider.com/user-id/filename.mp3
https://blobs.storage.svc/containers/audio/file.ogg
```

## Debugging URL Extraction

Enable console logging to see extraction process:

```typescript
// In processEvent function
console.log(`processEvent (${type}): Content: "${event.content.substring(0, 150)}..."`);
console.log(`processEvent (${type}): URLs found:`, allUrls);
console.log(`processEvent (${type}): URL found via ${foundVia}. URL: ${mediaUrl}`);
```

## Limitations

1. **URLs must start with `http://` or `https://`**
2. **No support for IPFS/LNURL media** (yet)
3. **No markdown link parsing** (`[text](url)` format)
4. **No relative URLs** - must be absolute URLs

## Future Improvements

- [ ] Add IPFS URL support
- [ ] Parse markdown-style links `[text](url)`
- [ ] Support for audio streaming formats (HLS, DASH)
- [ ] LNURL micropayment media support
