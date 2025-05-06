import { useState, useEffect, useMemo, useCallback } from 'react';
// REMOVE NDK Hooks
// import { useNDK, useSubscribe } from '@nostr-dev-kit/ndk-hooks';
// import { NDKEvent, NDKFilter, NDKKind } from '@nostr-dev-kit/ndk';

// ADD Applesauce Hooks & Types
import { Filter, NostrEvent } from 'nostr-tools'; // Reverted to original nostr-tools import
import { Hooks } from 'applesauce-react';
import { Queries } from 'applesauce-core';
import { ApplesauceEvent, ContentExtraction, EventContent, Url } from '../types/Events'; 

// Keep constants and local types
// import { TV_PUBKEY_NPUB } from '../constants'; // No longer needed here
import { NostrNote } from '../types/nostr'; // This is now the sole source for NostrNote
import { shuffleArray } from '../utils/shuffleArray';
// Keep filter utils, but getHexPubkey is no longer needed here
// import { buildMediaFilters, getHexPubkey, MediaType } from '../utils/filterUtils'; 
// Simplified: Let's rebuild filter logic here for clarity, assuming filterUtils might be outdated

// Constants for initial fetch limits
const INITIAL_IMAGE_FETCH_LIMIT = 20;
const INITIAL_VIDEO_FETCH_LIMIT = 20;
const INITIAL_GENERAL_KIND1_FETCH_LIMIT = 50; // ADDED: For general Kind 1 event fetching

// Pubkey for NoSolutions
const NOSOLUTIONS_PUBKEY_HEX = "9bde421491f3ead1ac21bd1d01667aab947f4c1c4aed87624cf2273b06ca052b";

// Regex to find audio URLs in content
const AUDIO_URL_REGEX = /(https?:\/\/[^\s"']+\.(m4a|mp3|aac|ogg|wav|flac|opus))/i;

// ADDED: Regex for image and video URLs
const IMAGE_URL_REGEX = /(https?:\/\/[^\s"']+\.(jpeg|jpg|gif|png|webp|avif|svg))/i;
const VIDEO_URL_REGEX = /(https?:\/\/[^\s"']+\.(mp4|mov|avi|webm|mkv|flv|ogv))/i;

// ADDED: Interface for processed notes with a media type hint
interface ProcessedNostrNote extends NostrNote {
    mediaTypeHint?: 'audio' | 'image' | 'video' | 'unknown';
}

// Event processing function - MODIFIED
// This might need revisiting depending on what TimelineQuery returns.
function processApplesauceEvent(event: NostrEvent): ProcessedNostrNote { // MODIFIED return type
    let basicUrl: string | null = null;
    let sourceType: string = 'unknown'; // For logging
    let mediaTypeHint: ProcessedNostrNote['mediaTypeHint'] = 'unknown'; // ADDED

    if (event.kind === 1) { // General Kind 1 event processing for potential audio, image, or video
        sourceType = `Kind 1 from ${event.pubkey}`;
        const audioMatch = event.content.match(AUDIO_URL_REGEX);
        if (audioMatch && audioMatch[0]) {
            basicUrl = audioMatch[0];
            mediaTypeHint = 'audio'; // SET HINT
            sourceType += ' (audio URL in content)';
            console.log(`[processApplesauceEvent] Audio URL FOUND via ${sourceType}:`, { eventId: event.id, pubkey: event.pubkey, basicUrl, kind: event.kind });
        } else {
            const imageMatch = event.content.match(IMAGE_URL_REGEX); // Check for image
            if (imageMatch && imageMatch[0]) {
                basicUrl = imageMatch[0];
                mediaTypeHint = 'image'; // SET HINT
                sourceType += ' (image URL in content)';
                console.log(`[processApplesauceEvent] Image URL FOUND via ${sourceType}:`, { eventId: event.id, pubkey: event.pubkey, basicUrl, kind: event.kind });
            } else {
                const videoMatch = event.content.match(VIDEO_URL_REGEX); // Check for video
                if (videoMatch && videoMatch[0]) {
                    basicUrl = videoMatch[0];
                    mediaTypeHint = 'video'; // SET HINT
                    sourceType += ' (video URL in content)';
                    console.log(`[processApplesauceEvent] Video URL FOUND via ${sourceType}:`, { eventId: event.id, pubkey: event.pubkey, basicUrl, kind: event.kind });
                } else {
                    // Only log if it's NoSolutions and fails, to reduce noise for general Kind 1s without audio/image/video
                    if (event.pubkey === NOSOLUTIONS_PUBKEY_HEX) {
                        console.log(`[processApplesauceEvent] No media URL (audio, image, video) NOT FOUND for NoSolutions Kind 1. Event:`, 
                            { eventId: event.id, pubkey: event.pubkey, kind: event.kind, contentSnippet: event.content?.substring(0,100) }
                        );
                    }
                }
            }
        }
    } else if (event.kind === 1063) { // MODIFIED: Image specific kind
        sourceType = `Image (Kind 1063 tags)`;
        mediaTypeHint = 'image'; // SET HINT
        basicUrl = event.tags.find(t => t[0] === 'url')?.[1] || 
                   event.tags.find(t => t[0] === 'media')?.[1] || 
                   event.tags.find(t => t[0] === 'image')?.[1] || 
                   null;
        if (basicUrl) {
            console.log(`[processApplesauceEvent] Media URL FOUND via ${sourceType}:`, { eventId: event.id, pubkey: event.pubkey, basicUrl, kind: event.kind });
        } else {
            console.log(`[processApplesauceEvent] Media URL NOT FOUND via ${sourceType} tags. Event:`, { eventId: event.id, pubkey: event.pubkey, kind: event.kind, tags: event.tags });
        }
    } else if (event.kind === 34235) { // MODIFIED: Video specific kind
        sourceType = `Video (Kind 34235 tags)`;
        mediaTypeHint = 'video'; // SET HINT
        basicUrl = event.tags.find(t => t[0] === 'url')?.[1] || 
                   event.tags.find(t => t[0] === 'media')?.[1] || 
                   null; // Videos might not use 'image' tag
        if (basicUrl) {
            console.log(`[processApplesauceEvent] Media URL FOUND via ${sourceType}:`, { eventId: event.id, pubkey: event.pubkey, basicUrl, kind: event.kind });
        } else {
            console.log(`[processApplesauceEvent] Media URL NOT FOUND via ${sourceType} tags. Event:`, { eventId: event.id, pubkey: event.pubkey, kind: event.kind, tags: event.tags });
        }
    }

    return {
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at ?? 0,
        kind: event.kind ?? 0,
        tags: event.tags,
        content: event.content,
        sig: event.sig || '',
        url: basicUrl === null ? undefined : basicUrl, 
        posterPubkey: event.pubkey,
        title: event.tags.find(t => t[0] === 'title')?.[1],
        summary: event.tags.find(t => t[0] === 'summary')?.[1],
        image: event.tags.find(t => t[0] === 'image')?.[1],
        duration: event.tags.find(t => t[0] === 'duration')?.[1],
        mediaTypeHint, // ADDED
    };
}

interface UseMediaContentProps {
    followedTags: string[];
    // currentUserNpub: string | null; // REMOVED
    followedAuthorPubkeys: string[]; // ADDED: Expect hex pubkeys
}

interface UseMediaContentReturn {
    shuffledImageNotes: NostrNote[];
    shuffledVideoNotes: NostrNote[];
    podcastNotes: NostrNote[];
    fetchOlderImages: () => void;
    fetchOlderVideos: () => void;
    // isLoadingKind3: boolean; // REMOVED
    isLoadingImages: boolean;
    isLoadingVideos: boolean;
    isLoadingPodcasts: boolean;
}

export function useMediaContent({
    followedTags,
    // currentUserNpub, // REMOVED
    followedAuthorPubkeys, // ADDED
}: UseMediaContentProps): UseMediaContentReturn {
    console.log('[useMediaContent] PROPS RECEIVED:', { followedAuthorPubkeys, followedTags });
    // REMOVE NDK instance
    // const { ndk } = useNDK();

    // REMOVE Internal Kind 3 fetching logic
    // const tvPubkeyHex = ...;
    // const currentUserHexPubkey = ...;
    // const [followedAuthorPubkeys, setFollowedAuthorPubkeys] = useState<string[]>([]);
    // const [isLoadingKind3, setIsLoadingKind3] = useState<boolean>(true);
    // const kind3AuthorHex = ...;
    // const kind3Filter = ...;
    // const { events: kind3Events, eose: kind3Eose } = useSubscribe(...);
    // useEffect(() => { ... process kind 3 ... }, ...);

    // --- Fetch Parameters State (Keep) ---
    const [imageFetchLimit, setImageFetchLimit] = useState<number>(INITIAL_IMAGE_FETCH_LIMIT);
    const [videoFetchLimit, setVideoFetchLimit] = useState<number>(INITIAL_VIDEO_FETCH_LIMIT);
    const [generalKind1FetchLimit, setGeneralKind1FetchLimit] = useState<number>(INITIAL_GENERAL_KIND1_FETCH_LIMIT); // ADDED
    const [generalKind1FetchUntil, setGeneralKind1FetchUntil] = useState<number | undefined>(undefined); // ADDED
    const [imageFetchUntil, setImageFetchUntil] = useState<number | undefined>(undefined);
    const [videoFetchUntil, setVideoFetchUntil] = useState<number | undefined>(undefined);

    // --- State for Processed Notes (Keep, but simplify raw state removal) ---
    // Store raw events to handle potential updates from subscription - REMOVED intermediate raw state
    // const [rawImageEvents, setRawImageEvents] = useState<NDKEvent[]>([]);
    // const [rawVideoEvents, setRawVideoEvents] = useState<NDKEvent[]>([]);
    // const [rawPodcastEvents, setRawPodcastEvents] = useState<NDKEvent[]>([]);

    // Store processed notes directly from useStoreQuery results
    const [processedImageNotes, setProcessedImageNotes] = useState<NostrNote[]>([]);
    const [processedVideoNotes, setProcessedVideoNotes] = useState<NostrNote[]>([]);
    const [processedPodcastNotes, setProcessedPodcastNotes] = useState<NostrNote[]>([]);

    // --- State for Shuffled Notes (Keep) ---
    const [shuffledImageNotes, setShuffledImageNotes] = useState<NostrNote[]>([]);
    const [shuffledVideoNotes, setShuffledVideoNotes] = useState<NostrNote[]>([]);

    // --- Loading States for Media Types (Derive from query results) ---
    // Let's rely on the undefined state of fetched...Notes from useStoreQuery
    // const [isLoadingImages, setIsLoadingImages] = useState<boolean>(true);
    // const [isLoadingVideos, setIsLoadingVideos] = useState<boolean>(true);
    // const [isLoadingPodcasts, setIsLoadingPodcasts] = useState<boolean>(true);

    // --- Build Filters (using props: followedAuthorPubkeys, followedTags) ---
    const mediaFilters = useMemo(() => {
        const authorsFilterPart = followedAuthorPubkeys.length > 0 ? { authors: followedAuthorPubkeys } : null;
        const tagsFilterPart = followedTags.length > 0 ? { '#t': followedTags } : null;

        const baseImageFilters: Filter = { kinds: [1063], limit: imageFetchLimit, ...(imageFetchUntil && { until: imageFetchUntil }) };
        const baseVideoFilters: Filter = { kinds: [34235], limit: videoFetchLimit, ...(videoFetchUntil && { until: videoFetchUntil }) };
        // REMOVED basePodcastKind31234Filters

        const imageFiltersArray: Filter[] = [];
        if (authorsFilterPart) imageFiltersArray.push({ ...baseImageFilters, ...authorsFilterPart });
        if (tagsFilterPart) imageFiltersArray.push({ ...baseImageFilters, ...tagsFilterPart });
        if (imageFiltersArray.length === 0 && !authorsFilterPart && !tagsFilterPart) imageFiltersArray.push(baseImageFilters);

        const videoFiltersArray: Filter[] = [];
        if (authorsFilterPart) videoFiltersArray.push({ ...baseVideoFilters, ...authorsFilterPart });
        if (tagsFilterPart) videoFiltersArray.push({ ...baseVideoFilters, ...tagsFilterPart });
        if (videoFiltersArray.length === 0 && !authorsFilterPart && !tagsFilterPart) videoFiltersArray.push(baseVideoFilters);
        
        // MODIFIED: General Kind 1 filter from ALL followed authors if any are followed
        const generalKind1FiltersArray: Filter[] = []; // RENAMED from podcastFiltersArray
        if (authorsFilterPart) { // Check if there are any followed authors
            generalKind1FiltersArray.push({ // RENAMED from podcastFiltersArray
                kinds: [1], 
                authors: followedAuthorPubkeys, // Use all followed authors
                limit: generalKind1FetchLimit, 
                ...(generalKind1FetchUntil && { until: generalKind1FetchUntil }),
            });
        } // If no authors are followed, generalKind1FiltersArray remains empty
        
        console.log("[useMediaContent] Constructed Filters:", { imageFiltersArray, videoFiltersArray, generalKind1FiltersArray }); // UPDATED Log

        return { imageFiltersArray, videoFiltersArray, generalKind1FiltersArray }; // UPDATED Return

    }, [followedAuthorPubkeys, followedTags, imageFetchLimit, videoFetchLimit, generalKind1FetchLimit, imageFetchUntil, videoFetchUntil, generalKind1FetchUntil]);

    // --- Subscribe to Media Events using Applesauce Hooks ---
    const imageQueryArgs = useMemo(() => mediaFilters.imageFiltersArray.length > 0 ? mediaFilters.imageFiltersArray : null, [mediaFilters.imageFiltersArray]);
    const videoQueryArgs = useMemo(() => mediaFilters.videoFiltersArray.length > 0 ? mediaFilters.videoFiltersArray : null, [mediaFilters.videoFiltersArray]);
    // const podcastQueryArgs = useMemo(() => mediaFilters.podcastFiltersArray.length > 0 ? mediaFilters.podcastFiltersArray : null, [mediaFilters.podcastFiltersArray]); // REMOVED
    const generalKind1QueryArgs = useMemo(() => mediaFilters.generalKind1FiltersArray.length > 0 ? mediaFilters.generalKind1FiltersArray : null, [mediaFilters.generalKind1FiltersArray]); // ADDED

    console.log('[useMediaContent] imageQueryArgs constructed:', JSON.stringify(imageQueryArgs, null, 2));
    const fetchedImageEvents = Hooks.useStoreQuery(Queries.TimelineQuery, imageQueryArgs ? [imageQueryArgs] : null);
    console.log('[useMediaContent] fetchedImageEvents RESULT:', fetchedImageEvents);
    
    console.log('[useMediaContent] videoQueryArgs constructed:', JSON.stringify(videoQueryArgs, null, 2));
    const fetchedVideoEvents = Hooks.useStoreQuery(Queries.TimelineQuery, videoQueryArgs ? [videoQueryArgs] : null);
    console.log('[useMediaContent] fetchedVideoEvents RESULT:', fetchedVideoEvents);
    
    console.log('[useMediaContent] generalKind1QueryArgs (for TimelineQuery) constructed:', JSON.stringify(generalKind1QueryArgs, null, 2)); // ADDED
    const fetchedGeneralKind1Events = Hooks.useStoreQuery(Queries.TimelineQuery, generalKind1QueryArgs ? [generalKind1QueryArgs] : null); // ADDED
    console.log('[useMediaContent] fetchedGeneralKind1Events RESULT:', fetchedGeneralKind1Events); // ADDED

    // Stabilize fetched events to prevent useEffect loops from unstable array references
    const stableFetchedImageEvents: NostrEvent[] | null = useMemo(() => {
        if (!fetchedImageEvents) return null;
        try {
            const eventsToStabilize = Array.isArray(fetchedImageEvents) ? fetchedImageEvents : [];
            return JSON.parse(JSON.stringify(eventsToStabilize)) as NostrEvent[];
        } catch (e) {
            console.error("Error stabilizing fetchedImageEvents:", e);
            // Fallback to the original unstable array or null if it wasn't an array initially
            return Array.isArray(fetchedImageEvents) ? fetchedImageEvents : null;
        }
    }, [fetchedImageEvents ? JSON.stringify(fetchedImageEvents) : null]);

    const stableFetchedVideoEvents: NostrEvent[] | null = useMemo(() => {
        if (!fetchedVideoEvents) return null;
        try {
            const eventsToStabilize = Array.isArray(fetchedVideoEvents) ? fetchedVideoEvents : [];
            return JSON.parse(JSON.stringify(eventsToStabilize)) as NostrEvent[];
        } catch (e) {
            console.error("Error stabilizing fetchedVideoEvents:", e);
            return Array.isArray(fetchedVideoEvents) ? fetchedVideoEvents : null;
        }
    }, [fetchedVideoEvents ? JSON.stringify(fetchedVideoEvents) : null]);

    const stableFetchedGeneralKind1Events: NostrEvent[] | null = useMemo(() => {
        if (!fetchedGeneralKind1Events) return null;
        try {
            const eventsToStabilize = Array.isArray(fetchedGeneralKind1Events) ? fetchedGeneralKind1Events : [];
            return JSON.parse(JSON.stringify(eventsToStabilize)) as NostrEvent[];
        } catch (e) {
            console.error("Error stabilizing fetchedGeneralKind1Events:", e);
            return Array.isArray(fetchedGeneralKind1Events) ? fetchedGeneralKind1Events : null;
        }
    }, [fetchedGeneralKind1Events ? JSON.stringify(fetchedGeneralKind1Events) : null]);

    // --- Direct EventStore Check (DEBUGGING) --- 
    const eventStore = Hooks.useEventStore(); // Get the store instance
    useEffect(() => {
      // ADDED: Log to confirm effect execution and current state of podcastQueryArgs
      console.log('[DEBUG] EventStore Check useEffect RUNNING. podcastQueryArgs:', JSON.stringify(generalKind1QueryArgs, null, 2), 'eventStore available:', !!eventStore);

      if (generalKind1QueryArgs && eventStore && generalKind1QueryArgs.length > 0) { // Ensure query args are valid
        console.log('[DEBUG] Checking EventStore directly for podcastQueryArgs:', generalKind1QueryArgs);
        try {
          // Note: eventStore.getAll expects Filter[], and podcastQueryArgs is Filter[] | null
          const matchingEvents = eventStore.getAll(generalKind1QueryArgs); 
          console.log(`[DEBUG] EventStore.getAll found ${matchingEvents.size} events matching the podcast filter.`);
          if (matchingEvents.size > 0) {
              console.log('[DEBUG] Events found by eventStore.getAll:', Array.from(matchingEvents).map(e => ({ id: e.id, kind: e.kind, pubkey: e.pubkey, content: e.content?.substring(0, 100) })));
          }
        } catch (error) {
            console.error('[DEBUG] Error calling eventStore.getAll:', error);
        }
      } else {
          // This log might be noisy if it logs every time args are null initially
          // console.log('[DEBUG] Skipping direct EventStore check (podcastQueryArgs or eventStore not ready).');
      }
    }, [generalKind1QueryArgs, eventStore]); // Rerun when query args or store instance changes

    // --- Process Applesauce Query Results into Notes --- 
    // REMOVED old useEffect for Image processing
    // REMOVED old useEffect for Video processing
    // REMOVED old useEffect for Podcast processing

    // ADDED: Consolidated useEffect for processing all media types
    useEffect(() => {
        console.log('[useMediaContent] Consolidated media processing useEffect RUNS.', 
            { 
                stableFetchedGeneralKind1EventsCount: stableFetchedGeneralKind1Events?.length,
                stableFetchedImageEventsCount: stableFetchedImageEvents?.length,
                stableFetchedVideoEventsCount: stableFetchedVideoEvents?.length 
            }
        );

        const allEventsToProcess: NostrEvent[] = [];
        if (stableFetchedGeneralKind1Events) {
            allEventsToProcess.push(...stableFetchedGeneralKind1Events);
        }
        if (stableFetchedImageEvents) {
            allEventsToProcess.push(...stableFetchedImageEvents);
        }
        if (stableFetchedVideoEvents) {
            allEventsToProcess.push(...stableFetchedVideoEvents);
        }

        console.log('[useMediaContent] Total events collected for processing:', allEventsToProcess.length);
        if (allEventsToProcess.length === 0 && 
            stableFetchedGeneralKind1Events !== undefined && 
            stableFetchedImageEvents !== undefined && 
            stableFetchedVideoEvents !== undefined) {
            // All sources have resolved (not undefined) but yielded no events to process
            setProcessedPodcastNotes([]);
            setProcessedImageNotes([]);
            setProcessedVideoNotes([]);
            console.log('[useMediaContent] All media sources loaded, no events to process. Clearing notes.');
            return; // Early exit if no events from any source after loading
        }

        // Only proceed if at least one source is still undefined (loading) or there are events
        if (allEventsToProcess.length > 0 || 
            stableFetchedGeneralKind1Events === undefined || 
            stableFetchedImageEvents === undefined || 
            stableFetchedVideoEvents === undefined) {

            // Process all collected events
            const processedNotesFromAllSources: ProcessedNostrNote[] = allEventsToProcess.map(event => processApplesauceEvent(event));
            console.log('[useMediaContent] Processed notes from all sources:', processedNotesFromAllSources.length, processedNotesFromAllSources.map(p => ({id: p.id, kind: p.kind, hint: p.mediaTypeHint, url: p.url !== undefined}) ) );

            // Deduplicate events based on ID, preferring events from specific kinds if content-parsed Kind 1 has same ID
            // This simple deduplication takes the first one encountered. More sophisticated logic could prioritize.
            const uniqueProcessedNotesMap = new Map<string, ProcessedNostrNote>();
            processedNotesFromAllSources.forEach(note => {
                if (!uniqueProcessedNotesMap.has(note.id)) {
                    uniqueProcessedNotesMap.set(note.id, note);
                } else {
                    // Basic prioritization: if existing is Kind 1 and new is specific media kind, replace.
                    // Or if new one has a URL and old one didn't (for same ID).
                    const existingNote = uniqueProcessedNotesMap.get(note.id)!;
                    if ( (existingNote.kind === 1 && note.kind !== 1) || 
                         (note.url && !existingNote.url) ) {
                        uniqueProcessedNotesMap.set(note.id, note); // Prioritize specific kind or one with URL
                        console.log(`[useMediaContent] Deduplication: Replaced note ${note.id} with more specific or URL-having version.`);
                    }
                }
            });
            const uniqueProcessedNotes = Array.from(uniqueProcessedNotesMap.values());
            console.log('[useMediaContent] Unique processed notes after deduplication:', uniqueProcessedNotes.length, uniqueProcessedNotes.map(p => ({id: p.id, kind: p.kind, hint: p.mediaTypeHint, url: p.url !== undefined}) ));

            // Filter into respective categories
            const currentPodcastNotes: ProcessedNostrNote[] = [];
            const currentImageNotes: ProcessedNostrNote[] = [];
            const currentVideoNotes: ProcessedNostrNote[] = [];

            uniqueProcessedNotes.forEach(note => {
                if (note.url) { // Only consider notes with an extracted URL
                    if (note.mediaTypeHint === 'audio') {
                        currentPodcastNotes.push(note);
                    } else if (note.mediaTypeHint === 'image') {
                        currentImageNotes.push(note);
                    } else if (note.mediaTypeHint === 'video') {
                        currentVideoNotes.push(note);
                    }
                }
            });

            currentPodcastNotes.sort((a, b) => b.created_at - a.created_at);
            currentImageNotes.sort((a, b) => b.created_at - a.created_at);
            currentVideoNotes.sort((a, b) => b.created_at - a.created_at);

            console.log('[useMediaContent] Categorized notes:', {
                podcastCount: currentPodcastNotes.length,
                imageCount: currentImageNotes.length,
                videoCount: currentVideoNotes.length
            });

            setProcessedPodcastNotes(currentPodcastNotes);
            setProcessedImageNotes(currentImageNotes);
            setProcessedVideoNotes(currentVideoNotes);
        } // else all sources are undefined (initial load, still waiting) or no events yet, do nothing until they load or events arrive

    }, [stableFetchedGeneralKind1Events, stableFetchedImageEvents, stableFetchedVideoEvents]); // queryArgs not needed here as we only care about fetched data
    
    // --- Shuffle Image and Video Notes (Keep) ---
    useEffect(() => {
        setShuffledImageNotes(shuffleArray([...processedImageNotes]));
    }, [processedImageNotes]);

    useEffect(() => {
        setShuffledVideoNotes(shuffleArray([...processedVideoNotes]));
    }, [processedVideoNotes]);

    // --- Fetch Older Content Callbacks (Keep logic, adjust dependencies) ---
    const fetchOlderImages = useCallback(() => {
        // Use processed notes as the source for oldest timestamp
        if (processedImageNotes.length > 0) {
            const oldestTimestamp = Math.min(...processedImageNotes.map(note => note.created_at));
            console.log(`useMediaContent: Fetching older images (until ${oldestTimestamp})`);
            setImageFetchUntil(oldestTimestamp - 1); // Fetch until *before* the oldest
            // Optional: Increase limit? setImageFetchLimit(prev => prev + X);
        }
    }, [processedImageNotes]);

    const fetchOlderVideos = useCallback(() => {
        // Use processed notes as the source for oldest timestamp
        if (processedVideoNotes.length > 0) {
            const oldestTimestamp = Math.min(...processedVideoNotes.map(note => note.created_at));
            console.log(`useMediaContent: Fetching older videos (until ${oldestTimestamp})`);
            setVideoFetchUntil(oldestTimestamp - 1); // Fetch until *before* the oldest
        }
    }, [processedVideoNotes]);
    
    // --- Determine Loading States --- 
    const isLoadingImages = fetchedImageEvents === undefined;
    const isLoadingVideos = fetchedVideoEvents === undefined;
    const isLoadingPodcasts = fetchedGeneralKind1Events === undefined;

    // --- Return Values ---
    return {
        shuffledImageNotes,
        shuffledVideoNotes,
        podcastNotes: processedPodcastNotes, 
        fetchOlderImages,
        fetchOlderVideos,
        // isLoadingKind3, // REMOVED
        isLoadingImages,
        isLoadingVideos,
        isLoadingPodcasts,
    };
} 