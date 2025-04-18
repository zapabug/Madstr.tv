import { useState, useCallback, useEffect, useRef } from 'react';
import { nip19 } from 'nostr-tools';
import { NostrNote } from '../types/nostr';

// Helper function (if needed, or keep in App.tsx if only used there once)
// function getHexPubkey... (already moved to useMediaAuthors or kept in App if needed elsewhere)

// --- Define Props Interface --- 
interface UseMediaStateProps {
  // Accept note arrays directly
  initialImageNotes?: NostrNote[];
  initialPodcastNotes?: NostrNote[];
  initialVideoNotes?: NostrNote[];
  // Keep fetchers and lengths
  fetchOlderImages?: () => void;
  fetchOlderVideos?: () => void;
  shuffledImageNotesLength?: number; // Need length for boundary check
  shuffledVideoNotesLength?: number; // Need length for boundary check
}

// Define return type for clarity
interface UseMediaStateReturn {
  viewMode: 'imagePodcast' | 'videoPlayer';
  // Return internal notes state
  imageNotes: NostrNote[];
  podcastNotes: NostrNote[];
  videoNotes: NostrNote[];
  // Keep loading states
  isLoadingPodcastNotes: boolean;
  isLoadingVideoNotes: boolean;
  // Indices and URL
  currentImageIndex: number;
  currentPodcastIndex: number;
  currentVideoIndex: number;
  selectedVideoNpub: string | null; 
  currentItemUrl: string | null;
  // Remove handle...NotesLoaded
  // handleImageNotesLoaded: (notes: NostrNote[]) => void;
  // handlePodcastNotesLoaded: (notes: NostrNote[]) => void;
  // handleVideoNotesLoaded: (notes: NostrNote[]) => void;
  // Keep other handlers
  handleVideoSelect: (note: NostrNote, index: number) => void; 
  handlePrevious: () => void;
  handleNext: () => void;
  setViewMode: (mode: 'imagePodcast' | 'videoPlayer') => void;
  setCurrentPodcastIndex: (index: number) => void;
  // Keep setters for loading state?
  // Or manage loading state internally based on prop changes?
  // Let's manage internally for now.
  // setIsLoadingPodcastNotes: React.Dispatch<React.SetStateAction<boolean>>;
  // setIsLoadingVideoNotes: React.Dispatch<React.SetStateAction<boolean>>;
}

// <<< Define Regex for media URLs >>>
const imageRegex = /https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp)/i;
const videoRegex = /https?:\/\/\S+\.(?:mp4|mov|webm|m3u8)/i;
const audioRegex = /https?:\/\/\S+\.(?:mp3|m4a|ogg|aac|wav)/i;

export function useMediaState({ 
    // Destructure new props
    initialImageNotes = [],
    initialPodcastNotes = [],
    initialVideoNotes = [],
    // Keep others
    fetchOlderImages, 
    fetchOlderVideos, 
    shuffledImageNotesLength = 0, 
    shuffledVideoNotesLength = 0 
  }: UseMediaStateProps = {}): UseMediaStateReturn {

    // State for selected video author npub
    const [selectedVideoNpub, setSelectedVideoNpub] = useState<string | null>(null);

    // State for the current view mode - Simplified
    const [viewMode, setViewModeInternal] = useState<'imagePodcast' | 'videoPlayer'>('imagePodcast');

    // State for notes and indices
    const [imageNotes, setImageNotes] = useState<NostrNote[]>([]); 
    const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
    const [videoNotes, setVideoNotes] = useState<NostrNote[]>([]); 
    const [currentVideoIndex, setCurrentVideoIndex] = useState<number>(0);
    const [isLoadingVideoNotes, setIsLoadingVideoNotes] = useState<boolean>(true); // Start as true

    const [podcastNotes, setPodcastNotes] = useState<NostrNote[]>([]);
    const [currentPodcastIndex, setCurrentPodcastIndexInternal] = useState<number>(0);
    const [isLoadingPodcastNotes, setIsLoadingPodcastNotes] = useState<boolean>(true); // Start as true
    
    const [currentItemUrl, setCurrentItemUrl] = useState<string | null>(null);

    // Refs to store previous prop references
    const prevInitialImageNotesRef = useRef<NostrNote[] | undefined>(undefined);
    const prevInitialPodcastNotesRef = useRef<NostrNote[] | undefined>(undefined);
    const prevInitialVideoNotesRef = useRef<NostrNote[] | undefined>(undefined);

    // --- NEW: Effect to process initialImageNotes prop --- 
    useEffect(() => {
        // Only process if the reference has actually changed
        if (initialImageNotes !== prevInitialImageNotesRef.current) {
            console.log(`useMediaState: Processing ${initialImageNotes.length} initial image notes (Reference changed).`);
            const sortedNotes = [...initialImageNotes].sort((a, b) => b.created_at - a.created_at);
            setImageNotes(sortedNotes);
            // Reset index if needed
            if (currentImageIndex >= sortedNotes.length && sortedNotes.length > 0) {
                setCurrentImageIndex(0);
            }
            prevInitialImageNotesRef.current = initialImageNotes; // Update the ref
        } else {
          console.log("useMediaState: Skipping image notes processing - reference hasn't changed.");
        }
    }, [initialImageNotes, currentImageIndex]); // Keep currentImageIndex dependency for reset logic

    // --- NEW: Effect to process initialPodcastNotes prop --- 
    useEffect(() => {
         // Only process if the reference has actually changed
        if (initialPodcastNotes !== prevInitialPodcastNotesRef.current) {
            console.log(`useMediaState: Processing ${initialPodcastNotes.length} initial podcast notes (Reference changed).`);
            const sortedNotes = [...initialPodcastNotes].sort((a, b) => b.created_at - a.created_at);
            setPodcastNotes(sortedNotes);
            setIsLoadingPodcastNotes(false); // Set loading false here
            // Reset index if needed
            const newIndex = (currentPodcastIndex >= sortedNotes.length && sortedNotes.length > 0) ? 0 : currentPodcastIndex;
            if (newIndex !== currentPodcastIndex) {
                setCurrentPodcastIndexInternal(newIndex);
            }
             prevInitialPodcastNotesRef.current = initialPodcastNotes; // Update the ref
        } else {
           console.log("useMediaState: Skipping podcast notes processing - reference hasn't changed.");
           // Still ensure loading is false if the ref hasn't changed but notes are present
           if(podcastNotes.length > 0 && isLoadingPodcastNotes) setIsLoadingPodcastNotes(false);
        }
    }, [initialPodcastNotes, currentPodcastIndex, podcastNotes.length, isLoadingPodcastNotes]); // Add dependencies for reset and loading logic

    // --- NEW: Effect to process initialVideoNotes prop --- 
    useEffect(() => {
         // Only process if the reference has actually changed
        if (initialVideoNotes !== prevInitialVideoNotesRef.current) {
            console.log(`useMediaState: Processing ${initialVideoNotes.length} initial video notes (Reference changed).`);
            const sortedNotes = [...initialVideoNotes].sort((a, b) => b.created_at - a.created_at);
            setVideoNotes(sortedNotes);
            setIsLoadingVideoNotes(false); // Set loading false here
            // Reset index if needed
            const newIndex = (currentVideoIndex >= sortedNotes.length && sortedNotes.length > 0) ? 0 : currentVideoIndex;
            if (newIndex !== currentVideoIndex) {
                 setCurrentVideoIndex(newIndex);
            }
             prevInitialVideoNotesRef.current = initialVideoNotes; // Update the ref
        } else {
             console.log("useMediaState: Skipping video notes processing - reference hasn't changed.");
             // Still ensure loading is false if the ref hasn't changed but notes are present
             if(videoNotes.length > 0 && isLoadingVideoNotes) setIsLoadingVideoNotes(false);
        }
    }, [initialVideoNotes, currentVideoIndex, videoNotes.length, isLoadingVideoNotes]); // Add dependencies for reset and loading logic

    // Update currentItemUrl whenever the relevant source changes
    useEffect(() => {
        let newUrl: string | null = null;
        console.log(`useMediaState URL Effect Trigger: mode=${viewMode}, pIdx=${currentPodcastIndex}, vIdx=${currentVideoIndex}, iIdx=${currentImageIndex}`);

        if (viewMode === 'imagePodcast') {
            if (imageNotes.length > 0 && currentImageIndex < imageNotes.length) {
                newUrl = imageNotes[currentImageIndex]?.url || null;
            }
        } else { // viewMode === 'videoPlayer'
            if (videoNotes.length > 0 && currentVideoIndex < videoNotes.length) {
                newUrl = videoNotes[currentVideoIndex]?.url || null;
            }
        }
        
        if (newUrl !== currentItemUrl) {
            console.log(`useMediaState URL Effect: Setting currentItemUrl from ${currentItemUrl} to: ${newUrl}`);
            setCurrentItemUrl(newUrl);
        } else {
            if (currentItemUrl !== null || newUrl !== null) {
                console.log(`useMediaState URL Effect: currentItemUrl (${currentItemUrl}) already matches newUrl (${newUrl}). No change.`);
            }
        }

    }, [viewMode, currentPodcastIndex, currentVideoIndex, currentImageIndex, podcastNotes, videoNotes, imageNotes, currentItemUrl]);

    // Set Podcast Index (does NOT change viewMode)
    const setCurrentPodcastIndex = useCallback((index: number) => {
        console.log("useMediaState: setCurrentPodcastIndex called with", index);
        if (index >= 0 && index < podcastNotes.length) {
            setCurrentPodcastIndexInternal(index);
        } else {
            console.warn(`useMediaState: Attempted to set invalid podcast index ${index}`);
        }
    }, [podcastNotes]);

    // Function to set view mode directly
    const setViewMode = useCallback((mode: 'imagePodcast' | 'videoPlayer') => {
        console.log("useMediaState: Setting viewMode to", mode);
        if (mode !== viewMode) { // Only update if changed
             setViewModeInternal(mode);
        }
    }, [viewMode]); // Depend on viewMode

    // Select Video (sets index AND switches mode to videoPlayer)
    const handleVideoSelect = useCallback((note: NostrNote, index: number) => {
        console.log(`useMediaState: Video selected - Index: ${index}, URL: ${note.url}`);
        let newNpub: string | null = null;
        if (note.posterPubkey) { 
            try { newNpub = nip19.npubEncode(note.posterPubkey); } catch (e) { console.error("npubEncode error:", e); }
        } else {
             console.warn(`useMediaState: posterPubkey missing on selected video note ${note.id}`);
        }
        setSelectedVideoNpub(newNpub);
        setCurrentVideoIndex(index);
        setViewMode('videoPlayer'); 
    }, [setViewMode]); // Depends on setViewMode

    // Prev/Next handlers - Updated for simplified modes
    const handlePrevious = useCallback(() => {
        if (viewMode === 'imagePodcast') {
            const count = imageNotes.length;
            if (count === 0) return;
            const prevIndex = (currentImageIndex - 1 + count) % count;
            setCurrentImageIndex(prevIndex);
            console.log(`useMediaState: Previous Image - Index: ${prevIndex}`);
        } else { // viewMode === 'videoPlayer'
            const count = videoNotes.length;
            if (count === 0) return;
            const prevIndex = (currentVideoIndex - 1 + count) % count;
            const newSelectedVideo = videoNotes[prevIndex];
            if (newSelectedVideo) {
                let newNpub: string | null = null;
                if (newSelectedVideo.posterPubkey) { try { newNpub = nip19.npubEncode(newSelectedVideo.posterPubkey); } catch(e){} }
                setSelectedVideoNpub(newNpub);
                setCurrentVideoIndex(prevIndex);
                console.log(`useMediaState: Previous Video - Index: ${prevIndex}`);
            }
        }
    }, [
        viewMode, 
        currentImageIndex, currentVideoIndex, 
        imageNotes, videoNotes // Depend on internal state now
    ]);

    const handleNext = useCallback(() => {
         if (viewMode === 'imagePodcast') {
            const count = shuffledImageNotesLength;
            if (count === 0) return;
            const nextIndex = (currentImageIndex + 1);
            if (nextIndex >= count) {
                console.log("useMediaState: Reached end of images, calling fetchOlderImages...");
                fetchOlderImages?.();
            } else {
                setCurrentImageIndex(nextIndex);
                console.log(`useMediaState: Next Image - Index: ${nextIndex}`);
            }
        } else { // viewMode === 'videoPlayer'
            const count = shuffledVideoNotesLength;
            if (count === 0) return;
            const nextIndex = (currentVideoIndex + 1);
            if (nextIndex >= count) {
                console.log("useMediaState: Reached end of videos, calling fetchOlderVideos...");
                fetchOlderVideos?.(); 
            } else {
                 setCurrentVideoIndex(nextIndex);
                 console.log(`useMediaState: Next Video - Index: ${nextIndex}`);
            }
        }
    }, [
        viewMode, 
        currentImageIndex, currentVideoIndex, 
        shuffledImageNotesLength, shuffledVideoNotesLength, 
        fetchOlderImages, fetchOlderVideos, 
        // Removed original note arrays from deps as npub lookup on next is removed
    ]);

    // Return value - updated
    return {
        viewMode,
        imageNotes, // Return internal state
        podcastNotes, // Return internal state
        videoNotes, // Return internal state
        isLoadingPodcastNotes,
        isLoadingVideoNotes,
        currentImageIndex,
        currentPodcastIndex,
        currentVideoIndex,
        selectedVideoNpub,
        currentItemUrl,
        // Removed handle...NotesLoaded
        handleVideoSelect,
        handlePrevious,
        handleNext,
        setViewMode,
        setCurrentPodcastIndex,
        // Removed setIsLoading...
    };
} 