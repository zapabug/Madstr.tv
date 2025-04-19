import { NDKFilter, NDKKind } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';

export type MediaType = 'podcast' | 'video' | 'image';

// Helper to get Kinds based on MediaType
export function getKindsForMediaType(mediaType: MediaType): number[] {
    switch (mediaType) {
        case 'podcast': return [34235, 31234, NDKKind.Text]; // Podcast Episode, Audio Track, Text
        case 'video': return [NDKKind.Video, NDKKind.Text]; // 31337, 1
        case 'image': return [NDKKind.Image, NDKKind.Text]; // 31338, 1
        default: return [NDKKind.Text];
    }
}

// Helper to safely decode npub
export function getHexPubkey(npub: string): string | null {
    try {
        const decoded = nip19.decode(npub);
        if (decoded.type === 'npub') {
            return decoded.data;
        }
        console.warn(`filterUtils: Decoded type is not npub: ${decoded.type}`);
        return null;
    } catch (e) {
        console.error(`filterUtils: Failed to decode npub ${npub}:`, e);
        return null;
    }
}

// Builds filters for media subscriptions based on authors and tags
export const buildMediaFilters = (
    mediaType: MediaType,
    limit: number,
    followedAuthorPubkeys: string[],
    followedTags: string[],
    until?: number,
    currentUserHexPubkey?: string | null // Optional hex pubkey of logged-in user
): NDKFilter[] | null => { // Return null to skip subscription
    console.log(`[buildMediaFilters - ${mediaType}] Inputs:`, { followedAuthorPubkeys, followedTags, limit, until, currentUserHexPubkey }); // Log inputs
    const kinds = getKindsForMediaType(mediaType);

    // Determine which author set to use: Logged-in user's OR TV pubkey's follows
    // For now, let's stick to the App.tsx logic which prioritized TV follows, but allow for user override potentially later
    // We receive the *already determined* list of authors to use (followedAuthorPubkeys)
    const authorsToUse = followedAuthorPubkeys; // Assume the caller decides which list to pass

    const hasAuthors = authorsToUse.length > 0;
    const hasTags = followedTags && followedTags.length > 0;

    // If NO authors AND NO tags are provided, we cannot subscribe to anything meaningful.
    if (!hasAuthors && !hasTags) {
        console.log(`[buildMediaFilters - ${mediaType}] No authors or tags to follow. Skipping subscription.`);
        return null; // Return null to indicate skipping
    }

    const baseFilter: NDKFilter = { kinds, limit };
    if (until) baseFilter.until = until;

    let filters: NDKFilter[] = [];

    // Create separate filters for authors and tags, then combine
    // NDK merges subscriptions, so sending separate filters for authors and tags is efficient.
    if (hasAuthors) {
        filters.push({ ...baseFilter, authors: authorsToUse });
    }

    // Re-enabled hashtag filtering
    if (hasTags) {
        // Ensure tags are lowercase as per NIP-12
        const lowerCaseTags = followedTags.map(tag => tag.toLowerCase());
        filters.push({ ...baseFilter, '#t': lowerCaseTags });
    }

    console.log(`[buildMediaFilters - ${mediaType}] Generated Filters:`, JSON.stringify(filters)); // Restored original log message
    // If filters array is empty (e.g., only authors were provided but authors array was empty), return null
    return filters.length > 0 ? filters : null;
}; 