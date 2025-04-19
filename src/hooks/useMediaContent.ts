import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNDK, useSubscribe } from '@nostr-dev-kit/ndk-hooks';
import { NDKEvent, NDKFilter, NDKKind } from '@nostr-dev-kit/ndk';
import { TV_PUBKEY_NPUB } from '../constants';
import { NostrNote } from '../types/nostr';
import { shuffleArray } from '../utils/shuffleArray';
import { buildMediaFilters, getHexPubkey, MediaType } from '../utils/filterUtils';

// Constants for initial fetch limits
const INITIAL_IMAGE_FETCH_LIMIT = 200;
const INITIAL_VIDEO_FETCH_LIMIT = 200;
const INITIAL_PODCAST_FETCH_LIMIT = 200;

// Event processing function (copied and adapted from App.tsx)
// TODO: Consider moving this to a shared utility if used elsewhere
function processEvent(event: NDKEvent, type: MediaType): NostrNote | null {
    const mimeTag = event.tags.find(t => t[0] === 'm');
    const urlTag = event.tags.find(t => t[0] === 'url');
    const mediaTag = event.tags.find(t => t[0] === 'media'); // NIP-96
    const imageTag = event.tags.find(t => t[0] === 'image'); // Older convention
    const enclosureTag = event.tags.find(t => t[0] === 'enclosure'); // RSS/Podcast

    let mediaUrl: string | undefined;
    let mimeType: string | undefined = mimeTag?.[1];

    let mimeMatch = false;
    if (mimeType) {
        switch (type) {
            case 'image': mimeMatch = mimeType.startsWith('image/'); break;
            case 'video': mimeMatch = mimeType.startsWith('video/'); break;
            case 'podcast': mimeMatch = mimeType.startsWith('audio/'); break;
        }
    }

    if (!mimeMatch) return null;

    if (urlTag?.[1]) {
        mediaUrl = urlTag[1];
    } else if (mediaTag?.[1]) {
        mediaUrl = mediaTag[1];
    } else if (type === 'image' && imageTag?.[1]) {
        mediaUrl = imageTag[1];
    } else if (type === 'podcast' && enclosureTag?.[1]) {
        mediaUrl = enclosureTag[1];
    }

    if (!mediaUrl) return null;

    const title = event.tags.find(t => t[0] === 'title')?.[1];
    const summary = event.tags.find(t => t[0] === 'summary')?.[1];
    const image = event.tags.find(t => t[0] === 'image')?.[1];
    const duration = event.tags.find(t => t[0] === 'duration')?.[1];

    return {
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at ?? 0,
        kind: event.kind ?? 0,
        tags: event.tags,
        content: event.content,
        sig: event.sig || '',
        url: mediaUrl,
        posterPubkey: event.pubkey,
        title: title,
        summary: summary,
        image: image,
        duration: duration,
    };
}

interface UseMediaContentProps {
    followedTags: string[];
    currentUserNpub: string | null; // Npub of the currently logged-in user, or null
}

interface UseMediaContentReturn {
    shuffledImageNotes: NostrNote[];
    shuffledVideoNotes: NostrNote[];
    podcastNotes: NostrNote[];
    fetchOlderImages: () => void;
    fetchOlderVideos: () => void;
    isLoadingKind3: boolean;
    isLoadingImages: boolean;
    isLoadingVideos: boolean;
    isLoadingPodcasts: boolean;
}

export function useMediaContent({
    followedTags,
    currentUserNpub,
}: UseMediaContentProps): UseMediaContentReturn {
    const { ndk } = useNDK();

    // --- State for Followed Author Pubkeys (from Kind 3) ---
    const tvPubkeyHex = useMemo(() => getHexPubkey(TV_PUBKEY_NPUB), []);
    const currentUserHexPubkey = useMemo(() => currentUserNpub ? getHexPubkey(currentUserNpub) : null, [currentUserNpub]);
    const [followedAuthorPubkeys, setFollowedAuthorPubkeys] = useState<string[]>([]);
    const [isLoadingKind3, setIsLoadingKind3] = useState<boolean>(true);

    // --- Determine Pubkey for Kind 3 Fetch ---
    // Use the logged-in user's pubkey if available, otherwise default to TV pubkey.
    const kind3AuthorHex = useMemo(() => {
        console.log(`useMediaContent: Determining Kind 3 author. currentUserHexPubkey: ${currentUserHexPubkey}, tvPubkeyHex: ${tvPubkeyHex}`);
        return currentUserHexPubkey || tvPubkeyHex;
    }, [currentUserHexPubkey, tvPubkeyHex]);

    console.log(`useMediaContent: Pubkey selected for Kind 3 fetch: ${kind3AuthorHex}`);

    // --- Subscribe to Kind 3 Event ---
    const kind3Filter = useMemo((): NDKFilter | null => {
        if (!kind3AuthorHex) {
            console.log("useMediaContent: No author pubkey available for Kind 3 fetch.");
            return null;
        }
        return { kinds: [NDKKind.Contacts], authors: [kind3AuthorHex], limit: 1 };
    }, [kind3AuthorHex]);

    console.log('useMediaContent: Passing filter to useSubscribe (Kind 3):', JSON.stringify(kind3Filter ? [kind3Filter] : []));

    const { events: kind3Events, eose: kind3Eose } = useSubscribe(
        kind3Filter ? [kind3Filter] : [] // Pass empty array if filter is null
        // { closeOnEose: true } // Temporarily removed for debugging Kind 3 fetch
    );

    // --- Process Kind 3 Event ---
    useEffect(() => {
        if (!kind3AuthorHex) {
            setIsLoadingKind3(false);
            setFollowedAuthorPubkeys([]);
            console.log('useMediaContent: Set followedAuthorPubkeys state to empty array (no kind3AuthorHex).');
            return;
        }

        const kind3Event = kind3Events[0];
        if (kind3Event) {
            console.log("useMediaContent: Found Kind 3 event:", kind3Event.rawEvent());
            const followed = kind3Event.tags.filter(tag => tag[0] === 'p' && tag[1]).map(tag => tag[1]);
            console.log(`useMediaContent: Setting followed authors: [${followed.join(', ')}]`);
            setFollowedAuthorPubkeys(followed);
            console.log('useMediaContent: Set followedAuthorPubkeys state:', followed);
            setIsLoadingKind3(false);
        } else if (kind3Eose) {
            console.warn(`useMediaContent: No Kind 3 event found for pubkey ${kind3AuthorHex} after EOSE.`);
            setFollowedAuthorPubkeys([]);
            console.log('useMediaContent: Set followedAuthorPubkeys state to empty array (no Kind 3 found).');
            setIsLoadingKind3(false);
        }
        // Keep loading true until EOSE or event found

    }, [kind3Events, kind3Eose, kind3AuthorHex]);

    // --- Fetch Parameters State ---
    const [imageFetchLimit, setImageFetchLimit] = useState<number>(INITIAL_IMAGE_FETCH_LIMIT);
    const [videoFetchLimit, setVideoFetchLimit] = useState<number>(INITIAL_VIDEO_FETCH_LIMIT);
    const [podcastFetchLimit, setPodcastFetchLimit] = useState<number>(INITIAL_PODCAST_FETCH_LIMIT);
    const [imageFetchUntil, setImageFetchUntil] = useState<number | undefined>(undefined);
    const [videoFetchUntil, setVideoFetchUntil] = useState<number | undefined>(undefined);
    const [podcastFetchUntil, setPodcastFetchUntil] = useState<number | undefined>(undefined);

    // --- State for Raw and Processed Notes ---
    // Store raw events to handle potential updates from subscription
    const [rawImageEvents, setRawImageEvents] = useState<NDKEvent[]>([]);
    const [rawVideoEvents, setRawVideoEvents] = useState<NDKEvent[]>([]);
    const [rawPodcastEvents, setRawPodcastEvents] = useState<NDKEvent[]>([]);

    const [processedImageNotes, setProcessedImageNotes] = useState<NostrNote[]>([]);
    const [processedVideoNotes, setProcessedVideoNotes] = useState<NostrNote[]>([]);
    const [processedPodcastNotes, setProcessedPodcastNotes] = useState<NostrNote[]>([]);

    // --- State for Shuffled Notes ---
    const [shuffledImageNotes, setShuffledImageNotes] = useState<NostrNote[]>([]);
    const [shuffledVideoNotes, setShuffledVideoNotes] = useState<NostrNote[]>([]);

    // --- Loading States for Media Types ---
    const [isLoadingImages, setIsLoadingImages] = useState<boolean>(true);
    const [isLoadingVideos, setIsLoadingVideos] = useState<boolean>(true);
    const [isLoadingPodcasts, setIsLoadingPodcasts] = useState<boolean>(true);

    // --- Build Filters ---
    const imageFilters = useMemo(() => {
        const filters = buildMediaFilters('image', imageFetchLimit, followedAuthorPubkeys, followedTags, imageFetchUntil, currentUserHexPubkey);
        console.log('useMediaContent: Generated imageFilters:', JSON.stringify(filters));
        return filters;
    }, [imageFetchLimit, followedAuthorPubkeys, followedTags, imageFetchUntil, currentUserHexPubkey]);
    
    const videoFilters = useMemo(() => {
        const filters = buildMediaFilters('video', videoFetchLimit, followedAuthorPubkeys, followedTags, videoFetchUntil, currentUserHexPubkey);
        console.log('useMediaContent: Generated videoFilters:', JSON.stringify(filters));
        return filters;
    }, [videoFetchLimit, followedAuthorPubkeys, followedTags, videoFetchUntil, currentUserHexPubkey]);
    
    const podcastFilters = useMemo(() => {
        const filters = buildMediaFilters('podcast', podcastFetchLimit, followedAuthorPubkeys, followedTags, podcastFetchUntil, currentUserHexPubkey);
        console.log('useMediaContent: Generated podcastFilters:', JSON.stringify(filters));
        return filters;
    }, [podcastFetchLimit, followedAuthorPubkeys, followedTags, podcastFetchUntil, currentUserHexPubkey]);

    // --- Subscribe to Media Events ---
    // Pass empty array [] to useSubscribe if filters are null to prevent type errors
    const finalImageFilters = imageFilters ?? [];
    console.log('useMediaContent: Passing to useSubscribe (Images):', JSON.stringify(finalImageFilters));
    const { events: imageEvents, eose: imageEose } = useSubscribe(finalImageFilters, { closeOnEose: false });
    
    const finalVideoFilters = videoFilters ?? [];
    console.log('useMediaContent: Passing to useSubscribe (Videos):', JSON.stringify(finalVideoFilters));
    const { events: videoEvents, eose: videoEose } = useSubscribe(finalVideoFilters, { closeOnEose: false });
    
    const finalPodcastFilters = podcastFilters ?? [];
    console.log('useMediaContent: Passing to useSubscribe (Podcasts):', JSON.stringify(finalPodcastFilters));
    const { events: podcastEvents, eose: podcastEose } = useSubscribe(finalPodcastFilters, { closeOnEose: false });

    // --- Process Raw Events into Notes (with deduplication) ---
    useEffect(() => {
        console.log(`useMediaContent: Received ${imageEvents.length} raw image events from useSubscribe.`, imageEvents.map(e => e.rawEvent()));
        console.log("useMediaContent: Processing raw image events", imageEvents);
        const newNotes = new Map<string, NostrNote>();
        imageEvents.forEach(event => {
            const note = processEvent(event, 'image');
            if (note && !newNotes.has(note.id)) {
                newNotes.set(note.id, note);
            }
        });
        // Merge with existing notes if needed, or just set?
        // For simplicity now, just set. Could merge if supporting pagination better.
        const notesArray = Array.from(newNotes.values());
        setProcessedImageNotes(notesArray);
        if (imageEose) setIsLoadingImages(false); // Stop loading on EOSE
    }, [imageEvents, imageEose]);

    useEffect(() => {
        console.log(`useMediaContent: Received ${videoEvents.length} raw video events from useSubscribe.`, videoEvents.map(e => e.rawEvent()));
        console.log("useMediaContent: Processing raw video events", videoEvents);
        const newNotes = new Map<string, NostrNote>();
        videoEvents.forEach(event => {
            const note = processEvent(event, 'video');
            if (note && !newNotes.has(note.id)) {
                newNotes.set(note.id, note);
            }
        });
        const notesArray = Array.from(newNotes.values());
        setProcessedVideoNotes(notesArray);
        if (videoEose) setIsLoadingVideos(false); // Stop loading on EOSE
    }, [videoEvents, videoEose]);

    useEffect(() => {
        console.log(`useMediaContent: Received ${podcastEvents.length} raw podcast events from useSubscribe.`, podcastEvents.map(e => e.rawEvent()));
        console.log("useMediaContent: Processing raw podcast events", podcastEvents);
        const newNotes = new Map<string, NostrNote>();
        podcastEvents.forEach(event => {
            const note = processEvent(event, 'podcast');
            if (note && !newNotes.has(note.id)) {
                newNotes.set(note.id, note);
            }
        });
        const notesArray = Array.from(newNotes.values());
        setProcessedPodcastNotes(notesArray);
        if (podcastEose) setIsLoadingPodcasts(false); // Stop loading on EOSE
    }, [podcastEvents, podcastEose]);

    // --- Shuffle Image and Video Notes ---
    useEffect(() => {
        console.log("useMediaContent: Shuffling processed image notes", processedImageNotes);
        setShuffledImageNotes(shuffleArray([...processedImageNotes]));
    }, [processedImageNotes]);

    useEffect(() => {
        console.log("useMediaContent: Shuffling processed video notes", processedVideoNotes);
        setShuffledVideoNotes(shuffleArray([...processedVideoNotes]));
    }, [processedVideoNotes]);

    // --- Fetch Older Content Callbacks ---
    const fetchOlderImages = useCallback(() => {
        if (processedImageNotes.length > 0) {
            const oldestTimestamp = Math.min(...processedImageNotes.map(note => note.created_at));
            console.log(`useMediaContent: Fetching older images (until ${oldestTimestamp})`);
            setImageFetchUntil(oldestTimestamp);
            setIsLoadingImages(true); // Indicate loading start
        }
    }, [processedImageNotes]);

    const fetchOlderVideos = useCallback(() => {
        if (processedVideoNotes.length > 0) {
            const oldestTimestamp = Math.min(...processedVideoNotes.map(note => note.created_at));
            console.log(`useMediaContent: Fetching older videos (until ${oldestTimestamp})`);
            setVideoFetchUntil(oldestTimestamp);
            setIsLoadingVideos(true); // Indicate loading start
        }
    }, [processedVideoNotes]);

    // --- Return Values ---
    return {
        shuffledImageNotes,
        shuffledVideoNotes,
        podcastNotes: processedPodcastNotes, // Podcasts aren't shuffled in original App.tsx
        fetchOlderImages,
        fetchOlderVideos,
        isLoadingKind3,
        isLoadingImages,
        isLoadingVideos,
        isLoadingPodcasts,
    };
} 