import React, { useMemo } from 'react';
import { useProfileData } from '../hooks/useProfileData';
import { NostrNote } from '../types/nostr';
import * as nip19 from 'nostr-tools/nip19';

export interface AuthorSelectorProps {
  videoNotes: NostrNote[];
  selectedAuthor: string | null; // hex pubkey of selected author
  onSelectAuthor: (authorPubkey: string | null) => void;
  currentVideoAuthor: string | null; // hex pubkey of currently playing video
  isInactive: boolean;
}

const AuthorSelector: React.FC<AuthorSelectorProps> = ({
  videoNotes,
  selectedAuthor,
  onSelectAuthor,
  currentVideoAuthor,
  isInactive,
}) => {
  // Get unique authors from video notes
  const uniqueAuthors = useMemo(() => {
    const authorMap = new Map<string, NostrNote[]>();
    videoNotes.forEach((note) => {
      const pubkey = note.posterPubkey;
      if (pubkey && !authorMap.has(pubkey)) {
        authorMap.set(pubkey, []);
      }
      if (pubkey) {
        authorMap.get(pubkey)!.push(note);
      }
    });
    return Array.from(authorMap.entries()).map(([pubkey, notes]) => ({
      pubkey,
      npub: nip19.npubEncode(pubkey),
      noteCount: notes.length,
    }));
  }, [videoNotes]);

  // Get profiles for authors
  const { profiles } = useProfileData(videoNotes);

  // Sort authors: current video author first, then selected author, then others
  const sortedAuthors = useMemo(() => {
    return [...uniqueAuthors].sort((a, b) => {
      if (a.pubkey === currentVideoAuthor) return -1;
      if (b.pubkey === currentVideoAuthor) return 1;
      return 0;
    });
  }, [uniqueAuthors, currentVideoAuthor]);

  const handleClear = () => {
    onSelectAuthor(null);
  };

  const handleAuthorClick = (pubkey: string) => {
    if (selectedAuthor === pubkey) {
      onSelectAuthor(null);
    } else {
      onSelectAuthor(pubkey);
    }
  };

  return (
    <div
      className={`
        h-full w-full flex flex-col bg-gray-900/80 backdrop-blur-sm rounded-lg overflow-hidden
        transition-opacity duration-500
        ${isInactive ? 'opacity-0' : 'opacity-100'}
      `}
    >
      {/* Header with Clear button */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-700">
        <span className="text-xs text-gray-400 font-semibold">Authors</span>
        <button
          onClick={handleClear}
          className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          Clear
        </button>
      </div>

      {/* Author Grid */}
      <div className="flex-grow overflow-y-auto p-2">
        {sortedAuthors.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-sm">No videos found</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1">
            {sortedAuthors.map((author) => {
              const profile = profiles[author.pubkey];
              const isCurrentAuthor = author.pubkey === currentVideoAuthor;
              const isSelected = author.pubkey === selectedAuthor;
              const displayName = profile?.name || profile?.displayName || author.pubkey.substring(0, 8);
              const pictureUrl = profile?.picture;

              return (
                <button
                  key={author.pubkey}
                  onClick={() => handleAuthorClick(author.pubkey)}
                  className={`
                    flex flex-col items-center p-1 rounded-lg transition-all
                    focus:outline-none focus:ring-2 focus:ring-purple-500
                    ${isCurrentAuthor 
                      ? 'bg-purple-700/50 ring-2 ring-purple-500' 
                      : isSelected 
                        ? 'bg-gray-700' 
                        : 'bg-gray-800 hover:bg-gray-700'
                    }
                  `}
                  title={`${displayName} - ${author.noteCount} videos`}
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-600 flex items-center justify-center">
                    {pictureUrl ? (
                      <img
                        src={pictureUrl}
                        alt={displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-bold text-gray-300">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] text-gray-300 mt-0.5 truncate w-full text-center">
                    {displayName.substring(0, 6)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthorSelector;
