import React, { useState, useEffect, useRef } from 'react';
import { useNdk, useProfile } from 'nostr-hooks';
import { NDKEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk';
import { MAIN_POST_CONTENT, MAIN_THREAD_EVENT_ID_HEX } from '../constants';

const MAX_MESSAGES_DISPLAY = 6;

// Inner component to render a single message and fetch profile
const MessageItem: React.FC<{ event: NDKEvent }> = ({ event }) => {
  const pubkey = event.pubkey;
  // Fetch profile metadata using useProfile - expect object { profile, status }
  const { profile } = useProfile({ pubkey }); // Pass { pubkey }, destructure result

  // Default avatar image
  const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDIiIGhlaWdodD0iNDIiIHZpZXdCb3g9IjAgMCA0MiA0MiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjEiIGN5PSIyMSIgcj0iMjEiIGZpbGw9IiNDNEM0QzQiLz4KPHBhdGggZD0iTTIxIDIxQzIzLjQ4NTMgMjEgMjUuNSAxOS44MjgzIDI1LjUgMTcuNUMyNS41IDE1LjE3MTYgMjMuNDg1MyAxNCAyMSAxNEMxOC41MTQ3IDE0IDE2LjUgMTUuMTcxNiAxNi41IDE3LjUgMTYuNSAxOS44MjgzIDE4LjUxNDcgMjEgMjEgMjFaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMjkuMzI1MiAzMS4yNzNDMjcuODE4MiAyOS43NDE1IDI1LjUxNzEgMjkgMjMgMjguOTk5OUMyMyAyOC45OTk5IDIxLjYwODEgMjkuNDU4NyAyMSAyOS40NTg3QzIwLjM5MTkgMjkuNDU4NyAxOSAyOC45OTk5IDE5IDI4Ljk5OTlDMTYuNDgyOSAyOSAxNC4xODIxIDI5Ljc0MTUgMTIuNjczMyAzMS4yNzMxQzExLjE2NDUgMzIuODAxMyAxMC41IDM1LjAwNDggMTAuNSAzNy4xMjVDMTAuNSA0MC4yMjMzIDE1LjczMTUgNDIgMjEgNDJDMjYuMjY4NSA0MiAzMS41IDQwLjIyMzMgMzEuNSAzNy4xMjVDMzEuNSAzNS4wMDQ4IDMwLjgyODYgMzIuODAxMyAyOS4zMjUyIDMxLjI3M1oiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo=';

  // Use profile directly (it can be null/undefined initially)
  const displayName = profile?.displayName || profile?.name || pubkey.substring(0, 12) + '...';
  const profileImage = profile?.image || defaultAvatar;

  return (
    <li className="flex items-center bg-gray-700 p-1.5 md:p-2 rounded space-x-2">
      <img 
        src={profileImage} 
        alt={`${displayName}'s avatar`} 
        className="w-8 h-8 md:w-10 md:h-10 rounded-full flex-shrink-0 object-cover bg-gray-500"
        onError={(e) => { (e.target as HTMLImageElement).src = defaultAvatar; }} // Fallback if image fails
      />
      <div className="flex-grow min-w-0">
        <p className="text-xs md:text-sm font-semibold text-gray-300 truncate">{displayName}</p>
        <p className="text-sm md:text-base text-white break-words">{event.content}</p>
      </div>
    </li>
  );
};


// Main MessageBoard component
const MessageBoard: React.FC = () => {
  const { ndk } = useNdk(); // Get NDK instance
  const [events, setEvents] = useState<NDKEvent[]>([]); // Local state for events
  const processedEventIds = useRef(new Set<string>()); // Track processed event IDs

  useEffect(() => {
    if (!ndk) return; // Wait for NDK

    console.log("MessageBoard: NDK available, creating subscription...");

    const filter: NDKFilter = {
      kinds: [1],
      '#e': [MAIN_THREAD_EVENT_ID_HEX],
      limit: 50, // Fetch a bit more than needed initially
    };

    const subscription: NDKSubscription | null = ndk.subscribe([filter], { closeOnEose: false });

    subscription.on('event', (event: NDKEvent) => {
      // Deduplicate based on ID
      if (!processedEventIds.current.has(event.id)) {
          processedEventIds.current.add(event.id);
          console.log(`MessageBoard: Received event ${event.id.substring(0, 8)}`);
          setEvents(prevEvents => {
              const newEvents = [...prevEvents, event];
              // Sort inside the state update
              newEvents.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
              return newEvents;
          });
      }
    });

    subscription.on('eose', () => {
        console.log("MessageBoard: Subscription EOSE received.");
    });

    subscription.start();
    console.log("MessageBoard: Subscription started.");

    // Cleanup function to stop the subscription
    return () => {
      console.log("MessageBoard: Cleaning up subscription.");
      subscription.stop();
      processedEventIds.current.clear(); // Clear tracked IDs on cleanup
    };

  }, [ndk]); // Re-run effect if NDK instance changes


  // Get the latest messages to display from local state
  const latestEvents = events.slice(0, MAX_MESSAGES_DISPLAY);

  console.log(`MessageBoard has ${events.length} total events, displaying ${latestEvents.length}`);

  return (
    <div className="w-full h-[40%] bg-gray-800 p-2 md:p-4 flex flex-col overflow-hidden border-8 border-purple-600 rounded-lg">
      <h2 className="text-lg md:text-xl font-bold mb-2 text-white flex-shrink-0">{MAIN_POST_CONTENT}</h2>
      {latestEvents.length === 0 ? (
        <p className="text-gray-400 flex-grow flex items-center justify-center text-center px-4 pt-4">
          Waiting for replies...
        </p>
      ) : (
        <ul className="space-y-1 md:space-y-2 overflow-y-auto flex-grow">
          {latestEvents.map((event: NDKEvent) => (
            <MessageItem key={event.id} event={event} />
          ))}
        </ul>
      )}
    </div>
  );
};

export default MessageBoard; 