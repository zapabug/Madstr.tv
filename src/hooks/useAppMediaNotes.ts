import { useState, useEffect, useCallback, useMemo } from 'react';
import NDK from '@nostr-dev-kit/ndk';
import { NostrNote } from '../types/nostr';
import { useMediaNotes, MediaType } from './useMediaNotes'; // Assuming MediaType is exported
import { UseAuthReturn } from './useAuth'; // For auth context type

interface UseAppMediaNotesProps {
    mediaType: MediaType;
    auth: Pick<UseAuthReturn, 'followedTags' | 'fetchImagesByTagEnabled' | 'fetchVideosByTagEnabled' | 'fetchPodcastsByTagEnabled'>;
    mediaAuthors: string[] | undefined;
    ndk: NDK | undefined;
    isNdkReady: boolean;
    baseLimit?: number;
    tagFetchLimit?: number; // Optional: if different limit for tags needed
}

interface UseAppMediaNotesReturn {
    combinedNotes: NostrNote[];
    isLoading: boolean;
    fetchOlderNotes: () => void;
}

const DEFAULT_BASE_LIMIT = 25;
const DEFAULT_TAG_FETCH_LIMIT_FACTOR = 1; // e.g. fetch same amount for tags

export function useAppMediaNotes({
    mediaType,
    auth,
    mediaAuthors,
    ndk,
    isNdkReady,
    baseLimit = DEFAULT_BASE_LIMIT,
    tagFetchLimit,
}: UseAppMediaNotesProps): UseAppMediaNotesReturn {
    const { followedTags, fetchImagesByTagEnabled, fetchVideosByTagEnabled, fetchPodcastsByTagEnabled } = auth;

    const [authorFetchUntil, setAuthorFetchUntil] = useState<number | undefined>(undefined);
    const [tagFetchUntil, setTagFetchUntil] = useState<number | undefined>(undefined);

    const actualTagFetchLimit = tagFetchLimit || baseLimit * DEFAULT_TAG_FETCH_LIMIT_FACTOR;

    const memoizedMediaAuthors = useMemo(() => mediaAuthors, [mediaAuthors]);
    const memoizedFollowedTags = useMemo(() => followedTags, [followedTags]);
    
    const emptyAuthors = useMemo(() => [], []);
    const emptyTags = useMemo(() => [], []);

    const fetchByTagEnabled = useMemo(() => {
        switch (mediaType) {
            case 'image': return fetchImagesByTagEnabled;
            case 'video': return fetchVideosByTagEnabled;
            case 'podcast': return fetchPodcastsByTagEnabled;
            default: return false;
        }
    }, [mediaType, fetchImagesByTagEnabled, fetchVideosByTagEnabled, fetchPodcastsByTagEnabled]);

    // Fetch notes from AUTHORS
    const { notes: authorNotes, isLoading: isLoadingAuthorNotes } = useMediaNotes({
        authors: memoizedMediaAuthors,
        mediaType,
        ndk,
        limit: baseLimit,
        until: authorFetchUntil,
    });

    // Fetch notes from TAGS (Conditional)
    const { notes: tagNotes, isLoading: isLoadingTagNotes } = useMediaNotes({
        followedTags: fetchByTagEnabled ? memoizedFollowedTags : emptyTags,
        mediaType,
        ndk,
        limit: actualTagFetchLimit,
        until: tagFetchUntil,
        authors: emptyAuthors, // Ensure this is purely for tags
    });

    const [combinedNotes, setCombinedNotes] = useState<NostrNote[]>([]);
    const [isLoadingCombined, setIsLoadingCombined] = useState<boolean>(true);

    // Effect to COMBINE and DEDUPLICATE notes
    useEffect(() => {
        // console.log(`useAppMediaNotes (${mediaType}): Combining notes. Author: ${authorNotes.length}, Tag: ${tagNotes.length}`);
        setIsLoadingCombined(isLoadingAuthorNotes || isLoadingTagNotes);

        const combinedMap = new Map<string, NostrNote>();
        
        // Add notes, potentially overwriting based on ID if fetched from both sources.
        // This simple merge prefers later additions if IDs clash, effectively letting tagNotes overwrite authorNotes if IDs are same.
        // A more sophisticated merge might be needed if specific priority is required.
        authorNotes.forEach(note => combinedMap.set(note.id, note));
        tagNotes.forEach(note => combinedMap.set(note.id, note));

        const newCombinedNotes = Array.from(combinedMap.values())
            .sort((a, b) => b.created_at - a.created_at);

        // Update state only if the actual content changed (compare IDs)
        // This simple string comparison might be heavy for very large lists.
        // Consider more optimized checks if performance issues arise.
        const currentIds = combinedNotes.map(n => n.id).join(',');
        const newIds = newCombinedNotes.map(n => n.id).join(',');

        if (currentIds !== newIds) {
            // console.log(`useAppMediaNotes (${mediaType}): Combined notes updated. Total: ${newCombinedNotes.length}`);
            setCombinedNotes(newCombinedNotes);
        }
    }, [authorNotes, tagNotes, isLoadingAuthorNotes, isLoadingTagNotes, mediaType, combinedNotes]);


    const fetchOlderNotes = useCallback(() => {
        // console.log(`useAppMediaNotes (${mediaType}): Fetching older notes.`);
        if (authorNotes.length > 0) {
            const oldestAuthorTimestamp = authorNotes[authorNotes.length - 1].created_at;
            setAuthorFetchUntil(oldestAuthorTimestamp);
        }
        if (fetchByTagEnabled && tagNotes.length > 0) {
            const oldestTagTimestamp = tagNotes[tagNotes.length - 1].created_at;
            setTagFetchUntil(oldestTagTimestamp);
        }
    }, [authorNotes, tagNotes, fetchByTagEnabled, mediaType]);

    return {
        combinedNotes,
        isLoading: isLoadingCombined,
        fetchOlderNotes,
    };
} 