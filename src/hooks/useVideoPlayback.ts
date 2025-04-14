import { useState, useCallback } from 'react';

export function useVideoPlayback() {
    // State for controlling playback request vs actual state
    const [appIsPlayingRequest, setAppIsPlayingRequest] = useState<boolean>(false); 
    const [videoIsPlayingActual, setVideoIsPlayingActual] = useState<boolean>(false);

    // Handler for VideoPlayer reporting its actual playing state
    // This updates the internal actual state and syncs the request state if needed
    const handleVideoPlayingStateChange = useCallback((isPlaying: boolean) => {
        setVideoIsPlayingActual(isPlaying);
        // If video stops unexpectedly (e.g., ends, buffers), sync request state
        if (!isPlaying && appIsPlayingRequest) {
            console.log("useVideoPlayback: Video stopped unexpectedly, syncing request state.");
            setAppIsPlayingRequest(false);
        }
    }, [appIsPlayingRequest]); // Dependency needed for sync logic

    // Handler for user clicking the Play/Pause button
    const handleAppPlayPauseClick = useCallback(() => {
        console.log("useVideoPlayback: Play/Pause button clicked.");
        setAppIsPlayingRequest(prev => !prev);
    }, []);

    // Handler for user pressing Enter/Space on the Play/Pause button
    const handleAppPlayPauseKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
            console.log("useVideoPlayback: Play/Pause button keydown (Enter/Space).");
            setAppIsPlayingRequest(prev => !prev);
            event.preventDefault();
        }
    }, []);

    // Return the state needed by components and the handlers they trigger
    return {
        appIsPlayingRequest,
        videoIsPlayingActual,
        handleVideoPlayingStateChange, // Passed to VideoPlayer
        handleAppPlayPauseClick,       // Passed to Play/Pause button
        handleAppPlayPauseKeyDown,     // Passed to Play/Pause button
    };
} 