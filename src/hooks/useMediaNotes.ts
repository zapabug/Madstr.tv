import { useState, useEffect, useRef, useCallback } from 'react';
import NDK, { NDKEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk';
import { NostrNote } from '../types/nostr';
import { cacheMediaNotes, getCachedNotesByAuthors } from '../utils/mediaNoteCache';

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
}

// Define hook return value
interface UseMediaNotesReturn {
    notes: NostrNote[];
    isLoading: boolean;
    fetchOlderNotes?: () => void;
}

// Regexes for all media types
const imageRegex = /https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp)/i;
const videoRegex = /https?:\/\/\S+\.(?:mp4|mov|webm|m3u8)/i;
const audioRegex = /https?:\/\/\S+\.(?:mp3|m4a|ogg|aac|wav)/i;

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
}

export function useMediaNotes({
    authors,
    mediaType,
    ndk,
    limit = 200, // Default limit if not provided
    until,       // Use provided until timestamp
    followedTags, // <<< Destructure followedTags prop
}: UseMediaNotesProps): UseMediaNotesReturn {
    const [notes, setNotes] = useState<NostrNote[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    // notesById now accumulates across fetches triggered by prop changes
    const notesById = useRef<Map<string, NostrNote>>(new Map());
    const currentSubscription = useRef<NDKSubscription | null>(null);
    const isFetching = useRef<boolean>(false); // Prevent concurrent fetches
    // Add refs to track previous dependency values
    const prevNdkRef = useRef<NDK | null>(ndk);
    const prevAuthorsRef = useRef<string[]>(authors);
    const prevMediaTypeRef = useRef<MediaType>(mediaType);
    const prevLimitRef = useRef<number>(limit);
    const prevUntilRef = useRef<number | undefined>(until);
    const prevFollowedTagsRef = useRef<string[] | undefined>(followedTags);

    // <<< Add logging for image type specifically >>>
    if (mediaType === 'image') {
        console.log("useMediaNotes (image): Hook rendering/re-rendering.", { authors, limit, until, followedTags });
    }

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
        if (!mediaUrl) {
            const contentMatch = event.content.match(urlRegex);
            if (contentMatch) {
                mediaUrl = contentMatch[0];
                foundVia = 'content regex fallback';
                console.log(`processEvent (${type}): URL found via CONTENT REGEX fallback for event ${event.id}`);
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
        let changedDeps: string[] = [];
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
        setIsLoading(true);
        isFetching.current = true; // Mark as fetching
        // Don't clear displayed notes immediately unless authors/type changed significantly?
        // Maybe only clear if until is undefined (meaning a fresh load)?
        // For simplicity, let's keep existing notes displayed while loading more.

        const authorsList = authors;
        const kindsToFetch = ALL_MEDIA_KINDS; // Fetch all media kinds in one subscription
        const urlRegex = getUrlRegexForMediaType(mediaType);

        const fetchAndSubscribe = async () => {
            // ... cache check ...
            if (mediaType === 'image') {
                console.log(`useMediaNotes (image): Checking cache for ${authorsList.length} authors.`);
                // Add more detail on cache results if needed
            }
            
            // --- Cache Check (Always read and merge) ---
            console.log(`useMediaNotes (${mediaType}): Checking cache for ${authorsList.length} authors.`);
            // <<< Always try to load from cache >>>
            const cachedNotes = await getCachedNotesByAuthors(authorsList);
            console.log(`useMediaNotes (${mediaType}): Raw cached notes found: ${cachedNotes.length}`); 
            const relevantCachedNotes: NostrNote[] = [];
            let newNotesAddedFromCache = false;
            if (cachedNotes.length > 0) {
                cachedNotes.forEach(note => {
                    // Filter for relevance (kind, matching URL regex for the *current* mediaType)
                    if (kindsToFetch.includes(note.kind) && note.url && note.url.match(urlRegex)) { 
                        if (!notesById.current.has(note.id)) {
                            notesById.current.set(note.id, note);
                            relevantCachedNotes.push(note);
                            newNotesAddedFromCache = true;
                        }    
                    } 
                });
                if (newNotesAddedFromCache) {
                    console.log(`useMediaNotes (${mediaType}): Added ${relevantCachedNotes.length} relevant notes from cache to map.`); 
                    // <<< Update UI immediately with combined notes from map >>>
                    const allNotesFromMap = Array.from(notesById.current.values());
                    const sortedNotes = allNotesFromMap.sort((a, b) => b.created_at - a.created_at);
                    if (isMounted) {
                        console.log(`useMediaNotes (${mediaType}): Updating state immediately with ${sortedNotes.length} notes from cache/map.`);
                        setNotes(sortedNotes); 
                        // Maybe set isLoading false briefly if only cache was hit?
                        // setIsLoading(false); // Consider implications
                    }
                } else {
                    console.log(`useMediaNotes (${mediaType}): No *new* relevant notes found in cache after filtering.`);
                }
            } else {
                 console.log(`useMediaNotes (${mediaType}): Cache was empty for these authors.`);
            }
            // <<< End of modified cache handling >>>
            
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
                    
                    const sortedFinalNotes = finalNotes.sort((a, b) => b.created_at - a.created_at);
                    if (isMounted) {
                        if (mediaType === 'image') {
                            console.log(`useMediaNotes (${mediaType}): Updating state with ${sortedFinalNotes.length} notes after EOSE.`);
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
            if (currentSubscription.current) {
                console.log(`useMediaNotes (${mediaType}): Cleaning up subscription.`);
                currentSubscription.current.stop();
                currentSubscription.current = null;
            }
            isFetching.current = false; // Ensure fetching flag is reset if component unmounts during fetch
        };
    // Re-run effect if ndk, authors, mediaType, limit, or until changes
    }, [ndk, authors, mediaType, limit, until, followedTags, processEvent]); // <<< Add followedTags to dependency array

    // <<< Log return value >>>
    if (mediaType === 'image') {
        console.log(`useMediaNotes (image): Returning state`, { notesLength: notes.length, isLoading });
    }
    return {
        notes,
        isLoading,
    };
} 