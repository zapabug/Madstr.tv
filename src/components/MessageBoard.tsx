import 'websocket-polyfill'; // Keep polyfill for now, though likely not needed for NDK
import React, { useState, useEffect, useRef, useCallback } from 'react';
import NDK, { NDKEvent, NDKFilter, NDKKind, NDKSubscription, NDKUserProfile } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools'; // Import nip19 for decoding

// Interface for storing profile data
interface ProfileData {
  name?: string;
  picture?: string;
  isLoading?: boolean; // Track loading state per profile
}

// Define the props for the component
interface MessageBoardProps {
  ndk: NDK | null;
  neventToFollow: string;
  authors: string[]; // Add authors prop
}

const MessageBoard: React.FC<MessageBoardProps> = ({ ndk, neventToFollow, authors }) => {
  const [messages, setMessages] = useState<NDKEvent[]>([]);
  const [targetEventId, setTargetEventId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ProfileData>>({}); // State for profiles
  const subscription = useRef<NDKSubscription | null>(null);
  const processingPubkeys = useRef<Set<string>>(new Set()); // Track profiles being fetched

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
        console.log('MessageBoard: Decoded nevent ID:', decoded.data.id);
        setTargetEventId(decoded.data.id);
      }
    } catch (error) {
      console.error('MessageBoard: Error decoding nevent:', neventToFollow, error);
      setTargetEventId(null);
    }
  }, [neventToFollow]);

  // Effect to subscribe when NDK and targetEventId are available
  useEffect(() => {
    // Only proceed if we have NDK and a valid target event ID
    if (!ndk || !targetEventId) {
      console.log('MessageBoard: Waiting for NDK and/or targetEventId.');
      setMessages([]); // Clear messages
      setProfiles({}); // Clear profiles too
      // Ensure any previous subscription is stopped if targetEventId becomes invalid
      if (subscription.current) {
          subscription.current.stop();
          subscription.current = null;
      }
      return;
    }

    // Assuming the passed NDK instance handles its connection lifecycle.
    console.log(`MessageBoard: NDK ready, subscribing to replies for event ${targetEventId} from ${authors.length} authors...`);
    subscribeToReplies(ndk, targetEventId, authors);

    // Cleanup function
    return () => {
      console.log('MessageBoard: Cleaning up replies subscription...');
      if (subscription.current) {
        subscription.current.stop();
        subscription.current = null;
      }
      setMessages([]);
      setProfiles({}); // Clear profiles on cleanup
      processingPubkeys.current.clear(); // Clear processing set
    };
    // Re-run the effect if ndk, targetEventId, or authors changes
  }, [ndk, targetEventId, authors]);

  // --- Function to fetch profiles, wrapped in useCallback ---
  const fetchProfile = useCallback(async (pubkey: string) => {
    if (!ndk || profiles[pubkey] || processingPubkeys.current.has(pubkey)) {
      // Don't fetch if no NDK, profile already exists, or already fetching
      return;
    }

    console.log(`MessageBoard: Fetching profile for ${pubkey.substring(0, 8)}...`);
    processingPubkeys.current.add(pubkey); // Mark as fetching
    setProfiles(prev => ({ ...prev, [pubkey]: { isLoading: true } })); // Set loading state

    try {
      const user = ndk.getUser({ pubkey });
      const profileEvent = await user.fetchProfile(); // Fetches Kind 0
      console.log(`MessageBoard: Raw profile event for ${pubkey.substring(0, 8)}:`, profileEvent);

      // Check if profileEvent exists and content is a string
      if (profileEvent && typeof profileEvent.content === 'string') {
        try { // Add try-catch for JSON.parse
            const profileData: Partial<NDKUserProfile> = JSON.parse(profileEvent.content);
            console.log(`MessageBoard: Parsed profile data for ${pubkey.substring(0, 8)}:`, profileData);

            // Explicitly resolve name to string | undefined
            const nameValue = profileData.name ?? profileData.display_name ?? profileData.displayName;
            const resolvedName: string | undefined = typeof nameValue === 'string' ? nameValue : 
                                                    (nameValue != null) ? String(nameValue) : undefined; // Simplified null check

            // Explicitly resolve picture to string | undefined
            const pictureValue = profileData.picture ?? profileData.image ?? profileData.avatar;
            const resolvedPicture: string | undefined = typeof pictureValue === 'string' ? pictureValue : 
                                                        (pictureValue != null) ? String(pictureValue) : undefined; // Simplified null check
            console.log(`MessageBoard: Resolved picture URL for ${pubkey.substring(0, 8)}:`, resolvedPicture);

            setProfiles(prev => ({ 
              ...prev, 
              [pubkey]: { 
                name: resolvedName, 
                picture: resolvedPicture, 
                isLoading: false
              }
            }));
        } catch (parseError) {
            console.error(`MessageBoard: Error parsing profile content for ${pubkey}:`, parseError, profileEvent.content);
            // Mark as not loading even if parsing failed
            setProfiles(prev => ({ ...prev, [pubkey]: { isLoading: false } })); 
        }
      } else {
        console.log(`MessageBoard: No profile or invalid content found for ${pubkey.substring(0,8)}. Reason: ${profileEvent ? 'Content is not a string' : 'Profile event is null'}. Full event:`, profileEvent);
        setProfiles(prev => ({ ...prev, [pubkey]: { isLoading: false } })); // Mark as not loading, no data found
      }
    } catch (error) {
      console.error(`MessageBoard: Error fetching profile for ${pubkey}:`, error);
      setProfiles(prev => ({ ...prev, [pubkey]: { isLoading: false } })); // Mark as not loading on error
    } finally {
        processingPubkeys.current.delete(pubkey); // Remove from processing set
    }
  }, [ndk, profiles]); // Dependency array includes ndk and profiles

  // Effect to fetch app's own profile (TV_PUBKEY_NPUB) and subscribe to updates
  useEffect(() => {
    if (!ndk) return;
    // Hardcoded TV_PUBKEY_NPUB from App.tsx for now
    const TV_PUBKEY_NPUB = 'npub1a5ve7g6q34lepmrns7c6jcrat93w4cd6lzayy89cvjsfzzwnyc4s6a66d8';
    let tvPubkeyHex = null;
    try {
      tvPubkeyHex = nip19.decode(TV_PUBKEY_NPUB).data;
      console.log('MessageBoard: Decoded TV_PUBKEY_NPUB to hex:', tvPubkeyHex);
    } catch (e) {
      console.error('MessageBoard: Failed to decode TV_PUBKEY_NPUB:', e);
      return;
    }
    if (tvPubkeyHex && typeof tvPubkeyHex === 'string') {
      if (!profiles[tvPubkeyHex] && !processingPubkeys.current.has(tvPubkeyHex)) {
        console.log('MessageBoard: App profile not in state, fetching...');
        fetchProfile(tvPubkeyHex);
      }
      // Subscribe to Kind 0 profile events for the app to handle streaming updates
      const profileFilter: NDKFilter = { kinds: [NDKKind.Metadata], authors: [tvPubkeyHex], limit: 1 };
      console.log('MessageBoard: Subscribing to app profile updates with filter:', profileFilter);
      const profileSub = ndk.subscribe(profileFilter, { closeOnEose: false });
      profileSub.on('event', (profileEvent: NDKEvent) => {
        console.log('MessageBoard: Received app profile update event:', profileEvent);
        if (profileEvent && typeof profileEvent.content === 'string') {
          try {
            const profileData: Partial<NDKUserProfile> = JSON.parse(profileEvent.content);
            console.log('MessageBoard: Parsed app profile data:', profileData);
            const nameValue = profileData.name ?? profileData.display_name ?? profileData.displayName;
            const resolvedName: string | undefined = typeof nameValue === 'string' ? nameValue : (nameValue != null) ? String(nameValue) : undefined;
            const pictureValue = profileData.picture ?? profileData.image ?? profileData.avatar;
            const resolvedPicture: string | undefined = typeof pictureValue === 'string' ? pictureValue : (pictureValue != null) ? String(pictureValue) : undefined;
            console.log('MessageBoard: Resolved app picture URL:', resolvedPicture);
            setProfiles(prev => ({ 
              ...prev, 
              [tvPubkeyHex]: { 
                name: resolvedName, 
                picture: resolvedPicture, 
                isLoading: false
              }
            }));
          } catch (parseError) {
            console.error('MessageBoard: Error parsing app profile content:', parseError, profileEvent.content);
          }
        } else {
          console.log('MessageBoard: App profile event invalid or no content:', profileEvent);
        }
      });
      profileSub.on('eose', () => {
        console.log('MessageBoard: EOSE received for app profile subscription.');
      });
      profileSub.start();
      return () => {
        console.log('MessageBoard: Cleaning up app profile subscription...');
        profileSub.stop();
      };
    }
  }, [ndk, profiles, fetchProfile]);

  // --- Effect to trigger profile fetches and subscriptions when messages update ---
  useEffect(() => {
    if (!ndk) return;
    const authorsToFetch = new Set<string>();
    const authorsToSubscribe = new Set<string>();
    messages.forEach(msg => {
        if (!profiles[msg.pubkey] && !processingPubkeys.current.has(msg.pubkey)) {
            authorsToFetch.add(msg.pubkey);
        }
        // Subscribe to all authors regardless of fetch status to catch updates
        authorsToSubscribe.add(msg.pubkey);
    });
    authorsToFetch.forEach(pubkey => fetchProfile(pubkey));
    
    // Subscribe to Kind 0 profile events for all message authors
    if (authorsToSubscribe.size > 0) {
      const authorsArray = Array.from(authorsToSubscribe);
      const profileFilter: NDKFilter = { kinds: [NDKKind.Metadata], authors: authorsArray, limit: authorsArray.length };
      console.log('MessageBoard: Subscribing to message authors profile updates with filter:', profileFilter);
      const authorsProfileSub = ndk.subscribe(profileFilter, { closeOnEose: false });
      authorsProfileSub.on('event', (profileEvent: NDKEvent) => {
        console.log('MessageBoard: Received author profile update event:', profileEvent);
        if (profileEvent && typeof profileEvent.content === 'string') {
          try {
            const profileData: Partial<NDKUserProfile> = JSON.parse(profileEvent.content);
            console.log('MessageBoard: Parsed author profile data for', profileEvent.pubkey.substring(0, 8), ':', profileData);
            const nameValue = profileData.name ?? profileData.display_name ?? profileData.displayName;
            const resolvedName: string | undefined = typeof nameValue === 'string' ? nameValue : (nameValue != null) ? String(nameValue) : undefined;
            const pictureValue = profileData.picture ?? profileData.image ?? profileData.avatar;
            const resolvedPicture: string | undefined = typeof pictureValue === 'string' ? pictureValue : (pictureValue != null) ? String(pictureValue) : undefined;
            console.log('MessageBoard: Resolved author picture URL for', profileEvent.pubkey.substring(0, 8), ':', resolvedPicture);
            setProfiles(prev => ({ 
              ...prev, 
              [profileEvent.pubkey]: { 
                name: resolvedName, 
                picture: resolvedPicture, 
                isLoading: false
              }
            }));
          } catch (parseError) {
            console.error('MessageBoard: Error parsing author profile content for', profileEvent.pubkey, ':', parseError, profileEvent.content);
          }
        } else {
          console.log('MessageBoard: Author profile event invalid or no content for', profileEvent?.pubkey?.substring(0, 8) || 'unknown', ':', profileEvent);
        }
      });
      authorsProfileSub.on('eose', () => {
        console.log('MessageBoard: EOSE received for message authors profile subscription.');
      });
      authorsProfileSub.start();
      return () => {
        console.log('MessageBoard: Cleaning up message authors profile subscription...');
        authorsProfileSub.stop();
      };
    }
  }, [messages, ndk, profiles, fetchProfile]); // Depend on messages, ndk, profiles, and the fetchProfile function

  const subscribeToReplies = (ndkInstance: NDK, eventId: string, authorsToFilter: string[]) => {
    // Prevent duplicate subscriptions
    if (subscription.current) {
      subscription.current.stop();
    }

    // Filter for kind 1 notes that tag the target event ID
    const filter: NDKFilter = {
      kinds: [NDKKind.Text],
      '#e': [eventId],
      authors: authorsToFilter, // Use authors prop in filter
      limit: 50,
    };

    console.log('NDK subscribing with reply filter:', filter);
    subscription.current = ndkInstance.subscribe(
        filter,
        { closeOnEose: false }
    );

    subscription.current.on('event', (event: NDKEvent) => {
        setMessages((prevMessages) => {
            if (prevMessages.some(msg => msg.id === event.id)) {
                return prevMessages;
            }
            // Prepend new message for chronological order (newest first)
            const newMessages = [event, ...prevMessages]; 
            // Optionally trim the list if it gets too long
            // if (newMessages.length > 100) newMessages.length = 100;
            return newMessages;
        });
    });

    subscription.current.on('eose', () => {
        console.log(`NDK EOSE received for replies to ${eventId}`);
    });

    subscription.current.start();
  };

  // Simplified status rendering
  const renderStatus = () => {
      if (!ndk) return 'Waiting for NDK...';
      if (!targetEventId) return 'Invalid or missing nevent to follow.';
      if (messages.length === 0) return 'Loading replies or none found...';
      return null;
  }

  return (
    <div className="message-board h-full overflow-y-auto flex flex-col items-center">
      {messages.length === 0 && !renderStatus() && (
          <p className="text-gray-500 text-center mt-4">No replies yet...</p>
      )}

      {messages.length > 0 && (
        <ul className="space-y-3 w-full max-w-md">
          {messages.map((msg) => {
              const profile = profiles[msg.pubkey];
              const displayName = profile?.name || msg.pubkey.substring(0, 10) + '...';
              const pictureUrl = profile?.picture;
              const isLoadingProfile = profile?.isLoading;

              return (
                <li key={msg.id} className="flex flex-row items-start space-x-2 py-1">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-600 overflow-hidden mt-1">
                      {isLoadingProfile ? (
                          <div className="w-full h-full animate-pulse bg-gray-500"></div>
                      ) : pictureUrl ? (
                          <img src={pictureUrl} alt={displayName} className="w-full h-full object-cover" onError={() => console.error(`MessageBoard: Failed to load image for ${displayName} at ${pictureUrl}`)} />
                      ) : (
                          <span className="text-gray-400 text-xs flex items-center justify-center h-full">?</span>
                      )}
                  </div>
                  <div className="flex-grow min-w-0 mt-1">
                      <span className="font-medium text-gray-200 text-sm mr-1" title={profile?.name ? msg.pubkey : undefined}>
                          {displayName}:
                      </span>
                      <span className="text-sm text-gray-400 break-words">
                          {msg.content}
                      </span>
                  </div>
                </li>
              );
          })}
        </ul>
      )}
    </div>
  );
};

export default MessageBoard; 