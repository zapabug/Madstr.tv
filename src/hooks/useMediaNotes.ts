import { useState, useEffect, useRef, useCallback } from 'react';
import NDK, { NDKEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk';
import { NostrNote } from '../types/nostr';
import { cacheMediaNotes, getCachedNotesByAuthors } from '../utils/mediaNoteCache';

// Define media types
export type MediaType = 'podcast' | 'video' | 'image';

// Define hook props
interface UseMediaNotesProps {
    authors?: string[]; // <<< Make authors optional
    mediaType: MediaType;
    ndk: NDK | undefined; // <<< Updated to accept undefined
    limit?: number; // <<< Renamed from initialLimit, now dynamic
    until?: number; // <<< Added until timestamp (seconds)
    followedTags?: string[]; // <<< Add optional followedTags
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
        case 'podcast': return [1, 31234]; // Keep Kind 1 fallback + User's Kind
        case 'video': return [1, 21, 22]; // Kind 1 fallback + NIP-71 Kinds
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
    followedTags, // <<< Destructure followedTags prop
}: UseMediaNotesProps): UseMediaNotesReturn {
    const [notes, setNotes] = useState<NostrNote[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const notesById = useRef<Map<string, NostrNote>>(new Map());
    const currentSubscription = useRef<NDKSubscription | null>(null);
    const isFetching = useRef<boolean>(false); // Prevent concurrent fetches
    // Add refs to track previous dependency values
    const prevNdkRef = useRef<NDK | undefined>(ndk);
    const prevAuthorsRef = useRef<string[] | undefined>(authors);
    const prevMediaTypeRef = useRef<MediaType>(mediaType);
    const prevLimitRef = useRef<number>(limit);
    const prevUntilRef = useRef<number | undefined>(until);
    const prevFollowedTagsRef = useRef<string[] | undefined>(followedTags);
    // <<< Add ref to track previous authors instance >>>
    const prevAuthorsInstanceRef = useRef<string[]>(authors || []);
    // <<< Add ref to track previous NDK instance >>>
    const prevNdkInstanceRef = useRef<NDK | null>(ndk);
    // <<< Add ref for processEvent >>>
    const prevProcessEventRef = useRef<((event: NDKEvent, _urlRegex: RegExp, type: MediaType) => NostrNote | null) | null>(null);

    // <<< Removed verbose render logging >>>

    const processEvent = useCallback((event: NDKEvent, _urlRegex: RegExp, type: MediaType): NostrNote | null => {
        const urlRegex = getUrlRegexForMediaType(type);
        // if (type === 'image') {
        //      console.log(`processEvent (image): Checking event ${event.id}`); // Keep commented out
        // }

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
        } else if (type === 'podcast') {
            // Podcast logic (prioritizing enclosure, then url/media)
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

        // --- Fallback to content regex LAST for all types --- 
        if (!mediaUrl) {
            const contentMatch = event.content.match(urlRegex);
            if (contentMatch) {
                mediaUrl = contentMatch[0];
                foundVia = 'content regex fallback';
                // console.log(`processEvent (${type}): URL found via CONTENT REGEX fallback for event ${event.id}`);
            }
        }

        // --- End of URL Finding Logic --- 

        if (!mediaUrl) {
            // if (type === 'image') { // Keep commented out
            //     console.log(`processEvent (image): Skipping event ${event.id} - No valid URL found in tags or content.`);
            // }
            return null;
        } else {
            // if (type === 'image') { // Keep commented out
            //      console.log(`processEvent (image): Found URL for event ${event.id} via ${foundVia}. URL: ${mediaUrl}`);
            // }
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

    }, [mediaType, getUrlRegexForMediaType]);

    useEffect(() => {
        // <<< START ADDED LOGGING >>>
        // console.log(`useMediaNotes (${mediaType}): useEffect RUNNING.`); // Keep commented
        // <<< END ADDED LOGGING >>>

        // <<< Detailed Dependency Check >>>
        let changedDeps: string[] = [];
        if (prevNdkRef.current !== ndk) changedDeps.push('ndk');
        // Use JSON.stringify for robust array comparison, handle undefined
        const authorsStringified = JSON.stringify(authors);
        if (JSON.stringify(prevAuthorsRef.current) !== authorsStringified) {
            console.log(`%%% useMediaNotes (${mediaType}): Dependency Change Detected - authors`); changedDeps.push('authors');
        }
        if (prevMediaTypeRef.current !== mediaType) {
            console.log(`%%% useMediaNotes (${mediaType}): Dependency Change Detected - mediaType`);
            changedDeps.push('mediaType');
        }
        if (prevLimitRef.current !== limit) {
            console.log(`%%% useMediaNotes (${mediaType}): Dependency Change Detected - limit`);
            changedDeps.push('limit');
        }
        if (prevUntilRef.current !== until) {
            console.log(`%%% useMediaNotes (${mediaType}): Dependency Change Detected - until`);
            changedDeps.push('until');
        }
        // Use JSON.stringify for robust array comparison, handle undefined
        const followedTagsStringified = JSON.stringify(followedTags);
        if (JSON.stringify(prevFollowedTagsRef.current) !== followedTagsStringified) {
            console.log(`%%% useMediaNotes (${mediaType}): Dependency Change Detected - followedTags`); changedDeps.push('followedTags');
        }
        if (prevProcessEventRef.current !== processEvent) {
            console.log(`%%% useMediaNotes (${mediaType}): Dependency Change Detected - processEvent`); changedDeps.push('processEvent');
        }
        // Update previous value refs *after* comparison
        prevNdkRef.current = ndk;
        prevAuthorsRef.current = authors;
        prevMediaTypeRef.current = mediaType;
        prevLimitRef.current = limit;
        prevUntilRef.current = until;
        prevFollowedTagsRef.current = followedTags;
        prevProcessEventRef.current = processEvent; // Store processEvent ref
        // ---------------------------------

        if (changedDeps.length > 0) {
            console.log(`%%% useMediaNotes (${mediaType}): Effect actually running due to changed dependencies:`, changedDeps.join(', '));
        }

        // Determine if we have valid filter criteria to proceed
        const hasAuthors = authors && authors.length > 0;
        const hasTags = followedTags && followedTags.length > 0;
        const canFetch = ndk && (hasAuthors || hasTags); // Can fetch if NDK is ready AND (we have authors OR we have tags)

        // <<< Log when effect is triggered AND has criteria >>>
        if (canFetch && !isFetching.current) {
            console.log(`useMediaNotes (${mediaType}): Effect triggered with fetch criteria. HasAuthors: ${hasAuthors}, HasTags: ${hasTags}`);
        }

        // Debounce or prevent fetch if already fetching or no valid criteria
        if (isFetching.current || !canFetch) {
            // console.log(`useMediaNotes (${mediaType}): useEffect SKIPPING fetch.`); // Keep commented
            // Clear state and stop loading if criteria become invalid (e.g., NDK disconnects, authors/tags become empty)
            if (!canFetch) {
                 setNotes([]);
                 notesById.current.clear();
                 setIsLoading(false);
            }
            // Don't reset isFetching.current here if skip was due to already fetching
            return;
        }

        let isMounted = true;
        setIsLoading(true);
        isFetching.current = true; 
        // <<< Clear the notesById map ONLY when starting a completely new fetch cycle >>>
        notesById.current.clear();
        // The notes state will persist until the fetch completes in EOSE

        const authorsList = authors || [];
        const kindsToFetch = getKindsForMediaType(mediaType);
        const urlRegex = getUrlRegexForMediaType(mediaType);

        const fetchAndSubscribe = async () => {
            // <<< START: Check cache for newest timestamp >>>
            let newestCachedTimestamp: number | undefined = undefined;
            let relevantCachedNotes: NostrNote[] = []; // Store notes valid for this mediaType
            try {
                // console.log(`useMediaNotes (${mediaType}): Checking cache...`); // Keep commented
                const cachedNotes = await getCachedNotesByAuthors(authorsList);
                // console.log(`useMediaNotes (${mediaType}): Raw cached notes found: ${cachedNotes.length}`); // Keep commented
                if (cachedNotes && cachedNotes.length > 0) {
                    // Filter cached notes for this mediaType
                    relevantCachedNotes = cachedNotes.filter(note => 
                        kindsToFetch.includes(note.kind) && 
                        note.url && 
                        note.url.match(urlRegex)
                    );
                    
                    // console.log(`useMediaNotes (${mediaType}): Found ${relevantCachedNotes.length} relevant notes in cache after filtering.`); // Keep commented
                    
                    // Pre-populate the map with relevant cached notes
                    relevantCachedNotes.forEach(note => {
                        if (!notesById.current.has(note.id)) {
                            notesById.current.set(note.id, note);
                        }
                    });
                    // console.log(`useMediaNotes (${mediaType}): Added ${notesById.current.size} notes from cache.`); // Keep commented

                    // Find newest timestamp *among the relevant cached notes*
                    if (relevantCachedNotes.length > 0) {
                        // Sort MUTATES the array, do it once
                        relevantCachedNotes.sort((a, b) => b.created_at - a.created_at);
                        newestCachedTimestamp = relevantCachedNotes[0].created_at;
                        // console.log(`useMediaNotes (${mediaType}): Newest relevant cached timestamp: ${newestCachedTimestamp}`); // Keep commented
                    } 
                } else {
                    // console.log(`useMediaNotes (${mediaType}): Cache was empty.`); // Keep commented
                }
            } catch (error) {
                console.error(`useMediaNotes (${mediaType}): Error reading/processing cache:`, error);
            }
             // <<< If cache was populated, update state immediately BEFORE network fetch >>>
            if (relevantCachedNotes.length > 0) {
                 // Use the already sorted relevantCachedNotes
                 // console.log(`useMediaNotes (${mediaType}): Pre-populating state with ${relevantCachedNotes.length} notes from cache.`); // Keep commented
                 // Don't set isLoading false yet, network fetch might still happen
                 setNotes(relevantCachedNotes); 
            }
            // <<< END: Cache Check Logic >>>
            
            const filter: NDKFilter = {
                kinds: kindsToFetch,
                limit: limit, // Limit applies to the network fetch
            };

            // Conditionally add authors to the filter
            if (hasAuthors) {
                filter.authors = authorsList;
            }

            if (until !== undefined) {
                filter.until = until; // For pagination
            }
            // <<< USE CACHED TIMESTAMP FOR SINCE FILTER >>>
            if (newestCachedTimestamp !== undefined && !until) { // Don't use since if paginating backwards
                // Add 1 second to avoid refetching the exact same newest note
                filter.since = newestCachedTimestamp + 1;
                // console.log(`useMediaNotes (${mediaType}): Applying SINCE filter: ${filter.since}`); // Keep commented
            }
            // <<< END SINCE FILTER LOGIC >>>

            // Conditionally add tags to the filter
            if (hasTags) {
                filter['#t'] = followedTags.map(tag => tag.toLowerCase());
            }

            // <<< Moved logging after filter definition >>>
            if (mediaType === 'image') {
                // console.log(`useMediaNotes (image): Subscribing...`, filter); // Keep commented
            }
            
            // Stop previous subscription if it exists
            if (currentSubscription.current) {
                currentSubscription.current.stop();
            }
            
            currentSubscription.current = ndk.subscribe(filter, { closeOnEose: true, groupable: false });

            currentSubscription.current.on('event', (event: NDKEvent) => {
                const note = processEvent(event, urlRegex, mediaType);
                if (note && !notesById.current.has(note.id)) {
                    // if (mediaType === 'image') {
                    //     console.log(`useMediaNotes (image): Adding new note ${note.id} from WS to internal map.`);
                    // }
                    notesById.current.set(note.id, note);
                    // <<< DO NOT setNotes here on individual events >>>
                }
            });

            currentSubscription.current.on('eose', () => {
                console.log(`%%% useMediaNotes (${mediaType}): EOSE received. Setting isLoading to false.`); // <<< ADD THIS LOG
                // console.log(`useMediaNotes (${mediaType}): EOSE received. Total notes in map: ${notesById.current.size}`); // Keep commented
                const finalNotes = Array.from(notesById.current.values());
                const sortedFinalNotes = finalNotes.sort((a, b) => b.created_at - a.created_at);
                if (isMounted) {
                    // console.log(`useMediaNotes (${mediaType}): Updating state with ${sortedFinalNotes.length} notes after EOSE.`); // Keep commented
                    // <<< The single state update point >>>
                    setNotes(sortedFinalNotes);
                    setIsLoading(false);
                    isFetching.current = false;
                }
                // console.log(`useMediaNotes (${mediaType}): Caching ${finalNotes.length} notes after EOSE.`); // Keep commented
                cacheMediaNotes(finalNotes).catch(error => {
                     console.error(`useMediaNotes (${mediaType}): Error caching notes after EOSE:`, error);
                });
            });
        };

        fetchAndSubscribe().catch(err => {
            console.error(`useMediaNotes (${mediaType}): Error fetching notes:`, err);
            console.log(`%%% useMediaNotes (${mediaType}): Fetch error. Setting isLoading to false.`); // <<< ADD THIS LOG
            if (isMounted) {
                 setIsLoading(false);
                 isFetching.current = false; // Mark fetching complete on error
            }
        });

        // Cleanup
        return () => {
            isMounted = false;
            currentSubscription.current?.stop(); // Use optional chaining for stop
            currentSubscription.current = null;
            // console.log(`useMediaNotes (${mediaType}): Cleaned up subscription.`); // Keep commented
            isFetching.current = false; // Ensure fetching flag is reset if component unmounts during fetch
        };
    // Re-run effect if ndk, authors, mediaType, limit, or until changes
    }, [ndk, authors, mediaType, limit, until, followedTags, processEvent]); // <<< Add followedTags to dependency array

    // <<< Log return value >>>
    // console.log(`useMediaNotes (${mediaType}): Returning state`, { notesLength: notes.length, isLoading }); // Keep commented
    return {
        notes,
        isLoading,
    };
} 