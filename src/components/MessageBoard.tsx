// Removed websocket-polyfill import
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { NDKEvent, NDKKind, NDKFilter } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools'; // Import nip19 for decoding
import { useNDK } from '@nostr-dev-kit/ndk-hooks'; // Import useNDK
import { useSubscribe, useProfile } from '@nostr-dev-kit/ndk-hooks'; // Import useSubscribe and useProfile

// Define the props for the component
interface MessageBoardProps {
  neventToFollow: string;
  onNewMessage?: () => void;
}

// --- Individual Message Component ---
interface MessageItemProps {
  message: NDKEvent;
}

const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  // Use useProfile hook to get author's profile
  const profile = useProfile(message.pubkey); // Pass pubkey string directly

  // Format timestamp (example)
  const timestamp = message.created_at
    ? new Date(message.created_at * 1000).toLocaleString()
    : 'Processing...'; // Should ideally not show 'Processing'

  const displayName = profile?.name || profile?.displayName || message.pubkey.substring(0, 8) + '...';
  const displayPicture = profile?.image || profile?.picture || 'https://via.placeholder.com/40'; // Default placeholder

  return (
    <div className="p-3 mb-2 bg-gray-800 rounded-lg shadow flex space-x-3">
      <img src={displayPicture} alt={`${displayName}'s avatar`} className="w-10 h-10 rounded-full" />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-purple-400 truncate">
            {displayName}
          </span>
          <span className="text-xs text-gray-500 ml-2">{timestamp}</span>
        </div>
        <p className="text-gray-300 mt-1 whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </div>
  );
};

const MessageBoard: React.FC<MessageBoardProps> = ({ neventToFollow, onNewMessage }) => {
  // Get NDK instance via hook
  const { ndk } = useNDK(); 
  const [targetEventId, setTargetEventId] = useState<string | null>(null);
  const previousMessageCount = useRef(0);

  // Effect to decode the nevent URI
  useEffect(() => {
    if (!neventToFollow) {
      console.error('MessageBoard: neventToFollow prop is missing.');
      setTargetEventId(null);
      return;
    }
    try {
      // Remove "nostr:" prefix if present before decoding
      const cleanNevent = neventToFollow.startsWith('nostr:') 
        ? neventToFollow.substring(6) 
        : neventToFollow;
        
      const decoded = nip19.decode(cleanNevent); // Decode the cleaned string
      if (decoded.type !== 'nevent' || !decoded.data.id) {
        console.error('MessageBoard: Failed to decode nevent or extract ID:', cleanNevent);
        setTargetEventId(null);
      } else {
        const eventId = decoded.data.id;
        console.log('MessageBoard: Decoded nevent ID:', eventId); // Log the ID itself
        setTargetEventId(eventId);
        console.log('MessageBoard: targetEventId state successfully set to:', eventId); // Log after setting state
      }
    } catch (error) {
      console.error('MessageBoard: Error decoding nevent:', neventToFollow, error);
      setTargetEventId(null);
    }
  }, [neventToFollow]);

  // Calculate the filter directly based on the current targetEventId state
  let subscriptionFilter: NDKFilter[] = [];
  if (targetEventId) {
      console.log('MessageBoard: Calculating filter for event:', targetEventId);
      subscriptionFilter = [{
          kinds: [NDKKind.Text],
          '#e': [targetEventId],
          limit: 100, // Keep original limit for now
      }];
  } else {
      console.log('MessageBoard: targetEventId is null, using empty filter array.');
  }

  console.log('[MessageBoard] Filter being passed to useSubscribe:', subscriptionFilter); // Log the filter being used

  const { events: messages } = useSubscribe(subscriptionFilter, {
    closeOnEose: false,
    groupable: false, // Keep replies separate
  });

  console.log('[MessageBoard] Passed filter to useSubscribe:', JSON.stringify(subscriptionFilter));

  // Effect to call onNewMessage when new messages arrive
  useEffect(() => {
    if (messages.length > previousMessageCount.current) {
      console.log('MessageBoard: New messages detected, calling onNewMessage.');
      onNewMessage?.();
    }
    previousMessageCount.current = messages.length;
  }, [messages, onNewMessage]);

  console.log('[MessageBoard] Received messages count:', messages.length); // Log the count of received messages

  const renderStatus = () => {
    if (!ndk) {
      return <p className="text-center text-gray-500">Connecting to Nostr...</p>;
    }
    if (!targetEventId) {
        return <p className="text-center text-gray-500">Waiting for target event...</p>;
    }
    if (messages.length === 0) {
      return <p className="text-center text-gray-500">No replies found yet.</p>;
    }
    return null;
  };

  return (
    <div className="w-full h-full bg-gray-900 text-white overflow-y-auto p-4 flex flex-col">
      <h2 className="text-xl font-bold mb-4 text-purple-300">Live Chat</h2>
      <div className="flex-1 overflow-y-auto mb-4 pr-2">
        {renderStatus()} 
        {/* Render messages using MessageItem which handles profile fetching */} 
        {messages.map((msg) => (
          <MessageItem key={msg.id} message={msg} />
        ))}
      </div>
      {/* Optional: Input area for sending messages (not implemented here) */}
      {/* <MessageInput targetEventId={targetEventId} /> */}
    </div>
  );
};

export default MessageBoard; 