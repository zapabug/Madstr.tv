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
const AUDIO_URL_REGEX = /(https?:\/\/[^\s\"']+\.(m4a|mp3|aac|ogg|wav|flac|opus))/i;

// ADDED: Regex for image and video URLs
const IMAGE_URL_REGEX = /(https?:\/\/[^\s\"']+\.(jpeg|jpg|gif|png|webp|avif|svg))/i;
const VIDEO_URL_REGEX = /(https?:\/\/[^\s\"']+\.(mp4|mov|avi|webm|mkv|flv|ogv))/i;

// ADDED: Interface for processed notes with a media type hint
interface ProcessedNostrNote extends NostrNote {
    mediaTypeHint?: 'audio' | 'image' | 'video' | 'unknown';
}

// Event processing function - MODIFIED
function processApplesauceEvent(event: NostrEvent): ProcessedNostrNote {
    // console.log(`[processApplesauceEvent] Starting for event id: ${event.id}, kind: ${event.kind}`); // Basic entry log
    let basicUrl: string | null = null;
    let sourceType: string = 'unknown';
    let mediaTypeHint: ProcessedNostrNote['mediaTypeHint'] = 'unknown';

    if (event.kind === 1) {
        sourceType = `Kind 1 from ${event.pubkey.substring(0,6)}`;
        // console.log(`[processApplesauceEvent] Processing Kind 1: ${event.id} from ${event.pubkey.substring(0,6)}... Content snippet: "${event.content?.substring(0, 70)}..."`);
        const audioMatch = event.content?.match(AUDIO_URL_REGEX);
        if (audioMatch && audioMatch[0]) {
            basicUrl = audioMatch[0];
            mediaTypeHint = 'audio';
            sourceType += ' (audio URL in content)';
            // console.log(`[processApplesauceEvent] Audio URL FOUND via ${sourceType}:`, { eventId: event.id, basicUrl });
        } else {
            const imageMatch = event.content?.match(IMAGE_URL_REGEX);
            if (imageMatch && imageMatch[0]) {
                basicUrl = imageMatch[0];
                mediaTypeHint = 'image';
                sourceType += ' (image URL in content)';
                // console.log(`[processApplesauceEvent] Image URL FOUND via ${sourceType}:`, { eventId: event.id, basicUrl });
            } else {
                const videoMatch = event.content?.match(VIDEO_URL_REGEX);
                if (videoMatch && videoMatch[0]) {
                    basicUrl = videoMatch[0];
                    mediaTypeHint = 'video';
                    sourceType += ' (video URL in content)';
                    // console.log(`[processApplesauceEvent] Video URL FOUND via ${sourceType}:`, { eventId: event.id, basicUrl });
                } else {
                    // if (event.pubkey === NOSOLUTIONS_PUBKEY_HEX) {
                    //     console.log(`[processApplesauceEvent] No media URL (audio, image, video) NOT FOUND for NoSolutions Kind 1. Event:`, { eventId: event.id });
                    // }
                }
            }
        }
    } else if (event.kind === 1063) {
        sourceType = `Image (Kind 1063 tags)`;
        mediaTypeHint = 'image';
        basicUrl = event.tags.find(t => t[0] === 'url')?.[1] || 
                   event.tags.find(t => t[0] === 'media')?.[1] || 
                   event.tags.find(t => t[0] === 'image')?.[1] || 
                   null;
        // if (basicUrl) {
        //     console.log(`[processApplesauceEvent] Media URL FOUND via ${sourceType}:`, { eventId: event.id, basicUrl });
        // } else {
        //     console.log(`[processApplesauceEvent] Media URL NOT FOUND via ${sourceType} tags. Event:`, { eventId: event.id, tags: event.tags });
        // }
    } else if (event.kind === 34235) {
        sourceType = `Video (Kind 34235 tags)`;
        mediaTypeHint = 'video';
        basicUrl = event.tags.find(t => t[0] === 'url')?.[1] || 
                   event.tags.find(t => t[0] === 'media')?.[1] || 
                   null;
        // if (basicUrl) {
        //     console.log(`[processApplesauceEvent] Media URL FOUND via ${sourceType}:`, { eventId: event.id, basicUrl });
        // } else {
        //     console.log(`[processApplesauceEvent] Media URL NOT FOUND via ${sourceType} tags. Event:`, { eventId: event.id, tags: event.tags });
        // }
    }
    // if (basicUrl) console.log(`[processApplesauceEvent] Event ${event.id} (kind ${event.kind}) processed. URL: ${basicUrl}, Hint: ${mediaTypeHint}`);


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
        mediaTypeHint,
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
    console.log('[useMediaContent] HOOK EXECUTION, PROPS RECEIVED:', { 
        followedAuthorPubkeys: JSON.parse(JSON.stringify(followedAuthorPubkeys)), 
        followedTags: JSON.parse(JSON.stringify(followedTags)) 
    });

    const [imageFetchLimit, setImageFetchLimit] = useState<number>(INITIAL_IMAGE_FETCH_LIMIT);
    const [videoFetchLimit, setVideoFetchLimit] = useState<number>(INITIAL_VIDEO_FETCH_LIMIT);
    const [generalKind1FetchLimit, setGeneralKind1FetchLimit] = useState<number>(INITIAL_GENERAL_KIND1_FETCH_LIMIT);
    const [generalKind1FetchUntil, setGeneralKind1FetchUntil] = useState<number | undefined>(undefined);
    const [imageFetchUntil, setImageFetchUntil] = useState<number | undefined>(undefined);
    const [videoFetchUntil, setVideoFetchUntil] = useState<number | undefined>(undefined);

    const [processedImageNotes, setProcessedImageNotes] = useState<NostrNote[]>([]);
    const [processedVideoNotes, setProcessedVideoNotes] = useState<NostrNote[]>([]);
    const [processedPodcastNotes, setProcessedPodcastNotes] = useState<NostrNote[]>([]);

    const [shuffledImageNotes, setShuffledImageNotes] = useState<NostrNote[]>([]);
    const [shuffledVideoNotes, setShuffledVideoNotes] = useState<NostrNote[]>([]);

    const mediaFilters = useMemo(() => {
        console.log('[useMediaContent] Recalculating mediaFilters...');
        const authorsFilterPart = followedAuthorPubkeys.length > 0 ? { authors: followedAuthorPubkeys } : null;
        
        const imageFiltersArray: Filter[] | null = (() => {
            if (followedAuthorPubkeys.length === 0 && followedTags.length === 0) return null;
            const filters: Filter[] = [];
            if (followedAuthorPubkeys.length > 0) {
                filters.push({
                    kinds: [1063], authors: followedAuthorPubkeys,
                    limit: imageFetchLimit, ...(imageFetchUntil && { until: imageFetchUntil })
                });
            }
            if (followedTags.length > 0) {
                filters.push({
                    kinds: [1063], '#t': followedTags,
                    limit: imageFetchLimit, ...(imageFetchUntil && { until: imageFetchUntil })
                });
            }
            return filters.length > 0 ? filters : null;
        })();
        console.log('[useMediaContent] Constructed imageFiltersArray:', imageFiltersArray ? JSON.parse(JSON.stringify(imageFiltersArray)) : null);

        const videoFiltersArray: Filter[] | null = (() => {
            if (followedAuthorPubkeys.length === 0 && followedTags.length === 0) return null;
            const filters: Filter[] = [];
            if (followedAuthorPubkeys.length > 0) {
                filters.push({
                    kinds: [34235], authors: followedAuthorPubkeys,
                    limit: videoFetchLimit, ...(videoFetchUntil && { until: videoFetchUntil })
                });
            }
            if (followedTags.length > 0) {
                filters.push({
                    kinds: [34235], '#t': followedTags,
                    limit: videoFetchLimit, ...(videoFetchUntil && { until: videoFetchUntil })
                });
            }
            return filters.length > 0 ? filters : null;
        })();
        console.log('[useMediaContent] Constructed videoFiltersArray:', videoFiltersArray ? JSON.parse(JSON.stringify(videoFiltersArray)) : null);
        
        const baseGeneralKind1Filters: Filter = { 
            kinds: [1], 
            limit: generalKind1FetchLimit, 
            ...(generalKind1FetchUntil && { until: generalKind1FetchUntil }) 
        };
        const generalKind1FiltersArray: Filter[] = [];
        if (authorsFilterPart) {
            generalKind1FiltersArray.push({ ...baseGeneralKind1Filters, ...authorsFilterPart });
        }
        // If you also want Kind 1 from tags (currently not implemented, but if added):
        // if (followedTags.length > 0) {
        //     generalKind1FiltersArray.push({ ...baseGeneralKind1Filters, '#t': followedTags });
        // }
        console.log('[useMediaContent] Constructed generalKind1FiltersArray:', generalKind1FiltersArray.length > 0 ? JSON.parse(JSON.stringify(generalKind1FiltersArray)) : 'Empty (no authors/tags for Kind 1)');

        return { imageFiltersArray, videoFiltersArray, generalKind1FiltersArray };
    }, [followedAuthorPubkeys, followedTags, imageFetchLimit, imageFetchUntil, videoFetchLimit, videoFetchUntil, generalKind1FetchLimit, generalKind1FetchUntil]);

    // --- Fetching Data using Applesauce Hooks ---
    const imageQueryArgs = useMemo(() => mediaFilters.imageFiltersArray, [mediaFilters.imageFiltersArray]);
    const videoQueryArgs = useMemo(() => mediaFilters.videoFiltersArray, [mediaFilters.videoFiltersArray]);
    const generalKind1QueryArgs = useMemo(() => mediaFilters.generalKind1FiltersArray.length > 0 ? mediaFilters.generalKind1FiltersArray : null, [mediaFilters.generalKind1FiltersArray]);

    console.log('[useMediaContent] imageQueryArgs for TimelineQuery:', imageQueryArgs ? JSON.parse(JSON.stringify(imageQueryArgs)) : null);
    const fetchedImageEvents = Hooks.useStoreQuery(Queries.TimelineQuery, imageQueryArgs ? [imageQueryArgs] : null);
    console.log('[useMediaContent] fetchedImageEvents (Result from TimelineQuery):', fetchedImageEvents === undefined ? 'undefined' : fetchedImageEvents === null ? 'null' : fetchedImageEvents.map(e => e.id));


    console.log('[useMediaContent] videoQueryArgs for TimelineQuery:', videoQueryArgs ? JSON.parse(JSON.stringify(videoQueryArgs)) : null);
    const fetchedVideoEvents = Hooks.useStoreQuery(Queries.TimelineQuery, videoQueryArgs ? [videoQueryArgs] : null);
    console.log('[useMediaContent] fetchedVideoEvents (Result from TimelineQuery):', fetchedVideoEvents === undefined ? 'undefined' : fetchedVideoEvents === null ? 'null' : fetchedVideoEvents.map(e => e.id));

    console.log('[useMediaContent] generalKind1QueryArgs for TimelineQuery:', generalKind1QueryArgs ? JSON.parse(JSON.stringify(generalKind1QueryArgs)) : null);
    const fetchedGeneralKind1Events = Hooks.useStoreQuery(Queries.TimelineQuery, generalKind1QueryArgs ? [generalKind1QueryArgs] : null);
    console.log('[useMediaContent] fetchedGeneralKind1Events (Result from TimelineQuery):', fetchedGeneralKind1Events === undefined ? 'undefined' : fetchedGeneralKind1Events === null ? 'null' : fetchedGeneralKind1Events.map(e => e.id));


    // --- Stabilize fetched events for useEffect dependency ---
    const stableFetchedImageEvents = useMemo(() => fetchedImageEvents, [JSON.stringify(fetchedImageEvents)]);
    const stableFetchedVideoEvents = useMemo(() => fetchedVideoEvents, [JSON.stringify(fetchedVideoEvents)]);
    const stableFetchedGeneralKind1Events = useMemo(() => fetchedGeneralKind1Events, [JSON.stringify(fetchedGeneralKind1Events)]);

    // --- Consolidated Event Processing ---
    useEffect(() => {
        console.log('[useMediaContent PROCESS_EFFECT] Starting. Stable inputs:', {
            stableFetchedGeneralKind1Events: stableFetchedGeneralKind1Events?.map(e => e.id),
            stableFetchedImageEvents: stableFetchedImageEvents?.map(e => e.id),
            stableFetchedVideoEvents: stableFetchedVideoEvents?.map(e => e.id),
        });

        const allEventsToProcess = [
            ...(stableFetchedGeneralKind1Events || []),
            ...(stableFetchedImageEvents || []),
            ...(stableFetchedVideoEvents || []),
        ];
        console.log(`[useMediaContent PROCESS_EFFECT] allEventsToProcess count: ${allEventsToProcess.length}`);
        if (allEventsToProcess.length === 0) {
            console.log('[useMediaContent PROCESS_EFFECT] No events to process, clearing notes.');
            setProcessedPodcastNotes([]);
            setProcessedImageNotes([]);
            setProcessedVideoNotes([]);
            return;
        }

        const processedNotesWithHint = allEventsToProcess.map(processApplesauceEvent);
        console.log(`[useMediaContent PROCESS_EFFECT] processedNotesWithHint count: ${processedNotesWithHint.length}. Sample (first 3):`, processedNotesWithHint.slice(0,3).map(n => ({id: n.id, url: n.url, hint: n.mediaTypeHint})));


        // Deduplication by event ID
        const uniqueNotesMap = new Map<string, ProcessedNostrNote>();
        processedNotesWithHint.forEach(note => {
            const existing = uniqueNotesMap.get(note.id);
            if (!existing) {
                uniqueNotesMap.set(note.id, note);
            } else {
                // Basic prioritization: specific kind over general, or with URL over without
                if ((note.kind === 1063 || note.kind === 34235) && existing.kind === 1) {
                    uniqueNotesMap.set(note.id, note); // Prefer specific kind
                } else if (note.url && !existing.url) {
                    uniqueNotesMap.set(note.id, note); // Prefer note with URL
                } else if (note.url && existing.url && note.mediaTypeHint !== 'unknown' && existing.mediaTypeHint === 'unknown') {
                    uniqueNotesMap.set(note.id, note); // Prefer note with known media type hint
                }
                 // else keep existing
            }
        });
        const deduplicatedNotes = Array.from(uniqueNotesMap.values());
        console.log(`[useMediaContent PROCESS_EFFECT] deduplicatedNotes count: ${deduplicatedNotes.length}. Sample (first 3):`, deduplicatedNotes.slice(0,3).map(n => ({id: n.id, url: n.url, hint: n.mediaTypeHint})));


        // Categorize
        const currentPodcastNotes: NostrNote[] = [];
        const currentImageNotes: NostrNote[] = [];
        const currentVideoNotes: NostrNote[] = [];

        deduplicatedNotes.forEach(note => {
            if (note.url) { // Only include notes with a successfully extracted URL
                if (note.mediaTypeHint === 'audio') {
                    currentPodcastNotes.push(note);
                } else if (note.mediaTypeHint === 'image') {
                    currentImageNotes.push(note);
                } else if (note.mediaTypeHint === 'video') {
                    currentVideoNotes.push(note);
                }
            }
        });
        console.log(`[useMediaContent PROCESS_EFFECT] Categorized - Podcasts: ${currentPodcastNotes.length}, Images: ${currentImageNotes.length}, Videos: ${currentVideoNotes.length}`);

        setProcessedPodcastNotes(prev => {
            if (JSON.stringify(prev) !== JSON.stringify(currentPodcastNotes)) {
                console.log('[useMediaContent PROCESS_EFFECT] Updating processedPodcastNotes.');
                return currentPodcastNotes;
            }
            return prev;
        });
        setProcessedImageNotes(prev => {
            if (JSON.stringify(prev) !== JSON.stringify(currentImageNotes)) {
                console.log('[useMediaContent PROCESS_EFFECT] Updating processedImageNotes.');
                return currentImageNotes;
            }
            return prev;
        });
        setProcessedVideoNotes(prev => {
            if (JSON.stringify(prev) !== JSON.stringify(currentVideoNotes)) {
                console.log('[useMediaContent PROCESS_EFFECT] Updating processedVideoNotes.');
                return currentVideoNotes;
            }
            return prev;
        });

    }, [stableFetchedGeneralKind1Events, stableFetchedImageEvents, stableFetchedVideoEvents]);


    // Shuffle image and video notes when their processed versions change
    useEffect(() => {
        console.log(`[useMediaContent SHUFFLE_EFFECT] Shuffling ${processedImageNotes.length} image notes.`);
        setShuffledImageNotes(shuffleArray([...processedImageNotes]));
    }, [processedImageNotes]);

    useEffect(() => {
        console.log(`[useMediaContent SHUFFLE_EFFECT] Shuffling ${processedVideoNotes.length} video notes.`);
        setShuffledVideoNotes(shuffleArray([...processedVideoNotes]));
    }, [processedVideoNotes]);

    // --- Callbacks for fetching older content (Pagination) ---
    const fetchOlderImages = useCallback(() => {
        console.log("[useMediaContent] fetchOlderImages called");
        if (processedImageNotes.length > 0) {
            const oldestImageTimestamp = Math.min(...processedImageNotes.map(n => n.created_at));
            setImageFetchUntil(oldestImageTimestamp -1); // Fetch events created before the oldest currently displayed
            setImageFetchLimit(prev => prev + 10); // Or just increase limit, depending on desired behavior
            console.log(`[useMediaContent] Setting imageFetchUntil to ${oldestImageTimestamp - 1}, new limit ${imageFetchLimit + 10}`);
        } else {
            console.log("[useMediaContent] No images to base 'until' on, just increasing limit for images.");
            setImageFetchLimit(prev => prev + 10);
        }
    }, [processedImageNotes, imageFetchLimit]);

    const fetchOlderVideos = useCallback(() => {
        console.log("[useMediaContent] fetchOlderVideos called");
        if (processedVideoNotes.length > 0) {
            const oldestVideoTimestamp = Math.min(...processedVideoNotes.map(n => n.created_at));
            setVideoFetchUntil(oldestVideoTimestamp - 1);
            setVideoFetchLimit(prev => prev + 10);
            console.log(`[useMediaContent] Setting videoFetchUntil to ${oldestVideoTimestamp - 1}, new limit ${videoFetchLimit + 10}`);
        } else {
            console.log("[useMediaContent] No videos to base 'until' on, just increasing limit for videos.");
            setVideoFetchLimit(prev => prev + 10);
        }
    }, [processedVideoNotes, videoFetchLimit]);
    
    // Placeholder for general Kind 1 pagination if needed later
    // const fetchOlderGeneralKind1 = useCallback(() => { ... });


    const isLoadingImages = useMemo(() => stableFetchedImageEvents === undefined && (mediaFilters.imageFiltersArray?.length ?? 0) > 0, [stableFetchedImageEvents, mediaFilters.imageFiltersArray]);
    const isLoadingVideos = useMemo(() => stableFetchedVideoEvents === undefined && (mediaFilters.videoFiltersArray?.length ?? 0) > 0, [stableFetchedVideoEvents, mediaFilters.videoFiltersArray]);
    const isLoadingPodcasts = useMemo(() => stableFetchedGeneralKind1Events === undefined && mediaFilters.generalKind1FiltersArray.length > 0, [stableFetchedGeneralKind1Events, mediaFilters.generalKind1FiltersArray]);

    console.log('[useMediaContent] FINAL RETURN VALUES:', {
        shuffledImageNotesCount: shuffledImageNotes.length,
        shuffledVideoNotesCount: shuffledVideoNotes.length,
        podcastNotesCount: processedPodcastNotes.length, // podcastNotes are not shuffled in this hook
        isLoadingImages,
        isLoadingVideos,
        isLoadingPodcasts,
    });

    return {
        shuffledImageNotes,
        shuffledVideoNotes,
        podcastNotes: processedPodcastNotes, // Return processed, unsorted podcasts
        fetchOlderImages,
        fetchOlderVideos,
        isLoadingImages,
        isLoadingVideos,
        isLoadingPodcasts,
    };
} 