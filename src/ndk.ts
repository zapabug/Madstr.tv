import NDK from "@nostr-dev-kit/ndk";
import { RELAYS } from "./constants";

console.log("ndk.ts: Creating NDK singleton instance...");

const ndkInstance = new NDK({
    explicitRelayUrls: RELAYS,
    // Removed debug: true as it caused errors
});

// Add relay status listeners
ndkInstance.pool.on('relay:connect', (relay) => {
    console.log(`NDK: Connected to relay: ${relay.url}`);
});

ndkInstance.pool.on('relay:disconnect', (relay) => {
    console.log(`NDK: Disconnected from relay: ${relay.url}`);
    // NDK will attempt to reconnect automatically
});

console.log("ndk.ts: NDK instance created.");

export default ndkInstance; 