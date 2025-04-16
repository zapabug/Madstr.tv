import { useState, useEffect, useRef, useCallback } from 'react';
import NDK, { NDKEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk';
import { NostrNote } from '../types/nostr';
import { cacheMediaNotes, getCachedNotesByAuthors } from '../utils/mediaNoteCache';

// Define media types
export type MediaType = 'podcast' | 'video' | 'image';

// Define hook props
interface UseMediaNotesProps {
    authors: string[];
    mediaType: MediaType;
    ndk: NDK | null;
    limit?: number; // <<< Renamed from initialLimit, now dynamic
    until?: number; // <<< Added until timestamp (seconds)
}

// Define hook return value
interface UseMediaNotesReturn {
    notes: NostrNote[];
    isLoading: boolean;
    fetchOlderNotes?: () => void; // <<< Optional: Expose a direct fetch function? No, let App control via props.
}

// Regexes (consider moving to constants or utils)
const imageRegex = /https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp)/i;
const videoRegex = /https?:\/\/\S+\.(?:mp4|mov|webm|m3u8)/i;
const audioRegex = /https?:\/\/\S+\.(?:mp3|m4a|ogg|aac|wav)/i;

// Helper to get Kinds based on MediaType
function getKindsForMediaType(mediaType: MediaType): number[] {
    switch (mediaType) {
        case 'podcast': return [30402, 1, 31234]; // NIP-101 + Kind 1 fallback + User's Kind
        case 'video': return [1]; // Primarily Kind 1 for simple links
        case 'image': return [1]; // Primarily Kind 1 for simple links
        default: return [1];
    }
}

// Helper to get URL Regex based on MediaType
function getUrlRegexForMediaType(mediaType: MediaType): RegExp {
    switch (mediaType) {
        case 'podcast': return audioRegex;
        case 'video': return videoRegex;
        case 'image': return imageRegex;
        default: return /https?:\/\/\S+/i; // Generic fallback
    }
}

export function useMediaNotes({
    authors,
    mediaType,
    ndk,
    limit = 200, // Default limit if not provided
    until,       // Use provided until timestamp
}: UseMediaNotesProps): UseMediaNotesReturn {
    const [notes, setNotes] = useState<NostrNote[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    // notesById now accumulates across fetches triggered by prop changes
    const notesById = useRef<Map<string, NostrNote>>(new Map());
    const currentSubscription = useRef<NDKSubscription | null>(null);
    const isFetching = useRef<boolean>(false); // Prevent concurrent fetches

    const processEvent = useCallback((event: NDKEvent, _urlRegex: RegExp, type: MediaType): NostrNote | null => {
        // Use specific regex for fallback, but m-tag is primary
        const urlRegex = getUrlRegexForMediaType(type);
        console.log(`processEvent (${type}): Checking event ${event.id}`, { content: event.content, tags: event.tags });

        let mediaUrl: string | undefined;
        let foundVia: string | null = null;
        let isVideoByMimeType = false;

        // --- Logic adjusted to prioritize Mime Type ('m' tag) --- 

        // 1. Check for VIDEO MIME type tag ('m') first
        if (type === 'video') { 
            const mimeTag = event.tags.find((t) => t[0] === 'm' && t[1]?.startsWith('video/'));
            if (mimeTag) {
                console.log(`processEvent (${type}): Found video MIME type tag:`, mimeTag[1]);
                isVideoByMimeType = true;
                // Now find the associated URL, prioritizing specific tags
                const urlTag = event.tags.find((t) => t[0] === 'url');
                if (urlTag && urlTag[1]) {
                    mediaUrl = urlTag[1];
                    foundVia = 'm tag + url tag';
                }
                if (!mediaUrl) {
                    const mediaTag = event.tags.find((t) => t[0] === 'media');
                    if (mediaTag && mediaTag[1]) {
                        mediaUrl = mediaTag[1];
                        foundVia = 'm tag + media tag';
                    }
                }
                // Fallback to content regex IF mime type was found but no url/media tag
                if (!mediaUrl) {
                    const genericUrlRegex = /https?:\/\/\S+/i; // Use generic regex here
                    const contentMatch = event.content.match(genericUrlRegex);
                    if (contentMatch) {
                        mediaUrl = contentMatch[0];
                        foundVia = 'm tag + content regex';
                    }
                }
            }
        }

        // 2. Fallback: If not identified as video by MIME type OR if type is not video,
        //    use the original logic (checking tags + regex)
        if (!mediaUrl) { // Check if URL was found via m-tag path OR if type wasn't video
            if (isVideoByMimeType) {
                console.log(`processEvent (${type}): Identified by MIME type but failed to find URL via tags/content.`);
            } else {
                 console.log(`processEvent (${type}): No video MIME type found (or not video type), falling back to URL regex checks.`);
            }

            const urlTag = event.tags.find((t) => t[0] === 'url');
            if (urlTag && urlTag[1]?.match(urlRegex)) {
                mediaUrl = urlTag[1];
                foundVia = 'url tag + regex';
            }

            if (!mediaUrl) {
                 const mediaTag = event.tags.find((t) => t[0] === 'media');
                 if (mediaTag && mediaTag[1]?.match(urlRegex)) {
                     mediaUrl = mediaTag[1];
                     foundVia = 'media tag + regex';
                 }
            }
            
            // Check type-specific tags only relevant for non-video (keep podcast/image logic here)
            if (!mediaUrl && type === 'podcast') {
                const enclosureTag = event.tags.find((t) => t[0] === 'enclosure');
                if (enclosureTag && enclosureTag[1]?.match(urlRegex)) {
                    mediaUrl = enclosureTag[1];
                    foundVia = 'enclosure tag + regex';
                }
            } else if (!mediaUrl && type === 'image') {
                const imageTag = event.tags.find((t) => t[0] === 'image');
                if (imageTag && imageTag[1]?.match(urlRegex)) {
                    mediaUrl = imageTag[1];
                    foundVia = 'image tag + regex';
                }
            }
            
            // Fallback to content regex (using the specific type regex)
            if (!mediaUrl) {
                console.log(`processEvent (${type}): Checking content fallback for event ${event.id}. Regex: ${urlRegex}`); // Keep log
                console.log(`processEvent (${type}): Content to check:`, JSON.stringify(event.content)); // Keep log
                const contentMatch = event.content.match(urlRegex);
                console.log(`processEvent (${type}): Content match result:`, contentMatch); // Keep log
                if (contentMatch) {
                    mediaUrl = contentMatch[0];
                    foundVia = 'content regex';
                }
            }
        }

        // --- End of URL Finding Logic --- 

        if (!mediaUrl) {
            console.log(`processEvent (${type}): Skipping event ${event.id} - No valid URL found via m-tag or fallback checks.`);
            return null;
        } else {
             console.log(`processEvent (${type}): Found URL for event ${event.id} via ${foundVia}. URL: ${mediaUrl}`);
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
        const kindsToFetch = getKindsForMediaType(mediaType);
        const urlRegex = getUrlRegexForMediaType(mediaType);

        const fetchAndSubscribe = async () => {
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
            console.log(`useMediaNotes (${mediaType}): Subscribing (Kinds: ${kindsToFetch}, Limit: ${limit}, Until: ${until ? new Date(until * 1000).toISOString() : 'N/A'})...`);
            const filter: NDKFilter = {
                kinds: kindsToFetch,
                authors: authorsList,
                limit: limit,
            };
            // Add until filter if provided
            if (until !== undefined) {
                filter.until = until;
            }
            
            // Stop previous subscription if it exists
            if (currentSubscription.current) {
                currentSubscription.current.stop();
            }
            
            currentSubscription.current = ndk.subscribe(filter, { closeOnEose: false, groupable: false });

            currentSubscription.current.on('event', (event: NDKEvent) => {
                const note = processEvent(event, urlRegex, mediaType);
                if (note && !notesById.current.has(note.id)) {
                    console.log(`useMediaNotes (${mediaType}): Adding new note ${note.id} from WS`);
                    notesById.current.set(note.id, note);
                    // Don't update main state here, wait for EOSE to batch updates
                }
            });

            currentSubscription.current.on('eose', () => {
                console.log(`useMediaNotes (${mediaType}): EOSE received.`);
                const finalNotes = Array.from(notesById.current.values());
                const sortedFinalNotes = finalNotes.sort((a, b) => b.created_at - a.created_at);
                if (isMounted) {
                    console.log(`useMediaNotes (${mediaType}): Updating state with ${sortedFinalNotes.length} notes after EOSE.`);
                    setNotes(sortedFinalNotes);
                    setIsLoading(false);
                    isFetching.current = false;
                }
                // Cache the final accumulated notes
                console.log(`useMediaNotes (${mediaType}): Caching ${finalNotes.length} notes after EOSE.`);
                cacheMediaNotes(finalNotes).catch(error => {
                     console.error(`useMediaNotes (${mediaType}): Error caching notes after EOSE:`, error);
                });
            });
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
            // Reset fetching flag on unmount or dependency change?
            // No, keep it as is, effect guard handles it.
            // isFetching.current = false; 
        };
    // Re-run effect if ndk, authors, mediaType, limit, or until changes
    }, [ndk, authors, mediaType, limit, until, processEvent]); 

    return {
        notes,
        isLoading,
    };
} 