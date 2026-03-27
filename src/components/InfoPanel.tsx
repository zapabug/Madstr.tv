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

  // Get display name (profile name or 5 chars of npub)
  const displayName = useMemo(() => {
    if (profileName && profileName.length > 5) {
      return profileName.slice(0, 5);
    }
    return profileName || '';
  }, [profileName]);

  // Get content preview (on one line with author)
  const displayText = useMemo(() => {
    if (!note?.content) return '';
    const stripped = stripLinks(note.content);
    const maxLength = 80;
    return stripped.slice(0, maxLength) + (stripped.length > maxLength ? '...' : '');
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

  // Show note info on ONE line
  return (
    <div className="h-full w-full flex flex-col justify-end bg-gray-900/80 backdrop-blur-sm rounded-lg overflow-hidden p-3">
      <p className="text-gray-200 text-sm truncate">
        <span className="text-purple-400">by {displayName || '???'}</span>
        {displayText && <span> {displayText}</span>}
      </p>
    </div>
  );
};

export default InfoPanel;
