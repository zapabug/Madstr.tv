import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
// useNdk no longer needed here
// import { useNdk } from 'nostr-hooks'; 
// NDK types no longer needed here
// import { NDKEvent, NDKFilter, NDKKind } from '@nostr-dev-kit/ndk';
// nip19 potentially still needed if displaying npubs
import { nip19 } from 'nostr-tools'; 
// Import local types
import { NostrNote } from '../types/nostr';
// import { useProfileData } from '../hooks/useProfileData'; // <-- Remove old hook import
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'react-qr-code';
import { useWallet } from '../hooks/useWallet'; // Import wallet hook
import { useAuth } from '../hooks/useAuth'; // Import auth hook for context
// import { useMediaAuthors } from '../hooks/useMediaAuthors'; // Remove this - NDK comes from useNDK
import { FiZap } from 'react-icons/fi'; // Import Zap icon
// import NDK from '@nostr-dev-kit/ndk'; // Removed unused NDK import
// import { useNDK, useProfile } from '@nostr-dev-kit/ndk-hooks'; // Import useNDK and useProfile
// import { formatTimeAgo } from '../utils/timeUtils'; // Removed - file not found, function unused
// import { useInactivityTimer } from '../hooks/useInactivityTimer'; // Removed - state unused
import { UnsignedEvent } from 'nostr-tools'; // Import UnsignedEvent
// Import Applesauce hooks and queries/types
import { Hooks } from 'applesauce-react';
import { ProfileQuery } from 'applesauce-core/queries';
import { EventStore } from 'applesauce-core';

// Remove internal MediaNote interface if NostrNote is sufficient
/*
interface MediaNote {
  id: string; // Event ID
  eventId: string; // Use id
  type: 'image' | 'video'; // Can be inferred from tags/content?
  url: string; // Should be in content or tags
  posterNpub: string; // Map to posterPubkey
  createdAt: number; // Map to created_at
}
*/

// Update props: remove authors, onNotesLoaded, add isLoading, authorNpub
export interface MediaFeedProps {
  // authors: string[]; // Removed
  // handlePrevious: () => void; // Removed prop - see TODO below
  // handleNext: () => void; // Removed prop - see TODO below
  currentImageIndex: number;
  imageNotes: NostrNote[]; 
  // authorNpub: string | null; // Removed
  // onNotesLoaded: (notes: NostrNote[]) => void; // Removed
}

// Restore loading messages array
const loadingMessages = [
  "Tuning into the cosmic streams...",
  "Aligning the digital constellations...",
  "Reticulating splines...",
  "Charging the flux capacitor...",
  "Brewing cyber-coffee...",
  "Asking the magic smoke nicely...",
  "Untangling the timelines...",
  "Polishing the pixels...",
];

const DEFAULT_TIP_AMOUNT = 121; // Sats

// Define your custom SVG component or markup here
const CustomLoggedInIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    {/* Lightning bolt path with specified colors */}
    <path 
      d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" 
      fill="#8B5CF6" 
      stroke="#F7931A" 
      strokeWidth="1.5" // Adjust stroke width as needed
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

// Removed forwardRef
const ImageFeed: React.FC<MediaFeedProps> = (
  { 
    // authors, // Removed
    // handlePrevious, // TODO: Prop passed but not used - wire up navigation?
    // handleNext, // TODO: Prop passed but not used - wire up navigation?
    currentImageIndex, // Use prop directly
    imageNotes, 
    // authorNpub, // This prop is now unused
    // onNotesLoaded, // Removed
  }
  // Removed ref parameter
) => {
  // Restore loading message state
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  // const { profiles } = useProfileData(imageNotes); // <-- Remove old hook call
  const authorContainerRef = useRef<HTMLDivElement>(null);
  // Re-add tipping state
  const [isTipping, setIsTipping] = useState(false);
  const [tipStatus, setTipStatus] = useState<'success' | 'error' | null>(null);
  // const [currentImageIndex, setCurrentImageIndex] = useState(0); // Removed duplicate state
  // const [isLoading, setIsLoading] = useState(true); // Removed unused state
  // const [showMetadata, setShowMetadata] = useState(false); // Removed unused state
  // const [isInactive, resetInactivityTimer] = useInactivityTimer(30000); // Removed unused state
  // const { ndk } = useNDK(); // Get NDK instance

  // Hooks
  const wallet = useWallet();
  // Get auth context without passing NDK; useAuth uses useNDK internally
  const auth = useAuth(); 
  const eventStore = Hooks.useEventStore(); // Get EventStore
  // const queryStore = Hooks.useQueryStore(); // Get QueryStore

  // Restore Loading Message Cycling useEffect
  useEffect(() => {
    const intervalId = setInterval(() => {
      setLoadingMessageIndex(prevIndex => (prevIndex + 1) % loadingMessages.length);
    }, 2500); 
    return () => clearInterval(intervalId); 
  }, []); // Empty dependency array ensures it runs once on mount

  // --- Effect to Scroll to Current Image (Keep) ---
  useEffect(() => {
    if (imageNotes.length > 0 && currentImageIndex < imageNotes.length) {
       const targetElement = document.getElementById(`media-item-${imageNotes[currentImageIndex]?.id}`);
       targetElement?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }, [currentImageIndex, imageNotes]);

  // --- REMOVED Effect to Fetch Notes --- 
  // useEffect(() => { ... fetching logic removed ... }, [ndk, authors, onNotesLoaded]);

  // --- Derive current note and author pubkey --- 
  const currentImageNote = useMemo(() => 
      (imageNotes && imageNotes.length > 0 && currentImageIndex >= 0 && currentImageIndex < imageNotes.length)
          ? imageNotes[currentImageIndex]
          : null,
      [imageNotes, currentImageIndex]
  );
  const currentAuthorPubkey = currentImageNote?.pubkey;

  // --- Fetch Profile for the Current Author using Applesauce ---
  const profileQueryArgs = useMemo((): [string] | null => (currentAuthorPubkey ? [currentAuthorPubkey] : null), [currentAuthorPubkey]);
  const profileData = Hooks.useStoreQuery(ProfileQuery, profileQueryArgs);
  const profile = profileData;
  // Infer loading state: if we expect a profile but don't have one yet
  // const isLoadingProfile = !!currentAuthorPubkey && !profile; // Removed unused variable

  // --- Calculate Display Name --- 
  const displayName = useMemo(() => 
    profile?.name || profile?.displayName || (currentAuthorPubkey ? nip19.npubEncode(currentAuthorPubkey).substring(0, 10) + '...' : 'Anon'), 
    [profile, currentAuthorPubkey]
  );
  const timestamp = currentImageNote?.created_at ? new Date(currentImageNote.created_at * 1000).toLocaleString() : 'Date unknown';
  const imageUrl = currentImageNote?.url;
  const currentNoteId = currentImageNote?.id;

  // --- Derive npub for QR code and tipping --- 
  const currentAuthorNpub = useMemo(() => {
      if (!currentAuthorPubkey) return null;
      try {
          return nip19.npubEncode(currentAuthorPubkey);
      } catch (e) {
          console.error("ImageFeed: Failed to encode author pubkey:", e);
          return null;
      }
  }, [currentAuthorPubkey]);

  // Define minimal interface for required signer methods
  interface EventSigner {
      pubkey: string;
      signEvent(event: Omit<NostrNote, 'id' | 'sig'> | UnsignedEvent): Promise<NostrNote>; // Allow UnsignedEvent
  }

  // --- Determine if tipping is possible --- 
  const canTip = useMemo(() => 
    !wallet.isLoadingWallet && !isTipping && wallet.balanceSats >= DEFAULT_TIP_AMOUNT && !!currentAuthorNpub && auth.isLoggedIn && !!eventStore,
    [wallet.isLoadingWallet, wallet.balanceSats, isTipping, currentAuthorNpub, auth.isLoggedIn, eventStore]
  );

  // --- Tipping Handler ---
  const handleTip = useCallback(async () => {
    // Assuming auth provides activeSigner
    const activeSigner = (auth as any).activeSigner as EventSigner | undefined;

    // Re-check conditions inside handler
    if (!canTip || !currentAuthorNpub || !eventStore || !auth.isLoggedIn || !activeSigner) {
        console.warn('Cannot tip (inside handler):', { canTip, currentAuthorNpub, eventStore, authIsLoggedIn: auth.isLoggedIn, activeSigner: !!activeSigner });
        return;
    }
    setIsTipping(true);
    setTipStatus(null);
    console.log(`Attempting to tip ${DEFAULT_TIP_AMOUNT} sats to ${currentAuthorNpub}`);

    try {
        // 1. Construct the unsigned Zap Request (Kind 9734) - This is complex!
        // We need the recipient's zap endpoint from their profile (relays tag? lud16?)
        // NIP-57: https://github.com/nostr-protocol/nips/blob/master/57.md
        // For now, we'll skip the actual LN invoice generation and focus on the Nostr event publishing structure.
        // We need to create a Kind 9735 (Zap) event, not 9734 (Zap Request).
        // The Zap event usually includes the Bolt11 invoice in a description tag.

        // --- Placeholder for Zap Event Creation --- 
        // TODO: Implement proper Zap Request (Kind 9734) to get invoice, then create Kind 9735
        // This is a simplified placeholder - assumes we magically got an invoice
        const placeholderInvoice = "lnbc..."; // Replace with actual invoice
        const zapEvent: UnsignedEvent = {
            kind: 9735,
            created_at: Math.floor(Date.now() / 1000),
            pubkey: activeSigner.pubkey,
            content: `📺⚡️ Tip from MadTrips TV App!`, // Optional user comment
            tags: [
                ["p", currentAuthorPubkey!], // Zap recipient pubkey
                ["e", currentNoteId!], // Zap target event (optional)
                // ["a", <coordinate>], // Zap target kind 10k+ (optional)
                ["amount", (DEFAULT_TIP_AMOUNT * 1000).toString()], // Amount in millisats
                // Required: Description tag containing the BOLT11 invoice
                ["description", JSON.stringify({ content: `Zap for event ${currentNoteId}`, bolt11: placeholderInvoice })]
            ],
        };

        console.log("ImageFeed: Signing Zap event...", zapEvent);
        const signedZapEvent = await activeSigner.signEvent(zapEvent as any); // Cast needed?

        console.log("ImageFeed: Adding Zap event to EventStore...", signedZapEvent.id);
        eventStore.add(signedZapEvent);

        // Assume success if add doesn't throw
        const success = true;

        // const success = await wallet.sendCashuTipWithSplits(params); // Old method
        if (success) { // Check the result of adding to eventStore
            console.log('Tip successful!');
            setTipStatus('success');
        } else {
            console.error('Tip failed.', wallet.walletError); // Keep wallet error for potential Cashu issues?
            setTipStatus('error');
        }
    } catch (error) {
        console.error('Exception during tip:', error);
        setTipStatus('error');
    } finally {
        setIsTipping(false);
        setTimeout(() => setTipStatus(null), 2000);
    }
  }, [canTip, currentAuthorNpub, eventStore, auth, wallet, currentNoteId]);

  // --- Keyboard Handler for Tipping ---
  const handleAuthorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') { // OK/Select button
        event.preventDefault();
        if (canTip) {
            handleTip();
        }
    }
    // Allow arrow keys for navigation if needed, but prevent default if handled
    // if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    //   // Handle focus movement elsewhere if needed
    // }
  };

  // <<< Conditionally render loading state based on imageNotes length >>>
  if (imageNotes.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
        <div className="mb-4 w-16 h-16 animate-spin border-4 border-purple-600 border-t-transparent rounded-full"></div>
        {/* Use cycling message */}
        <p className="animate-pulse">{loadingMessages[loadingMessageIndex]}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        {/* Image Container */}
        <AnimatePresence mode="wait">
          <motion.div
             key={currentImageNote?.id || currentImageIndex} // Ensure key changes
            className="w-full h-full flex items-center justify-center"
          >
             {imageUrl ? (
                <img 
                    src={imageUrl} 
                    alt={`Nostr media ${currentImageNote?.id}`}
                    className="max-w-full max-h-full object-contain shadow-lg"
                    // loading="lazy" // Let the browser handle lazy loading if needed
                    onError={(e) => {
                        console.error(`ImageFeed: Error loading image ${imageUrl}`);
                        // Optionally handle image errors, e.g., show placeholder
                        (e.target as HTMLImageElement).style.display = 'none'; // Hide broken image
                    }}
                />
            ) : (
                <div className="text-gray-500">No Image Available</div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Author Info Overlay */}
        {currentAuthorNpub && (
          <div
            ref={authorContainerRef}
            className={`absolute bottom-2 right-2 z-20 flex flex-col items-center space-y-0.5 transition-all duration-200 ease-in-out 
                         ${canTip ? 'cursor-pointer focus:outline-none focus:ring-4 focus:ring-purple-600 focus:ring-opacity-75 rounded-lg p-1 bg-black/30' : 'p-1'}`}
            tabIndex={canTip ? 0 : -1} // Make focusable only when tipping is possible
            onKeyDown={handleAuthorKeyDown}
            title={canTip ? `Press OK to tip ${DEFAULT_TIP_AMOUNT} sats` : displayName}
          >
            {/* Author Name */} 
            {currentImageNote && (
              <p className="text-xs text-purple-500 bg-black/40 px-1.5 py-0.5 rounded pointer-events-none truncate max-w-[120px] text-center">
                {displayName}
              </p>
            )}

            {/* Author QR Code + Overlays */} 
            <div className="relative bg-white p-1 rounded-sm shadow-md w-12 h-12 md:w-16 md:h-16 lg:w-18 lg:h-18">
                {/* QR Code itself */}
                <QRCode
                    value={currentAuthorNpub}
                    size={256}
                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                    viewBox={`0 0 256 256`}
                    level="H" // High error correction crucial for overlays
                    bgColor="#FFFFFF"
                    fgColor="#000000"
                />

                {/* --- Overlays Container --- */} 
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    
                    {/* Custom Logged-in Icon (Always shown when logged in) */} 
                    {auth.isLoggedIn && (
                        <div className="absolute w-1/3 h-1/3 opacity-80">
                           <CustomLoggedInIcon />
                        </div>
                    )}

                    {/* Tip possible indicator (Zap icon) */} 
                    {canTip && !isTipping && (
                        // Position the Zap icon; it might overlap the custom icon or be offset
                        <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-sm">
                             <FiZap className="w-3/5 h-3/5 text-yellow-400 opacity-90 filter drop-shadow(0 1px 1px rgba(0,0,0,0.7))" />
                        </div>
                    )}
                </div>

                 {/* --- Tipping Status Overlays (Should cover everything else) --- */} 
                 {/* Use a separate container or ensure higher z-index if needed */} 
                 <div className="absolute inset-0 pointer-events-none"> 
                   <AnimatePresence>
                     {isTipping && (
                         <motion.div /* Loading Spinner Overlay */
                              key="tipping"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-sm"
                          >
                               <svg className="animate-spin h-6 w-6 text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                          </motion.div>
                     )}
                     {tipStatus === 'success' && (
                          <motion.div /* Success Checkmark Overlay */
                              key="success"
                              initial={{ scale: 0.5, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.5, opacity: 0 }}
                              className="absolute inset-0 flex items-center justify-center bg-green-600/80 rounded-sm"
                          >
                              <svg className="h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </motion.div>
                      )}
                      {tipStatus === 'error' && (
                          <motion.div /* Error X Overlay */
                              key="error"
                              initial={{ x: -10, opacity: 0 }}
                              animate={{ x: 0, opacity: 1 }}
                              exit={{ x: 10, opacity: 0 }}
                              className="absolute inset-0 flex items-center justify-center bg-red-600/80 rounded-sm"
                          >
                              <svg className="h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </motion.div>
                      )}
                   </AnimatePresence>
                 </div>
            </div>

            {/* Timestamp */} 
            {currentImageNote && (
              <p className="text-[10px] text-purple-500 bg-black/40 px-1 py-0.5 rounded pointer-events-none text-center">
                {timestamp}
              </p>
            )}

          </div>
        )}

        {/* Hidden Toggle Button (Keep outside the info container) */}
        <button
          ref={toggleButtonRef}
          className="absolute opacity-0 pointer-events-none" // Make it truly hidden
          aria-hidden="true"
          tabIndex={-1} // Prevent tabbing
        >
          Focus Target
        </button>
    </div>
  );
};

export default ImageFeed; 