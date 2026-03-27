import { useState, useEffect, useRef, useCallback } from 'react';
import NDK, { NDKEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk';
import { NostrNote } from '../types/nostr';
import { cacheMediaNotes, getCachedNotesByAuthors } from '../utils/mediaNoteCache';
import { HASHTAG_QUERY_RELAYS } from '../constants';
import { idb } from '../utils/idb';

// Media type for filtering
export type MediaType = 'audio' | 'video' | 'image';

// Minimum video duration in seconds (2 minutes)
export const MIN_VIDEO_DURATION_SECONDS = 120;

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Define hook props
interface UseMediaNotesProps {
    authors: string[];
    mediaType: MediaType;
    ndk: NDK | null;
    limit?: number;
    until?: number;
    followedTags?: string[];
    refreshKey?: number;
    mutedPubkeys?: string[];
}

// Define hook return value
interface UseMediaNotesReturn {
    notes: NostrNote[];
    isLoading: boolean;
    fetchOlderNotes?: () => void;
}

// Regexes for all media types
// Audio/video regexes allow format anywhere in URL - handles query params, fragments, etc.
const imageRegex = /https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp)/i;
const videoRegex = /https?:\/\/[^\s]*(?:mp4|mov|webm|m3u8)(?:\?[^\s]*)?/i;
const audioRegex = /https?:\/\/[^\s]*(?:mp3|m4a|ogg|aac|wav)(?:\?[^\s]*)?/i;

// Allowed hosts for hashtag discovery (Nostr-native Blossom servers)
const ALLOWED_BLOSSOM_HOSTS = [
  'blossom.primal.net',
  'blossom.nostrich.io',
  'blossom.nevent.ninja',
  'blossom.ditto.pub',
  'blossom.fiatjaf.com',
  'blossom.obsidian.vip',
  'blossom.band',
  'blossom.nostr.build',
  'cdn.nostrcheck.me',
  'nostrcheck.me',
  'cdn.satellite.earth',
  '24242.io',
  'blossom.azzamo.media',
  'blossom.yakihonne.com',
  'cdn.sovbit.host',
  'blossom.sector01.com',
  'loratu.bitcointxoko.com',
  'cdn.hzrd149.com',
  'blossom.poster.place',
  'blossom.uid.ovh',
  'blossom.nostr.hu',
  'blossom.nogood.studio',
  'files.v0l.io',
  'blossom.f7z.io',
  'nosto.re',
  'nostr.download',
];

// Check if URL is from allowed Blossom host
function isAllowedBlossomUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return ALLOWED_BLOSSOM_HOSTS.some(host => hostname === host || hostname.endsWith('.' + host));
  } catch {
    return false;
  }
}

// Unified kinds - fetch all media types in one subscription
const ALL_MEDIA_KINDS = [1, 1063, 31338, 34235, 34236];

// Helper to get URL Regex based on MediaType
function getUrlRegexForMediaType(mediaType: MediaType): RegExp {
    switch (mediaType) {
        case 'audio': return audioRegex;
        case 'video': return videoRegex;
        case 'image': return imageRegex;
        default: return imageRegex;
    }
}

// Define hook return value
interface UseMediaNotesReturn {
    notes: NostrNote[];
    isLoading: boolean;
    fetchOlderNotes?: () => void;
    markAsSeen?: (_noteId: string) => void;
}

export function useMediaNotes({
    authors,
    mediaType,
    ndk,
    limit = 200, // Default limit if not provided
    until,       // Use provided until timestamp
    followedTags, // <<< Destructure followedTags prop
    refreshKey = 0, // Key to trigger refresh
    mutedPubkeys = [], // Muted pubkeys to filter out
}: UseMediaNotesProps): UseMediaNotesReturn {
    const [notes, setNotes] = useState<NostrNote[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    // notesById now accumulates across fetches triggered by prop changes
    const notesById = useRef<Map<string, NostrNote>>(new Map());
    const currentSubscription = useRef<NDKSubscription | null>(null);
    const hashtagSubscription = useRef<NDKSubscription | null>(null);
    const isFetching = useRef<boolean>(false); // Prevent concurrent fetches
    const hashtagEoseReceived = useRef<boolean>(false);
    // Add refs to track previous dependency values
    const prevNdkRef = useRef<NDK | null>(ndk);
    const prevAuthorsRef = useRef<string[]>(authors);
    const prevMediaTypeRef = useRef<MediaType>(mediaType);
    const prevLimitRef = useRef<number>(limit);
    const prevUntilRef = useRef<number | undefined>(until);
    const prevFollowedTagsRef = useRef<string[] | undefined>(followedTags);
    // Seen notes tracking
    const seenNoteIds = useRef<Set<string>>(new Set());
    const seenNotesLoaded = useRef<boolean>(false);
    // Debounce timer for UI updates
    const updateUiTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // <<< Add logging for image type specifically >>>
    if (mediaType === 'image') {
        console.log("useMediaNotes (image): Hook rendering/re-rendering.", { authors, limit, until, followedTags });
    }

    // Load seen notes from IndexedDB on mount
    useEffect(() => {
        if (seenNotesLoaded.current) return;
        idb.getSeenNotes().then(seenSet => {
            seenNoteIds.current = seenSet;
            seenNotesLoaded.current = true;
            console.log(`useMediaNotes (${mediaType}): Loaded ${seenSet.size} seen notes`);
        }).catch(err => {
            console.error(`useMediaNotes (${mediaType}): Failed to load seen notes:`, err);
        });
    }, []);

    // Helper to sort notes with unseen first, then by recency
    const sortNotesWithUnseenFirst = useCallback((notesToSort: NostrNote[]): NostrNote[] => {
        return notesToSort.sort((a, b) => {
            const aSeen = seenNoteIds.current.has(a.id);
            const bSeen = seenNoteIds.current.has(b.id);
            if (aSeen !== bSeen) return aSeen ? 1 : -1;
            return b.created_at - a.created_at;
        });
    }, []);

    // Debounced UI update
    const scheduleUiUpdate = useCallback(() => {
        if (updateUiTimeout.current) {
            clearTimeout(updateUiTimeout.current);
        }
        updateUiTimeout.current = setTimeout(() => {
            const allNotes = Array.from(notesById.current.values());
            const sorted = sortNotesWithUnseenFirst(allNotes);
            setNotes(sorted);
            setIsLoading(false);
        }, 500);
    }, [sortNotesWithUnseenFirst]);

    const processEvent = useCallback((event: NDKEvent, _urlRegex: RegExp, type: MediaType): NostrNote | null => {
        const urlRegex = getUrlRegexForMediaType(type);
        if (type === 'image') {
            console.log(`processEvent (image): Checking event ${event.id}`, { content: event.content.substring(0, 100), tags: event.tags });
        }

        let mediaUrl: string | undefined;
        let foundVia: string | null = null;

        // --- Prioritize specific tags based on type --- 
        
        if (type === 'image') {
            // 1. Prioritize 'image' tag for images
            const imageTag = event.tags.find((t) => t[0] === 'image');
            if (imageTag && imageTag[1]?.match(urlRegex)) {
                mediaUrl = imageTag[1];
                foundVia = 'image tag';
            }
            // 2. Check 'url' tag for image types
            if (!mediaUrl) {
                 const urlTag = event.tags.find((t) => t[0] === 'url');
                 if (urlTag && urlTag[1]?.match(urlRegex)) {
                     mediaUrl = urlTag[1];
                     foundVia = 'url tag + image regex';
                 }
            }
            // 3. Check 'media' tag for image types
            if (!mediaUrl) {
                 const mediaTag = event.tags.find((t) => t[0] === 'media');
                 if (mediaTag && mediaTag[1]?.match(urlRegex)) {
                     mediaUrl = mediaTag[1];
                     foundVia = 'media tag + image regex';
                 }
            }
            // 4. Check for image MIME type ('m' tag) + associated 'url' tag
            if (!mediaUrl) {
                 const mimeTag = event.tags.find((t) => t[0] === 'm' && t[1]?.startsWith('image/'));
                 if (mimeTag) {
                     const associatedUrlTag = event.tags.find((t) => t[0] === 'url');
                     if (associatedUrlTag && associatedUrlTag[1]?.match(urlRegex)) {
                         mediaUrl = associatedUrlTag[1];
                         foundVia = 'm tag (image) + url tag';
                     }
                 }
            }
        } else if (type === 'video') {
            // Video logic (prioritizing mime type first, then url/media)
            const mimeTag = event.tags.find((t) => t[0] === 'm' && t[1]?.startsWith('video/'));
            if (mimeTag) {
                 foundVia = 'm tag (video)';
                 const urlTag = event.tags.find((t) => t[0] === 'url');
                 if (urlTag && urlTag[1]) { mediaUrl = urlTag[1]; foundVia += ' + url tag'; }
                 if (!mediaUrl) {
                     const mediaTag = event.tags.find((t) => t[0] === 'media');
                     if (mediaTag && mediaTag[1]) { mediaUrl = mediaTag[1]; foundVia += ' + media tag'; }
                 }
                 // Only fallback to content regex if video mime type was found but no URL tag
                 if (!mediaUrl) {
                     const genericUrlRegex = /https?:\/\/\S+/i;
                     const contentMatch = event.content.match(genericUrlRegex);
                     if (contentMatch) { mediaUrl = contentMatch[0]; foundVia += ' + content regex fallback'; }
                 }
            } else {
                 // Fallback checks if no video mime type
                 const urlTag = event.tags.find((t) => t[0] === 'url');
                 if (urlTag && urlTag[1]?.match(urlRegex)) { mediaUrl = urlTag[1]; foundVia = 'url tag + video regex'; }
                 if (!mediaUrl) {
                     const mediaTag = event.tags.find((t) => t[0] === 'media');
                     if (mediaTag && mediaTag[1]?.match(urlRegex)) { mediaUrl = mediaTag[1]; foundVia = 'media tag + video regex'; }
                 }
            }
        } else if (type === 'audio') {
            // Podcast logic - prioritize NIP-94 m tag with audio/*, then enclosure, url, media
            const mimeTag = event.tags.find((t) => t[0] === 'm' && t[1]?.startsWith('audio/'));
            if (mimeTag) {
                 foundVia = 'm tag (audio)';
                 const urlTag = event.tags.find((t) => t[0] === 'url');
                 if (urlTag && urlTag[1]) { mediaUrl = urlTag[1]; foundVia += ' + url tag'; }
                 if (!mediaUrl) {
                     const mediaTag = event.tags.find((t) => t[0] === 'media');
                     if (mediaTag && mediaTag[1]) { mediaUrl = mediaTag[1]; foundVia += ' + media tag'; }
                 }
                 // Fallback to content regex if mime type found but no URL tag
                 if (!mediaUrl) {
                     const genericUrlRegex = /https?:\/\/\S+/i;
                     const contentMatch = event.content.match(genericUrlRegex);
                     if (contentMatch) { mediaUrl = contentMatch[0]; foundVia += ' + content regex fallback'; }
                 }
            } else {
                 // Fallback: check enclosure, url, media tags with audio regex
                 const enclosureTag = event.tags.find((t) => t[0] === 'enclosure');
                 if (enclosureTag && enclosureTag[1]?.match(urlRegex)) { mediaUrl = enclosureTag[1]; foundVia = 'enclosure tag'; }
                 if (!mediaUrl) {
                      const urlTag = event.tags.find((t) => t[0] === 'url');
                      if (urlTag && urlTag[1]?.match(urlRegex)) { mediaUrl = urlTag[1]; foundVia = 'url tag + audio regex'; }
                 }
                 if (!mediaUrl) {
                      const mediaTag = event.tags.find((t) => t[0] === 'media');
                      if (mediaTag && mediaTag[1]?.match(urlRegex)) { mediaUrl = mediaTag[1]; foundVia = 'media tag + audio regex'; }
                 }
            }
        }

        // --- Fallback to content regex LAST for all types --- 
        // Note: URL might be on a new line, so we first extract any URL, then check if it matches our format
        if (!mediaUrl) {
            // Generic URL regex that matches URLs anywhere in content (including newlines)
            // Allows http/https URLs followed by non-whitespace chars
            const anyUrlRegex = /https?:\/\/[^\s<>"\]]+/gi;
            const allUrls = event.content.match(anyUrlRegex);
            
            if (type === 'audio' && allUrls === null) {
                console.log(`processEvent (audio): DEBUG - content has no URLs matched by regex. Content: "${event.content.substring(0, 150)}..."`);
            }
            
            if (allUrls) {
                for (const foundUrl of allUrls) {
                    // Check if this URL contains our media format
                    if (urlRegex.test(foundUrl)) {
                        mediaUrl = foundUrl;
                        foundVia = 'content URL + format check';
                        console.log(`processEvent (${type}): URL found via content fallback for event ${event.id}. URL: ${mediaUrl.substring(0, 80)}...`);
                        break;
                    }
                }
            }
            
            // Debug: show why we skipped if no URL found
            if (!mediaUrl && (type === 'image' || type === 'audio')) {
                console.log(`processEvent (${type}): No matching URL in content. Checked ${allUrls?.length || 0} URLs from content.`);
                if (allUrls && allUrls.length > 0) {
                    console.log(`  URLs found:`, allUrls.map(u => u.substring(0, 60)).join(', '));
                } else {
                    // Show actual content to debug why regex failed
                    console.log(`  Content: "${event.content.substring(0, 200)}..."`);
                    console.log(`  Raw content length: ${event.content.length}`);
                }
            }
        }

        // --- End of URL Finding Logic --- 

        if (!mediaUrl) {
            if (type === 'image') {
                console.log(`processEvent (image): Skipping event ${event.id} - No valid URL found in tags or content.`);
                console.log(`  Content: "${event.content.substring(0, 150)}..."`);
                console.log(`  Tags (${event.tags.length}):`, event.tags.map(t => `[${t[0]}]${t[1]?.substring(0, 50) || ''}`).join(', '));
            }
            if (type === 'audio') {
                console.log(`processEvent (audio): Skipping event ${event.id} - No valid audio URL found.`);
                console.log(`  Content: "${event.content.substring(0, 150)}..."`);
                console.log(`  Tags (${event.tags.length}):`, event.tags.map(t => `[${t[0]}]${t[1]?.substring(0, 50) || ''}`).join(', '));
            }
            if (type === 'video') {
                console.log(`processEvent (video): Skipping event ${event.id} - No valid video URL found.`);
                console.log(`  Content: "${event.content.substring(0, 150)}..."`);
                console.log(`  Tags (${event.tags.length}):`, event.tags.map(t => `[${t[0]}]${t[1]?.substring(0, 50) || ''}`).join(', '));
            }
            return null;
        } else {
            if (type === 'image') {
                 console.log(`processEvent (image): Found URL for event ${event.id} via ${foundVia}. URL: ${mediaUrl}`);
            }
            if (type === 'audio') {
                 console.log(`processEvent (audio): Found URL for event ${event.id} via ${foundVia}. URL: ${mediaUrl}`);
            }
        }

        // 2. Extract Metadata (Example)
        const title = event.tags.find(t => t[0] === 'title')?.[1];
        const summary = event.tags.find(t => t[0] === 'summary')?.[1];
        const image = event.tags.find(t => t[0] === 'image')?.[1]; // Cover art
        const duration = event.tags.find(t => t[0] === 'duration')?.[1];

        const note: NostrNote = {
            id: event.id,
            pubkey: event.pubkey,
            created_at: event.created_at ?? 0,
            kind: event.kind ?? 0,
            tags: event.tags,
            content: event.content,
            sig: event.sig || '',
            url: mediaUrl,
            posterPubkey: event.pubkey,
            // Add extracted metadata
            title: title,
            summary: summary,
            image: image,
            duration: duration,
        };
        return note;

    }, []); // No dependencies, it's a pure function based on args

    useEffect(() => {
        // --- Dependency Change Logging --- 
        const changedDeps: string[] = [];
        if (prevNdkRef.current !== ndk) changedDeps.push('ndk');
        // Shallow compare arrays for changes
        if (JSON.stringify(prevAuthorsRef.current) !== JSON.stringify(authors)) {
            changedDeps.push('authors');
            if (mediaType === 'image') {
                console.log(`useMediaNotes (image): ** Authors prop changed! ** Prev: ${prevAuthorsRef.current?.length ?? 0}, New: ${authors.length}`);
            }
        }
        if (prevMediaTypeRef.current !== mediaType) changedDeps.push('mediaType');
        if (prevLimitRef.current !== limit) changedDeps.push('limit');
        if (prevUntilRef.current !== until) changedDeps.push('until');
        if (JSON.stringify(prevFollowedTagsRef.current) !== JSON.stringify(followedTags)) changedDeps.push('followedTags');
        
        if (mediaType === 'image') {
             if (changedDeps.length > 0) {
                 console.log(`useMediaNotes (image): Effect triggered by changed dependencies:`, changedDeps.join(', '));
             }
             console.log(`useMediaNotes (image): Effect check`, { isFetching: isFetching.current, hasNdk: !!ndk, numAuthors: authors.length });
        }
        // Update previous value refs *after* comparison
        prevNdkRef.current = ndk;
        prevAuthorsRef.current = authors;
        prevMediaTypeRef.current = mediaType;
        prevLimitRef.current = limit;
        prevUntilRef.current = until;
        prevFollowedTagsRef.current = followedTags;
        // ---------------------------------

            // Check if authors changed significantly (different users, not just order)
        const authorsChanged = JSON.stringify(prevAuthorsRef.current) !== JSON.stringify(authors);
        if (authorsChanged) {
            console.log(`useMediaNotes (${mediaType}): Authors changed - clearing notes and resetting.`);
            notesById.current.clear();
            setNotes([]);
            isFetching.current = false; // Reset to allow new subscription
        }
        
        // Filter cached content by muted pubkeys
        if (mutedPubkeys && mutedPubkeys.length > 0) {
            console.log(`useMediaNotes (${mediaType}): Filtering by muted pubkeys:`, mutedPubkeys);
            // Filter already-fetched notes
            const filteredNotes = Array.from(notesById.current.values())
                .filter(note => !mutedPubkeys.includes(note.pubkey));
            if (filteredNotes.length !== notesById.current.size) {
                console.log(`useMediaNotes (${mediaType}): Filtered out ${notesById.current.size - filteredNotes.length} muted notes from cache`);
                notesById.current.clear();
                filteredNotes.forEach(note => notesById.current.set(note.id, note));
            }
        }

        // Debounce or prevent fetch if already fetching or no NDK/authors
        if (isFetching.current || !ndk || authors.length === 0) {
            // If no authors/ndk, clear state
            if (!ndk || authors.length === 0) {
                 setNotes([]);
                 notesById.current.clear(); // Clear map if authors/ndk removed
                 setIsLoading(false);
            }
            return; 
        }

        let isMounted = true;
        // Do NOT clear notesById.current here - we want to accumulate
        isFetching.current = true; // Mark as fetching

        const authorsList = authors;
        const kindsToFetch = ALL_MEDIA_KINDS; // Fetch all media kinds in one subscription
        const urlRegex = getUrlRegexForMediaType(mediaType);

        const fetchAndSubscribe = async () => {
            // ... cache check ...
            if (mediaType === 'image') {
                console.log(`useMediaNotes (image): Checking cache for ${authorsList.length} authors.`);
            }
            
            // --- IMMEDIATE: Load cache and display right away ---
            console.log(`useMediaNotes (${mediaType}): Loading cache...`);
            const cachedNotes = await getCachedNotesByAuthors(authorsList);
            console.log(`useMediaNotes (${mediaType}): Raw cached notes found: ${cachedNotes.length}`); 
            
            if (cachedNotes.length > 0) {
                const relevantCachedNotes: NostrNote[] = [];
                cachedNotes.forEach(note => {
                    // Double-check this note is from a current author (handles author switch)
                    if (!authorsList.includes(note.pubkey)) {
                        return;
                    }
                    // Filter for relevance (kind, matching URL regex for the *current* mediaType)
                    if (kindsToFetch.includes(note.kind) && note.url && note.url.match(urlRegex)) { 
                        if (!notesById.current.has(note.id)) {
                            notesById.current.set(note.id, note);
                            relevantCachedNotes.push(note);
                        }    
                    } 
                });
                
                if (relevantCachedNotes.length > 0) {
                    console.log(`useMediaNotes (${mediaType}): Displaying ${relevantCachedNotes.length} cached notes immediately.`);
                    // Apply hashtag filtering
                    let filteredNotes = Array.from(notesById.current.values());
                    if (followedTags && followedTags.length > 0) {
                        const lowerFollowedTags = followedTags.map(t => t.toLowerCase());
                        filteredNotes = filteredNotes.filter(note => {
                            const noteTags = note.tags
                                .filter(tag => tag[0] === 't')
                                .map(tag => tag[1]?.toLowerCase())
                                .filter(Boolean);
                            const contentHashtagRegex = /#(\w+)/g;
                            const contentTags: string[] = [];
                            let match;
                            while ((match = contentHashtagRegex.exec(note.content)) !== null) {
                                contentTags.push(match[1].toLowerCase());
                            }
                            const allNoteTags = [...new Set([...noteTags, ...contentTags])];
                            return allNoteTags.some(tag => lowerFollowedTags.includes(tag));
                        });
                    }
                    // Sort with unseen first
                    const sortedNotes = sortNotesWithUnseenFirst(filteredNotes);
                    // Display immediately - don't wait for relay
                    setNotes(sortedNotes);
                    setIsLoading(false);
                }
            }
            
            // --- Start relay subscription in background --- 
            
            // --- Subscription --- 
            const filter: NDKFilter = {
                kinds: kindsToFetch,
                authors: authorsList,
                limit: limit,
            };
            if (until !== undefined) {
                filter.until = until;
            }
            // Removed tag filtering - authors already filter content
            // Tag filtering can be added client-side later if needed for UI

            // <<< Moved logging after filter definition >>>
            if (mediaType === 'image') {
                 console.log(`useMediaNotes (image): Subscribing (Kinds: ${kindsToFetch}, Limit: ${limit}, Until: ${until ? new Date(until * 1000).toISOString() : 'N/A'})...`);
            }
            if (mediaType === 'audio') {
                 console.log(`useMediaNotes (audio): Subscribing (Kinds: ${kindsToFetch}, Limit: ${limit}, Authors: ${authorsList.length})...`);
                 console.log(`useMediaNotes (audio): Author hex values (first 5):`, authorsList.slice(0, 5));
            }
            
            // Helper to parse duration string to seconds
            const parseDuration = (duration: string): number => {
                const parts = duration.split(':').map(Number);
                if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
                if (parts.length === 2) return parts[0] * 60 + parts[1];
                return parseInt(duration) || 0;
            };

            // Stop previous subscription if it exists
            if (currentSubscription.current) {
                currentSubscription.current.stop();
            }
            
            // Retry state
            let retryCount = 0;
            let eoseReceived = false;

            const subscribe = () => {
                // Stop previous subscription if it exists
                if (currentSubscription.current) {
                    currentSubscription.current.stop();
                }
                
                console.log(`useMediaNotes (${mediaType}): Subscription attempt ${retryCount + 1}/${MAX_RETRIES}`);
                
                currentSubscription.current = ndk.subscribe(filter, { closeOnEose: false, groupable: false });

                currentSubscription.current.on('event', (event: NDKEvent) => {
                    // Verify this event is from the current authors list (handles author switch)
                    if (!authorsList.includes(event.pubkey)) {
                        console.log(`useMediaNotes (${mediaType}): Ignoring event from non-current-author: ${event.pubkey.substring(0, 16)}...`);
                        return;
                    }
                    
                    // Filter out muted pubkeys
                    if (mutedPubkeys.includes(event.pubkey)) {
                        console.log(`useMediaNotes (${mediaType}): Ignoring event from muted pubkey: ${event.pubkey.substring(0, 16)}...`);
                        return;
                    }
                    
                    if (mediaType === 'audio' || mediaType === 'image') {
                        console.log(`useMediaNotes (${mediaType}): Received event ${event.id} from pubkey ${event.pubkey.substring(0, 16)}..., kind ${event.kind}`);
                    }
                    const note = processEvent(event, urlRegex, mediaType);
                    if (note && !notesById.current.has(note.id)) {
                        // Apply minimum video duration filter
                        if (mediaType === 'video' && note.duration) {
                            const durationSeconds = parseDuration(note.duration);
                            if (durationSeconds < MIN_VIDEO_DURATION_SECONDS) {
                                console.log(`useMediaNotes (video): Skipping video ${note.id} - duration ${durationSeconds}s < ${MIN_VIDEO_DURATION_SECONDS}s minimum`);
                                return;
                            }
                        }
                        if (mediaType === 'image') {
                             console.log(`useMediaNotes (image): Adding new note ${note.id} from WS to internal map.`);
                        }
                        if (mediaType === 'audio') {
                             console.log(`useMediaNotes (audio): Adding new note ${note.id} to internal map. URL: ${note.url}`);
                        }
                        notesById.current.set(note.id, note);
                        // Trigger debounced UI update for new content
                        scheduleUiUpdate();
                    } else if (!note && mediaType === 'audio') {
                        console.log(`useMediaNotes (audio): Event ${event.id} processed but no valid audio URL found`);
                    }
                });

                currentSubscription.current.on('eose', () => {
                    eoseReceived = true;
                    retryCount = 0;
                    console.log(`useMediaNotes (${mediaType}): EOSE received. Total notes: ${notesById.current.size}`);
                    if (mediaType === 'audio') {
                        console.log(`useMediaNotes (audio): EOSE - Total notes collected: ${notesById.current.size}`);
                    }
                    let finalNotes = Array.from(notesById.current.values());
                    
                    // Apply minimum duration filter for videos
                    if (mediaType === 'video') {
                        finalNotes = finalNotes.filter(note => {
                            if (!note.duration) return true;
                            return parseDuration(note.duration) >= MIN_VIDEO_DURATION_SECONDS;
                        });
                    }
                    
                    // Apply hashtag filtering if followedTags is provided
                    if (followedTags && followedTags.length > 0) {
                        console.log(`useMediaNotes (${mediaType}): Filtering by hashtags:`, followedTags);
                        const lowerFollowedTags = followedTags.map(t => t.toLowerCase());
                        finalNotes = finalNotes.filter(note => {
                            // Get 't' tags from the note
                            const noteTags = note.tags
                                .filter(tag => tag[0] === 't')
                                .map(tag => tag[1]?.toLowerCase())
                                .filter(Boolean);
                            
                            // Also check content for hashtags
                            const contentHashtagRegex = /#(\w+)/g;
                            const contentTags: string[] = [];
                            let match;
                            while ((match = contentHashtagRegex.exec(note.content)) !== null) {
                                contentTags.push(match[1].toLowerCase());
                            }
                            
                            const allNoteTags = [...new Set([...noteTags, ...contentTags])];
                            
                            // Check if any note tag matches any followed tag
                            const hasMatchingTag = allNoteTags.some(tag => lowerFollowedTags.includes(tag));
                            
                            if (mediaType === 'image') {
                                console.log(`useMediaNotes (image): Note ${note.id} tags: ${allNoteTags.join(', ') || 'none'}, matches: ${hasMatchingTag}`);
                            }
                            
                            return hasMatchingTag;
                        });
                        console.log(`useMediaNotes (${mediaType}): After hashtag filtering: ${finalNotes.length} notes`);
                    }
                    
                    // Sort with unseen first
                    const sortedFinalNotes = sortNotesWithUnseenFirst(finalNotes);
                    if (isMounted) {
                        if (mediaType === 'image') {
                            console.log(`useMediaNotes (${mediaType}): Updating state with ${sortedFinalNotes.length} notes after EOSE.`);
                        }
                        // Clear any pending debounced update and set immediately
                        if (updateUiTimeout.current) {
                            clearTimeout(updateUiTimeout.current);
                            updateUiTimeout.current = null;
                        }
                        setNotes(sortedFinalNotes);
                        setIsLoading(false);
                        isFetching.current = false;
                    }
                    console.log(`useMediaNotes (${mediaType}): Caching ${finalNotes.length} notes after EOSE.`);
                    cacheMediaNotes(finalNotes).catch(error => {
                         console.error(`useMediaNotes (${mediaType}): Error caching notes after EOSE:`, error);
                    });
                });

                currentSubscription.current.on('close', () => {
                    console.log(`useMediaNotes (${mediaType}): Subscription closed.`);
                    if (!eoseReceived && retryCount < MAX_RETRIES) {
                        retryCount++;
                        console.log(`useMediaNotes (${mediaType}): Retrying in ${RETRY_DELAY_MS}ms (${retryCount}/${MAX_RETRIES})`);
                        setTimeout(() => {
                            if (isMounted && !eoseReceived) subscribe();
                        }, RETRY_DELAY_MS);
                    } else if (!eoseReceived) {
                        console.warn(`useMediaNotes (${mediaType}): Max retries reached.`);
                        if (isMounted) {
                            setIsLoading(false);
                            isFetching.current = false;
                        }
                    }
                });
            };

            subscribe();

            // --- Hashtag Discovery Subscription ---
            // Create separate subscription for hashtag-based discovery (no author restriction)
            console.log(`useMediaNotes (${mediaType}): Hashtag check - tags:`, followedTags, 'current sub:', hashtagSubscription.current ? 'exists' : 'null');
            
            // Stop existing subscription if hashtags are disabled
            if ((!followedTags || followedTags.length === 0) && hashtagSubscription.current) {
                console.log(`useMediaNotes (${mediaType}): Stopping hashtag subscription (hashtags disabled)`);
                hashtagSubscription.current.stop();
                hashtagSubscription.current = null;
            }
            
            if (followedTags && followedTags.length > 0 && hashtagSubscription.current === null) {
                console.log(`useMediaNotes (${mediaType}): Creating hashtag discovery subscription for relays:`, HASHTAG_QUERY_RELAYS, 'tags:', followedTags);
                
                hashtagEoseReceived.current = false;
                
                const hashtagFilter: NDKFilter = {
                    kinds: kindsToFetch,
                    '#t': followedTags,
                    limit: 200,
                };
                
                hashtagSubscription.current = ndk.subscribe(hashtagFilter, { 
                    closeOnEose: false, 
                    groupable: false,
                    relayUrls: HASHTAG_QUERY_RELAYS 
                });

                hashtagSubscription.current.on('event', (event: NDKEvent) => {
                    console.log(`useMediaNotes (${mediaType}): [HASHTAG] EVENT - kind: ${event.kind}, id: ${event.id.substring(0,16)}`);
                    
                    // Filter out muted pubkeys
                    if (mutedPubkeys.includes(event.pubkey)) {
                        console.log(`useMediaNotes (${mediaType}): [HASHTAG] Ignoring event from muted pubkey: ${event.pubkey.substring(0, 16)}...`);
                        return;
                    }
                    
                    if (mediaType === 'image' || mediaType === 'video') {
                        // Check all possible URL sources
                        const imageTag = event.tags.find(t => t[0] === 'image');
                        const urlTag = event.tags.find(t => t[0] === 'url');
                        const mediaTag = event.tags.find(t => t[0] === 'media');
                        const enclosureTag = event.tags.find(t => t[0] === 'enclosure');
                        
                        let foundBlossomUrl: string | null = null;
                        
                        // Check proper media tags first
                        const tagUrls = [imageTag?.[1], urlTag?.[1], mediaTag?.[1], enclosureTag?.[1]].filter(Boolean);
                        for (const url of tagUrls) {
                            if (url && isAllowedBlossomUrl(url)) {
                                foundBlossomUrl = url;
                                break;
                            }
                        }
                        
                        // For kind 1 text notes, try regex on content
                        if (!foundBlossomUrl && event.kind === 1 && event.content) {
                            const contentUrl = event.content.match(/https?:\/\/[^\s<>"\]]+/i)?.[0];
                            if (contentUrl && isAllowedBlossomUrl(contentUrl)) {
                                foundBlossomUrl = contentUrl;
                                console.log(`useMediaNotes (${mediaType}): [HASHTAG] Found Blossom URL in content: ${contentUrl.substring(0, 50)}`);
                            }
                        }
                        
                        if (!foundBlossomUrl) {
                            console.log(`useMediaNotes (${mediaType}): [HASHTAG] Skipping - no Blossom URL (tags had: ${tagUrls.join(', ') || 'none'})`);
                            return;
                        }
                        console.log(`useMediaNotes (${mediaType}): [HASHTAG] ✓ Blossom URL: ${foundBlossomUrl.substring(0, 50)}`);
                    }
                    
                    if (mediaType === 'image') {
                        console.log(`useMediaNotes (${mediaType}): [HASHTAG] Received event ${event.id} (kind ${event.kind}) from pubkey ${event.pubkey.substring(0, 16)}...`);
                    }
                    const note = processEvent(event, urlRegex, mediaType);
                    if (note && !notesById.current.has(note.id)) {
                        // Verify the found URL is from Blossom (not from regex fallback)
                        if (mediaType === 'image' || mediaType === 'video') {
                            if (!note.url || !isAllowedBlossomUrl(note.url)) {
                                console.log(`useMediaNotes (${mediaType}): [HASHTAG] Skipping - URL not from Blossom: ${note.url?.substring(0, 50)}`);
                                return;
                            }
                        }
                        // For videos in hashtag mode: only accept if URL was found via tags, NOT content regex fallback
                        if (mediaType === 'video') {
                            // Check if URL was found via content regex (not via tags)
                            // If it was found via content regex, skip it for hashtag mode
                            const urlTag = event.tags.find(t => t[0] === 'url');
                            const mediaTag = event.tags.find(t => t[0] === 'media');
                            const enclosureTag = event.tags.find(t => t[0] === 'enclosure');
                            const hasVideoTag = urlTag?.[1] || mediaTag?.[1] || enclosureTag?.[1];
                            
                            if (!hasVideoTag) {
                                console.log(`useMediaNotes (${mediaType}): [HASHTAG] Skipping video - no tag URL found (content regex not allowed for hashtag mode)`);
                                return;
                            }
                        }
                        if (mediaType === 'video' && note.duration) {
                            const durationSeconds = parseDuration(note.duration);
                            if (durationSeconds < MIN_VIDEO_DURATION_SECONDS) {
                                return;
                            }
                        }
                        notesById.current.set(note.id, note);
                        if (mediaType === 'image') {
                            console.log(`useMediaNotes (${mediaType}): [HASHTAG] Added note ${note.id} to map. Total: ${notesById.current.size}`);
                        }
                        // Trigger debounced UI update for new content
                        scheduleUiUpdate();
                    }
                });

                hashtagSubscription.current.on('eose', () => {
                    console.log(`useMediaNotes (${mediaType}): [HASHTAG] EOSE received from hashtag subscription. Total notes: ${notesById.current.size}`);
                    hashtagEoseReceived.current = true;
                    
                    // Final update with all collected notes
                    let finalNotes = Array.from(notesById.current.values());
                    
                    if (mediaType === 'video') {
                        finalNotes = finalNotes.filter(note => {
                            if (!note.duration) return true;
                            return parseDuration(note.duration) >= MIN_VIDEO_DURATION_SECONDS;
                        });
                    }
                    
                    // Sort with unseen first
                    const sortedFinalNotes = sortNotesWithUnseenFirst(finalNotes);
                    if (isMounted) {
                        // Clear any pending debounced update and set immediately
                        if (updateUiTimeout.current) {
                            clearTimeout(updateUiTimeout.current);
                            updateUiTimeout.current = null;
                        }
                        setNotes(sortedFinalNotes);
                        setIsLoading(false);
                        isFetching.current = false;
                    }
                    cacheMediaNotes(finalNotes).catch(error => {
                        console.error(`useMediaNotes (${mediaType}): Error caching notes from hashtag subscription:`, error);
                    });
                });

                hashtagSubscription.current.on('close', () => {
                    console.log(`useMediaNotes (${mediaType}): [HASHTAG] Subscription closed.`);
                    if (!hashtagEoseReceived.current) {
                        hashtagSubscription.current = null; // Allow retry
                    }
                });
            }
        };

        fetchAndSubscribe().catch(err => {
            console.error(`useMediaNotes (${mediaType}): Error fetching notes:`, err);
            if (isMounted) {
                 setIsLoading(false);
                 isFetching.current = false; // Mark fetching complete on error
            }
        });

        // Cleanup
        return () => {
            isMounted = false;
            // Clear any pending UI update
            if (updateUiTimeout.current) {
                clearTimeout(updateUiTimeout.current);
                updateUiTimeout.current = null;
            }
            if (currentSubscription.current) {
                console.log(`useMediaNotes (${mediaType}): Cleaning up subscription.`);
                currentSubscription.current.stop();
                currentSubscription.current = null;
            }
            if (hashtagSubscription.current) {
                console.log(`useMediaNotes (${mediaType}): Cleaning up hashtag subscription.`);
                hashtagSubscription.current.stop();
                hashtagSubscription.current = null;
            }
            isFetching.current = false; // Ensure fetching flag is reset if component unmounts during fetch
        };
    // Re-run effect if ndk, authors, mediaType, limit, until, followedTags, or refreshKey changes
    }, [ndk, authors, mediaType, limit, until, followedTags, refreshKey, processEvent, sortNotesWithUnseenFirst, scheduleUiUpdate]);

    // <<< Log return value >>>
    if (mediaType === 'image') {
        console.log(`useMediaNotes (image): Returning state`, { notesLength: notes.length, isLoading });
    }
    
    // Mark a note as seen
    const markAsSeen = useCallback((noteId: string) => {
        if (!seenNoteIds.current.has(noteId)) {
            seenNoteIds.current.add(noteId);
            idb.markNoteAsSeen(noteId).catch(err => {
                console.error(`useMediaNotes (${mediaType}): Failed to persist seen status:`, err);
            });
            // Re-sort notes to put newly seen note at the bottom
            const currentNotes = Array.from(notesById.current.values());
            const sorted = sortNotesWithUnseenFirst(currentNotes);
            setNotes(sorted);
        }
    }, [sortNotesWithUnseenFirst]);
    
    return {
        notes,
        isLoading,
        markAsSeen,
    };
} 