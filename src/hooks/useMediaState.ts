import { useState, useCallback, useEffect, useRef } from 'react';
import { nip19 } from 'nostr-tools';
import { NostrNote } from '../types/nostr';
import { shuffleArray } from '../utils/shuffleArray'; // Assuming you have this utility

// Constants for playlist management
const IMAGE_DISPLAY_BATCH_SIZE = 30;
const VIDEO_INITIAL_PLAYLIST_SIZE = 15;
const VIDEO_PLAYLIST_EXTEND_SIZE = 10;
const VIDEO_PRELOAD_OFFSET = 1; // Start preloading when this many items are left in the current display list

export interface UseMediaStateProps {
  fullImageCache?: NostrNote[];      // Renamed from initialImageNotes
  fullPodcastCache?: NostrNote[];    // Renamed from initialPodcastNotes
  fullVideoCache?: NostrNote[];      // Renamed from initialVideoNotes
  fetchOlderImages?: () => void;
  fetchOlderVideos?: () => void;
  // shuffledImageNotesLength and shuffledVideoNotesLength are no longer needed as props
}

interface UseMediaStateReturn {
  viewMode: 'imagePodcast' | 'videoPlayer';
  imageNotesForDisplay: NostrNote[]; // Represents current display batch for images
  podcastNotesForDisplay: NostrNote[]; // Represents current display list for podcasts
  videoNotesForDisplay: NostrNote[];   // Represents current display list for videos
  isLoadingPodcastNotes: boolean;
  isLoadingVideoNotes: boolean;
  currentImageIndex: number;
  currentPodcastIndex: number;
  currentVideoIndex: number;
  selectedVideoNpub: string | null; 
  currentItemUrl: string | null;
  currentVideoNote: NostrNote | null;
  preloadVideoUrl: string | null; // ADDED for video preloading
  handleVideoSelect: (note: NostrNote, index: number) => void; 
  handlePrevious: () => void;
  handleNext: () => void;
  setViewMode: (mode: 'imagePodcast' | 'videoPlayer') => void;
  setCurrentPodcastIndex: (index: number) => void;
  reshuffleImageDisplayBatch: () => void; // ADDED for image reshuffling
}

// Regexes (kept from original, ensure they are correct for your needs)
const imageRegex = /https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp)/i;
const videoRegex = /https?:\/\/\S+\.(?:mp4|mov|webm|m3u8)/i;
const audioRegex = /https?:\/\/\S+\.(?:mp3|m4a|ogg|aac|wav)/i;

export function useMediaState({ 
    fullImageCache = [],
    fullPodcastCache = [],
    fullVideoCache = [],
    fetchOlderImages,
    fetchOlderVideos,
}: UseMediaStateProps = {}): UseMediaStateReturn {

    const [selectedVideoNpub, setSelectedVideoNpub] = useState<string | null>(null);
    const [viewMode, setViewModeInternal] = useState<'imagePodcast' | 'videoPlayer'>('imagePodcast');

    // These now represent the CURRENT DISPLAY BATCH/LIST, not the full cache
    const [imageNotesForDisplay, setImageNotesForDisplay] = useState<NostrNote[]>([]); 
    const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
    
    const [videoNotesForDisplay, setVideoNotesForDisplay] = useState<NostrNote[]>([]); 
    const [currentVideoIndex, setCurrentVideoIndex] = useState<number>(0);
    const [isLoadingVideoNotes, setIsLoadingVideoNotes] = useState<boolean>(true); 

    const [podcastNotesForDisplay, setPodcastNotesForDisplay] = useState<NostrNote[]>([]);
    const [currentPodcastIndex, setCurrentPodcastIndexInternal] = useState<number>(0);
    const [isLoadingPodcastNotes, setIsLoadingPodcastNotes] = useState<boolean>(true);
    
    const [currentItemUrl, setCurrentItemUrl] = useState<string | null>(null);
    const [currentVideoNote, setCurrentVideoNote] = useState<NostrNote | null>(null);
    const [preloadVideoUrl, setPreloadVideoUrl] = useState<string | null>(null); // ADDED

    const prevFullImageCacheRef = useRef<NostrNote[] | undefined>(undefined);
    const prevFullPodcastCacheRef = useRef<NostrNote[] | undefined>(undefined);
    const prevFullVideoCacheRef = useRef<NostrNote[] | undefined>(undefined);

    // Helper to get a new random batch of images
    const generateNewImageDisplayBatch = useCallback(() => {
        if (fullImageCache.length > 0) {
            const shuffledCache = shuffleArray([...fullImageCache]);
            const newDisplayBatch = shuffledCache.slice(0, IMAGE_DISPLAY_BATCH_SIZE);
            if (JSON.stringify(newDisplayBatch) !== JSON.stringify(imageNotesForDisplay)) {
                console.log(`useMediaState: UPDATING imageNotesForDisplay via generateNewImageDisplayBatch. Prev length: ${imageNotesForDisplay.length}, New length: ${newDisplayBatch.length}`);
                setImageNotesForDisplay(newDisplayBatch);
            }
            // Always reset index when a new batch is generated, even if content is same (e.g. reshuffle of same items)
            // However, if the batch IS the same, this might be unwanted. Consider if index should only reset if batch content changes.
            // For now, let's assume reshuffling implies wanting to start from the beginning of the (potentially) new batch.
            if (JSON.stringify(newDisplayBatch) !== JSON.stringify(imageNotesForDisplay) || currentImageIndex !== 0) {
                 setCurrentImageIndex(0); // Reset index if batch content changes or wasn't already 0
            }
        } else {
            if (imageNotesForDisplay.length !== 0) {
                console.log(`useMediaState: Clearing imageNotesForDisplay via generateNewImageDisplayBatch.`);
                setImageNotesForDisplay([]);
            }
            if (currentImageIndex !== 0) setCurrentImageIndex(0);
        }
    }, [fullImageCache, imageNotesForDisplay, currentImageIndex]); // Added imageNotesForDisplay and currentImageIndex to deps

    useEffect(() => {
        if (fullImageCache !== prevFullImageCacheRef.current) {
            console.log(`useMediaState: fullImageCache changed (size: ${fullImageCache.length}). Generating new image display batch.`);
            generateNewImageDisplayBatch();
            prevFullImageCacheRef.current = fullImageCache;
        }
    }, [fullImageCache, generateNewImageDisplayBatch]);

    useEffect(() => {
        if (fullPodcastCache !== prevFullPodcastCacheRef.current) {
            console.log(`useMediaState: fullPodcastCache changed (size: ${fullPodcastCache.length}). Updating podcast display list.`);
            // Podcasts usually displayed sequentially, sorted by `useMediaContent`
            setPodcastNotesForDisplay([...fullPodcastCache]); 
            setIsLoadingPodcastNotes(false);
            if (currentPodcastIndex >= fullPodcastCache.length && fullPodcastCache.length > 0) {
                setCurrentPodcastIndexInternal(0);
            }
            prevFullPodcastCacheRef.current = fullPodcastCache;
        } else if (fullPodcastCache.length > 0 && isLoadingPodcastNotes) {
            setIsLoadingPodcastNotes(false);
        }
    }, [fullPodcastCache, currentPodcastIndex, isLoadingPodcastNotes]);

    // Effect to initialize or extend video display list from fullVideoCache
    useEffect(() => {
        if (fullVideoCache !== prevFullVideoCacheRef.current) {
            console.log(`useMediaState: fullVideoCache changed (size: ${fullVideoCache.length}). Initializing video display list.`);
            const newInitialVideoBatch = fullVideoCache.slice(0, VIDEO_INITIAL_PLAYLIST_SIZE);
            if (JSON.stringify(newInitialVideoBatch) !== JSON.stringify(videoNotesForDisplay)) {
                console.log(`useMediaState: UPDATING videoNotesForDisplay. Prev length: ${videoNotesForDisplay.length}, New length: ${newInitialVideoBatch.length}`);
                setVideoNotesForDisplay(newInitialVideoBatch);
            }
            // Reset index if cache changes and current index is out of bounds for new initial batch or simply if cache changed.
            if (currentVideoIndex >= VIDEO_INITIAL_PLAYLIST_SIZE && fullVideoCache.length > 0) {
                setCurrentVideoIndex(0);
            }
            setIsLoadingVideoNotes(false);
            prevFullVideoCacheRef.current = fullVideoCache;
        } else if (fullVideoCache.length > 0 && isLoadingVideoNotes) {
             setIsLoadingVideoNotes(false);
        }
    }, [fullVideoCache, currentVideoIndex, isLoadingVideoNotes, videoNotesForDisplay]); // Added videoNotesForDisplay to deps

    const tryExtendVideoPlaylist = useCallback(() => {
        if (videoNotesForDisplay.length < fullVideoCache.length) {
            const currentDisplayLength = videoNotesForDisplay.length;
            const numberToExtend = Math.min(VIDEO_PLAYLIST_EXTEND_SIZE, fullVideoCache.length - currentDisplayLength);
            if (numberToExtend > 0) {
                const moreVideos = fullVideoCache.slice(currentDisplayLength, currentDisplayLength + numberToExtend);
                const newVideoDisplayList = [...videoNotesForDisplay, ...moreVideos];
                // No stringify check here, as extending should always update if moreVideos exist.
                // The main purpose is to avoid re-render if tryExtendVideoPlaylist is called but no extension happens.
                setVideoNotesForDisplay(newVideoDisplayList);
                console.log(`useMediaState: Extended video playlist by ${moreVideos.length} items.`);
                return true; // Extended successfully
            }
        }
        return false; // No more videos in cache to extend with
    }, [videoNotesForDisplay, fullVideoCache]);

    // Update currentItemUrl, currentVideoNote, and preloadVideoUrl
    useEffect(() => {
        let newUrl: string | null = null;
        let newVideoNoteState: NostrNote | null = null;
        let newPreloadUrl: string | null = null;

        if (viewMode === 'imagePodcast') {
            if (podcastNotesForDisplay.length > 0 && currentPodcastIndex < podcastNotesForDisplay.length && podcastNotesForDisplay[currentPodcastIndex]?.url) {
                newUrl = podcastNotesForDisplay[currentPodcastIndex].url;
            } else if (imageNotesForDisplay.length > 0 && currentImageIndex < imageNotesForDisplay.length) {
                newUrl = imageNotesForDisplay[currentImageIndex]?.url || null;
            }
        } else { // viewMode === 'videoPlayer'
            if (videoNotesForDisplay.length > 0 && currentVideoIndex < videoNotesForDisplay.length) {
                const selectedNote = videoNotesForDisplay[currentVideoIndex];
                newUrl = selectedNote?.url || null;
                newVideoNoteState = selectedNote || null;

                // Set preload URL for the next video
                if (currentVideoIndex + 1 < videoNotesForDisplay.length) {
                    newPreloadUrl = videoNotesForDisplay[currentVideoIndex + 1]?.url || null;
                }
            }
        }
        
        if (newUrl !== currentItemUrl) setCurrentItemUrl(newUrl);
        if (newVideoNoteState !== currentVideoNote) setCurrentVideoNote(newVideoNoteState);
        if (newPreloadUrl !== preloadVideoUrl) setPreloadVideoUrl(newPreloadUrl);

    }, [
        viewMode, currentPodcastIndex, currentVideoIndex, currentImageIndex, 
        podcastNotesForDisplay, videoNotesForDisplay, imageNotesForDisplay, 
        currentItemUrl, currentVideoNote, preloadVideoUrl
    ]);

    const setViewMode = useCallback((mode: 'imagePodcast' | 'videoPlayer') => {
        console.log(`useMediaState: Setting view mode to ${mode}`);
        setViewModeInternal(mode);
    }, []);

    const setCurrentPodcastIndex = useCallback((index: number) => {
        if (index >= 0 && index < podcastNotesForDisplay.length) {
            setCurrentPodcastIndexInternal(index);
        }
    }, [podcastNotesForDisplay]);

    const handleVideoSelect = useCallback((note: NostrNote, index: number) => {
        console.log(`useMediaState: Video selected - ${note.id} at index ${index}`);
        if (index >= 0 && index < videoNotesForDisplay.length) {
            setCurrentVideoIndex(index);
            setViewModeInternal('videoPlayer');
            if (note.pubkey) {
                try {
                    setSelectedVideoNpub(nip19.npubEncode(note.pubkey));
                } catch (e) {
                    console.error("Error encoding pubkey for selected video:", e);
                    setSelectedVideoNpub(null);
                }
            }
        } else {
            console.warn("handleVideoSelect called with out-of-bounds index or missing note");
        }
    }, [videoNotesForDisplay]);

    const handlePrevious = useCallback(() => {
        if (viewMode === 'imagePodcast') {
            if (imageNotesForDisplay.length === 0) return;
            let nextIndex = currentImageIndex - 1;
            if (nextIndex < 0) {
                // Option 1: Try to reshuffle for new batch (for "infinite feel")
                // generateNewImageDisplayBatch(); // This will reset index to 0
                // Option 2: Fetch older if no reshuffle is implemented here or reshuffle exhausted
                if (fetchOlderImages) {
                    console.log("useMediaState: Reached start of images, fetching older.");
                    fetchOlderImages();
                } else {
                     nextIndex = imageNotesForDisplay.length - 1; // Loop to end if no fetchOlder
                     setCurrentImageIndex(nextIndex);
                }
            } else {
                 setCurrentImageIndex(nextIndex);
            }
        } else { // viewMode === 'videoPlayer'
            if (videoNotesForDisplay.length === 0) return;
            let nextIndex = currentVideoIndex - 1;
            if (nextIndex < 0) {
                // At the beginning of the video list, try fetching older if available
                // (Looping is less common for video playlists, but can be a fallback)
                if (fetchOlderVideos) {
                    console.log("useMediaState: Reached start of videos, fetching older.");
                    fetchOlderVideos();
                } else {
                    // nextIndex = videoNotesForDisplay.length - 1; // Loop to end
                    // setCurrentVideoIndex(nextIndex);
                     // Or simply do nothing / stay at first video
                }
            } else {
                 setCurrentVideoIndex(nextIndex);
            }
        }
    }, [viewMode, currentImageIndex, imageNotesForDisplay, fetchOlderImages, currentVideoIndex, videoNotesForDisplay, fetchOlderVideos]);

    const handleNext = useCallback(() => {
        if (viewMode === 'imagePodcast') {
            if (imageNotesForDisplay.length === 0) return;
            let nextIndex = currentImageIndex + 1;
            if (nextIndex >= imageNotesForDisplay.length) {
                // Reached end of current image batch
                // Try to get a new batch from cache first
                console.log("useMediaState: Reached end of image batch, attempting to reshuffle.");
                generateNewImageDisplayBatch(); // This will set index to 0 if successful
                // If generateNewImageDisplayBatch doesn't find more diverse items or cache is small, fetch older
                // This condition needs refinement: how to know if reshuffle was effective?
                // For now, let's assume reshuffle is tried, and if user hits next again on a small/same batch, then fetchOlder.
                // A more robust way would be for generateNewImageDisplayBatch to signal if it truly provided new content.
                // Or, after a few reshuffles, trigger fetchOlder.
                if (imageNotesForDisplay.length < IMAGE_DISPLAY_BATCH_SIZE && fetchOlderImages) {
                     console.log("useMediaState: Image batch small after reshuffle, or end reached, fetching older images.");
                     fetchOlderImages();
                }
                // If generateNewImageDisplayBatch resets index, this direct set might not be needed
                // or could cause a quick flash. generateNewImageDisplayBatch already sets index to 0.
            } else {
                setCurrentImageIndex(nextIndex);
            }
        } else { // viewMode === 'videoPlayer'
            if (videoNotesForDisplay.length === 0) return;
            let nextIndex = currentVideoIndex + 1;
            if (nextIndex >= videoNotesForDisplay.length) {
                // Reached end of current video display list
                if (!tryExtendVideoPlaylist()) { // Try to extend from cache
                    // If cache extension fails (no more in cache), then fetch older from relays
                    if (fetchOlderVideos) {
                        console.log("useMediaState: End of video playlist and cache, fetching older videos.");
                        fetchOlderVideos();
                    }
                     // else: do nothing, stay on last video if no fetchOlderVideos
                } else {
                     // Playlist was extended, new videos are available.
                     // We can either auto-advance to nextIndex (if it's now valid)
                     // or let the user click next again. For continuous play, auto-advance is good.
                     if(nextIndex < videoNotesForDisplay.length) { // Check if extension made nextIndex valid
                         setCurrentVideoIndex(nextIndex);
                     }
                     // If nextIndex is still out of bounds after extension (e.g. only 1 video added and we were at the end)
                     // then we might just stay on the current one, or the last one of the newly extended list.
                     // The current logic will re-evaluate in next render. Let's ensure index is valid or reset if needed.
                }
            } else {
                setCurrentVideoIndex(nextIndex);
            }
        }
    }, [
        viewMode, currentImageIndex, imageNotesForDisplay, fetchOlderImages, 
        currentVideoIndex, videoNotesForDisplay, fetchOlderVideos, 
        tryExtendVideoPlaylist, generateNewImageDisplayBatch
    ]);

    const reshuffleImageDisplayBatch = useCallback(() => {
        console.log("useMediaState: Explicitly reshuffling image display batch.");
        generateNewImageDisplayBatch();
    }, [generateNewImageDisplayBatch]);

    return {
        viewMode,
        imageNotesForDisplay,
        podcastNotesForDisplay,
        videoNotesForDisplay,
        isLoadingPodcastNotes,
        isLoadingVideoNotes,
        currentImageIndex,
        currentPodcastIndex,
        currentVideoIndex,
        selectedVideoNpub,
        currentItemUrl,
        currentVideoNote,
        preloadVideoUrl, // ADDED
        handleVideoSelect,
        handlePrevious,
        handleNext,
        setViewMode,
        setCurrentPodcastIndex,
        reshuffleImageDisplayBatch, // ADDED
    };
}