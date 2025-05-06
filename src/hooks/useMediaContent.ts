import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
const TARGET_GENERAL_KIND1_CACHE_SIZE = 500; // Increased for a larger initial cache
const IMAGE_FETCH_LIMIT_AUTHORS = 30;
const IMAGE_FETCH_LIMIT_TAGS = 30;
const VIDEO_FETCH_LIMIT_AUTHORS = 15;
const VIDEO_FETCH_LIMIT_TAGS = 15;

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
        // console.log(`[processApplesauceEvent] Processing Kind 1: ${event.id} from ${event.pubkey.substring(0,6)}... Content snippet: \"${event.content?.substring(0, 70)}...\"`);
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

export interface UseMediaContentProps {
    followedTags: string[];
    followedAuthorPubkeys: string[];
    fetchImagesByTagEnabled: boolean;
    fetchVideosByTagEnabled: boolean;
}

interface UseMediaContentReturn {
    shuffledImageNotes: NostrNote[];
    shuffledVideoNotes: NostrNote[];
    podcastNotes: NostrNote[];
    fetchOlderImages: () => void;
    fetchOlderVideos: () => void;
    isLoadingImages: boolean;
    isLoadingVideos: boolean;
    isLoadingPodcasts: boolean;
}

export function useMediaContent({
    followedTags,
    followedAuthorPubkeys,
    fetchImagesByTagEnabled,
    fetchVideosByTagEnabled,
}: UseMediaContentProps): UseMediaContentReturn {
    const hookInstanceIdRef = useRef<string | null>(null);
    if (!hookInstanceIdRef.current) {
        hookInstanceIdRef.current = Math.random().toString(36).substring(2, 7);
    }
    const hookInstanceId = hookInstanceIdRef.current; // Use this stable string

    console.log(`[useMediaContent ${hookInstanceId}] HOOK EXECUTION, PROPS RECEIVED:`, { 
        followedAuthorPubkeys: JSON.parse(JSON.stringify(followedAuthorPubkeys)), 
        followedTags: JSON.parse(JSON.stringify(followedTags)),
        fetchImagesByTagEnabled,
        fetchVideosByTagEnabled,
    });

    const [imageFetchLimit, setImageFetchLimit] = useState<number>(IMAGE_FETCH_LIMIT_AUTHORS); // Default to author limit
    const [videoFetchLimit, setVideoFetchLimit] = useState<number>(VIDEO_FETCH_LIMIT_AUTHORS); // Default to author limit
    const [generalKind1FetchLimit, setGeneralKind1FetchLimit] = useState<number>(TARGET_GENERAL_KIND1_CACHE_SIZE);
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
        const imageFiltersArray: Filter[] | null = (() => {
            const filters: Filter[] = [];
            if (followedAuthorPubkeys.length > 0) {
                filters.push({
                    kinds: [1063], authors: followedAuthorPubkeys,
                    limit: IMAGE_FETCH_LIMIT_AUTHORS,
                    ...(imageFetchUntil && { until: imageFetchUntil })
                });
            }
            if (followedTags.length > 0 && fetchImagesByTagEnabled) {
                filters.push({
                    kinds: [1063], '#t': followedTags,
                    limit: IMAGE_FETCH_LIMIT_TAGS,
                    ...(imageFetchUntil && { until: imageFetchUntil })
                });
            }
            return filters.length > 0 ? filters : null;
        })();
        console.log('[useMediaContent] Constructed imageFiltersArray:', imageFiltersArray ? JSON.parse(JSON.stringify(imageFiltersArray)) : null);

        const videoFiltersArray: Filter[] | null = (() => {
            const filters: Filter[] = [];
            if (followedAuthorPubkeys.length > 0) {
                filters.push({
                    kinds: [34235], authors: followedAuthorPubkeys,
                    limit: VIDEO_FETCH_LIMIT_AUTHORS,
                    ...(videoFetchUntil && { until: videoFetchUntil })
                });
            }
            if (followedTags.length > 0 && fetchVideosByTagEnabled) {
                filters.push({
                    kinds: [34235], '#t': followedTags,
                    limit: VIDEO_FETCH_LIMIT_TAGS,
                    ...(videoFetchUntil && { until: videoFetchUntil })
                });
            }
            return filters.length > 0 ? filters : null;
        })();
        console.log('[useMediaContent] Constructed videoFiltersArray:', videoFiltersArray ? JSON.parse(JSON.stringify(videoFiltersArray)) : null);
        
        const generalKind1FiltersArray: Filter[] | null = (() => {
            const filters: Filter[] = [];
            if (followedAuthorPubkeys.length > 0) {
                filters.push({
                    kinds: [1], authors: followedAuthorPubkeys,
                    limit: TARGET_GENERAL_KIND1_CACHE_SIZE,
                    ...(generalKind1FetchUntil && { until: generalKind1FetchUntil })
                });
            }
            if (followedTags.length > 0) {
                filters.push({
                    kinds: [1], '#t': followedTags,
                    limit: TARGET_GENERAL_KIND1_CACHE_SIZE,
                    ...(generalKind1FetchUntil && { until: generalKind1FetchUntil })
                });
            }
            return filters.length > 0 ? filters : null;
        })();
        console.log('[useMediaContent] Constructed generalKind1FiltersArray:', generalKind1FiltersArray ? JSON.parse(JSON.stringify(generalKind1FiltersArray)) : null);

        return { imageFiltersArray, videoFiltersArray, generalKind1FiltersArray };
    }, [
        followedAuthorPubkeys, 
        followedTags, 
        fetchImagesByTagEnabled,
        fetchVideosByTagEnabled,
        imageFetchLimit,
        videoFetchLimit,
        generalKind1FetchLimit,
        imageFetchUntil, 
        videoFetchUntil, 
        generalKind1FetchUntil
    ]);

    const imageQueryArgs = useMemo(() => ({
        filters: mediaFilters.imageFiltersArray,
        operator: "OR",
    }), [mediaFilters.imageFiltersArray]);
    
    const videoQueryArgs = useMemo(() => ({
        filters: mediaFilters.videoFiltersArray,
        operator: "OR",
    }), [mediaFilters.videoFiltersArray]);

    const generalKind1QueryArgs = useMemo(() => ({
        filters: mediaFilters.generalKind1FiltersArray,
        operator: "OR",
    }), [mediaFilters.generalKind1FiltersArray]);


    const fetchedImageEvents = Hooks.useStoreQuery(
        Queries.TimelineQuery,
        imageQueryArgs.filters ? [imageQueryArgs] : undefined
    );
    const isLoadingImages = fetchedImageEvents === undefined;
    
    const fetchedVideoEvents = Hooks.useStoreQuery(
        Queries.TimelineQuery,
        videoQueryArgs.filters ? [videoQueryArgs] : undefined
    );
    const isLoadingVideos = fetchedVideoEvents === undefined;
    
    const fetchedGeneralKind1Events = Hooks.useStoreQuery(
        Queries.TimelineQuery,
        generalKind1QueryArgs.filters ? [generalKind1QueryArgs] : undefined
    );
    const isLoadingPodcasts = fetchedGeneralKind1Events === undefined;


    const stableFetchedImageEvents = useMemo(() => fetchedImageEvents || [], [fetchedImageEvents]);
    const stableFetchedVideoEvents = useMemo(() => fetchedVideoEvents || [], [fetchedVideoEvents]);
    const stableFetchedGeneralKind1Events = useMemo(() => fetchedGeneralKind1Events || [], [fetchedGeneralKind1Events]);

    useEffect(() => {
        console.log("[useMediaContent] Entering consolidated processing useEffect. Event counts:", {
            generalKind1: stableFetchedGeneralKind1Events.length,
            kind1063: stableFetchedImageEvents.length,
            kind34235: stableFetchedVideoEvents.length,
        });

        const allFetchedEvents: NostrEvent[] = [
            ...stableFetchedGeneralKind1Events,
            ...stableFetchedImageEvents,
            ...stableFetchedVideoEvents,
        ];
        
        console.log("[useMediaContent] Total events before processing:", allFetchedEvents.length);

        const processedNotesWithHint = allFetchedEvents.map(processApplesauceEvent);

        // Step 1: Deduplication by event ID (keeping best version of an event)
        const uniqueNotesById: Record<string, ProcessedNostrNote> = {};
        processedNotesWithHint.forEach(note => {
            if (!uniqueNotesById[note.id]) {
                uniqueNotesById[note.id] = note;
            } else {
                const existingNote = uniqueNotesById[note.id];
                // Prioritization logic (e.g., prefer specific kind, prefer note with URL, prefer newer)
                if (note.kind !== 1 && existingNote.kind === 1) {
                    uniqueNotesById[note.id] = note;
                } else if (note.url && !existingNote.url) {
                    uniqueNotesById[note.id] = note;
                } else if (note.url && existingNote.url && note.created_at > existingNote.created_at) {
                    uniqueNotesById[note.id] = note;
                } else if (note.mediaTypeHint !== 'unknown' && existingNote.mediaTypeHint === 'unknown') {
                    uniqueNotesById[note.id] = note; // Prefer note with a known media type
                }
            }
        });
        const initiallyProcessedNotes = Object.values(uniqueNotesById);
        console.log("[useMediaContent] Notes after initial ID-based deduplication:", initiallyProcessedNotes.length);

        // Step 2: Categorize these initially processed notes
        const tempPodcastNotes: ProcessedNostrNote[] = [];
        const tempImageNotes: ProcessedNostrNote[] = [];
        const tempVideoNotes: ProcessedNostrNote[] = [];

        initiallyProcessedNotes.forEach(note => {
            if (note.url) { // Only consider notes with a URL for media categories
                if (note.mediaTypeHint === 'audio') {
                    tempPodcastNotes.push(note);
                } else if (note.mediaTypeHint === 'image') {
                    tempImageNotes.push(note);
                } else if (note.mediaTypeHint === 'video') {
                    tempVideoNotes.push(note);
                }
            }
        });

        // Step 3: Video specific processing: Sort by created_at (newest first) then deduplicate by URL
        tempVideoNotes.sort((a, b) => b.created_at - a.created_at); 
        // console.log("[useMediaContent] Videos after sorting (sample):", tempVideoNotes.slice(0,3).map(v => ({id:v.id, url:v.url, created_at:v.created_at})));

        const finalVideoNotes: ProcessedNostrNote[] = [];
        const seenVideoUrls = new Set<string>();
        for (const videoNote of tempVideoNotes) {
            if (videoNote.url && !seenVideoUrls.has(videoNote.url)) {
                finalVideoNotes.push(videoNote);
                seenVideoUrls.add(videoNote.url);
            }
        }
        console.log("[useMediaContent] Videos after URL deduplication (kept newest):", finalVideoNotes.length);

        // For images and podcasts, we'll use the ID-deduplicated versions for now.
        // Future: Consider URL deduplication for images if needed.
        const finalImageNotes = [...tempImageNotes]; // Already ID-deduplicated
        const finalPodcastNotes = [...tempPodcastNotes]; // Already ID-deduplicated
        
        // Sort images by created_at (newest first) - for potential non-shuffled display if needed, shuffling happens later
        finalImageNotes.sort((a, b) => b.created_at - a.created_at);
        // Podcasts might also benefit from a default sort, e.g., newest first
        finalPodcastNotes.sort((a, b) => b.created_at - a.created_at);


        console.log("[useMediaContent] Final categorized notes counts:", { 
            podcasts: finalPodcastNotes.length, 
            images: finalImageNotes.length, 
            videos: finalVideoNotes.length 
        });

        setProcessedPodcastNotes(finalPodcastNotes);
        setProcessedImageNotes(finalImageNotes);
        setProcessedVideoNotes(finalVideoNotes); // These are now sorted and URL-deduplicated

    }, [stableFetchedGeneralKind1Events, stableFetchedImageEvents, stableFetchedVideoEvents]);


    useEffect(() => {
        console.log(`[useMediaContent ${hookInstanceId}] Re-evaluating shuffledImageNotes. processedImageNotes length: ${processedImageNotes.length}`);
        const newShuffledArray = shuffleArray([...processedImageNotes]);
        if (JSON.stringify(newShuffledArray) !== JSON.stringify(shuffledImageNotes)) {
            console.log(`[useMediaContent ${hookInstanceId}] UPDATING shuffledImageNotes. Prev length: ${shuffledImageNotes.length}, New length: ${newShuffledArray.length}`);
            setShuffledImageNotes(newShuffledArray);
        }
    }, [processedImageNotes, hookInstanceId, shuffledImageNotes]);

    useEffect(() => {
        console.log(`[useMediaContent ${hookInstanceId}] Re-evaluating shuffledVideoNotes. processedVideoNotes length: ${processedVideoNotes.length}`);
        const newVideoArray = [...processedVideoNotes]; // No shuffle, just copy
        if (JSON.stringify(newVideoArray) !== JSON.stringify(shuffledVideoNotes)) {
            console.log(`[useMediaContent ${hookInstanceId}] UPDATING shuffledVideoNotes. Prev length: ${shuffledVideoNotes.length}, New length: ${newVideoArray.length}`);
            setShuffledVideoNotes(newVideoArray);
        }
    }, [processedVideoNotes, hookInstanceId, shuffledVideoNotes]);


    const fetchOlderImages = useCallback(() => {
        if (processedImageNotes.length > 0) {
            const oldestTimestamp = processedImageNotes.reduce((min, note) => Math.min(min, note.created_at), Date.now() / 1000);
            setImageFetchUntil(oldestTimestamp -1);
            console.log("[useMediaContent] Fetching older images, until:", oldestTimestamp -1);
        }
    }, [processedImageNotes]);

    const fetchOlderVideos = useCallback(() => {
        if (processedVideoNotes.length > 0) {
            const oldestTimestamp = processedVideoNotes.reduce((min, note) => Math.min(min, note.created_at), Date.now() / 1000);
            setVideoFetchUntil(oldestTimestamp -1);
            console.log("[useMediaContent] Fetching older videos, until:", oldestTimestamp -1);
        }
    }, [processedVideoNotes]);
    

    return {
        shuffledImageNotes,
        shuffledVideoNotes,
        podcastNotes: processedPodcastNotes,
        fetchOlderImages,
        fetchOlderVideos,
        isLoadingImages,
        isLoadingVideos,
        isLoadingPodcasts,
    };
} 