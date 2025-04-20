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
      // Always signal interaction on any key press to potentially exit fullscreen
      signalInteraction(); 

      if (isFullScreen) {
        console.log(`useKeyboardControls: Key event (Fullscreen) - Key: ${event.key}`);
        // Prevent default browser actions for specific keys even in fullscreen
        // to ensure they ONLY signal interaction and don't scroll/etc.
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) {
          event.preventDefault();
        }
        // Interaction signal is enough, don't process other specific app actions
        return; 
      }

      // --- Process keys only if NOT in fullscreen --- Simulate D-pad ---
      console.log(`useKeyboardControls: Key event (Not Fullscreen) - Key: ${event.key}, Code: ${event.code}`);

      switch (event.key) {
        case 'ArrowUp':
        case 'ArrowDown':
          // Toggle between modes (like Channel Up/Down?)
          onSetViewMode(viewMode === 'imagePodcast' ? 'videoPlayer' : 'imagePodcast');
          event.preventDefault(); // Prevent page scroll
          break;
        case 'ArrowLeft':
          onPrevious();
          event.preventDefault(); // Prevent browser back/forward
          break;
        case 'ArrowRight':
          onNext();
          event.preventDefault(); // Prevent browser back/forward
          break;
        case 'Enter':
        case ' ': // Space bar
          onTogglePlayPause(); // OK/Select toggles play/pause
          event.preventDefault(); // Prevent button clicks/space scroll
          break;
        case 'Escape':
        case 'Backspace':
          // Maybe use Backspace/Escape to trigger the focus toggle?
          onFocusToggle?.(); 
          event.preventDefault(); 
          break;
        // Consider adding 'Back' key code if needed for specific remotes

        default:
          // Don't prevent default for unhandled keys (allows typing in inputs if ever added)
          console.log(`useKeyboardControls: Allowing default behavior for unhandled key: ${event.key}`);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullScreen, signalInteraction, onSetViewMode, onTogglePlayPause, onNext, onPrevious, onFocusToggle, viewMode]); 
}; 