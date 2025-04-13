import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code'; // Import QRCode
import MediaFeed from './components/MediaFeed';
import MessageBoard from './components/MessageBoard'; // Re-enable import
import Podcastr from './components/Podcastr'; // Import renamed Podcastr
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
    {/* Outermost div: Has padding, border, AND background */}
    <div className="relative flex flex-col min-h-screen h-screen text-white border-4 border-purple-600 pt-8 bg-black">
      {/* Absolute Positioned Titles (Remain the same) */}
      <h2 className="absolute top-4 right-32 z-20 text-lg font-semibold text-purple-800 px-4 py-1 rounded">
        Mad⚡str.tv
      </h2>
      <h2 className="absolute top-1/2 left-32 -translate-y-1/2 z-30 text-lg font-semibold text-purple-800 px-4 py-1 rounded">
        📺 TV Feed 🎉
      </h2>

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

      {/* Inner wrapper: Fills space below padding, NO background, NO border */}
      <div className="relative flex flex-col flex-grow min-h-0 overflow-hidden">

        {/* MediaFeed Area (Top Section) */}
        {isLoadingAuthors ? (
            <div className="relative w-full flex-grow min-h-0 bg-black flex items-center justify-center overflow-hidden">
                <p className="text-gray-400">Loading author list...</p>
            </div>
         ) : (
            <div className="relative w-full flex-grow min-h-0 bg-black flex items-center justify-center overflow-hidden">
                <MediaFeed authors={mediaAuthors} />
            </div>
         )}

        {/* Split Screen Container: Fixed Height, Flex Row */}
        <div className="relative w-full h-1/3 flex-shrink-0 flex flex-row overflow-hidden"> {/* Fixed height, Flexbox row */}
            
            {/* Message Board Container (Left Side - 2/3 width) */}
            <div className="w-2/3 h-full flex-shrink-0 overflow-y-auto bg-gray-900 border-r border-gray-700"> {/* Width 2/3, Scroll, Border Right */}
                {ndk ? (
                    <MessageBoard 
                      ndk={ndk} 
                      neventToFollow={MAIN_THREAD_NEVENT_URI} 
                      authors={mediaAuthors}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center"> {/* Centering placeholder */}
                        <p className="text-gray-400">Initializing Nostr connection...</p>
                    </div>
                )}
            </div> {/* End Message Board Container */} 

            {/* Podcastr Container (Right Side - 1/3 width) - Remove Background & Border */}
            <div className="w-1/3 h-full flex-shrink-0 overflow-hidden"> 
                {ndk ? (
                    <Podcastr 
                        authors={mediaAuthors} 
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center"> 
                      <p className="text-gray-400">Initializing Nostr...</p> 
                    </div>
                )}
            </div>

        </div> {/* End Split Screen Container */} 

      </div> {/* End Inner Wrapper */} 
    </div> {/* End Outermost Div */} 
    </>
  );
}

export default App;
