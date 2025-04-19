import NDK from "@nostr-dev-kit/ndk";
import { RELAYS } from "./constants";

console.log("ndk.ts: Creating NDK singleton instance...");

const ndkInstance = new NDK({
    explicitRelayUrls: RELAYS,
    // Enable debugging if needed during development
    // debug: true, 
});

// Attempt to connect immediately - NDK handles reconnect logic internally
// We'll also call connect explicitly in App.tsx useEffect for good measure
ndkInstance.connect().catch((error) => {
    console.error("ndk.ts: Initial singleton connection attempt failed:", error);
});

console.log("ndk.ts: NDK instance created and connection initiated.");

export default ndkInstance; 