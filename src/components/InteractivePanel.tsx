import React from 'react';
import Podcastr from './Podcastr';
import VideoList, { VideoListProps, VideoNote } from './VideoList'; // Import props type and VideoNote

// Define the props for the InteractivePanel
interface InteractivePanelProps {
  authors: string[];
  onVideoSelect: VideoListProps['onVideoSelect']; // Reuse type from VideoList
  interactiveMode: 'podcast' | 'video';
  toggleInteractiveMode: () => void;
  currentVideoIndex: number;
  videoNotes: VideoNote[];
  onNotesLoaded: (notes: VideoNote[]) => void;
}

const InteractivePanel: React.FC<InteractivePanelProps> = ({
  authors,
  onVideoSelect,
  interactiveMode,
  toggleInteractiveMode,
  currentVideoIndex,
  videoNotes,
  onNotesLoaded,
}) => {
  return (
    // Outermost container for the panel + toggle button
    <div className="relative w-full h-full flex flex-col">

        {/* Toggle Button (Absolute Position - Top right *within* this panel) */}
        <button
           onClick={toggleInteractiveMode}
           // Positioned top-right within the panel's container
           className="absolute top-1 right-1 z-20 p-1 bg-transparent border-none
                      text-purple-500 hover:text-purple-300 focus:text-purple-300
                      focus:outline-none transition-colors duration-150 text-xs font-semibold uppercase"
           aria-label={interactiveMode === 'podcast' ? 'Show Video List' : 'Show Podcasts'}
           title={interactiveMode === 'podcast' ? 'Show Video List' : 'Show Podcasts'}
           style={{lineHeight: '1'}}
        >
            {interactiveMode === 'podcast' ? 'Videos' : 'Podcasts'}
        </button>

        {/* Content Area (Takes remaining space, added top margin for button) */}
        {/* The direct children (Podcastr/VideoList) will handle their own background/padding if needed */}
        <div className="flex-grow min-h-0 mt-6"> {/* Adjusted margin for button */}
            {interactiveMode === 'podcast' ? (
                // Pass authors to Podcastr
                <Podcastr authors={authors} />
            ) : (
                // Pass all required props to VideoList
                <VideoList
                    authors={authors}
                    onVideoSelect={onVideoSelect}
                    currentVideoIndex={currentVideoIndex}
                    videoNotes={videoNotes}
                    onNotesLoaded={onNotesLoaded}
                />
            )}
        </div>
    </div>
  );
};

export default InteractivePanel; 