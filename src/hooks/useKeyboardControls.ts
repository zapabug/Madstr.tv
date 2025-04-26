import { useEffect, useCallback } from 'react';

// Original Props
interface KeyboardControlsProps {
  isFullScreen: boolean;
  signalInteraction: () => void;
  onTogglePlayPause: () => void;
  onToggleFullScreen: () => void;
}

// Original Implementation
export function useKeyboardControls({
  isFullScreen,
  signalInteraction,
  onTogglePlayPause,
  // onToggleFullScreen, // Prop not used directly
}: KeyboardControlsProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // signalInteraction(); // <<< REMOVE Unconditional Call Here
      console.log(
        `useKeyboardControls: Key event - Key: ${event.key}, Code: ${event.code}, isFullScreen: ${isFullScreen}`
      );

      // Handle exit fullscreen first
      if (isFullScreen) {
        switch (event.key) {
          case 'ArrowUp':
          case 'ArrowDown':
          case 'ArrowLeft':
          case 'ArrowRight':
          case 'Backspace':
          case 'Escape':
            console.log(
              `useKeyboardControls: Key (${event.key}) detected (Fullscreen) - Exiting fullscreen.`
            );
            signalInteraction(); // Call signalInteraction ONLY when exiting fullscreen via these keys
            event.preventDefault();
            return;
        }
      } else {
        // If NOT fullscreen, still signal interaction for activity tracking (except maybe for arrows?)
        // Let's only signal on non-arrow keys when not fullscreen to avoid messing with focus timer
        if (!event.key.startsWith('Arrow')) {
            signalInteraction(); 
        }
      }

      // Non-fullscreen handling (continues if not fullscreen or handled above)
      switch (event.key) {
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight':
          // *** DO NOTHING - Allow default browser focus navigation ***
          console.log(
            `useKeyboardControls: Arrow key (${event.key}) detected (Not Fullscreen) - Allowing default focus navigation.`
          );
          // Note: event.preventDefault() is NOT called here
          break;

        case 'Enter':
        case ' ': // OK / Select button
          console.log(
            `useKeyboardControls: ${
              event.key === 'Enter' ? 'Enter' : 'Space'
            } detected (Not Fullscreen).`
          );
          // Check if a specific element (button, input, etc.) has focus
          if (
            document.activeElement &&
            document.activeElement !== document.body &&
            document.activeElement !== document.documentElement &&
            // Check if it's an interactive element that should respond to Enter/Space
            (document.activeElement instanceof HTMLButtonElement ||
              document.activeElement instanceof HTMLInputElement ||
              document.activeElement instanceof HTMLSelectElement ||
              document.activeElement instanceof HTMLTextAreaElement ||
              document.activeElement.getAttribute('role') === 'button' ||
              document.activeElement.getAttribute('role') === 'option' ||
              document.activeElement.getAttribute('role') === 'menuitem' ||
              document.activeElement.getAttribute('role') === 'slider' ||
              document.activeElement.hasAttribute('onclick')) // Basic check for elements with click handlers
          ) {
            console.log(
              'useKeyboardControls: Allowing default action for focused element:',
              document.activeElement
            );
            // *** DO NOT preventDefault() ***
            // Let the browser handle activating the focused element (click, select, etc.)
          } else {
            // If no specific interactive element is focused, treat Enter/Space as Play/Pause
            console.log(
              'useKeyboardControls: No specific element focused, toggling play/pause.'
            );
            onTogglePlayPause();
            event.preventDefault(); // Prevent space scrolling page etc. in this fallback case
          }
          break;

        case 'Backspace':
          console.log(
            'useKeyboardControls: Backspace detected (Not Fullscreen) - Ignoring.'
          );
          // Allow default backspace behavior (e.g., in input fields) or do nothing
          break;

        case 'Escape':
           console.log("useKeyboardControls: Escape detected (Not Fullscreen) - Ignoring.");
           // Allow default escape behavior if needed
          break;

        default:
          console.log(`useKeyboardControls: Unhandled key - ${event.key}`);
          // Allow default behavior for unhandled keys
          break;
      }
    },
    [isFullScreen, signalInteraction, onTogglePlayPause]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
} 