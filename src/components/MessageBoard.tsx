import 'websocket-polyfill'; // Keep polyfill for now, though likely not needed for NDK
import React, { useState, useEffect, useRef, useCallback } from 'react';
import NDK, { NDKEvent, NDKFilter, NDKKind, NDKSubscription, NDKUserProfile } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools'; // Import nip19 for decoding
// Import useAuth
import { useAuth } from '../hooks/useAuth';
import { useNdk } from 'nostr-hooks'; // Corrected import path and hook name
// Import ABOUT.md content
import aboutContent from '/ABOUT.md?raw';
// Import shared profile cache utilities
import { 
    ProfileData, 
    getProfileFromCache, 
    saveProfileToCache,
    getAllProfilesFromCache, // Keep if using initial bulk load
    deleteExpiredProfilesFromCache, // Keep if using cleanup
    parseProfileContent
} from '../utils/profileCache';

// Define the props for the component
interface MessageBoardProps {
  // ndk: NDK | null; // REMOVED - will use useNDK()
  threadEventId: string;
  onNewMessage?: () => void;
  // isReady: boolean; // REMOVED - will derive internally
  currentUser: NDKUserProfile | null | undefined; // ADDED - Need user for sending messages (updated type)
  onRequestFocusSettings?: () => void; // <<< ADDED: Callback to focus settings
}

const MessageBoard: React.FC<MessageBoardProps> = ({ threadEventId, onNewMessage, currentUser, onRequestFocusSettings }) => {
  // <<< Get NDK instance via hook >>>
  const { ndk } = useNdk(); // <-- Corrected hook name (lowercase d)
  // <<< Determine readiness locally >>>
  const isReady = !!ndk; // Simple check is often sufficient after initial app load

  const [messages, setMessages] = useState<NDKEvent[]>([]);
  const [targetEventId, setTargetEventId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ProfileData>>({}); // State for profiles (uses imported type)
  const subscription = useRef<NDKSubscription | null>(null);
  const processingPubkeys = useRef<Set<string>>(new Set()); // Track profiles being fetched
  const [isProfileCacheLoaded, setIsProfileCacheLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null); // <<< ADDED: Ref for container
  // Get auth state
  // const auth = useAuth(ndk ?? undefined); // REMOVED - useAuth should use useNDK() itself, and we get currentUser via props

  // Load profiles from shared cache on component mount
  useEffect(() => {
    getAllProfilesFromCache() // Use imported function
      .then(cachedProfiles => {
        console.log(`MessageBoard: Loaded ${cachedProfiles.length} profiles from shared cache.`);
        const cachedProfilesMap: Record<string, ProfileData> = {};
        cachedProfiles.forEach(profile => {
          // Ensure profile and pubkey exist before adding
          if (profile && profile.pubkey) { 
              cachedProfilesMap[profile.pubkey] = { ...profile, isLoading: false };
          }
        });
        setProfiles(cachedProfilesMap);
        setIsProfileCacheLoaded(true);
        // Optional: Trigger cleanup of expired profiles
        // deleteExpiredProfilesFromCache().catch(err => console.error('MessageBoard: Failed background cache cleanup:', err));
      })
      .catch(err => {
        console.error('MessageBoard: Failed to load profiles from shared cache:', err);
        setIsProfileCacheLoaded(true);
      });
  }, []); // Run once on mount

  // Effect to decode the threadEventId URI
  useEffect(() => {
    if (!threadEventId) {
      console.error('MessageBoard: threadEventId prop is missing.');
      setTargetEventId(null);
      return;
    }
    try {
      const cleanNevent = threadEventId.startsWith('nostr:') 
        ? threadEventId.substring(6) 
        : threadEventId;
        
      const decoded = nip19.decode(cleanNevent);
      if (decoded.type !== 'nevent' || !decoded.data.id) {
        console.error('MessageBoard: Failed to decode nevent or extract ID:', cleanNevent);
        setTargetEventId(null);
      } else {
        console.log('MessageBoard: Decoded nevent ID:', decoded.data.id);
        setTargetEventId(decoded.data.id);
      }
    } catch (error) {
      console.error('MessageBoard: Error decoding nevent:', threadEventId, error);
      setTargetEventId(null);
    }
  }, [threadEventId]);

  // Effect to subscribe when NDK is ready and targetEventId are available
  useEffect(() => {
    if (!isReady || !ndk || !targetEventId) { 
      console.log('MessageBoard: Waiting for NDK readiness and/or targetEventId.');
      setMessages([]); // Clear messages if not ready
      if (subscription.current) {
          subscription.current.stop();
          subscription.current = null;
      }
      return;
    }

    console.log(`MessageBoard: NDK ready, subscribing to replies for event ${targetEventId}...`);
    subscribeToReplies(ndk, targetEventId);

    // Cleanup function
    return () => {
      if (subscription.current) {
          console.log("MessageBoard: Cleaning up subscription.");
          subscription.current.stop();
          subscription.current = null;
      }
    };
  }, [isReady, ndk, targetEventId]);

  // --- Function to fetch profiles, wrapped in useCallback ---
  const fetchProfile = useCallback(async (pubkey: string) => {
    if (!ndk || profiles[pubkey]?.name || processingPubkeys.current.has(pubkey)) {
      return;
    }

    try {
      const cachedProfile = await getProfileFromCache(pubkey); // Use imported function
      if (cachedProfile && cachedProfile.name) { // Check cached profile validity
        console.log(`MessageBoard: Using cached profile for ${pubkey.substring(0, 8)}.`);
        setProfiles(prev => ({ 
          ...prev, 
          [pubkey]: { ...cachedProfile, isLoading: false } // Spread cached data
        }));
        return;
      }
    } catch (err) {
      console.error(`MessageBoard: Error checking shared cache for ${pubkey.substring(0, 8)}:`, err);
    }

    console.log(`MessageBoard: Fetching profile for ${pubkey.substring(0, 8)}...`);
    processingPubkeys.current.add(pubkey); 
    setProfiles(prev => ({ ...prev, [pubkey]: { ...prev[pubkey], pubkey: pubkey, isLoading: true } }));

    try {
      const user = ndk.getUser({ pubkey });
      const profileEvent = await user.fetchProfile();
      
      if (profileEvent && typeof profileEvent.content === 'string') {
        const parsedProfileData = parseProfileContent(profileEvent.content, pubkey); // Use shared parser
        
        if (parsedProfileData) {
            setProfiles(prev => ({ 
              ...prev, 
              [pubkey]: { ...parsedProfileData, isLoading: false }
            }));
            // Save to shared cache
            saveProfileToCache({ ...parsedProfileData, pubkey }).catch(err => 
                console.error(`MessageBoard: Failed to save profile to shared cache for ${pubkey.substring(0, 8)}:`, err)
            );
        } else {
             // Handle parsing error - already logged in parseProfileContent
             setProfiles(prev => ({ ...prev, [pubkey]: { ...prev[pubkey], pubkey: pubkey, isLoading: false } }));
        }

      } else {
        console.log(`MessageBoard: No profile or invalid content found for ${pubkey.substring(0,8)}.`);
        setProfiles(prev => ({ ...prev, [pubkey]: { ...prev[pubkey], pubkey: pubkey, isLoading: false } }));
      }
    } catch (error) {
      console.error(`MessageBoard: Error fetching profile for ${pubkey}:`, error);
      setProfiles(prev => ({ ...prev, [pubkey]: { ...prev[pubkey], pubkey: pubkey, isLoading: false } }));
    } finally {
        processingPubkeys.current.delete(pubkey);
    }
  }, [ndk]); // Removed profiles dependency

  // --- Effect to trigger profile fetches and subscriptions when messages update ---
  useEffect(() => {
    if (!ndk || !isProfileCacheLoaded) return; // Wait for cache load
    const authorsToFetch = new Set<string>();
    const authorsToSubscribe = new Set<string>();
    messages.forEach(msg => {
        if (!profiles[msg.pubkey]?.name && !processingPubkeys.current.has(msg.pubkey)) {
            authorsToFetch.add(msg.pubkey);
        }
        authorsToSubscribe.add(msg.pubkey);
    });
    authorsToFetch.forEach(pubkey => fetchProfile(pubkey));

    let authorsProfileSub: NDKSubscription | null = null;
    if (authorsToSubscribe.size > 0) {
      const authorsArray = Array.from(authorsToSubscribe);
      const profileFilter: NDKFilter = { kinds: [NDKKind.Metadata], authors: authorsArray, limit: authorsArray.length };
      console.log('MessageBoard: Subscribing to message authors profile updates.');
      authorsProfileSub = ndk.subscribe(profileFilter, { closeOnEose: false });
      
      authorsProfileSub?.on('event', (profileEvent: NDKEvent) => {
        const eventPubkey = profileEvent?.pubkey;
        if (!eventPubkey || typeof eventPubkey !== 'string') return;

        console.log(`MessageBoard: Received author profile update for ${eventPubkey.substring(0, 8)}.`);
        if (profileEvent.content && typeof profileEvent.content === 'string') {
            const parsedProfileData = parseProfileContent(profileEvent.content, eventPubkey);
            if (parsedProfileData) {
                 setProfiles(prev => {
                  const existingProfile = prev[eventPubkey];
                  // Prioritize incoming picture if it exists, otherwise keep existing picture
                  const pictureToSet = parsedProfileData.picture !== undefined ? parsedProfileData.picture : existingProfile?.picture;
                  // Merge name: Use new if available, else existing
                  const nameToSet = parsedProfileData.name !== undefined ? parsedProfileData.name : existingProfile?.name;
                  
                  // Create the updated profile object by merging
                  const updatedProfile = { 
                        ...existingProfile, // Start with existing 
                        ...parsedProfileData, // Overwrite with parsed fields
                        name: nameToSet, // Apply specific merge logic
                        picture: pictureToSet, // Apply specific merge logic
                        isLoading: false 
                    };

                  return { ...prev, [eventPubkey]: updatedProfile };
                });
                 // Save updated profile to cache
                saveProfileToCache({ ...parsedProfileData, pubkey: eventPubkey }).catch(err => 
                    console.error(`MessageBoard: Failed to save updated profile to shared cache for ${eventPubkey.substring(0, 8)}:`, err)
                 );
            }
        }
      });
      authorsProfileSub?.on('eose', () => { /* console.log('EOSE...') */ });
      authorsProfileSub?.start();
    }
    return () => {
      if (authorsProfileSub) {
          authorsProfileSub.stop();
      }
    };
  }, [messages, ndk, fetchProfile, isProfileCacheLoaded]); // Added isProfileCacheLoaded dependency

  const subscribeToReplies = (ndkInstance: NDK, eventId: string) => {
    if (subscription.current) {
      subscription.current.stop();
    }

    // Filter for kind 1 notes that tag the target event ID
    const filter: NDKFilter = {
      kinds: [NDKKind.Text],
      '#e': [eventId],
      limit: 100,
    };

    // --- Temporarily Reduce Logging --- 
    /*
    console.log('MessageBoard: PRE-SUBSCRIBE CHECK', { 
      hasNdk: !!ndkInstance, 
      eventId: eventId 
    });
    console.log('MessageBoard: Subscribing with ACTUAL filter object:', JSON.stringify(filter));
    */
    console.log('MessageBoard: Subscribing to replies for event:', eventId); // Keep a simpler log
    // ---------------------------------

    subscription.current = ndkInstance.subscribe(filter, {
      closeOnEose: false,
      subId: `msgboard-${eventId.substring(0, 5)}`
    });

    subscription.current.on('event', (event: NDKEvent) => {
      console.log(`%%% MessageBoard: Received event ${event.id} from WS for thread ${eventId}`);
      // Check if the event ID already exists in the current state
      setMessages((prevMessages) => {
        if (!prevMessages.some((msg) => msg.id === event.id)) {
          // Defer state update in parent to avoid warning
          if (onNewMessage) {
              setTimeout(onNewMessage, 0);
          }
          // Add the new event and re-sort
          const newMessages = [...prevMessages, event].sort((a, b) => a.created_at! - b.created_at!); // Sort oldest first
          return newMessages;
        }
        return prevMessages; // Return previous state if duplicate
      });
    });
  };

  // <<< ADDED: Keyboard handler for focus navigation >>>
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      // If ArrowLeft is pressed, attempt to move focus to the settings button
      if (onRequestFocusSettings) {
        console.log("MessageBoard: ArrowLeft detected, requesting settings focus.");
        onRequestFocusSettings();
        event.preventDefault(); // Prevent default browser navigation
        event.stopPropagation(); // Stop event from bubbling up
      }
    }
    // Add other navigation logic here if needed (e.g., ArrowRight to MediaPanel)
  };

  // Simplified status rendering
  const renderStatus = () => {
      if (!ndk) return 'Waiting for NDK...';
      if (!targetEventId) return 'Invalid or missing nevent to follow.';
      if (messages.length === 0) return 'Loading replies or none found...';
      return null;
  }

  // --- Conditional rendering based on login state ---
  if (!currentUser) {
    return (
      <div className="flex flex-col h-full overflow-y-auto p-4 bg-gray-800 text-gray-300 rounded-lg shadow-inner">
        <h2 className="text-xl font-semibold text-purple-400 mb-4">Welcome to Mad⚡tr.tv!</h2>
        <pre className="whitespace-pre-wrap text-sm font-mono">
          {aboutContent}
        </pre>
      </div>
    );
  }

  // --- Render the Message List if logged in ---
  return (
    <div 
      ref={containerRef} // Attach ref
      className="message-board-container flex flex-col h-full bg-gray-900/80 backdrop-blur-sm rounded-lg overflow-hidden p-2 focus:outline-none focus:ring-1 focus:ring-yellow-400" // Added focus styles
      tabIndex={0} // Make the container focusable
      onKeyDown={handleKeyDown} // Attach keydown listener
      aria-label="Message Board - Press Left Arrow to access Settings" // Accessibility hint
    >
      {/* Header/Title (Optional) */}
      {/* <h2 className="text-sm font-semibold text-purple-300 mb-1">Chat</h2> */}

      {/* Message List */}
      <div className="flex-grow overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
        {isReady && targetEventId ? (
          messages.length > 0 ? (
            messages.map((msg) => {
              const profile = profiles[msg.pubkey];
              const displayName = profile?.name || profile?.displayName || msg.pubkey.substring(0, 10) + '...';
              const profilePicture = profile?.picture;

              return (
                <div key={msg.id} className="flex items-start space-x-2 p-2 bg-gray-750 rounded-md shadow">
                  {/* Profile Picture */}
                  {profilePicture ? (
                    <img
                      src={profilePicture}
                      alt={`${displayName}'s avatar`}
                      className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-gray-600 object-cover flex-shrink-0"
                      onError={(e) => (e.currentTarget.style.display = 'none')} // Hide if image fails
                    />
                  ) : (
                    <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-purple-700 flex items-center justify-center text-white text-xs lg:text-sm font-bold flex-shrink-0">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {/* Message Content */}
                  <div className="flex-grow text-sm lg:text-base">
                    <span className="font-medium text-purple-600 text-sm lg:text-base mr-1.5" title={profile?.name ? msg.pubkey : undefined}>
                      {displayName}
                    </span>
                    <span className="text-gray-300">{msg.content}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex justify-center items-center h-full">
              <p className="text-gray-500 text-sm">No messages yet. Be the first!</p>
            </div>
          )
        ) : (
          <div className="flex justify-center items-center h-full">
            <p className="text-gray-500">Loading messages...</p>
          </div>
        )}
      </div>

      {/* Message Input Area (Simplified - Placeholder for future) */}
      {/* 
      <div className="mt-1 pt-1 border-t border-gray-700">
        <input
          type="text"
          placeholder={currentUser ? "Type your message..." : "Log in to chat"}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          disabled={!currentUser} // Disable if not logged in
          // Add onKeyDown handler for sending messages
        />
      </div>
      */}
    </div>
  );
};

export default MessageBoard; 