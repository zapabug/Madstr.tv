import { useState, useCallback, useEffect, useRef } from 'react';
import { nip19 } from 'nostr-tools';
import { NostrNote } from '../types/nostr';

// Helper function (if needed, or keep in App.tsx if only used there once)
// function getHexPubkey... (already moved to useMediaAuthors or kept in App if needed elsewhere)

// --- Define Props Interface --- 
interface UseMediaStateProps {
  // Accept note arrays directly
  initialImageNotes?: NostrNote[];
  initialAudioNotes?: NostrNote[];
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
  audioNotes: NostrNote[];
  videoNotes: NostrNote[];
  // Keep loading states
  isLoadingAudioNotes: boolean;
  isLoadingVideoNotes: boolean;
  // Indices and URL
  currentImageIndex: number;
  currentAudioIndex: number;
  currentVideoIndex: number;
  selectedVideoNpub: string | null; 
  currentItemUrl: string | null;
  // Remove handle...NotesLoaded
  // handleImageNotesLoaded: (notes: NostrNote[]) => void;
  // handlePodcastNotesLoaded: (notes: NostrNote[]) => void;
  // handleVideoNotesLoaded: (notes: NostrNote[]) => void;
  // Keep other handlers
  handleVideoSelect: (_note: NostrNote, _index: number) => void; 
  handlePrevious: () => void;
  handleNext: () => void;
  setViewMode: (_mode: 'imagePodcast' | 'videoPlayer') => void;
  setCurrentAudioIndex: (_index: number) => void;
  // Keep setters for loading state?
  // Or manage loading state internally based on prop changes?
  // Let's manage internally for now.
  // setIsLoadingPodcastNotes: React.Dispatch<React.SetStateAction<boolean>>;
  // setIsLoadingVideoNotes: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useMediaState({ 
    // Destructure new props
    initialImageNotes = [],
    initialAudioNotes = [],
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

    const [audioNotes, setAudioNotes] = useState<NostrNote[]>([]);
    const [currentAudioIndex, setCurrentAudioIndexInternal] = useState<number>(0);
    const [isLoadingAudioNotes, setIsLoadingAudioNotes] = useState<boolean>(true); // Start as true
    
    const [currentItemUrl, setCurrentItemUrl] = useState<string | null>(null);

    // Refs to store previous prop references
    const prevInitialImageNotesRef = useRef<NostrNote[] | undefined>(undefined);
    const prevInitialAudioNotesRef = useRef<NostrNote[] | undefined>(undefined);
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

    // --- NEW: Effect to process initialAudioNotes prop --- 
    useEffect(() => {
         // Only process if the reference has actually changed
        if (initialAudioNotes !== prevInitialAudioNotesRef.current) {
            console.log(`useMediaState: Processing ${initialAudioNotes.length} initial audio notes (Reference changed).`);
            const sortedNotes = [...initialAudioNotes].sort((a, b) => b.created_at - a.created_at);
            setAudioNotes(sortedNotes);
            setIsLoadingAudioNotes(false); // Set loading false here
            // Reset index if needed
            const newIndex = (currentAudioIndex >= sortedNotes.length && sortedNotes.length > 0) ? 0 : currentAudioIndex;
            if (newIndex !== currentAudioIndex) {
                setCurrentAudioIndexInternal(newIndex);
            }
             prevInitialAudioNotesRef.current = initialAudioNotes; // Update the ref
        } else {
           console.log("useMediaState: Skipping audio notes processing - reference hasn't changed.");
           // Still ensure loading is false if the ref hasn't changed but notes are present
           if(audioNotes.length > 0 && isLoadingAudioNotes) setIsLoadingAudioNotes(false);
        }
    }, [initialAudioNotes, currentAudioIndex, audioNotes.length, isLoadingAudioNotes]); // Add dependencies for reset and loading logic

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
        console.log(`useMediaState URL Effect Trigger: mode=${viewMode}, aIdx=${currentAudioIndex}, vIdx=${currentVideoIndex}, iIdx=${currentImageIndex}`);

        if (viewMode === 'imagePodcast') {
            if (audioNotes.length > 0 && currentAudioIndex < audioNotes.length) {
                newUrl = audioNotes[currentAudioIndex]?.url || null;
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

    }, [viewMode, currentAudioIndex, currentVideoIndex, audioNotes, videoNotes, currentItemUrl]);

    // Set Audio Index (does NOT change viewMode)
    const setCurrentAudioIndex = useCallback((index: number) => {
        console.log("useMediaState: setCurrentAudioIndex called with", index);
        if (index >= 0 && index < audioNotes.length) {
            setCurrentAudioIndexInternal(index);
        } else {
            console.warn(`useMediaState: Attempted to set invalid audio index ${index}`);
        }
    }, [audioNotes]);

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
                if (newSelectedVideo.posterPubkey) { try { newNpub = nip19.npubEncode(newSelectedVideo.posterPubkey); } catch { /* ignore encoding errors */ } }
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
        audioNotes, // Return internal state
        videoNotes, // Return internal state
        isLoadingAudioNotes,
        isLoadingVideoNotes,
        currentImageIndex,
        currentAudioIndex,
        currentVideoIndex,
        selectedVideoNpub,
        currentItemUrl,
        // Removed handle...NotesLoaded
        handleVideoSelect,
        handlePrevious,
        handleNext,
        setViewMode,
        setCurrentAudioIndex,
        // Removed setIsLoading...
    };
} 