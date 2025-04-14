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

    const processEvent = useCallback((event: NDKEvent, urlRegex: RegExp, type: MediaType): NostrNote | null => {
        console.log(`processEvent (${type}): Checking event ${event.id}`, { content: event.content, tags: event.tags });

        let mediaUrl: string | undefined;
        let foundVia: string | null = null;

        // 1. Check 'url' tag
        const urlTag = event.tags.find((t) => t[0] === 'url');
        if (urlTag && urlTag[1]?.match(urlRegex)) {
            mediaUrl = urlTag[1];
            foundVia = 'url tag';
        }

        // 2. Check type-specific tags (if no URL yet)
        if (!mediaUrl) {
            if (type === 'podcast') {
                const enclosureTag = event.tags.find((t) => t[0] === 'enclosure');
                if (enclosureTag && enclosureTag[1]?.match(urlRegex)) {
                    mediaUrl = enclosureTag[1];
                    foundVia = 'enclosure tag';
                }
            } else if (type === 'image') {
                const imageTag = event.tags.find((t) => t[0] === 'image');
                if (imageTag && imageTag[1]?.match(urlRegex)) {
                    mediaUrl = imageTag[1];
                    foundVia = 'image tag';
                }
            }
        }
        
        // 3. Check generic 'media' tag (if no URL yet)
        if (!mediaUrl) {
             const mediaTag = event.tags.find((t) => t[0] === 'media');
             if (mediaTag && mediaTag[1]?.match(urlRegex)) {
                 mediaUrl = mediaTag[1];
                 foundVia = 'media tag';
             }
        }

        // 4. Fallback to content regex (if no URL yet)
        if (!mediaUrl) {
            const contentMatch = event.content.match(urlRegex);
            if (contentMatch) {
                mediaUrl = contentMatch[0];
                foundVia = 'content regex';
            }
        }

        if (!mediaUrl) {
            console.log(`processEvent (${type}): Skipping event ${event.id} - No valid URL found via tags (url, enclosure, image, media) or content regex.`);
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
            // --- Cache Check (Load initial state if map is empty) ---
            if (notesById.current.size === 0) { 
                console.log(`useMediaNotes (${mediaType}): Map empty, loading cached notes for ${authorsList.length} authors.`);
                const cachedNotes = await getCachedNotesByAuthors(authorsList);
                console.log(`useMediaNotes (${mediaType}): Raw cached notes found: ${cachedNotes.length}`); 
                const relevantCachedNotes: NostrNote[] = [];
                if (cachedNotes.length > 0) {
                    cachedNotes.forEach(note => {
                        if (kindsToFetch.includes(note.kind) && note.url && note.url.match(urlRegex)) { 
                            if (!notesById.current.has(note.id)) {
                                notesById.current.set(note.id, note);
                                relevantCachedNotes.push(note);
                            }    
                        } 
                    });
                    if (relevantCachedNotes.length > 0) {
                        const sortedNotes = [...relevantCachedNotes].sort((a, b) => b.created_at - a.created_at);
                        console.log(`useMediaNotes (${mediaType}): Loaded ${sortedNotes.length} relevant notes from cache into map.`); 
                        // Don't setNotes yet, wait for live fetch to complete or EOSE
                    } else {
                        console.log(`useMediaNotes (${mediaType}): No relevant notes found in cache after filtering.`);
                    }
                } else {
                     console.log(`useMediaNotes (${mediaType}): Cache was empty for these authors.`);
                }
            }
            
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
            
            const sub = ndk.subscribe(filter, { closeOnEose: true, groupable: false });
            currentSubscription.current = sub;

            const newlyFetchedNotes: NostrNote[] = [];

            sub.on('event', (event: NDKEvent) => {
                console.log(`useMediaNotes (${mediaType}): Received event ${event.id}`);
                if (!isMounted) return; // Ignore if unmounted
                // Process only if not already in our map
                if (!notesById.current.has(event.id)) {
                    const processedNote = processEvent(event, urlRegex, mediaType);
                    if (processedNote) {
                        // Double-check map again inside callback
                        if (!notesById.current.has(processedNote.id)) {
                            console.log(`useMediaNotes (${mediaType}): Adding event ${processedNote.id} to map.`); 
                            notesById.current.set(processedNote.id, processedNote);
                            newlyFetchedNotes.push(processedNote);
                        }
                    }
                }
            });

            sub.on('eose', () => {
                console.log(`useMediaNotes (${mediaType}): Subscription EOSE.`);
                if (!isMounted) return;

                if (newlyFetchedNotes.length > 0) {
                    cacheMediaNotes(newlyFetchedNotes);
                    console.log(`useMediaNotes (${mediaType}): Cached ${newlyFetchedNotes.length} new notes.`);
                }

                // Update state with accumulated notes from the map
                const finalNotes = Array.from(notesById.current.values())
                                         .sort((a, b) => b.created_at - a.created_at);
                console.log(`useMediaNotes (${mediaType}): Setting final state with ${finalNotes.length} total notes.`);
                setNotes(finalNotes);
                setIsLoading(false);
                isFetching.current = false; // Mark fetching as complete
                currentSubscription.current = null; 
            });

            sub.on('close', (reason: any) => {
                console.log(`useMediaNotes (${mediaType}): Subscription closed. Reason:`, reason);
                 if (!isMounted) return;
                 // If closed before EOSE, still update state with what we have
                 if (isFetching.current) {
                    const finalNotes = Array.from(notesById.current.values())
                                         .sort((a, b) => b.created_at - a.created_at);
                    console.log(`useMediaNotes (${mediaType}): Setting final state after close with ${finalNotes.length} total notes.`);
                     setNotes(finalNotes);
                     setIsLoading(false);
                     isFetching.current = false; // Mark fetching as complete
                 }
                 currentSubscription.current = null;
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