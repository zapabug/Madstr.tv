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
        // const tagsFilterPart = followedTags.length > 0 ? { '#t': followedTags } : null; // Tags not used for Kind 1 only focus

        // --- RESTORED LOGIC for image and video specific kinds ---
        const imageFiltersArray: Filter[] | null = (() => {
            if (followedAuthorPubkeys.length === 0 && followedTags.length === 0) return null;
            const filters: Filter[] = [];
            if (followedAuthorPubkeys.length > 0) {
                filters.push({ 
                    kinds: [1063], 
                    authors: followedAuthorPubkeys, 
                    limit: imageFetchLimit, 
                    until: imageFetchUntil 
                });
            }
            if (followedTags.length > 0) {
                filters.push({ 
                    kinds: [1063], 
                    '#t': followedTags, 
                    limit: imageFetchLimit, 
                    until: imageFetchUntil 
                });
            }
            return filters.length > 0 ? filters : null;
        })();

        const videoFiltersArray: Filter[] | null = (() => {
            if (followedAuthorPubkeys.length === 0 && followedTags.length === 0) return null;
            const filters: Filter[] = [];
            if (followedAuthorPubkeys.length > 0) {
                filters.push({ 
                    kinds: [34235], 
                    authors: followedAuthorPubkeys, 
                    limit: videoFetchLimit, 
                    until: videoFetchUntil 
                });
            }
            if (followedTags.length > 0) {
                filters.push({ 
                    kinds: [34235], 
                    '#t': followedTags, 
                    limit: videoFetchLimit, 
                    until: videoFetchUntil 
                });
            }
            return filters.length > 0 ? filters : null;
        })();
        // --- END RESTORED LOGIC ---

        // General Kind 1 filters (sole focus for now)
        const baseGeneralKind1Filters: Filter = { 
            kinds: [1], 
            limit: generalKind1FetchLimit, 
            ...(generalKind1FetchUntil && { until: generalKind1FetchUntil }) 
        };
        const generalKind1FiltersArray: Filter[] = [];
        if (authorsFilterPart) {
            generalKind1FiltersArray.push({ ...baseGeneralKind1Filters, ...authorsFilterPart });
        } else {
            // If no authors followed, maybe fetch generic Kind 1s? Or an empty array to fetch nothing.
            // For now, let's fetch nothing if no authors are followed to keep it consistent.
            // generalKind1FiltersArray.push(baseGeneralKind1Filters); // Potentially noisy
        }
        
        // If NoSolutions is specifically followed, ensure we query their Kind 1s even if generalKind1FiltersArray is empty
        // (e.g. if followedAuthorPubkeys was initially empty but then populated with only NoSolutions)
        // This logic might be redundant if NOSOLUTIONS_PUBKEY_HEX is already in followedAuthorPubkeys
        // For now, the main authorsFilterPart should cover this.

        console.log('[useMediaContent] Constructed Filters:', {
            imageFiltersArray,
            videoFiltersArray,
            generalKind1FiltersArray,
        });

        return { imageFiltersArray, videoFiltersArray, generalKind1FiltersArray };
    }, [
        followedAuthorPubkeys,
        // followedTags, // Tags not used for Kind 1 only focus
        imageFetchLimit,
        imageFetchUntil,
        videoFetchLimit,
        videoFetchUntil,
        generalKind1FetchLimit,
        generalKind1FetchUntil,
    ]);

    // --- Setup Query Args for Applesauce --- 
    const imageQueryArgs = useMemo(() => mediaFilters.imageFiltersArray, [mediaFilters.imageFiltersArray]);
    const videoQueryArgs = useMemo(() => mediaFilters.videoFiltersArray, [mediaFilters.videoFiltersArray]);
    const generalKind1QueryArgs = useMemo(() => mediaFilters.generalKind1FiltersArray.length > 0 ? mediaFilters.generalKind1FiltersArray : null, [mediaFilters.generalKind1FiltersArray]);

    console.log('[useMediaContent] imageQueryArgs constructed:', imageQueryArgs);
    // Wrap params in a tuple: [filtersArray]
    const fetchedImageEvents = Hooks.useStoreQuery(Queries.TimelineQuery, imageQueryArgs ? [imageQueryArgs] : null);
    console.log('[useMediaContent] fetchedImageEvents RESULT:', fetchedImageEvents);

    console.log('[useMediaContent] videoQueryArgs constructed:', videoQueryArgs);
    // Wrap params in a tuple: [filtersArray]
    const fetchedVideoEvents = Hooks.useStoreQuery(Queries.TimelineQuery, videoQueryArgs ? [videoQueryArgs] : null);
    console.log('[useMediaContent] fetchedVideoEvents RESULT:', fetchedVideoEvents);

    console.log('[useMediaContent] generalKind1QueryArgs (for TimelineQuery) constructed:', generalKind1QueryArgs);
    // Wrap params in a tuple: [filtersArray]
    const fetchedGeneralKind1Events = Hooks.useStoreQuery(Queries.TimelineQuery, generalKind1QueryArgs ? [generalKind1QueryArgs] : null);
    console.log('[useMediaContent] fetchedGeneralKind1Events RESULT:', fetchedGeneralKind1Events);

    // --- Stabilize fetched events for useEffect dependencies (Keep) ---
    const stableFetchedImageEvents = useMemo(() => fetchedImageEvents ? [...fetchedImageEvents] : [], [fetchedImageEvents]);
    const stableFetchedVideoEvents = useMemo(() => fetchedVideoEvents ? [...fetchedVideoEvents] : [], [fetchedVideoEvents]);
    const stableFetchedGeneralKind1Events = useMemo(() => fetchedGeneralKind1Events ? [...fetchedGeneralKind1Events] : [], [fetchedGeneralKind1Events]);

    // --- Consolidated useEffect for Processing All Media Notes (Keep, it will now mostly process Kind 1) ---
    useEffect(() => {
        console.log('[useMediaContent] Processing useEffect triggered. Dependencies:', {
            stableFetchedGeneralKind1EventsCount: stableFetchedGeneralKind1Events?.length,
            stableFetchedImageEventsCount: stableFetchedImageEvents?.length,
            stableFetchedVideoEventsCount: stableFetchedVideoEvents?.length,
        });

        const allEventsToProcess: NostrEvent[] = [
            ...(stableFetchedGeneralKind1Events || []),
            ...(stableFetchedImageEvents || []),
            ...(stableFetchedVideoEvents || []),
        ];
        
        console.log(`[useMediaContent] Total events to process before deduplication: ${allEventsToProcess.length}`);

        if (allEventsToProcess.length === 0) {
            // If there are no events from any source, clear all processed notes.
            // Only do this if the underlying queries are not undefined (i.e., have resolved, even if to empty).
            if (fetchedGeneralKind1Events !== undefined && fetchedImageEvents !== undefined && fetchedVideoEvents !== undefined) {
                console.log('[useMediaContent] No events from any source after queries resolved, clearing all processed notes.');
                setProcessedPodcastNotes([]);
                setProcessedImageNotes([]);
                setProcessedVideoNotes([]);
            }
            return;
        }

        const processedNotes: ProcessedNostrNote[] = allEventsToProcess.map(processApplesauceEvent);
        console.log(`[useMediaContent] Processed ${processedNotes.length} notes initially.`);

        // Deduplication by event ID, prioritizing specific kinds if IDs match
        const uniqueNotesMap = new Map<string, ProcessedNostrNote>();
        processedNotes.forEach(note => {
            const existing = uniqueNotesMap.get(note.id);
            if (!existing) {
                uniqueNotesMap.set(note.id, note);
            } else {
                // Basic prioritization: keep specific media kind if current is Kind 1, or keep if new one has URL and old doesn't
                if (existing.kind === 1 && note.kind !== 1) {
                    uniqueNotesMap.set(note.id, note); // Prefer specific kind over general Kind 1
                } else if (!existing.url && note.url) {
                    uniqueNotesMap.set(note.id, note); // Prefer version with a URL
                }
                // Could add more prioritization logic here if needed
            }
        });
        const uniqueProcessedNotes = Array.from(uniqueNotesMap.values());
        console.log(`[useMediaContent] Notes after deduplication: ${uniqueProcessedNotes.length}`);

        // Filter into categories based on mediaTypeHint and presence of URL
        const currentPodcastNotes = uniqueProcessedNotes.filter(note => note.mediaTypeHint === 'audio' && note.url);
        const currentImageNotes = uniqueProcessedNotes.filter(note => note.mediaTypeHint === 'image' && note.url);
        const currentVideoNotes = uniqueProcessedNotes.filter(note => note.mediaTypeHint === 'video' && note.url);

        console.log('[useMediaContent] Categorized notes:', {
            podcasts: currentPodcastNotes.length,
            images: currentImageNotes.length,
            videos: currentVideoNotes.length,
        });

        // Sort podcasts by creation date (newest first)
        currentPodcastNotes.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));

        setProcessedPodcastNotes(currentPodcastNotes);
        setProcessedImageNotes(currentImageNotes); // Images will be shuffled later
        setProcessedVideoNotes(currentVideoNotes); // Videos will be shuffled later

    // IMPORTANT: Ensure all dependencies that can change filters or data are included
    }, [stableFetchedGeneralKind1Events, stableFetchedImageEvents, stableFetchedVideoEvents, fetchedGeneralKind1Events, fetchedImageEvents, fetchedVideoEvents]); // Added raw fetched events as deps too

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