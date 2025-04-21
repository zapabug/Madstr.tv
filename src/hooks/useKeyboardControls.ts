import { useEffect, useCallback } from 'react';

// Original Props
interface KeyboardControlsProps {
  isFullScreen: boolean; // Still needed to gate controls
  signalInteraction: () => void; // Called on any keypress
  onSetViewMode: (mode: 'imagePodcast' | 'videoPlayer') => void;
  onTogglePlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onFocusToggle: () => void; 
  viewMode: 'imagePodcast' | 'videoPlayer';
  onToggleFullScreen: () => void;
}

// Original Implementation
export function useKeyboardControls({
  isFullScreen,
  signalInteraction,
  onSetViewMode,
  onTogglePlayPause,
  onNext,
  onPrevious,
  onFocusToggle,
  viewMode,
  onToggleFullScreen,
}: KeyboardControlsProps) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    signalInteraction(); // Signal activity on any key press
    console.log(`useKeyboardControls: Key event - Key: ${event.key}, Code: ${event.code}, isFullScreen: ${isFullScreen}`);

    // Specific handling based on key and fullscreen state
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        if (isFullScreen) {
          console.log(`useKeyboardControls: Arrow key (${event.key}) detected (Fullscreen) - Exiting fullscreen.`);
          onToggleFullScreen(); // Exit fullscreen on any arrow press
          event.preventDefault(); // Prevent default scrolling/actions
        } else {
          // Original non-fullscreen arrow key logic
          console.log(`useKeyboardControls: Arrow key (${event.key}) detected (Not Fullscreen).`);
          switch (event.key) {
            case 'ArrowUp':
              if (viewMode === 'imagePodcast') onSetViewMode('videoPlayer');
              break;
            case 'ArrowDown':
              if (viewMode === 'videoPlayer') onSetViewMode('imagePodcast');
              else onFocusToggle();
              break;
            case 'ArrowLeft':
              onPrevious();
              break;
            case 'ArrowRight':
              onNext();
              break;
          }
          event.preventDefault(); // Prevent default scrolling/actions
        }
        break;

      case 'Enter':
      case ' ': // OK / Select button
        if (isFullScreen) {
          // Assuming the QR Code button is already focused via auto-focus logic elsewhere
          console.log(`useKeyboardControls: ${event.key === 'Enter' ? 'Enter' : 'Space'} detected (Fullscreen) - Allowing default action for focused element (QR Button).`);
          // *** DO NOT preventDefault() ***
          // Let the browser handle activating the focused button.
        } else {
          // Original non-fullscreen behavior
          console.log(`useKeyboardControls: ${event.key === 'Enter' ? 'Enter' : 'Space'} detected (Not Fullscreen).`);
           if (document.activeElement && document.activeElement !== document.body && document.activeElement !== document.documentElement) {
               console.log("useKeyboardControls: Allowing default for focused element:", document.activeElement);
               // Allow default browser action for other focused elements like buttons
           } else {
               console.log("useKeyboardControls: Toggling play/pause.");
               onTogglePlayPause(); // Toggle play/pause if nothing specific is focused
               event.preventDefault(); // Prevent space scrolling page etc.
           }
        }
        break;

      case 'Backspace': // Assuming Back button also exits fullscreen
        if (isFullScreen) {
          console.log("useKeyboardControls: Backspace detected (Fullscreen) - Exiting fullscreen.");
          onToggleFullScreen();
          event.preventDefault();
        } else {
           console.log("useKeyboardControls: Backspace detected (Not Fullscreen) - Ignoring.");
          // Potentially add non-fullscreen Backspace behavior if needed
        }
        break;

      // Also exit on Escape
       case 'Escape':
         if (isFullScreen) {
          console.log("useKeyboardControls: Escape detected (Fullscreen) - Exiting fullscreen.");
          onToggleFullScreen();
          event.preventDefault();
         }
         break;

      default:
         console.log(`useKeyboardControls: Unhandled key - ${event.key}`);
         // Allow default behavior for unhandled keys
         break;
    }
  }, [
    isFullScreen,
    signalInteraction,
    onSetViewMode,
    onTogglePlayPause,
    onNext,
    onPrevious,
    onFocusToggle,
    viewMode,
    onToggleFullScreen, // Ensure dependency is included
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
} 