import { useEffect } from 'react';

interface KeyboardControlsProps {
  isFullScreen: boolean;
  signalInteraction: () => void;
  onSetViewMode: (mode: 'imagePodcast' | 'videoPlayer') => void;
  onTogglePlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onFocusToggle?: () => void; // Optional callback for focus management (e.g., Back key)
  viewMode: 'imagePodcast' | 'videoPlayer'; // Needed to determine mode switch direction
}

export const useKeyboardControls = ({
  isFullScreen,
  signalInteraction,
  onSetViewMode,
  onTogglePlayPause,
  onNext,
  onPrevious,
  onFocusToggle, 
  viewMode,
}: KeyboardControlsProps) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Always signal interaction on any key press
      signalInteraction(); 

      // If fullscreen, interaction signal is enough, don't process other keys
      if (isFullScreen) {
        console.log(`useKeyboardControls: Key event (Fullscreen) - Key: ${event.key}`);
        return; 
      }

      // --- Process keys only if NOT in fullscreen ---
      console.log(`useKeyboardControls: Key event (Not Fullscreen) - Key: ${event.key}, Code: ${event.code}`);

      switch (event.key) {
        // REMOVING ArrowUp/ArrowDown cases - Rely on browser focus navigation
        /*
        case 'ArrowUp':
        case 'ArrowDown':
          // Toggle between modes
          onSetViewMode(viewMode === 'imagePodcast' ? 'videoPlayer' : 'imagePodcast');
          event.preventDefault();
          break;
        */
        // REMOVING Escape/Backspace/Back cases - Rely on browser focus navigation/handling
        /*
        case 'Escape':
        case 'Backspace':
        case 'Back': // Common on some TV remotes
          console.log("useKeyboardControls: Back/Escape key pressed.");
          // Optional: Call focus callback if provided
          onFocusToggle?.(); 
          event.preventDefault(); 
          break;
        */
        default:
          // Allow browser default behavior for ALL keys when not fullscreen
          console.log(`useKeyboardControls: Allowing default behavior for key: ${event.key}`);
          // We no longer call preventDefault() here, let the browser handle it.
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
    // Dependencies: Include all functions/state used inside the effect
  }, [isFullScreen, signalInteraction, onSetViewMode, onTogglePlayPause, onNext, onPrevious, onFocusToggle, viewMode]); 
}; 