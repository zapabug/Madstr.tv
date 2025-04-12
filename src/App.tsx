import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code'; // Import QRCode
import MediaFeed from './components/MediaFeed';
import MessageBoard from './components/MessageBoard';
import RelayStatus from './components/RelayStatus'; // Import the new component
import { nip19 } from 'nostr-tools';
import { MAIN_THREAD_NEVENT_URI, RELAYS } from './constants';
import { useNdk } from 'nostr-hooks'; // Import the main hook

// Public key for this TV instance (used for displaying QR code)
const TV_PUBKEY_NPUB = 'npub1a5ve7g6q34lepmrns7c6jcrat93w4cd6lzayy89cvjsfzzwnyc4s6a66d8';

// Function to safely decode npub
function getHexPubkey(npub: string): string | null {
    try {
        return nip19.decode(npub).data as string;
    } catch (e) {
        console.error(`Failed to decode npub ${npub}:`, e);
        return null;
    }
}

function App() {
  // Initialize NDK
  const { initNdk, ndk } = useNdk();
  const [mediaAuthors, setMediaAuthors] = useState<string[]>([]); // State for media authors
  const [isLoadingAuthors, setIsLoadingAuthors] = useState<boolean>(true); // Loading state for authors

  useEffect(() => {
    console.log("App: Initializing NDK...");
    initNdk({
      explicitRelayUrls: RELAYS,
      // debug: true, // Uncomment for verbose NDK logs
      // Add signer here if needed in the future
    });
  }, [initNdk]);

  useEffect(() => {
    if (ndk) {
      console.log("App: Connecting NDK...");
      ndk.connect().then(() => console.log("App: NDK Connected.")).catch(err => console.error("App: NDK Connection Error", err));
    }
  }, [ndk]);

  // Effect to Connect NDK and Fetch Kind 3 List
  useEffect(() => {
    if (!ndk) return;

    const connectAndFetch = async () => {
        console.log("App: Connecting NDK...");
        try {
            await ndk.connect();
            console.log("App: NDK Connected.");

            // Fetch Kind 3 list after connecting
            const tvPubkeyHex = getHexPubkey(TV_PUBKEY_NPUB);
            if (!tvPubkeyHex) {
                console.error("App: Invalid TV_PUBKEY_NPUB, cannot fetch authors.");
                setIsLoadingAuthors(false);
                return;
            }

            console.log(`App: Fetching Kind 3 contact list for ${tvPubkeyHex}...`);
            setIsLoadingAuthors(true);
            const kind3Event = await ndk.fetchEvent({ kinds: [3], authors: [tvPubkeyHex], limit: 1 });

            if (kind3Event) {
                console.log("App: Found Kind 3 event:", kind3Event.rawEvent());
                const followed = kind3Event.tags
                    .filter(tag => tag[0] === 'p' && tag[1])
                    .map(tag => tag[1]); // These are hex pubkeys
                const authors = Array.from(new Set([tvPubkeyHex, ...followed]));
                console.log(`App: Setting media authors (TV + follows):`, authors);
                setMediaAuthors(authors);
            } else {
                console.warn("App: No Kind 3 event found for TV pubkey. Media feed will be empty unless TV posts itself.");
                // Set authors to only the TV's pubkey if you want it to show its own posts
                // setMediaAuthors([tvPubkeyHex]); 
                setMediaAuthors([]); // Set to empty if only followed should show
            }
        } catch (err) {
            console.error("App: NDK Connection or Kind 3 Fetch Error", err);
        } finally {
            setIsLoadingAuthors(false);
        }
    };

    connectAndFetch();

  }, [ndk]); // Re-run when NDK instance is available

  // --- Remove old state logic placeholders ---
  // const mediaNotes: any[] = []; // Removed placeholder
  // const inboxNotes: any[] = []; // Removed placeholder
  // const isLoadingMediaContacts = false; // Replaced by isLoadingAuthors
  const isReceivingData = false; // Placeholder for RelayStatus
  // --> End Placeholder ---

  // --> Use the nevent URI directly for the QR code value <--
  const qrValue = MAIN_THREAD_NEVENT_URI || '';
  if (!qrValue) {
      console.warn("App.tsx: MAIN_THREAD_NEVENT_URI is not set in constants.ts. QR code will be empty.");
  }

  return (
    // Ensure min-height and flex column layout
    <div className="relative flex flex-col min-h-screen h-screen bg-gray-900 text-white">
      {/* --> Moved Thread QR Code to Bottom Left <-- */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-col items-center">
          {/* QR Code Container */}
          <div className="bg-white p-1 rounded shadow-lg w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:w-24 mb-1">
              {qrValue ? (
                <QRCode
                  value={qrValue} // Use the generated nostr:note1... URI
                  size={256} // Max internal size
                  style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                  viewBox={`0 0 256 256`}
                  level="L"
                />
              ) : (
                // Optionally render a placeholder if qrValue is empty
                <div className="w-full h-full flex items-center justify-center text-black text-xs text-center">No Thread ID</div>
              )}
          </div>
          {/* Subtle Title */}
          <p className="text-xs text-gray-400 font-semibold">Reply here</p>
      </div>

      {/* Relay Status Display (Bottom Left) - May need adjustment if overlapping */}
      {/* --> Keep RelayStatus, adjust positioning if needed <-- */}
      {/* Let's move RelayStatus slightly above the QR code maybe? Or to another corner? */}
      {/* For now, let's keep it but be aware of potential overlap */}
      <RelayStatus isReceivingData={isReceivingData} />

      {/* Pass authors list to MediaFeed */}
      {isLoadingAuthors ? (
          <div className="relative w-full h-[60%] bg-black flex items-center justify-center overflow-hidden">
              <p className="text-gray-400">Loading author list...</p>
          </div>
       ) : (
          <MediaFeed authors={mediaAuthors} />
       )}

      {/* MessageBoard now fetches its own data */}
      <MessageBoard />
    </div>
  );
}

export default App;
