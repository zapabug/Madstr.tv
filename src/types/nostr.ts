// src/types/nostr.ts

// Represents basic Nostr profile data extracted from Kind 0
export interface NostrProfile {
    npub: string;
    pubkey: string;
    name?: string;
    displayName?: string;
    about?: string;
    picture?: string;
    banner?: string;
    website?: string;
    lud16?: string;
    nip05?: string;
    // Add other relevant fields as needed
    isLoading?: boolean; // Added to track loading state
}

// Represents a processed Nostr note, potentially containing media
export interface NostrNote {
    id: string; // Event ID
    pubkey: string; // Hex pubkey of the original author
    created_at: number; // Unix timestamp
    kind: number; // Event kind
    tags: string[][]; // Event tags
    content: string; // Original event content
    sig: string; // Event signature

    // --- Media/Context Specific --- 
    url?: string;          // Extracted media URL (audio, video, image)
    posterPubkey?: string; // Pubkey of the direct poster (might differ from original author in replies/boosts - though less relevant here)
    
    // --- Potential Metadata (extracted from tags mostly) ---
    title?: string;        // e.g., from 'title' tag in Kind 30402
    summary?: string;      // e.g., from 'summary' tag
    image?: string;        // e.g., from 'image' tag (cover art)
    duration?: string;     // e.g., from 'duration' tag (podcast/video length)
} 