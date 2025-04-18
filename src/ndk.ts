import NDK from "@nostr-dev-kit/ndk";
import { RELAYS } from "./constants";

console.log("ndk.ts: Creating NDK singleton instance...");

const ndkInstance = new NDK({
    explicitRelayUrls: RELAYS,
    // Enable debugging if needed during development
    // debug: true, 
});

console.log("ndk.ts: NDK instance created.");

export default ndkInstance; 