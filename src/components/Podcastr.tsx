// src/components/Podcastr.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useInactivityTimer } from '../hooks/useInactivityTimer';
import { usePodcastNotes } from '../hooks/usePodcastNotes';
import { useProfileData } from '../hooks/useProfileData';
import { useAudioPlayback } from '../hooks/useAudioPlayback';

// --- Helper to format time (seconds) into MM:SS ---
const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || !isFinite(seconds)) {
        return '00:00';
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(remainingSeconds).padStart(2, '0');
    return `${formattedMinutes}:${formattedSeconds}`;
};

interface PodcastPlayerProps {
  authors: string[];
}

const Podcastr: React.FC<PodcastPlayerProps> = ({ authors }) => {
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [focusedItemIndex, setFocusedItemIndex] = useState(0);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);

  // --- Refs ---
  const audioRef = useRef<HTMLAudioElement>(null);
  const scrollableListRef = useRef<HTMLDivElement>(null);
  const listItemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const speedButtonRef = useRef<HTMLButtonElement>(null);
  const playPauseButtonRef = useRef<HTMLButtonElement>(null);
  const progressBarRef = useRef<HTMLInputElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null); // <<< Declaration >>>

  // --- Custom Hooks ---
  const { notes, isLoading: isLoadingNotes } = usePodcastNotes(authors);
  const { profiles } = useProfileData(notes);
  // Get the current item based on the index *after* notes have loaded
  const currentItem = !isLoadingNotes && notes.length > currentItemIndex ? notes[currentItemIndex] : null;
  const {
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    setPlaybackRate,
    togglePlayPause,
    handleSeek
  } = useAudioPlayback({ audioRef, currentItemUrl: currentItem?.url || null });
  const [isInactive, resetInactivityTimer] = useInactivityTimer(45000);

  // --- Effects ---

  // Initialize/Resize list item refs when notes change
  useEffect(() => {
      listItemRefs.current = Array(notes.length).fill(null).map((_, i) => listItemRefs.current[i] || null);
  }, [notes]);

  // Reset focus/selection when notes list changes (e.g., author selection changes)
  useEffect(() => {
    // Check if notes array identity has changed or length is 0 to avoid unnecessary resets
    setCurrentItemIndex(0);
    setFocusedItemIndex(0);
  }, [notes]); // Depend on notes array identity

  // Effect to close speed menu if clicked outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isSpeedMenuOpen &&
        speedMenuRef.current &&
        !speedMenuRef.current.contains(event.target as Node) &&
        speedButtonRef.current &&
        !speedButtonRef.current.contains(event.target as Node)
      ) {
        setIsSpeedMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSpeedMenuOpen]);

  // Effect to scroll focused item into view
  useEffect(() => {
    // Ensure notes exist and index is valid before scrolling
    if (notes.length > 0 && focusedItemIndex >= 0 && focusedItemIndex < listItemRefs.current.length && listItemRefs.current[focusedItemIndex]) {
        listItemRefs.current[focusedItemIndex]?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
        });
    }
  }, [focusedItemIndex, notes.length]);

  // Effect for Initial Focus on the list
  useEffect(() => {
      if (!isLoadingNotes && notes.length > 0 && scrollableListRef.current) {
          const validIndex = Math.max(0, Math.min(focusedItemIndex, notes.length - 1));
          if (focusedItemIndex !== validIndex) {
              setFocusedItemIndex(validIndex); // Ensure index is valid
          }
          // Check if the list itself doesn't already have focus
          // This can prevent focus jumps if user clicked elsewhere while notes loaded
          if (document.activeElement !== scrollableListRef.current) {
            console.log("Podcastr: Setting initial focus to scrollable list.");
            scrollableListRef.current.focus();
          }
      }
  }, [isLoadingNotes, notes.length, focusedItemIndex]); // Rerun if loading state, notes length or focusedIndex changes

  // Effect for Inactivity Listeners
  useEffect(() => {
    const container = mainContainerRef.current; // <<< Usage 1 >>>
    if (!container) return;
    const handleActivity = () => resetInactivityTimer();
    const activityEvents: Array<keyof HTMLElementEventMap> = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'focus'];
    activityEvents.forEach(event => container.addEventListener(event, handleActivity, event === 'focus'));
    resetInactivityTimer();
    return () => {
      activityEvents.forEach(event => {
          if (container) {
             container.removeEventListener(event, handleActivity, event === 'focus');
          }
      });
    };
  }, [resetInactivityTimer]);

  // --- Event Handlers ---

  const handleSpeedChange = (newRate: number) => {
      setPlaybackRate(newRate);
      setIsSpeedMenuOpen(false);
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (notes.length === 0) return;
      let newIndex = focusedItemIndex;
      switch (event.key) {
          case 'ArrowUp':
              newIndex = Math.max(0, focusedItemIndex - 1);
              event.preventDefault();
              break;
          case 'ArrowDown':
              newIndex = Math.min(notes.length - 1, focusedItemIndex + 1);
              event.preventDefault();
              break;
          case 'Enter':
          case ' ':
              if (newIndex >= 0 && newIndex < notes.length) {
                 setCurrentItemIndex(newIndex);
                 playPauseButtonRef.current?.focus();
              }
              event.preventDefault();
              break;
          default:
              return;
      }
      if (newIndex !== focusedItemIndex) {
          setFocusedItemIndex(newIndex);
      }
  };

  const handlePlayPauseKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
          togglePlayPause();
          event.preventDefault();
      }
  };

  // --- Render Logic ---

  if (isLoadingNotes) {
    return (
        <div className='relative w-full h-full bg-gray-800 flex items-center justify-center overflow-hidden p-4'>
            <p className='text-gray-400 text-lg font-medium'>Loading Podcasts...</p>
        </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className='relative w-full h-full bg-gray-800 flex items-center justify-center overflow-hidden p-4'>
        <p className='text-gray-400 text-lg font-medium'>No podcasts found for selected authors.</p>
      </div>
    );
  }

  return (
    <div
        ref={mainContainerRef}
        className='relative w-full h-full bg-blue-950 flex flex-col overflow-hidden p-2 text-white rounded-lg'
    >
      {/* Scrollable Podcast List */}
      <div
          ref={scrollableListRef}
          tabIndex={0}
          onKeyDown={handleListKeyDown}
          className="flex-grow w-full overflow-y-auto pr-1 mb-2 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-blue-950 rounded"
          aria-activedescendant={notes[focusedItemIndex]?.id}
          aria-label="Podcast List"
          role="listbox"
      >
        {notes.map((note, index) => {
            const isActuallySelected = index === currentItemIndex;
            const isFocused = index === focusedItemIndex;
            let itemBg = 'bg-blue-800 bg-opacity-60 hover:bg-blue-700 hover:bg-opacity-80';
            if (isActuallySelected) {
                itemBg = 'bg-purple-700 bg-opacity-70';
            }
            const focusStyle = isFocused ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-blue-950' : '';
            const profile = profiles[note.posterPubkey];
            const itemDisplayName = profile?.name || profile?.displayName || note.posterPubkey.substring(0, 10) + '...';
            const itemPictureUrl = profile?.picture;
            const itemIsLoadingProfile = profile?.isLoading;

            return (
                <div
                    key={note.id}
                    id={note.id}
                    ref={(el) => {
                        if (index < listItemRefs.current.length) {
                            listItemRefs.current[index] = el;
                        } else {
                           console.warn(`Podcastr: Attempted to assign ref to index ${index} beyond current length ${listItemRefs.current.length}`);
                        }
                    }}
                    role="option"
                    aria-selected={isActuallySelected}
                    tabIndex={-1}
                    className={`flex items-center p-2 mb-1 rounded-md cursor-pointer transition-colors ${itemBg} ${focusStyle} focus:outline-none`}
                    onClick={() => setCurrentItemIndex(index)}
                    title={note.content || note.url}
                >
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center mr-2">
                        <span className="text-xs font-semibold text-white">{notes.length - index}</span>
                    </div>
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 overflow-hidden mr-2">
                        {itemIsLoadingProfile ? (
                            <div className="w-full h-full animate-pulse bg-gray-400"></div>
                        ) : itemPictureUrl ? (
                            <img src={itemPictureUrl} alt={itemDisplayName} className="w-full h-full object-cover" onError={() => console.error(`Podcastr: Failed profile img: ${itemPictureUrl}`)} />
                        ) : (
                            <span className="text-gray-300 text-xs font-semibold flex items-center justify-center h-full uppercase">
                                {itemDisplayName.substring(0, 1)}
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-white truncate flex-grow" title={itemDisplayName}>
                       {itemDisplayName}
                    </p>
                </div>
            );
        })}
      </div>

      {/* Audio Player Controls Area - Apply fade effect */}
      <div
          className={`w-full max-w-xl px-2 py-1 mt-auto bg-black bg-opacity-60 rounded-lg flex-shrink-0 mx-auto flex items-center space-x-3 transition-opacity duration-500 ease-in-out ${isInactive ? 'opacity-20' : 'opacity-100'}`}
      >
        {/* Audio Element - Hidden (Ref is passed to useAudioPlayback) */}
        <audio ref={audioRef} className="hidden" />

        {/* Play/Pause Button (Uses togglePlayPause from hook) */}
        <button
            ref={playPauseButtonRef}
            onClick={togglePlayPause} // Use function from hook
            onKeyDown={handlePlayPauseKeyDown}
            tabIndex={0}
            className="flex-shrink-0 p-2 rounded-md text-white bg-purple-600 hover:bg-purple-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black"
            aria-label={isPlaying ? "Pause Podcast" : "Play Podcast"}
        >
            {isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                </svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
            )}
        </button>

        {/* Progress Bar & Time Display (Uses state/handlers from hook) */}
        <div className="flex flex-grow items-center space-x-2 min-w-0 px-1">
            <span className="text-xs font-mono text-gray-300 w-10 text-right flex-shrink-0">
                {formatTime(currentTime)} {/* <<< Usage 1 >>> */}
            </span>
            <input
                ref={progressBarRef}
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime || 0}
                onChange={handleSeek} // Use handler from hook
                className="flex-grow h-1 bg-gray-600 rounded-full appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black podcast-progress"
                style={{
                    background: duration > 0 && isFinite(duration) && isFinite(currentTime)
                        ? `linear-gradient(to right, #a855f7 ${ (currentTime / duration) * 100 }%, #4b5563 ${ (currentTime / duration) * 100 }%)`
                        : '#4b5563'
                }}
                tabIndex={0}
                aria-label="Podcast progress"
            />
            <span className="text-xs font-mono text-gray-300 w-10 text-left flex-shrink-0">
                {formatTime(duration)} {/* <<< Usage 2 >>> */}
            </span>
        </div>

        {/* Speed Control Button & Menu (Uses state/handler from hook) */}
        <div className="relative flex-shrink-0">
            <button
                ref={speedButtonRef}
                onClick={() => setIsSpeedMenuOpen(!isSpeedMenuOpen)}
                className="p-1 text-xs font-semibold w-10 h-10 flex items-center justify-center rounded-md text-white bg-gray-700 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black"
                title="Playback Speed"
                aria-haspopup="true"
                aria-expanded={isSpeedMenuOpen}
                tabIndex={0}
            >
                <span>{playbackRate.toFixed(1)}x</span>
            </button>
            {isSpeedMenuOpen && (
                <div
                    ref={speedMenuRef}
                    className="absolute bottom-full right-0 mb-1 w-20 bg-gray-700 border border-gray-600 rounded shadow-lg py-1 z-10"
                    role="menu"
                >
                    {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(rate => (
                        <button
                            key={rate}
                            onClick={() => handleSpeedChange(rate)}
                            className={`block w-full text-left px-3 py-1 text-sm ${
                                playbackRate === rate ? 'bg-purple-600 text-white' : 'text-gray-200 hover:bg-gray-600'
                            }`}
                            role="menuitemradio"
                            aria-checked={playbackRate === rate}
                        >
                            {rate.toFixed(2)}x
                        </button>
                    ))}
                </div>
            )}
        </div>
      </div>

    </div>
  );
};

export default Podcastr;
