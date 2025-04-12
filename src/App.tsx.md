import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code'; // Import QRCode
import MediaFeed from './components/MediaFeed';
import MessageBoard from './components/MessageBoard'; // Re-enable import
import RelayStatus from './components/RelayStatus'; // Import the new component
import { nip19 } from 'nostr-tools';
import { MAIN_THREAD_NEVENT_URI, RELAYS } from './constants';
import { useNdk } from 'nostr-hooks'; // Import the main hook
import { NDKEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk';

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
      // debug: true,
    });
  }, [initNdk]);

  // Effect to Connect NDK and Subscribe to Kind 3 List
  useEffect(() => {
    if (!ndk) return;

    let sub: NDKSubscription | null = null; // Keep track of the subscription
    let foundKind3Event = false; // Flag to track if event was found

    const fetchKind3List = async () => { // Keep async for connect
        console.log("App: Ensuring NDK connection for Kind 3 fetch...");
        try {
            // Connect explicitly before subscribing if not already connected
            // NDK connect() handles multiple calls gracefully
            await ndk.connect();
            console.log("App: NDK Connected. Subscribing to Kind 3 list...");

            const tvPubkeyHex = getHexPubkey(TV_PUBKEY_NPUB);
            if (!tvPubkeyHex) {
                console.error("App: Invalid TV_PUBKEY_NPUB, cannot fetch authors.");
                setIsLoadingAuthors(false);
                return;
            }

            console.log(`App: Subscribing to Kind 3 contact list for ${tvPubkeyHex}...`);
            setIsLoadingAuthors(true); // Set loading before subscribing

            const filter: NDKFilter = { kinds: [3], authors: [tvPubkeyHex], limit: 1 };
            // Use closeOnEose: false to manage loading state accurately with the flag
            sub = ndk.subscribe(filter, { closeOnEose: false });

            sub.on('event', (kind3Event: NDKEvent) => {
                if (foundKind3Event) return; // Process only the first event due to limit: 1 logic

                foundKind3Event = true; // Mark as found
                console.log("App: Found Kind 3 event:", kind3Event.rawEvent());
                const followed = kind3Event.tags
                    .filter(tag => tag[0] === 'p' && tag[1])
                    .map(tag => tag[1]); // These are hex pubkeys
                const authors = Array.from(new Set([tvPubkeyHex, ...followed]));
                console.log(`App: Setting media authors (TV + follows):`, authors);
                setMediaAuthors(authors);
                setIsLoadingAuthors(false); // Stop loading once event found
                sub?.stop(); // Stop subscription after processing the event
            });

            sub.on('eose', () => {
                console.log("App: Kind 3 subscription EOSE received.");
                // If EOSE is received and we haven't found the event yet
                if (!foundKind3Event) {
                    console.warn("App: No Kind 3 event found for TV pubkey after EOSE. Media feed might be empty.");
                    setMediaAuthors([]); // Set to empty if no Kind 3 found
                    setIsLoadingAuthors(false); // Stop loading after EOSE if no event
                    // No need to stop sub here, cleanup will handle it or it stops automatically if relays disconnect
                }
            });

             sub.on('closed', () => {
                console.log("App: Kind 3 subscription closed.");
                // Ensure loading state is false if subscription closes unexpectedly before EOSE/event
                if (isLoadingAuthors && !foundKind3Event) {
                     console.warn("App: Kind 3 subscription closed before event or EOSE. Setting authors empty.");
                     setMediaAuthors([]);
                     setIsLoadingAuthors(false);
                }
            });


        } catch (err) {
            console.error("App: NDK Connection or Kind 3 Subscription Error", err);
            setIsLoadingAuthors(false); // Stop loading on error
        }
    };

    fetchKind3List();

    // Cleanup function
    return () => {
      console.log("App: Cleaning up Kind 3 subscription...");
      sub?.stop(); // Ensure subscription is stopped on unmount or ndk change
    };

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
    <>
    {/* Ensure min-height and flex column layout - PARENT MUST BE RELATIVE */}
    <div className="relative flex flex-col min-h-screen h-screen bg-gray-900 text-white">
      {/* Absolute Positioned Title - REMOVED */}
      {/* <h2 className="absolute top-4 left-1/2 -translate-x-1/2 z-20 text-lg font-semibold text-center text-purple-800 px-4 py-1 bg-gray-900 bg-opacity-75 rounded">
       📺 TV Feed 🎉
      </h2> */}

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
          <div className="relative w-full flex-shrink-0 basis-3/5 bg-black flex items-center justify-center overflow-hidden">
              <p className="text-gray-400">Loading author list...</p>
          </div>
       ) : (
          // Make this container relative to position title within it
          <div className="relative w-full flex-shrink-0 basis-3/5 bg-black flex items-center justify-center overflow-hidden">
              {/* Title positioned absolutely within MediaFeed container */}
              <h2 className="absolute top-2 left-1/2 -translate-x-1/2 z-10 text-lg font-semibold text-center text-purple-800 px-3 py-1 bg-black bg-opacity-60 rounded">
                  📺 TV Feed Fun! 🎉
              </h2>
              {/* MediaFeed component */}
              <MediaFeed authors={mediaAuthors} />
          </div>
       )}

      {/* Message Board Container */}
      {/* Removing flex-col and inner title */}
      <div className="relative w-full flex-grow min-h-0 bg-gray-800 p-4 overflow-y-auto border-4 border-purple-600">
          {/* Title removed from here */}
          {/* <h2 className="text-lg font-semibold mb-2 text-center text-purple-800 flex-shrink-0">
              📺 TV Feed Fun! 🎉
          </h2> */}
          {/* MessageBoard rendering area (removed inner wrapper) */}
          {/* <div className="flex-grow min-h-0 overflow-y-auto">  - Removed inner div */}
              {ndk ? (
                  <MessageBoard 
                    ndk={ndk} 
                    neventToFollow={MAIN_THREAD_NEVENT_URI} 
                    authors={mediaAuthors}
                  />
              ) : (
                  <p className="text-gray-400">Initializing Nostr connection...</p> // Placeholder while ndk is null
              )}
          </div>
      </div>

    </div>
    </>
  );
}

export default App;
