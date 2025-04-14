import { useState, useEffect, useRef, useCallback } from 'react';
import { useNdk } from 'nostr-hooks';
import { 
    ProfileData, 
    getProfileFromCache, 
    saveProfileToCache,
    parseProfileContent 
} from '../utils/profileCache'; // Import shared profile utilities

// Use the generic NostrNote type
import { NostrNote } from '../types/nostr';

interface UseProfileDataResult {
  profiles: Record<string, ProfileData>;
  fetchProfile: (pubkey: string) => Promise<void>; // Expose fetch for potential pre-fetching
}

export function useProfileData(notes: NostrNote[]): UseProfileDataResult {
  const { ndk } = useNdk();
  const [profiles, setProfiles] = useState<Record<string, ProfileData>>({});
  const processingPubkeys = useRef<Set<string>>(new Set()); // Track profiles being fetched

  // --- Profile Fetching Logic (adapted from Podcastr) ---
  const fetchProfile = useCallback(async (pubkey: string) => {
    console.log(`useProfileData: ENTER fetchProfile for ${pubkey?.substring(0,8)}`); 

    if (!ndk || !pubkey || processingPubkeys.current.has(pubkey) || profiles[pubkey]?.name) {
      // console.log(`useProfileData: EXIT fetchProfile early: ndk=${!!ndk}, pubkey=${!!pubkey}, processing=${processingPubkeys.current.has(pubkey)}, hasName=${!!profiles[pubkey]?.name}`);
      return;
    }
    
    // Check shared cache first
    try {
      const cachedProfile = await getProfileFromCache(pubkey); 
      if (cachedProfile && cachedProfile.name) { // Ensure cached profile has a name
           console.log(`useProfileData: Using named profile from cache for ${pubkey.substring(0,8)}.`);
           setProfiles(prev => ({ ...prev, [pubkey]: { ...cachedProfile, isLoading: false } }));
           return; // Found in cache, no need to fetch
      }
    } catch (err) {
      console.error(`useProfileData: Error checking shared cache for ${pubkey.substring(0, 8)}:`, err);
    }

    // Proceed with network fetch
    console.log(`useProfileData: Initiating network fetch for ${pubkey.substring(0, 8)}...`);
    processingPubkeys.current.add(pubkey);
    setProfiles(prev => ({ ...prev, [pubkey]: { ...prev[pubkey], pubkey: pubkey, isLoading: true } }));

    try {
      const user = ndk.getUser({ pubkey });
      const profileEvent = await user.fetchProfile(); // Fetch NDKUserProfile
      console.log(`useProfileData: Network response for ${pubkey.substring(0,8)}: Event=`, profileEvent);
      
      let profileDataToSave: Omit<ProfileData, 'cachedAt' | 'isLoading'> | null = null;

      if (profileEvent && typeof profileEvent.content === 'string') {
        profileDataToSave = parseProfileContent(profileEvent.content, pubkey);
      } else if (profileEvent && (profileEvent.name || profileEvent.picture || profileEvent.displayName)) {
         // Fallback for potentially pre-parsed profile data
         profileDataToSave = {
             pubkey: pubkey,
             name: typeof profileEvent.name === 'string' ? profileEvent.name : undefined,
             picture: typeof profileEvent.picture === 'string' ? profileEvent.picture : undefined,
             displayName: typeof profileEvent.displayName === 'string' ? profileEvent.displayName : undefined,
             about: typeof profileEvent.about === 'string' ? profileEvent.about : undefined,
             banner: typeof profileEvent.banner === 'string' ? profileEvent.banner : undefined,
             lud16: typeof profileEvent.lud16 === 'string' ? profileEvent.lud16 : undefined,
             nip05: typeof profileEvent.nip05 === 'string' ? profileEvent.nip05 : undefined,
         };
         if (!profileDataToSave.name && !profileDataToSave.picture && !profileDataToSave.displayName) {
             profileDataToSave = null; // Invalidate if key fields missing
         }
      }

      if (profileDataToSave) {
          console.log(`useProfileData: Successfully processed profile data for ${pubkey.substring(0,8)}.`);
          const finalProfileData = { ...profileDataToSave, isLoading: false };
          setProfiles(prev => ({ ...prev, [pubkey]: finalProfileData }));
          // Save the successfully parsed data to cache
          saveProfileToCache({ ...profileDataToSave, pubkey }).catch(err => 
              console.error(`useProfileData: Failed to save profile to shared cache for ${pubkey.substring(0, 8)}:`, err)
          );
      } else {
           console.log(`useProfileData: Marking fetch as complete (no valid data) for ${pubkey.substring(0,8)}.`);
           // Update state to remove loading indicator even if no data was found/parsed
           setProfiles(prev => ({ ...prev, [pubkey]: { ...prev[pubkey], pubkey: pubkey, isLoading: false } }));
      }

    } catch (error) {
      console.error(`useProfileData: Error during network fetch for ${pubkey}:`, error);
      // Ensure loading state is cleared on error
      setProfiles(prev => ({ ...prev, [pubkey]: { ...prev[pubkey], pubkey: pubkey, isLoading: false } }));
    } finally {
        processingPubkeys.current.delete(pubkey);
    }
  }, [ndk, profiles]); // Depend on NDK and profiles state to avoid re-fetching if profile already loaded

  // --- Effect to Trigger Profile Fetches --- 
  useEffect(() => {
    if (notes.length > 0) {
        // Filter out notes without a posterPubkey before creating the Set
        const validPubkeysInNotes = notes
            .map(note => note.posterPubkey)
            .filter((pubkey): pubkey is string => typeof pubkey === 'string' && pubkey.length > 0);
        
        const uniquePubkeysInNotes = new Set(validPubkeysInNotes);

        uniquePubkeysInNotes.forEach(pubkey => {
            // Fetch logic remains the same: check if profile needs fetching
            if (!profiles[pubkey]?.name && !processingPubkeys.current.has(pubkey)) {
                fetchProfile(pubkey);
            }
      });
    }
  }, [notes, profiles, fetchProfile]);

  return { profiles, fetchProfile };
} 