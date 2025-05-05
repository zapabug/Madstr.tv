// Removed websocket-polyfill import
import React, { useState, useEffect, useRef, useMemo } from 'react';
// import { NDKEvent, NDKKind, NDKFilter } from '@nostr-dev-kit/ndk'; // REMOVE NDK types
import { nip19 } from 'nostr-tools'; // Import nip19 for decoding
// import { useNDK } from '@nostr-dev-kit/ndk-hooks'; // REMOVE useNDK
// import { useSubscribe, useProfile } from '@nostr-dev-kit/ndk-hooks'; // REMOVE useSubscribe and useProfile
import { NostrEvent, Filter } from 'applesauce-core'; // ADD Applesauce types
import { useQuery } from 'applesauce-react'; // ADD Applesauce useQuery
import { RELAYS } from '../constants'; // ADD RELAYS import

// Define the props for the component
interface MessageBoardProps {
  neventToFollow: string;
  onNewMessage?: () => void;
}

// --- Individual Message Component ---
interface MessageItemProps {
  message: NostrEvent; // Use NostrEvent type
}

const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  // Use useProfile hook to get author's profile
  // const profile = useProfile(message.pubkey); // REMOVE NDK useProfile for now

  // --- Fetch Profile using Applesauce useQuery --- 
  const profileFilter: Filter = useMemo(() => ({
    kinds: [0],
    authors: [message.pubkey],
    limit: 1,
  }), [message.pubkey]);

  const { events: profileEvents, isLoading: isLoadingProfile } = useQuery({
      filters: [profileFilter],
      relays: RELAYS, // Use same relays for profile for now
      enabled: !!message.pubkey, // Only run if pubkey exists
  });

  // Get the latest profile event if multiple are returned (shouldn't happen with limit: 1, but good practice)
  const profileData = useMemo(() => {
    if (!profileEvents || profileEvents.length === 0) return null;
    return profileEvents.sort((a: NostrEvent, b: NostrEvent) => b.created_at - a.created_at)[0];
  }, [profileEvents]);

  // TODO: Refactor profile fetching using Applesauce
  // const [profileData, setProfileData] = useState<NostrEvent | null>(null); // REMOVE Placeholder state
  // const [isLoadingProfile, setIsLoadingProfile] = useState(false); // REMOVE Placeholder state

  // Placeholder profile fetching - replace with Applesauce hook later
  // useEffect(() => { // REMOVE Placeholder effect
  //   // Simulate fetching - replace with actual useQuery/useProfile
  //   setIsLoadingProfile(true);
  //   // console.log(\"[MessageItem] Fetching profile for:\", message.pubkey);
  //   // This would be a useQuery({ filters: [{ kinds: [0], authors: [message.pubkey], limit: 1 }] })
  //   setTimeout(() => {
  //     // Simulate finding a profile
  //     // setProfileData({ kind: 0, pubkey: message.pubkey, content: JSON.stringify({ name: \'Mock Name\', picture: \'https://via.placeholder.com/40\' }), created_at: Date.now()/1000, tags: [], id: \'mockid\', sig: \'mocksig\' });
  //     setIsLoadingProfile(false);
  //   }, 50); // Short delay to simulate async
  // }, [message.pubkey]);

  const profileContent = useMemo(() => {
      if (!profileData?.content) return {};
      try {
          return JSON.parse(profileData.content);
      } catch (e) {
          console.error("Failed to parse profile content:", e);
          return {};
      }
  }, [profileData]);

  // Format timestamp (example)
  const timestamp = message.created_at
    ? new Date(message.created_at * 1000).toLocaleString()
    : 'Processing...'; // Should ideally not show 'Processing'

  // Derive display info from profile data or fallback
  const displayName = profileContent?.name || profileContent?.displayName || message.pubkey.substring(0, 8) + '...';
  const displayPicture = profileContent?.image || profileContent?.picture || 'https://via.placeholder.com/40'; // Default placeholder

  return (
    <div className="p-3 mb-2 bg-gray-800 rounded-lg shadow flex space-x-3">
      {isLoadingProfile ? (
        <div className="w-10 h-10 rounded-full bg-gray-700 animate-pulse"></div>
      ) : (
        <img src={displayPicture} alt={`${displayName}'s avatar`} className="w-10 h-10 rounded-full" />
      )}
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
  // const { ndk } = useNDK(); // REMOVE
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
  const subscriptionFilter: Filter | null = useMemo(() => {
    if (targetEventId) {
        console.log('MessageBoard: Calculating filter for event:', targetEventId);
        return {
            kinds: [1], // Use numeric kind
            '#e': [targetEventId],
            limit: 100, // Keep original limit for now
        };
    } else {
        console.log('MessageBoard: targetEventId is null, cannot create filter.');
        return null;
    }
  }, [targetEventId]);

  console.log('[MessageBoard] Filter being passed to useQuery:', subscriptionFilter); // Log the filter being used

  // Use Applesauce useQuery
  const { events: messages, isLoading: isLoadingMessages } = useQuery({
      filters: subscriptionFilter ? [subscriptionFilter] : [], // Pass filter array, or empty if no ID
      relays: RELAYS,
      enabled: !!subscriptionFilter, // Only enable if filter is valid
      // closeOnEose: false, // Applesauce handles this differently, defaults usually fine
  });

  // console.log('[MessageBoard] Passed filter to useSubscribe:', JSON.stringify(subscriptionFilter)); // REMOVE old log

  // Effect to call onNewMessage when new messages arrive
  useEffect(() => {
    if (messages.length > previousMessageCount.current) {
      console.log('MessageBoard: New messages detected, calling onNewMessage.');
      onNewMessage?.();
    }
    previousMessageCount.current = messages.length;
  }, [messages, onNewMessage]);

  console.log('[MessageBoard] Received messages count:', messages?.length ?? 0); // Log the count of received messages

  const renderStatus = () => {
    // if (!ndk) { // REMOVE NDK check
    //   return <p className="text-center text-gray-500">Connecting to Nostr...</p>;
    // }
    if (!targetEventId) {
        return <p className="text-center text-gray-500">Waiting for target event...</p>;
    }
    if (isLoadingMessages) {
        return <p className="text-center text-gray-500 animate-pulse">Loading messages...</p>;
    }
    if (!messages || messages.length === 0) {
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
        {/* Add null check for messages */}
        {messages && messages.map((msg: NostrEvent) => (
          <MessageItem key={msg.id} message={msg} />
        ))}
      </div>
      {/* Optional: Input area for sending messages (not implemented here) */}
      {/* <MessageInput targetEventId={targetEventId} /> */}
    </div>
  );
};

export default MessageBoard; 