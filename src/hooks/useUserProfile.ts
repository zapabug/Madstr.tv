import { useState, useEffect } from 'react';
import NDK, { NDKUser, NDKUserProfile } from '@nostr-dev-kit/ndk';
import { getProfileFromCache, saveProfileToCache, ProfileData } from '../utils/profileCache';

// Combine expected profile types for the state
type UserProfileState = NDKUserProfile | ProfileData | null;

// Define the return type for the hook
interface UseUserProfileReturn {
    profile: UserProfileState;
    isLoading: boolean;
}

/**
 * Hook to fetch and cache a single Nostr user profile by hex pubkey.
 * Fetched profile is NDKUserProfile, cached profile is ProfileData.
 * @param pubkey The hex public key of the user.
 * @param ndk The NDK instance.
 * @returns An object containing the profile (either type) and loading state.
 */
export function useUserProfile(pubkey: string | null | undefined, ndk: NDK | null): UseUserProfileReturn {
    const [profile, setProfile] = useState<UserProfileState>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    useEffect(() => {
        let isMounted = true;
        if (!pubkey || !ndk) {
            setProfile(null); // Clear profile if no pubkey or ndk
            setIsLoading(false);
            return;
        }

        const fetchProfile = async () => {
            setIsLoading(true);
            setProfile(null); // Clear previous profile while loading new one

            // 1. Check cache first
            try {
                const cached: ProfileData | null = await getProfileFromCache(pubkey);
                if (cached && isMounted) {
                    console.log(`useUserProfile: Cache hit for ${pubkey.substring(0, 6)}`);
                    // Use the ProfileData object directly from cache
                    setProfile(cached);
                    setIsLoading(false);
                    return; // Found in cache, no need to fetch
                }
            } catch (error) {
                console.error("Error reading profile cache:", error);
                // Continue to fetch from network
            }

            console.log(`useUserProfile: Cache miss or expired for ${pubkey.substring(0, 6)}, fetching from network...`);

            // 2. Fetch from network if not in cache
            try {
                const user = ndk.getUser({ hexpubkey: pubkey });
                const fetchedProfile: NDKUserProfile | null = await user.fetchProfile(); // Fetches Kind 0

                if (fetchedProfile && isMounted) {
                    console.log(`useUserProfile: Fetched profile for ${pubkey.substring(0, 6)}`);
                    // Use the NDKUserProfile object directly from network
                    setProfile(fetchedProfile);
                    // 3. Cache the fetched profile
                    try {
                        // Convert NDKUserProfile to ProfileData for caching
                        const profileToCache: ProfileData = {
                            pubkey: pubkey,
                            ...fetchedProfile // Spread fetched profile fields
                        };
                        await saveProfileToCache(profileToCache);
                        console.log(`useUserProfile: Cached profile for ${pubkey.substring(0, 6)}`);
                    } catch (cacheError) {
                        console.error("Error caching fetched profile:", cacheError);
                    }
                } else if (isMounted) {
                     console.log(`useUserProfile: No profile found on network for ${pubkey.substring(0, 6)}`);
                     setProfile(null); // Ensure profile is null if fetch returns nothing
                }
            } catch (error) {
                console.error(`Error fetching profile for ${pubkey}:`, error);
                if (isMounted) setProfile(null);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchProfile();

        return () => {
            isMounted = false;
        };
    }, [pubkey, ndk]); // Re-run if pubkey or ndk instance changes

    return { profile, isLoading };
} 