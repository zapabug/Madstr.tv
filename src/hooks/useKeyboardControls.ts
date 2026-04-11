import { useEffect, useCallback } from 'react';

interface KeyboardControlsProps {
  isFullScreen: boolean;
  signalInteraction: () => void;
  onSetViewMode: (_mode: 'imagePodcast' | 'videoPlayer') => void;
  onTogglePlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onOpenSettings?: () => void; // Callback to open settings modal
  onCloseSettings?: () => void; // Callback to close settings modal
  onFocusToggle?: () => void;
  viewMode: 'imagePodcast' | 'videoPlayer';
}

export const useKeyboardControls = ({
  isFullScreen,
  signalInteraction,
  onSetViewMode,
  onTogglePlayPause,
  onNext,
  onPrevious,
  onOpenSettings,
  onCloseSettings,
  onFocusToggle,
  viewMode,
}: KeyboardControlsProps) => {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    signalInteraction();

    if (isFullScreen) {
      return;
    }

    switch (event.key) {
      case 's':
      case 'S':
        if (onOpenSettings) {
          onOpenSettings();
        }
        break;
      case 'Escape':
      case 'Backspace':
        if (onCloseSettings) {
          onCloseSettings();
        } else if (onFocusToggle) {
          onFocusToggle();
        }
        break;
      case 'Enter':
      case ' ':
        if (document.activeElement?.getAttribute('aria-label') === 'Settings') {
          if (onOpenSettings) {
            onOpenSettings();
          }
        }
        break;
      default:
        break;
    }
  }, [isFullScreen, signalInteraction, onOpenSettings, onCloseSettings, onFocusToggle]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}; 