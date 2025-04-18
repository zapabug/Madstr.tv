import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import QRCode from 'react-qr-code';
import ndkInstance from './ndk'; // <-- Import the singleton NDK instance
import ImageFeed from './components/ImageFeed';
import MessageBoard from './components/MessageBoard';
import MediaPanel from './components/MediaPanel';
import RelayStatus from './components/RelayStatus';
import VideoPlayer from './components/VideoPlayer';
import { MAIN_THREAD_NEVENT_URI, RELAYS, TV_PUBKEY_NPUB } from './constants';
import { useMediaState } from './hooks/useMediaState';
import { useMediaElementPlayback } from './hooks/useMediaElementPlayback';
import { useFullscreen } from './hooks/useFullscreen';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useImageCarousel } from './hooks/useImageCarousel';
import { useNDK, useNDKInit, useSubscribe } from '@nostr-dev-kit/ndk-hooks';
import { NDKFilter, NDKKind, NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { NostrNote } from './types/nostr';
import { shuffleArray } from './utils/shuffleArray';
import { motion, AnimatePresence } from 'framer-motion';
import SettingsModal from './components/SettingsModal';
import { useAuth } from './hooks/useAuth';

// Fullscreen Timeouts
const INTERACTION_TIMEOUT = 30000; // 30 seconds
const MESSAGE_TIMEOUT = 120000; // 2 minutes
const CHECK_INTERVAL = 5000; // Check every 5 seconds

// --- Constants ---
const IMAGE_CAROUSEL_INTERVAL = 45000; // 45 seconds

// --- Types ---
type MediaType = 'podcast' | 'video' | 'image';

// --- Helper Functions (moved from useMediaNotes) ---
// Helper to get Kinds based on MediaType
function getKindsForMediaType(mediaType: MediaType): number[] {
    switch (mediaType) {
        case 'podcast': return [34235, 31234, NDKKind.Text]; // Podcast Episode, Audio Track, Text
        case 'video': return [NDKKind.Video, NDKKind.Text]; // 31337, 1
        case 'image': return [NDKKind.Image, NDKKind.Text]; // 31338, 1
        default: return [NDKKind.Text];
    }
}

// Helper to get URL Regex based on MediaType
function getUrlRegexForMediaType(mediaType: MediaType): RegExp {
    switch (mediaType) {
        case 'podcast': return /https?:\/\/\S+\.(?:mp3|m4a|ogg|aac|wav)/i;
        case 'video': return /https?:\/\/\S+\.(?:mp4|mov|webm|m3u8)/i;
        case 'image': return /https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp)/i;
        default: return /https?:\/\/\S+/i; // Generic fallback
    }
}

// Helper to safely decode npub (moved from useMediaAuthors)
function getHexPubkey(npub: string): string | null {
    try {
        const decoded = nip19.decode(npub);
        if (decoded.type === 'npub') {
            return decoded.data;
        }
        console.warn(`App.tsx: Decoded type is not npub: ${decoded.type}`);
        return null;
    } catch (e) {
        console.error(`App.tsx: Failed to decode npub ${npub}:`, e);
        return null;
    }
}

// Processing function (adapted from useMediaNotes)
function processEvent(event: NDKEvent, type: MediaType): NostrNote | null {
    const urlRegex = getUrlRegexForMediaType(type);
    // console.log(`processEvent (${type}): Checking event ${event.id}`, { content: event.content, tags: event.tags });

    let mediaUrl: string | undefined;
    let foundVia: string | null = null;
    let isVideoByMimeType = false;

    // 1. Check for VIDEO MIME type tag ('m') first
    if (type === 'video') {
        const mimeTag = event.tags.find((t) => t[0] === 'm' && t[1]?.startsWith('video/'));
        if (mimeTag) {
            isVideoByMimeType = true;
            const urlTag = event.tags.find((t) => t[0] === 'url');
            if (urlTag && urlTag[1]) mediaUrl = urlTag[1], foundVia = 'm tag + url tag';
            if (!mediaUrl) {
                const mediaTag = event.tags.find((t) => t[0] === 'media');
                if (mediaTag && mediaTag[1]) mediaUrl = mediaTag[1], foundVia = 'm tag + media tag';
            }
            if (!mediaUrl) {
                const genericUrlRegex = /https?:\/\/\S+/i;
                const contentMatch = event.content.match(genericUrlRegex);
                if (contentMatch) mediaUrl = contentMatch[0], foundVia = 'm tag + content regex';
            }
        }
    }

    // 2. Fallback: If not identified as video by MIME type OR if type is not video
    if (!mediaUrl) {
        const urlTag = event.tags.find((t) => t[0] === 'url');
        if (urlTag && urlTag[1]?.match(urlRegex)) mediaUrl = urlTag[1], foundVia = 'url tag + regex';

        if (!mediaUrl) {
            const mediaTag = event.tags.find((t) => t[0] === 'media');
            if (mediaTag && mediaTag[1]?.match(urlRegex)) mediaUrl = mediaTag[1], foundVia = 'media tag + regex';
        }

        if (!mediaUrl && type === 'podcast') {
            const enclosureTag = event.tags.find((t) => t[0] === 'enclosure');
            if (enclosureTag && enclosureTag[1]?.match(urlRegex)) mediaUrl = enclosureTag[1], foundVia = 'enclosure tag + regex';
        } else if (!mediaUrl && type === 'image') {
            const imageTag = event.tags.find((t) => t[0] === 'image');
            if (imageTag && imageTag[1]?.match(urlRegex)) mediaUrl = imageTag[1], foundVia = 'image tag + regex';
        }

        // Fallback to content regex
        if (!mediaUrl) {
            const contentMatch = event.content.match(urlRegex);
            if (contentMatch) mediaUrl = contentMatch[0], foundVia = 'content regex';
        }
    }

    if (!mediaUrl) {
        // console.log(`processEvent (${type}): Skipping event ${event.id} - No valid URL found.`);
        return null;
    }
    // console.log(`processEvent (${type}): Found URL for event ${event.id} via ${foundVia}. URL: ${mediaUrl}`);

    const title = event.tags.find(t => t[0] === 'title')?.[1];
    const summary = event.tags.find(t => t[0] === 'summary')?.[1];
    const image = event.tags.find(t => t[0] === 'image')?.[1];
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
        title: title,
        summary: summary,
        image: image,
        duration: duration,
    };
    return note;
}
// --- End Helper Functions ---

function App() {
  // --- Call ALL Hooks Unconditionally at the Top --- 
  const initNDK = useNDKInit(); 
  const { ndk } = useNDK(); 
  console.log("[App.tsx] Value of ndk from useNDK():", ndk);
  const auth = useAuth(); 
  const { followedTags, currentUserNpub } = auth;

  // --- Get Followed Tags (conditional on auth readiness) ---
  // We access followedTags later when building filters, auth handles its internal state.

  // --- State for Followed Author Pubkeys ---
  // Restore state for followed pubkeys from Kind 3
  const tvPubkeyHex = useMemo(() => getHexPubkey(TV_PUBKEY_NPUB), []);
  const [followedAuthorPubkeys, setFollowedAuthorPubkeys] = useState<string[]>([]);

  // --- Get TV Pubkey Hex ---
  // const tvPubkeyHex = useMemo(() => getHexPubkey(TV_PUBKEY_NPUB), []); // Defined above now

  // --- Filter for Kind 3 Subscription ---
  // Restore Kind 3 logic
  const kind3Filter = useMemo((): NDKFilter | null => {
    if (!tvPubkeyHex) return null;
    return { kinds: [NDKKind.Contacts], authors: [tvPubkeyHex], limit: 1 };
  }, [tvPubkeyHex]);
  const kind3SubscriptionFilter = useMemo(() => {
    return kind3Filter ? [kind3Filter] : false; // Return false when skipping
  }, [kind3Filter]);

  // --- Subscribe to Kind 3 Event ---
  const { events: kind3Events, eose: kind3Eose } = useSubscribe(
    kind3SubscriptionFilter, // Use the memoized filter directly
    { closeOnEose: true }
  );

  // --- Process Kind 3 Event ---
  // Restore Kind 3 processing
  useEffect(() => {
    if (!tvPubkeyHex) return;
    const kind3Event = kind3Events[0];
    if (kind3Event) {
      console.log("App: Found Kind 3 event for TV:", kind3Event.rawEvent());
      const followed = kind3Event.tags.filter(tag => tag[0] === 'p' && tag[1]).map(tag => tag[1]);
      console.log(`App: DIAGNOSTIC - Setting followed authors based on TV's Kind 3: [${followed.join(', ')}]`); // <-- DIAGNOSTIC LOG
      setFollowedAuthorPubkeys(followed); // Set state with follows
    } else if (kind3Eose) {
      console.warn("App: DIAGNOSTIC - No Kind 3 event found for TV pubkey after EOSE. Author-based filtering will be limited or disabled."); // <-- DIAGNOSTIC LOG
      setFollowedAuthorPubkeys([]); // Ensure empty array if no Kind 3 found
    }
  }, [kind3Events, kind3Eose, tvPubkeyHex]);

  // --- Fetch Parameters State ---
  const [imageFetchLimit] = useState<number>(200);
  const [videoFetchLimit] = useState<number>(200);
  const [podcastFetchLimit] = useState<number>(200); // Added podcast limit for consistency
  const [imageFetchUntil, setImageFetchUntil] = useState<number | undefined>(undefined);
  const [videoFetchUntil, setVideoFetchUntil] = useState<number | undefined>(undefined);
  const [podcastFetchUntil, setPodcastFetchUntil] = useState<number | undefined>(undefined); // Added podcast until

  // --- State for Processed Notes ---
  const [podcastNotes, setPodcastNotes] = useState<NostrNote[]>([]);
  const [videoNotes, setVideoNotes] = useState<NostrNote[]>([]);
  const [imageNotes, setImageNotes] = useState<NostrNote[]>([]);

  // --- Consolidated Filters for Subscriptions ---
  /*
  const buildMediaFilters = useCallback((mediaType: MediaType, limit: number, until?: number): NDKFilter[] | false => {
    const kinds = getKindsForMediaType(mediaType);
    const hasAuthors = followedAuthorPubkeys.length > 0;
    const hasTags = followedTags && followedTags.length > 0;

    const baseFilter: NDKFilter = { kinds, limit };
    if (until) baseFilter.until = until;

    let filters: NDKFilter[] = [];

    if (hasAuthors && hasTags) {
      console.log(`[DEBUG ${mediaType}] Creating filters for Authors AND Tags`);
      const authorFilter = { ...baseFilter, authors: followedAuthorPubkeys };
      const tagFilter = { ...baseFilter, '#t': followedTags };
      filters = [authorFilter, tagFilter];
    } else if (hasAuthors) {
      console.log(`[DEBUG ${mediaType}] Creating filter for Authors only`);
      filters = [{ ...baseFilter, authors: followedAuthorPubkeys }];
    } else if (hasTags) {
      console.log(`[DEBUG ${mediaType}] Creating filter for Tags only`);
      filters = [{ ...baseFilter, '#t': followedTags }];
    } else {
      console.log(`[DEBUG ${mediaType}] No authors or tags followed. Skipping subscription by returning [].`);
      return []; 
    }

    console.log(`[DEBUG ${mediaType}] Final filters:`, JSON.stringify(filters));
    return filters;
  }, [followedAuthorPubkeys, followedTags]);
  */

  // --- Subscribe to Media Events (Consolidated) ---
  
  // Temporarily disable podcast subscription
  // const podcastFilters = buildMediaFilters('podcast', podcastFetchLimit, podcastFetchUntil);
  // const { events: rawPodcastEvents } = useSubscribe(
  //   Array.isArray(podcastFilters) ? podcastFilters : false,
  //   { closeOnEose: false } 
  // );
  const rawPodcastEvents: NDKEvent[] = []; // Keep variable defined

  // Temporarily disable video subscription
  // const videoFilters = buildMediaFilters('video', videoFetchLimit, videoFetchUntil);
  // const { events: rawVideoEvents } = useSubscribe(
  //   Array.isArray(videoFilters) ? videoFilters : false,
  //   { closeOnEose: false }
  // );
  const rawVideoEvents: NDKEvent[] = []; // Keep variable defined

  // Use a HARDCODED simple filter for images to test useSubscribe stability
  const hardcodedImageFilters: NDKFilter[] = [{ kinds: [1], limit: 10 }]; 
  // const imageFilters = buildMediaFilters('image', imageFetchLimit, imageFetchUntil);
  const { events: rawImageEvents } = useSubscribe(
    // Array.isArray(imageFilters) ? imageFilters : false,
    hardcodedImageFilters, // Use the hardcoded filter
    { closeOnEose: false }
  );


  // --- Process Raw Events into Notes State (Simplified) ---
  useEffect(() => {
    console.log(`[App.tsx] DIAGNOSTIC - Received ${rawPodcastEvents.length} raw podcast events`);
    // Deduplicate based on event ID
    const uniqueEvents = Array.from(new Map(rawPodcastEvents.map(event => [event.id, event])).values());
    const processedNotes = uniqueEvents
      .map(event => processEvent(event, 'podcast')) // processEvent already logs details
      .filter((note): note is NostrNote => note !== null);

    if (processedNotes.length > 0) {
        console.log(`[App.tsx] Processed ${processedNotes.length} unique podcast notes from ${uniqueEvents.length} unique events.`);
    } else if (uniqueEvents.length > 0) {
        console.log(`[App.tsx] No valid podcast notes found after processing ${uniqueEvents.length} unique events.`);
    }
    setPodcastNotes(processedNotes);
  }, [rawPodcastEvents]); // Depend only on the direct subscription results

  useEffect(() => {
    console.log(`[App.tsx] DIAGNOSTIC - Received ${rawVideoEvents.length} raw video events`);
    const uniqueEvents = Array.from(new Map(rawVideoEvents.map(event => [event.id, event])).values());
    const processedNotes = uniqueEvents
      .map(event => processEvent(event, 'video'))
      .filter((note): note is NostrNote => note !== null);

    if (processedNotes.length > 0) {
        console.log(`[App.tsx] Processed ${processedNotes.length} unique video notes from ${uniqueEvents.length} unique events.`);
    } else if (uniqueEvents.length > 0) {
        console.log(`[App.tsx] No valid video notes found after processing ${uniqueEvents.length} unique events.`);
    }
    setVideoNotes(processedNotes);
  }, [rawVideoEvents]);

  useEffect(() => {
    console.log(`[App.tsx] DIAGNOSTIC - Received ${rawImageEvents.length} raw image events`);
    const uniqueEvents = Array.from(new Map(rawImageEvents.map(event => [event.id, event])).values());
    const processedNotes = uniqueEvents
      .map(event => processEvent(event, 'image'))
      .filter((note): note is NostrNote => note !== null);

    if (processedNotes.length > 0) {
        console.log(`[App.tsx] Processed ${processedNotes.length} unique image notes from ${uniqueEvents.length} unique events.`);
    } else if (uniqueEvents.length > 0) {
        console.log(`[App.tsx] No valid image notes found after processing ${uniqueEvents.length} unique events.`);
    }

    // Only update state if the processed notes have actually changed
    if (JSON.stringify(processedNotes) !== JSON.stringify(imageNotes)) {
        console.log("[App.tsx] Image notes changed, updating state.");
        setImageNotes(processedNotes);
    } else {
        // console.log("[App.tsx] Image notes haven't changed, skipping state update.");
    }
  }, [rawImageEvents, imageNotes]); // Add imageNotes to dependency array for comparison
  // --- End Process Raw Events ---

  const [shuffledImageNotes, setShuffledImageNotes] = useState<NostrNote[]>([]);
  const [shuffledVideoNotes, setShuffledVideoNotes] = useState<NostrNote[]>([]);
  const [initialPodcastTime] = useState<number>(0);
  const [preloadVideoUrl, setPreloadVideoUrl] = useState<string | null>(null);
  const fetchOlderImages = useCallback(() => {
    if (imageNotes.length > 0) { 
      const oldestTimestamp = imageNotes[imageNotes.length - 1].created_at;
      setImageFetchUntil(oldestTimestamp); 
    }
  }, [imageNotes]);
  const fetchOlderVideos = useCallback(() => {
    if (videoNotes.length > 0) { 
      const oldestTimestamp = videoNotes[videoNotes.length - 1].created_at;
      setVideoFetchUntil(oldestTimestamp); 
    }
  }, [videoNotes]);
  const mediaState = useMediaState({ 
      initialImageNotes: shuffledImageNotes, 
      initialPodcastNotes: podcastNotes, 
      initialVideoNotes: shuffledVideoNotes,
      fetchOlderImages: fetchOlderImages, 
      fetchOlderVideos: fetchOlderVideos,
      shuffledImageNotesLength: shuffledImageNotes.length,
      shuffledVideoNotesLength: shuffledVideoNotes.length,
  });
  const { viewMode, currentImageIndex, currentPodcastIndex, currentVideoIndex, currentItemUrl, handleVideoSelect, handlePrevious, handleNext, setViewMode, setCurrentPodcastIndex } = mediaState;
  const fullscreenState = useFullscreen({
    interactionTimeout: INTERACTION_TIMEOUT,
    messageTimeout: MESSAGE_TIMEOUT,
    checkInterval: CHECK_INTERVAL,
  });
  const { isFullScreen, signalInteraction, signalMessage } = fullscreenState;
  const handleNewMessage = useCallback(() => {
      signalMessage(); 
  }, [signalMessage]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeMediaRef = viewMode === 'videoPlayer' ? videoRef : audioRef;
  const playbackInitialTime = viewMode === 'imagePodcast' ? initialPodcastTime : 0;
  const playbackState = useMediaElementPlayback({
    mediaElementRef: activeMediaRef as React.RefObject<HTMLMediaElement>,
    currentItemUrl: currentItemUrl, 
    viewMode: viewMode,
    onEnded: handleNext, 
    initialTime: playbackInitialTime, 
  });
  const { isPlaying, currentTime, duration, playbackRate, setPlaybackRate, togglePlayPause, handleSeek, isMuted, autoplayFailed } = playbackState;
  const imageFeedRef = useRef<HTMLDivElement>(null);
  const focusImageFeedToggle = useCallback(() => {
    console.warn("Focusing ImageFeed toggle button via ref is currently disabled.");
  }, []);
  const qrValue = MAIN_THREAD_NEVENT_URI || '';
  useKeyboardControls({ 
    isFullScreen, signalInteraction, onSetViewMode: setViewMode, onTogglePlayPause: togglePlayPause, 
    onNext: handleNext, onPrevious: handlePrevious, onFocusToggle: focusImageFeedToggle, viewMode 
  });
  const isCarouselActive = viewMode === 'imagePodcast' && shuffledImageNotes.length > 1;
  useImageCarousel({
      isActive: isCarouselActive,
      onTick: handleNext, 
      intervalDuration: IMAGE_CAROUSEL_INTERVAL,
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);
  const toggleSettingsModal = useCallback(() => {
    setIsSettingsOpen(prev => !prev);
    signalInteraction();
  }, [signalInteraction]);
  const currentAuthorPubkey = useMemo(() => {
      const currentNote = 
          viewMode === 'imagePodcast' ? shuffledImageNotes[currentImageIndex] :
          viewMode === 'videoPlayer' ? shuffledVideoNotes[currentVideoIndex] :
          null;
      return currentNote?.pubkey;
  }, [viewMode, currentImageIndex, currentVideoIndex, shuffledImageNotes, shuffledVideoNotes]);

  // --- Author Filter (Based on Kind 3) --- 
  const authorFilter = useMemo((): NDKFilter | null => {
    if (!followedAuthorPubkeys || followedAuthorPubkeys.length === 0) {
        console.log('[DEBUG] No followed authors found from Kind 3, skipping author filter.');
        return null; // Can't filter if the list is empty
    }
    // Construct filter with ONLY the followed authors
    const filter: NDKFilter = { authors: followedAuthorPubkeys };
    console.log('[DEBUG] Constructed authorFilter (from Kind 3):', filter);
    return filter;
  }, [followedAuthorPubkeys]); // Depend only on the list from Kind 3

  // --- Tags Filter (Based on Settings) --- 
  const tagsFilter = useMemo((): NDKFilter | null => {
      if (!followedTags || followedTags.length === 0) {
          console.log('[DEBUG] No followed tags, skipping tags filter.');
          return null;
      }
      const filter: NDKFilter = { '#t': followedTags };
      console.log('[DEBUG] Constructed tagsFilter:', filter);
      return filter;
  }, [followedTags]); // Depend only on tags

  // --- Combine Filters for Media Types (Apply Kinds/Limits) --- 
  const podcastAuthorFilter = useMemo((): NDKFilter | null => {
      if (!authorFilter) return null;
      return { ...authorFilter, kinds: getKindsForMediaType('podcast'), limit: 200 };
  }, [authorFilter]);
  const podcastTagsFilter = useMemo((): NDKFilter | null => {
      if (!tagsFilter) return null;
      return { ...tagsFilter, kinds: getKindsForMediaType('podcast'), limit: 200 };
  }, [tagsFilter]);

  const videoAuthorFilter = useMemo((): NDKFilter | null => {
      if (!authorFilter) return null;
      const filter: NDKFilter = { ...authorFilter, kinds: getKindsForMediaType('video'), limit: videoFetchLimit };
      if (videoFetchUntil) filter.until = videoFetchUntil;
      return filter;
  }, [authorFilter, videoFetchLimit, videoFetchUntil]);
   const videoTagsFilter = useMemo((): NDKFilter | null => {
      if (!tagsFilter) return null;
      const filter: NDKFilter = { ...tagsFilter, kinds: getKindsForMediaType('video'), limit: videoFetchLimit };
      if (videoFetchUntil) filter.until = videoFetchUntil; // Apply until here too?
      return filter;
  }, [tagsFilter, videoFetchLimit, videoFetchUntil]);

  const imageAuthorFilter = useMemo((): NDKFilter | null => {
      if (!authorFilter) return null;
      const filter: NDKFilter = { ...authorFilter, kinds: getKindsForMediaType('image'), limit: imageFetchLimit };
      if (imageFetchUntil) filter.until = imageFetchUntil;
      return filter;
  }, [authorFilter, imageFetchLimit, imageFetchUntil]);
  const imageTagsFilter = useMemo((): NDKFilter | null => {
      if (!tagsFilter) return null;
      const filter: NDKFilter = { ...tagsFilter, kinds: getKindsForMediaType('image'), limit: imageFetchLimit };
      if (imageFetchUntil) filter.until = imageFetchUntil; // Apply until here too?
      return filter;
  }, [tagsFilter, imageFetchLimit, imageFetchUntil]);

  // --- Memoize Author Subscription Filters --- 
  const podcastSubscriptionFilter = useMemo(() => {
      // This should depend on podcastAuthorFilter
      return podcastAuthorFilter ? [podcastAuthorFilter] : false;
  }, [podcastAuthorFilter]);
  const videoSubscriptionFilter = useMemo(() => {
      // This should depend on videoAuthorFilter
      return videoAuthorFilter ? [videoAuthorFilter] : false;
  }, [videoAuthorFilter]);
  const imageSubscriptionFilter = useMemo(() => {
      // This should depend on imageAuthorFilter
      return imageAuthorFilter ? [imageAuthorFilter] : false;
  }, [imageAuthorFilter]);

  // --- Subscribe to Authors ---
  const { events: rawPodcastEventsByAuthor } = useSubscribe(
    podcastAuthorFilter ? podcastSubscriptionFilter : false,
    { closeOnEose: false }
  );
  const { events: rawVideoEventsByAuthor } = useSubscribe(
    videoAuthorFilter ? videoSubscriptionFilter : false,
    { closeOnEose: false }
  );
  const { events: rawImageEventsByAuthor } = useSubscribe(
    imageAuthorFilter ? imageSubscriptionFilter : false,
    { closeOnEose: false }
  );

  // --- Subscribe to Tags --- 
  // Memoize tag-based subscription filters

  // --- Effect Hooks (Can stay below hook calls) ---
  useEffect(() => {
    console.log("App.tsx: useEffect running for NDK Initialization trigger");
    initNDK(ndkInstance);
  }, [initNDK]);

  useEffect(() => {
    console.log('App.tsx: Effect running: Shuffling imageNotes');
    setShuffledImageNotes(shuffleArray([...imageNotes])); 
  }, [imageNotes]); 

  useEffect(() => {
    console.log('App.tsx: Effect running: Deduplicating and shuffling videoNotes');
    const uniqueVideoNotesMap = new Map<string, NostrNote>();
    for (const note of videoNotes) { 
        if (note.url && !uniqueVideoNotesMap.has(note.url)) {
            uniqueVideoNotesMap.set(note.url, note);
        }
    }
    const uniqueVideoNotes = Array.from(uniqueVideoNotesMap.values());
    console.log(`App: Deduplicated ${videoNotes.length} video notes to ${uniqueVideoNotes.length} unique URLs.`);
    setShuffledVideoNotes(shuffleArray(uniqueVideoNotes)); 
  }, [videoNotes]); 

  useEffect(() => {
    let urlToPreload: string | null = null;
    if (shuffledVideoNotes.length > 0) {
      if (viewMode === 'videoPlayer') {
        if (shuffledVideoNotes.length > 1) {
          const nextIndex = (currentVideoIndex + 1) % shuffledVideoNotes.length;
          const nextNote = shuffledVideoNotes[nextIndex];
          if (nextNote?.url && nextNote.url !== currentItemUrl) {
            urlToPreload = nextNote.url;
            console.log(`App: Preloading NEXT video (index ${nextIndex}): ${urlToPreload}`);
          }
        }
      } else {
        const firstNote = shuffledVideoNotes[0];
        if (firstNote?.url) {
          urlToPreload = firstNote.url;
          if(viewMode !== 'imagePodcast' || urlToPreload !== currentItemUrl) {
             console.log(`App: Preloading FIRST video (index 0) while in ${viewMode} mode: ${urlToPreload}`);
          }
        }
      }
    }
    if (preloadVideoUrl !== urlToPreload) {
       setPreloadVideoUrl(urlToPreload);
    }
  }, [viewMode, currentVideoIndex, shuffledVideoNotes, currentItemUrl, preloadVideoUrl]);

  // --- Conditional Return for NDK Readiness (AFTER all hooks) ---
  if (!ndk) {
    return (
      <div className="relative flex flex-col min-h-screen h-screen text-white border-2 border-purple-900 bg-gradient-radial from-gray-900 via-black to-black items-center justify-center">
        <div className="mb-4 w-16 h-16 animate-spin border-4 border-purple-600 border-t-transparent rounded-full"></div>
        <p className="animate-pulse">Initializing Nostr Connection...</p>
      </div>
    );
  }

  // --- Main Render (NDK is ready) --- 
  console.log("App.tsx: NDK instance is ready, rendering main app.");

  return (
    <>
    {/* Outermost div */}
    <div className="relative flex flex-col min-h-screen h-screen text-white border-2 border-purple-900 bg-gradient-radial from-gray-900 via-black to-black">

      {/* Invisible Audio Element */}
      <audio
        ref={audioRef}
        src={viewMode === 'imagePodcast' && currentItemUrl ? currentItemUrl : undefined}
        className="hidden"
      />
      {/* Video is rendered visibly inside VideoPlayer */}

      {/* Absolute Positioned Titles */}
      <h2 className="absolute top-2 right-4 z-20 text-base font-bold text-purple-600 pointer-events-none">
        Mad⚡tr.tv
      </h2>

      {/* Bottom Left Area (QR Code) */}
       <div className="absolute bottom-4 left-4 z-10 flex flex-col items-center">
           {/* Reply QR Code Container */}
           <div className="bg-white p-1.5 rounded-md shadow-lg w-20 h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 mb-1">
               {qrValue ? (
                 <QRCode
                   value={qrValue}
                   size={256}
                   style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                   viewBox={`0 0 256 256`}
                   level="L"
                 />
               ) : (
                 <div className="w-full h-full flex items-center justify-center text-black text-xs text-center">No Thread ID</div>
               )}
           </div>
           <p className="text-xs text-gray-400 font-semibold">Reply here</p>
       </div>

      {/* Inner wrapper */}
      <div className="relative flex flex-col flex-grow min-h-0 overflow-hidden">

        {/* MediaFeed Area (Top Section) */}
         <div className="relative w-full flex-grow min-h-0 bg-black flex items-center justify-center overflow-hidden">
              <AnimatePresence mode='wait'>
                 {/* REMOVED incorrect loading block - was checking isLoadingAuthors which no longer exists */}
                 {/* --- Render ImageFeed or VideoPlayer directly --- */}
                 { viewMode === 'imagePodcast' ? (
                     <motion.div
                         key="imageFeed"
                         initial={{ opacity: 0 }}
                         animate={{ opacity: 1 }}
                         exit={{ opacity: 0 }}
                         transition={{ duration: 0.5 }}
                         className="w-full h-full flex items-center justify-center"
                         ref={imageFeedRef}
                     >
                         <ImageFeed
                             currentImageIndex={currentImageIndex}
                             imageNotes={shuffledImageNotes}
                         />
                     </motion.div>
                 ) : viewMode === 'videoPlayer' ? (
                     <motion.div
                         key="videoPlayer"
                         initial={{ opacity: 0 }}
                         animate={{ opacity: 1 }}
                         exit={{ opacity: 0 }}
                         transition={{ duration: 0.5 }}
                         className="w-full h-full flex items-center justify-center"
                     >
                         <VideoPlayer
                             videoRef={videoRef}
                             src={currentItemUrl}
                             isPlaying={isPlaying}
                             togglePlayPause={togglePlayPause}
                             autoplayFailed={autoplayFailed}
                             isMuted={isMuted}
                         />
                     </motion.div>
                 ) : null }
              </AnimatePresence>

              {/* Duplicated Mode Toggle Button (Hide on Fullscreen) */}
              <AnimatePresence>
                {!isFullScreen && (
                  <motion.button
                      key="top-toggle-button"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      onClick={() => setViewMode(viewMode === 'imagePodcast' ? 'videoPlayer' : 'imagePodcast')}
                      tabIndex={0}
                      className="absolute bottom-2 right-24 z-20 p-1.5 rounded
                                 bg-transparent text-purple-600
                                 hover:text-purple-100 hover:bg-black/70
                                 focus:outline-none focus:bg-transparent focus:text-purple-300
                                 focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:ring-offset-black
                                 transition-all duration-150 text-xs font-semibold uppercase"
                      aria-label={`Show ${viewMode === 'imagePodcast' ? 'Videos' : 'Images'}`}
                      title={`Show ${viewMode === 'imagePodcast' ? 'Videos' : 'Images'}`}
                  >
                      {viewMode === 'imagePodcast' ? 'Videos' : 'Images'}
                  </motion.button>
                )}
              </AnimatePresence>
              {/* Author QR Code is rendered inside ImageFeed/VideoPlayer */}

         </div>

        {/* Prev/Next Buttons (Hide on Fullscreen) */}
        <AnimatePresence>
          {!isFullScreen && (
            (viewMode === 'imagePodcast' && shuffledImageNotes.length > 1) ||
            (viewMode === 'videoPlayer' && shuffledVideoNotes.length > 1)
          ) && (
             <motion.div
                 key="pagination-buttons"
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 transition={{ duration: 0.3 }}
             >
                <>
                  {/* Prev Button */}
                  <button
                      onClick={handlePrevious}
                      className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10 p-1.5 rounded
                                 bg-transparent text-purple-600
                                 hover:text-purple-100 hover:bg-black/70
                                 focus:outline-none focus:bg-transparent focus:text-purple-300
                                 focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:ring-offset-black
                                 transition-all duration-150 text-xs font-semibold uppercase"
                      aria-label="Previous Item"
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 5 L 13 12 L 15 19" />
                      </svg>
                  </button>
                  {/* Next Button */}
                  <button
                      onClick={handleNext}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10 p-1.5 rounded
                                 bg-transparent text-purple-600
                                 hover:text-purple-100 hover:bg-black/70
                                 focus:outline-none focus:bg-transparent focus:text-purple-300
                                 focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:ring-offset-black
                                 transition-all duration-150 text-xs font-semibold uppercase"
                      aria-label="Next Item"
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5 L 11 12 L 9 19" />
                      </svg>
                  </button>
                </>
             </motion.div>
           )
        }
        </AnimatePresence>

        {/* Animated Bottom Split Screen Container */}
        <AnimatePresence>
            {!isFullScreen && (
                 <motion.div
                    key="bottomPanel"
                    className="relative w-full h-1/4 flex-shrink-0 flex flex-row overflow-hidden mt-2"
                    initial={{ y: '100%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: '100%', opacity: 0 }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                 >
                    {/* Message Board Container */}
                    <div className="w-2/3 h-full flex-shrink-0 overflow-y-auto bg-gray-900/80 rounded-lg backdrop-blur-sm p-2">
                         {ndk ? ( 
                            <MessageBoard
                              neventToFollow={MAIN_THREAD_NEVENT_URI}
                              onNewMessage={handleNewMessage}
                            />
                        ) : ( 
                            <div className="w-full h-full flex items-center justify-center">
                                <p className="text-gray-400">Initializing Nostr connection...</p>
                            </div>
                        )} 
                    </div>

                    {/* Interactive Panel Container (Right 1/3) */}
                    <div className="w-1/3 h-full flex flex-col">
                        <MediaPanel
                            viewMode={viewMode}
                            audioRef={audioRef}
                            videoRef={videoRef}
                            podcastNotes={podcastNotes}
                            videoNotes={shuffledVideoNotes}
                            currentPodcastIndex={currentPodcastIndex}
                            currentVideoIndex={currentVideoIndex}
                            setCurrentPodcastIndex={setCurrentPodcastIndex}
                            onVideoSelect={handleVideoSelect}
                            setViewMode={setViewMode}
                            isPlaying={isPlaying}
                            currentTime={currentTime}
                            duration={duration}
                            playbackRate={playbackRate}
                            setPlaybackRate={setPlaybackRate}
                            togglePlayPause={togglePlayPause}
                            handleSeek={handleSeek}
                            currentItemUrl={currentItemUrl}
                        />
                    </div>
                 </motion.div>
            )}
        </AnimatePresence>

      </div> {/* End Inner Wrapper */}
    </div> {/* End Outermost Div */}

    {/* Relay Status (Bottom Left) */}
    <div className="absolute bottom-0 left-0 p-2 z-20">
      <RelayStatus
        // Pass the ready ndk instance here
        isReceivingData={!!ndk?.pool?.connectedRelays?.().length} 
        relayCount={RELAYS.length}
        onSettingsClick={toggleSettingsModal} // Pass the toggle function
      />
    </div>

    {/* Preload Link */}
    {preloadVideoUrl && (
        <link rel="preload" href={preloadVideoUrl} as="video" /> 
    )}

    {/* Settings Modal */}
    <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
    />

    </>
  );
}

export default App;

