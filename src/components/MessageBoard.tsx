import 'websocket-polyfill'; // Keep polyfill for now, though likely not needed for NDK
import React, { useState, useEffect, useRef, useCallback } from 'react';
import NDK, { NDKEvent, NDKFilter, NDKKind, NDKSubscription, NDKUserProfile } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools'; // Import nip19 for decoding
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
  ndk: NDK | null;
  neventToFollow: string;
  // authors: string[]; // Remove authors prop
  onNewMessage?: () => void;
}

const MessageBoard: React.FC<MessageBoardProps> = ({ ndk, neventToFollow, /* authors, */ onNewMessage }) => { // Remove authors from destructuring
  const [messages, setMessages] = useState<NDKEvent[]>([]);
  const [targetEventId, setTargetEventId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ProfileData>>({}); // State for profiles (uses imported type)
  const subscription = useRef<NDKSubscription | null>(null);
  const processingPubkeys = useRef<Set<string>>(new Set()); // Track profiles being fetched
  const [isProfileCacheLoaded, setIsProfileCacheLoaded] = useState(false);

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
    // Remove authors check here, it's not relevant for the subscription filter
    if (!ndk || !targetEventId) { 
      console.log('MessageBoard: Waiting for NDK and/or targetEventId.');
      // ... reset state and stop subscription ...
      return;
    }

    console.log(`MessageBoard: NDK ready, subscribing to replies for event ${targetEventId}...`); // Removed author count log
    // Pass only needed args to helper
    subscribeToReplies(ndk, targetEventId);

    // Cleanup function
    return () => {
      // ... cleanup ...
    };
    // Remove authors from dependency array
  }, [ndk, targetEventId]);

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
      
      authorsProfileSub.on('event', (profileEvent: NDKEvent) => {
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
      authorsProfileSub.on('eose', () => { /* console.log('EOSE...') */ });
      authorsProfileSub.start();
    }
    return () => {
        authorsProfileSub?.stop();
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

    try {
        subscription.current = ndkInstance.subscribe(
            filter,
            { closeOnEose: false }
        );
        // ... attach listeners ...
    } catch (error) {
        console.error("MessageBoard: Error during NDK subscribe call:", error);
    }
  };

  // Simplified status rendering
  const renderStatus = () => {
      if (!ndk) return 'Waiting for NDK...';
      if (!targetEventId) return 'Invalid or missing nevent to follow.';
      if (messages.length === 0) return 'Loading replies or none found...';
      return null;
  }

  return (
    <div className="h-full overflow-y-auto scroll-smooth p-2">
      {messages.length === 0 && !renderStatus() && (
          <p className="text-gray-500 text-center mt-6 text-lg lg:text-xl">No replies yet...</p>
      )}

      {messages.length > 0 && (
        <ul className="w-full space-y-1 pl-32">
          {messages.map((msg, index) => {
              const profile = profiles[msg.pubkey];
              const displayName = profile?.name || profile?.displayName || msg.pubkey.substring(0, 10) + '...';
              const pictureUrl = profile?.picture;
              const isLoadingProfile = profile?.isLoading;

              return (
                <li 
                  key={msg.id} 
                  className={`flex flex-row items-start space-x-2 transition-colors duration-100 py-1 lg:py-1.5 px-3 lg:px-4 bg-gray-900/60 rounded-lg`}
                >
                  <div className="flex-shrink-0 w-8 h-8 lg:w-9 lg:h-9 rounded-full bg-gray-600/80 overflow-hidden mt-1">
                      {isLoadingProfile ? (
                          <div className="w-full h-full animate-pulse bg-gray-500"></div>
                      ) : pictureUrl ? (
                          <img src={pictureUrl} alt={displayName || 'avatar'} className="w-full h-full object-cover" onError={() => console.error(`Failed to load ${pictureUrl}`)} />
                      ) : (
                          <span className="text-gray-300 text-xs font-semibold flex items-center justify-center h-full uppercase">
                              {displayName?.substring(0, 2) || '??'}
                          </span>
                      )}
                  </div>
                  <div className={`flex-grow min-w-0 mt-0.5`}>
                      <span className="font-medium text-purple-600 text-sm lg:text-base mr-1.5" title={profile?.name ? msg.pubkey : undefined}>
                          {displayName}:
                      </span>
                      <span className="text-sm lg:text-base text-gray-200 break-words">
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