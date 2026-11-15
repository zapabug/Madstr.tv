import React, { useRef, useState } from 'react';
import { UseOwnAudioReturn, SourceStatus } from '../hooks/useOwnAudio';

interface OwnAudioSettingsProps {
  ownAudio: UseOwnAudioReturn;
}

const buttonBase =
  'px-3 py-1 rounded text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-1 focus:ring-offset-gray-800';

function statusText(status: SourceStatus, count: number, error?: string): string {
  if (status === 'loading') return 'Loading…';
  if (status === 'needs-permission') return 'Needs permission';
  if (status === 'error') return error || 'Error';
  return `${count} ${count === 1 ? 'track' : 'tracks'}`;
}

export const OwnAudioSettings: React.FC<OwnAudioSettingsProps> = ({ ownAudio }) => {
  const [feedInput, setFeedInput] = useState('');
  const [adding, setAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddFeed = async () => {
    if (!feedInput.trim() || adding) return;
    setAdding(true);
    await ownAudio.addFeed(feedInput);
    setAdding(false);
    setFeedInput('');
  };

  return (
    <div className="mb-6 p-4 bg-gray-700/30 rounded-lg border border-gray-600">
      <h3 className="text-lg font-semibold mb-3 text-green-300 border-b border-gray-600 pb-1">My Audio</h3>

      {/* --- Local music --- */}
      <p className="text-sm text-gray-400 mb-2">Local music</p>
      <ul className="space-y-1 mb-2">
        {ownAudio.folders.map(folder => (
          <li key={folder.id} className="flex items-center justify-between gap-2 text-sm bg-gray-800/60 rounded px-2 py-1">
            <span className="truncate" title={folder.name}>{folder.name}</span>
            <span className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-xs ${folder.status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                {statusText(folder.status, folder.count, folder.error)}
              </span>
              {folder.status === 'needs-permission' && (
                <button onClick={() => { void ownAudio.reconnectFolder(folder.id); }} className={`${buttonBase} bg-yellow-600 hover:bg-yellow-500 text-white`}>
                  Reconnect
                </button>
              )}
              <button onClick={() => ownAudio.removeFolder(folder.id)} className={`${buttonBase} bg-gray-600 hover:bg-red-600 text-white`} aria-label={`Remove ${folder.name}`}>
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
      {ownAudio.canPickFolder ? (
        <button onClick={() => { void ownAudio.addFolder(); }} className={`${buttonBase} bg-green-600 hover:bg-green-500 text-white`}>
          Add music folder
        </button>
      ) : (
        <>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="audio/*,.mp3,.m4a,.ogg,.opus,.aac,.wav,.flac"
            className="hidden"
            onChange={e => {
              ownAudio.addFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          <button onClick={() => fileInputRef.current?.click()} className={`${buttonBase} bg-green-600 hover:bg-green-500 text-white`}>
            Add audio files
          </button>
          <p className="text-xs text-gray-500 mt-1">This browser cannot remember folders, so picked files last until you reload.</p>
        </>
      )}

      {/* --- RSS feeds --- */}
      <p className="text-sm text-gray-400 mt-4 mb-2">RSS feeds (podcasts, music)</p>
      <ul className="space-y-1 mb-2">
        {ownAudio.feeds.map(feed => (
          <li key={feed.url} className="flex items-center justify-between gap-2 text-sm bg-gray-800/60 rounded px-2 py-1">
            <span className="truncate" title={feed.url}>{feed.name}</span>
            <span className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-xs ${feed.status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                {statusText(feed.status, feed.count, feed.error).replace('track', 'episode')}
              </span>
              <button onClick={() => { void ownAudio.refreshFeed(feed.url); }} className={`${buttonBase} bg-gray-600 hover:bg-gray-500 text-white`}>
                Refresh
              </button>
              <button onClick={() => ownAudio.removeFeed(feed.url)} className={`${buttonBase} bg-gray-600 hover:bg-red-600 text-white`} aria-label={`Remove ${feed.name}`}>
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          type="url"
          value={feedInput}
          onChange={e => setFeedInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { void handleAddFeed(); } }}
          placeholder="https://example.com/feed.xml"
          className="flex-grow px-2 py-1 rounded bg-gray-800 border border-gray-600 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
        <button onClick={() => { void handleAddFeed(); }} disabled={adding} className={`${buttonBase} bg-green-600 hover:bg-green-500 text-white disabled:opacity-50`}>
          {adding ? 'Adding…' : 'Add feed'}
        </button>
      </div>
    </div>
  );
};

export default OwnAudioSettings;
