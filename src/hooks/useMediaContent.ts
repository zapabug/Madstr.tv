import { useState, useEffect, useMemo, useCallback } from 'react';
// REMOVE NDK Hooks
// import { useNDK, useSubscribe } from '@nostr-dev-kit/ndk-hooks';
// import { NDKEvent, NDKFilter, NDKKind } from '@nostr-dev-kit/ndk';

// ADD Applesauce Hooks & Types
import { Filter, NostrEvent } from 'nostr-tools'; // Use nostr-tools types
import { Hooks } from 'applesauce-react';
import { Queries } from 'applesauce-core';

// Keep constants and local types
// import { TV_PUBKEY_NPUB } from '../constants'; // No longer needed here
import { NostrNote } from '../types/nostr';
import { shuffleArray } from '../utils/shuffleArray';
// Keep filter utils, but getHexPubkey is no longer needed here
// import { buildMediaFilters, getHexPubkey, MediaType } from '../utils/filterUtils'; 
// Simplified: Let's rebuild filter logic here for clarity, assuming filterUtils might be outdated

// Constants for initial fetch limits
const INITIAL_IMAGE_FETCH_LIMIT = 20;
const INITIAL_VIDEO_FETCH_LIMIT = 20;
const INITIAL_PODCAST_FETCH_LIMIT = 50; // Maybe more for podcasts?

// Pubkey for NoSolutions
const NOSOLUTIONS_PUBKEY_HEX = "9bde421491f3ead1ac21bd1d01667aab947f4c1c4aed87624cf2273b06ca052b";

// Regex to find audio URLs in content
const AUDIO_URL_REGEX = /(https?:\/\/[^\s"']+\.(m4a|mp3|aac|ogg|wav|flac|opus))/i;

// Event processing function - simplified, assumes event is already NostrEvent
// and URL extraction happens later or is handled by data structure.
// This might need revisiting depending on what TimelineQuery returns.
function processApplesauceEvent(event: NostrEvent): NostrNote {
    let basicUrl: string | null = null;
    let sourceType: string = 'unknown'; // For logging

    if (event.kind === 1) { 
        sourceType = 'Kind 1 (content audio URL attempt)';
        const contentUrlMatch = event.content.match(AUDIO_URL_REGEX);
        if (contentUrlMatch && contentUrlMatch[0]) {
            basicUrl = contentUrlMatch[0];
            console.log(`[processApplesauceEvent] Audio URL FOUND via ${sourceType}:`, { eventId: event.id, pubkey: event.pubkey, basicUrl, kind: event.kind });
        } else {
            console.log(`[processApplesauceEvent] Audio URL NOT FOUND via ${sourceType}. Event:`, 
                { eventId: event.id, pubkey: event.pubkey, kind: event.kind, contentSnippet: event.content?.substring(0,100) }
            );
        }
    } else if (event.kind === 1063 || event.kind === 34235) { // Image or Video
        sourceType = event.kind === 1063 ? 'Image (tags)' : 'Video (tags)';
        basicUrl = event.tags.find(t => t[0] === 'url')?.[1] || 
                   event.tags.find(t => t[0] === 'media')?.[1] || 
                   event.tags.find(t => t[0] === 'image')?.[1] || // 'image' tag primarily for Kind 1063
                   null;
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
    const [podcastFetchLimit, setPodcastFetchLimit] = useState<number>(INITIAL_PODCAST_FETCH_LIMIT);
    const [imageFetchUntil, setImageFetchUntil] = useState<number | undefined>(undefined);
    const [videoFetchUntil, setVideoFetchUntil] = useState<number | undefined>(undefined);
    const [podcastFetchUntil, setPodcastFetchUntil] = useState<number | undefined>(undefined);

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
        
        // MODIFIED: Podcast filter: Kind 1 from ALL followed authors if any are followed
        const podcastFiltersArray: Filter[] = [];
        if (authorsFilterPart) { // Check if there are any followed authors
            podcastFiltersArray.push({ 
                kinds: [1], 
                authors: followedAuthorPubkeys, // Use all followed authors
                limit: podcastFetchLimit, 
                ...(podcastFetchUntil && { until: podcastFetchUntil }),
            });
        } // If no authors are followed, podcastFiltersArray remains empty, so no Kind 1 audio query.
        
        console.log("[useMediaContent] Constructed Filters (Podcasts: Kind 1 from ALL Followed Authors):", { imageFiltersArray, videoFiltersArray, podcastFiltersArray });

        return { imageFiltersArray, videoFiltersArray, podcastFiltersArray };

    }, [followedAuthorPubkeys, followedTags, imageFetchLimit, videoFetchLimit, podcastFetchLimit, imageFetchUntil, videoFetchUntil, podcastFetchUntil]);

    // --- Subscribe to Media Events using Applesauce Hooks ---
    const imageQueryArgs = useMemo(() => mediaFilters.imageFiltersArray.length > 0 ? mediaFilters.imageFiltersArray : null, [mediaFilters.imageFiltersArray]);
    const videoQueryArgs = useMemo(() => mediaFilters.videoFiltersArray.length > 0 ? mediaFilters.videoFiltersArray : null, [mediaFilters.videoFiltersArray]);
    const podcastQueryArgs = useMemo(() => mediaFilters.podcastFiltersArray.length > 0 ? mediaFilters.podcastFiltersArray : null, [mediaFilters.podcastFiltersArray]);

    console.log('[useMediaContent] imageQueryArgs:', JSON.stringify(imageQueryArgs, null, 2));
    const fetchedImageEvents: NostrEvent[] | undefined = Hooks.useStoreQuery(Queries.TimelineQuery, imageQueryArgs ? [imageQueryArgs] : null);
    
    console.log('[useMediaContent] videoQueryArgs:', JSON.stringify(videoQueryArgs, null, 2));
    const fetchedVideoEvents: NostrEvent[] | undefined = Hooks.useStoreQuery(Queries.TimelineQuery, videoQueryArgs ? [videoQueryArgs] : null);
    
    console.log('[useMediaContent] podcastQueryArgs (for TimelineQuery):', JSON.stringify(podcastQueryArgs, null, 2));
    const fetchedPodcastEvents: NostrEvent[] | undefined = Hooks.useStoreQuery(Queries.TimelineQuery, podcastQueryArgs ? [podcastQueryArgs] : null);

    // --- Direct EventStore Check (DEBUGGING) --- 
    const eventStore = Hooks.useEventStore(); // Get the store instance
    useEffect(() => {
      // ADDED: Log to confirm effect execution and current state of podcastQueryArgs
      console.log('[DEBUG] EventStore Check useEffect RUNNING. podcastQueryArgs:', JSON.stringify(podcastQueryArgs, null, 2), 'eventStore available:', !!eventStore);

      if (podcastQueryArgs && eventStore && podcastQueryArgs.length > 0) { // Ensure query args are valid
        console.log('[DEBUG] Checking EventStore directly for podcastQueryArgs:', podcastQueryArgs);
        try {
          // Note: eventStore.getAll expects Filter[], and podcastQueryArgs is Filter[] | null
          const matchingEvents = eventStore.getAll(podcastQueryArgs); 
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
    }, [podcastQueryArgs, eventStore]); // Rerun when query args or store instance changes

    // --- Process Applesauce Query Results into Notes --- 
    useEffect(() => {
        if (fetchedImageEvents) {
            console.log(`useMediaContent: Processing ${fetchedImageEvents.length} fetched image events.`);
            setProcessedImageNotes(fetchedImageEvents.map(processApplesauceEvent));
        } else {
             setProcessedImageNotes([]); // Clear if query args become null
        }
    }, [fetchedImageEvents]);

    useEffect(() => {
        if (fetchedVideoEvents) {
            console.log(`useMediaContent: Processing ${fetchedVideoEvents.length} fetched video events.`);
            setProcessedVideoNotes(fetchedVideoEvents.map(processApplesauceEvent));
        } else {
            setProcessedVideoNotes([]);
        }
    }, [fetchedVideoEvents]);

    useEffect(() => {
        if (fetchedPodcastEvents) {
            console.log(`useMediaContent: Raw fetchedPodcastEvents count (Kind 1 from followed): ${fetchedPodcastEvents.length}`);
            const allProcessedNotes = fetchedPodcastEvents.map(processApplesauceEvent);
            console.log('[useMediaContent] All processed notes (before URL filter - Kind 1 from followed):', allProcessedNotes.map(n => ({id: n.id, kind: n.kind, pubkey: n.pubkey, extractedUrl: n.url, content: n.content?.substring(0,100) })));

            const notesWithUrls = allProcessedNotes.filter(note => note.url !== undefined); 
            console.log(`useMediaContent: Notes with URLs after filter (Kind 1 from followed): ${notesWithUrls.length}`);

            notesWithUrls.sort((a, b) => b.created_at - a.created_at);
            setProcessedPodcastNotes(notesWithUrls);
        } else {
             setProcessedPodcastNotes([]);
             // MODIFIED: Log if the query is skipped because podcastQueryArgs is null 
             // (which happens if followedAuthorPubkeys is empty, thus authorsFilterPart would have been null, leading to empty podcastFiltersArray)
             if (podcastQueryArgs === null) { 
                 console.log('[useMediaContent] Skipping podcast fetch/processing: No authors followed, so no Kind 1 audio query was made.');
             } else {
                 // This case means podcastQueryArgs was not null, but fetchedPodcastEvents is still undefined/null
                 console.log('[useMediaContent] fetchedPodcastEvents is undefined or null (TimelineQuery for Kind 1 audio might still be loading/returned no data).');
             }
        }
    }, [fetchedPodcastEvents, podcastQueryArgs]); // podcastQueryArgs implies changes from followedAuthorPubkeys via mediaFilters

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
    const isLoadingPodcasts = fetchedPodcastEvents === undefined;

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