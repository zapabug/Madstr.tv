import React from 'react';
import { useAuth } from '../hooks/useAuth';

interface MessageBoardProps {
  authorName?: string;
  timestamp?: string;
  hashtags?: string[];
}

const MessageBoard: React.FC<MessageBoardProps> = ({ 
  authorName, 
  timestamp, 
  hashtags 
}) => {
  const auth = useAuth();

  if (!auth.isLoggedIn) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <p className="text-gray-400 text-sm text-center">
          Open Settings to connect
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col justify-center p-4 overflow-hidden">
      <p className="text-gray-200 text-sm truncate font-medium">
        {authorName || 'Unknown'}
      </p>
      {timestamp && (
        <p className="text-gray-500 text-xs mt-0.5">
          {timestamp}
        </p>
      )}
      {hashtags && hashtags.length > 0 && (
        <p className="text-purple-400 text-xs mt-1 truncate">
          {hashtags.slice(0, 5).map(tag => `#${tag}`).join(' ')}
        </p>
      )}
    </div>
  );
};

export default MessageBoard;
