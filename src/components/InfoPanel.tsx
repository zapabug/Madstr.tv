import React, { useMemo } from 'react';
import { NostrNote } from '../types/nostr';

export interface InfoPanelProps {
  note: NostrNote | null;
  viewMode: 'imagePodcast' | 'videoPlayer';
  isLoggedIn: boolean;
  profileName: string;
}

const InfoPanel: React.FC<InfoPanelProps> = ({
  note,
  isLoggedIn,
  profileName,
}) => {
  // Strip URLs/links from content
  const stripLinks = (text: string): string => {
    return text
      .replace(/https?:\/\/[^\s]+/g, '')
      .replace(/www\.[^\s]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Get display name - profile name, or last 5 chars of npub, or npub1 fallback
  const displayName = useMemo(() => {
    if (profileName) {
      // If it looks like an npub, get last 5 chars
      if (profileName.startsWith('npub1')) {
        return profileName.slice(-5);
      }
      // Otherwise just return as-is (truncated profile name)
      return profileName.slice(0, 10);
    }
    return '???'; // Fallback
  }, [profileName]);

  // Get content preview (2-3 sentences worth, ~250 chars)
  const displayText = useMemo(() => {
    if (!note?.content) return '';
    const stripped = stripLinks(note.content);
    const maxLength = 250;
    
    if (stripped.length <= maxLength) {
      return stripped;
    }
    
    // Truncate at word boundary near maxLength
    const truncated = stripped.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return truncated.slice(0, lastSpace) + '...';
  }, [note?.content]);

  // Show logged out message
  if (!isLoggedIn) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm rounded-lg overflow-hidden p-4">
        <div className="text-center space-y-3">
          <h3 className="text-lg font-bold text-purple-400">Madstr TV</h3>
          <div className="flex items-center justify-center space-x-2 text-gray-300">
            <span>press</span>
            <span className="px-2 py-0.5 bg-gray-700 rounded text-white font-mono">#</span>
            <span>to access settings</span>
          </div>
          <div className="text-gray-500 text-sm">
            <span>← </span>
            <span>bottom left</span>
          </div>
        </div>
      </div>
    );
  }

  // Show note info (2-3 lines, fill available space)
  return (
    <div className="h-full w-full flex flex-col justify-end bg-gray-900/80 backdrop-blur-sm rounded-lg overflow-hidden p-3">
      <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap break-words">
        <span className="text-purple-400 font-medium">{displayName}</span>
        {displayText && <span> {displayText}</span>}
      </p>
    </div>
  );
};

export default InfoPanel;
