import { useState, useCallback } from 'react';
import { nip19 } from 'nostr-tools';
import { MediaNote } from '../components/MediaFeed'; // Assuming MediaNote is exported
import { VideoNote } from '../components/VideoList'; // Assuming VideoNote is exported

// Helper function (if needed, or keep in App.tsx if only used there once)
// function getHexPubkey... (already moved to useMediaAuthors or kept in App if needed elsewhere)

export function useMediaState() {
    // State for selected video
    const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
    const [selectedVideoNpub, setSelectedVideoNpub] = useState<string | null>(null);

    // State for bottom-right panel toggle
    const [interactiveMode, setInteractiveMode] = useState<'podcast' | 'video'>('podcast');

    // State for notes
    const [imageNotes, setImageNotes] = useState<MediaNote[]>([]); 
    const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
    const [videoNotes, setVideoNotes] = useState<VideoNote[]>([]); 
    const [currentVideoIndex, setCurrentVideoIndex] = useState<number>(0);

    // Define handleVideoSelect first as it might be used by other handlers here
    const handleVideoSelect = useCallback((url: string | null, npub: string | null, index: number) => {
        console.log(`useMediaState: Video selected - URL: ${url}, Npub: ${npub}, Index: ${index}`);
        setSelectedVideoUrl(url);
        setSelectedVideoNpub(npub);
        setCurrentVideoIndex(index);
    }, []); // No dependencies needed if it only calls setters

    // Callback handlers for loaded notes
    const handleImageNotesLoaded = useCallback((notes: MediaNote[]) => {
        console.log(`useMediaState: Received ${notes.length} image notes.`);
        setImageNotes(notes);
        // Reset index if it's out of bounds after notes update
        if (currentImageIndex >= notes.length && notes.length > 0) {
            setCurrentImageIndex(0);
        }
    }, [currentImageIndex]); // Dependency needed for index check

    const handleVideoNotesLoaded = useCallback((notes: VideoNote[]) => {
        console.log(`useMediaState: Received ${notes.length} video notes.`);
        setVideoNotes(notes);
        // Reset video index if out of bounds
        if (currentVideoIndex >= notes.length && notes.length > 0) {
            setCurrentVideoIndex(0);
        }
        // Auto-select first video if none is selected and notes are loaded
        if (notes.length > 0 && !selectedVideoUrl) {
            console.log("useMediaState: Auto-selecting first video on load.");
            let npub: string | null = null;
            try {
                npub = nip19.npubEncode(notes[0].posterPubkey);
            } catch (e) { console.error("useMediaState: Failed to encode npub in handleVideoNotesLoaded", e); }
            handleVideoSelect(notes[0].url, npub, 0);
        }
    // Dependencies: currentVideoIndex, selectedVideoUrl, handleVideoSelect
    }, [currentVideoIndex, selectedVideoUrl, handleVideoSelect]);

    // Prev/Next handlers
    const handlePrevious = useCallback(() => {
        if (interactiveMode === 'podcast') {
            const cycleLength = imageNotes.length;
            if (cycleLength === 0) return;
            const prevIndex = (currentImageIndex - 1 + cycleLength) % cycleLength;
            setCurrentImageIndex(prevIndex);
            console.log(`useMediaState: Previous Image - Index: ${prevIndex}`);
        } else {
            const cycleLength = videoNotes.length;
            if (cycleLength === 0) return;
            const prevIndex = (currentVideoIndex - 1 + cycleLength) % cycleLength;
            const newSelectedVideo = videoNotes[prevIndex];
            if (newSelectedVideo) {
                let npub: string | null = null;
                try {
                    npub = nip19.npubEncode(newSelectedVideo.posterPubkey);
                } catch (e) { console.error("useMediaState: Failed to encode npub in handlePrevious", e); }
                handleVideoSelect(newSelectedVideo.url, npub, prevIndex); // Use handleVideoSelect
                console.log(`useMediaState: Previous Video - Index: ${prevIndex}, URL: ${newSelectedVideo.url}`);
            } else {
                console.warn("useMediaState: Previous Video - No video found at index", prevIndex);
            }
        }
    // Dependencies: interactiveMode, currentImageIndex, currentVideoIndex, imageNotes, videoNotes, handleVideoSelect
    }, [interactiveMode, currentImageIndex, currentVideoIndex, imageNotes, videoNotes, handleVideoSelect]);

    const handleNext = useCallback(() => {
        if (interactiveMode === 'podcast') {
            const cycleLength = imageNotes.length;
            if (cycleLength === 0) return;
            const nextIndex = (currentImageIndex + 1) % cycleLength;
            setCurrentImageIndex(nextIndex);
            console.log(`useMediaState: Next Image - Index: ${nextIndex}`);
        } else {
            const cycleLength = videoNotes.length;
            if (cycleLength === 0) return;
            const nextIndex = (currentVideoIndex + 1) % cycleLength;
            const newSelectedVideo = videoNotes[nextIndex];
            if (newSelectedVideo) {
                let npub: string | null = null;
                try {
                    npub = nip19.npubEncode(newSelectedVideo.posterPubkey);
                } catch (e) { console.error("useMediaState: Failed to encode npub in handleNext", e); }
                handleVideoSelect(newSelectedVideo.url, npub, nextIndex); // Use handleVideoSelect
                console.log(`useMediaState: Next Video - Index: ${nextIndex}, URL: ${newSelectedVideo.url}`);
            } else {
                console.warn("useMediaState: Next Video - No video found at index", nextIndex);
            }
        }
    // Dependencies: interactiveMode, currentImageIndex, currentVideoIndex, imageNotes, videoNotes, handleVideoSelect
    }, [interactiveMode, currentImageIndex, currentVideoIndex, imageNotes, videoNotes, handleVideoSelect]);

    const toggleInteractiveMode = useCallback(() => {
        setInteractiveMode(prev => {
            const newMode = prev === 'podcast' ? 'video' : 'podcast';
            console.log("useMediaState: Toggling interactiveMode to", newMode);
            // If switching to video mode, select the current/first video
            if (newMode === 'video' && videoNotes.length > 0) {
                console.log("useMediaState: Selecting current/first video on mode toggle.");
                const indexToSelect = currentVideoIndex < videoNotes.length ? currentVideoIndex : 0;
                const videoToSelect = videoNotes[indexToSelect];
                if (videoToSelect) {
                    let npub: string | null = null;
                    try {
                        npub = nip19.npubEncode(videoToSelect.posterPubkey);
                    } catch (e) { console.error("useMediaState: Failed to encode npub in toggleInteractiveMode", e); }
                    handleVideoSelect(videoToSelect.url, npub, indexToSelect);
                }
            }
            return newMode;
        });
    // Dependencies: videoNotes, currentVideoIndex, handleVideoSelect
    }, [videoNotes, currentVideoIndex, handleVideoSelect]);

    // Return all the state values and handlers needed by App.tsx
    return {
        // State values
        interactiveMode,
        imageNotes,
        currentImageIndex,
        videoNotes,
        currentVideoIndex,
        selectedVideoUrl,
        selectedVideoNpub,
        
        // Handlers
        handleImageNotesLoaded,
        handleVideoNotesLoaded,
        handleVideoSelect,
        handlePrevious,
        handleNext,
        toggleInteractiveMode,
    };
} 