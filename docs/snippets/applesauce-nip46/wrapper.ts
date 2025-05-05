import NDK, { NDKSigner, NDKUser, NDKEvent, NDKUserProfile, NDKRelaySet } from "@nostr-dev-kit/ndk";
import { EventTemplate, NostrEvent } from "nostr-tools";
import { NostrConnectSigner, NostrConnectSignerOptions, Observer, NostrConnectAppMetadata } from "./nostr-connect-signer";
import debug from 'debug';

const logger = debug("Zapsliggers:applesauce-wrapper");

// Interface for the serializable payload
interface NostrConnectWrapperPayload {
    type: "nostrconnect-wrapper";
    remotePubkey?: string;
    relays?: string[];
    // Add bunkerUri if needed for rehydration
    bunkerUri?: string;
}

/**
 * Options for the NostrConnectSignerWrapper.
 * Extends NostrConnectSignerOptions but makes subscription/publish optional
 * as they will be provided by the NDK instance.
 */
export interface NostrConnectWrapperOptions extends Partial<Omit<NostrConnectSignerOptions, 'subscriptionMethod' | 'publishMethod'>> {
    ndk: NDK;
    // AbortSignal for cancellation during connection (optional)
    signal?: AbortSignal;
}

/**
 * Wraps the NostrConnectSigner (from applesauce-signers) to implement
 * the NDKSigner interface, allowing it to be used with an NDK instance.
 */
export class NostrConnectSignerWrapper implements NDKSigner {
    private ndk: NDK;
    private signer: NostrConnectSigner;
    private userPromise: Promise<NDKUser>;
    private _user: NDKUser | undefined;
    private options: NostrConnectWrapperOptions & { bunkerUri?: string };
    private log = logger.extend("Wrapper");

    public remotePubkey: string | undefined;
    public isConnected: boolean = false;

    // pubkey must return string, throw if user not ready
    public get pubkey(): string {
        if (!this._user?.pubkey) {
            throw new Error("Signer not ready: User pubkey not available synchronously.");
        }
        return this._user.pubkey;
    }

    // Expose nip04 from underlying signer
    public get nip04() {
        // Add null check for safety, though signer should be initialized in constructor
        return this.signer?.nip04;
    }

    // Expose nip44 from underlying signer
    public get nip44() {
        // Add null check for safety
        return this.signer?.nip44;
    }

    constructor(options: NostrConnectWrapperOptions & { bunkerUri?: string }) {
        this.ndk = options.ndk;
        this.options = options;
        this.log("Initializing wrapper with options:", {
             relays: options.relays,
             remote: options.remote,
             pubkey: options.pubkey,
             hasSigner: !!options.signer,
             hasOnAuth: !!options.onAuth,
             bunkerUri: options.bunkerUri,
        });

        // NDK-provided subscription method
        const subscriptionMethod: NostrConnectSignerOptions['subscriptionMethod'] = (relays, filters) => {
            this.log("NDK Subscribe called via wrapper:", filters, relays);
            // Use NDKRelaySet for specifying relays
            const relaySet = NDKRelaySet.fromRelayUrls(relays, this.ndk);
            const sub = this.ndk.subscribe(filters, { relaySet: relaySet, closeOnEose: false });

            // Simple adapter for the expected Subscribable interface
            const subscribable = {
                subscribe: (observer: Partial<Observer<NostrEvent>>) => { // Use imported Observer
                    sub.on('event', (event: NDKEvent) => {
                        observer.next?.(event.rawEvent());
                    });
                    sub.on('eose', () => {
                        observer.complete?.();
                    });
                    // NDK doesn't have a direct error event on subscription object?
                    // Errors are typically handled globally or per relay.
                    // We might need a way to forward errors if the signer logic depends on it.
                    this.log("Subscribed to NDK relay events");

                    return {
                        unsubscribe: () => {
                            this.log("Unsubscribing from NDK relay events");
                            sub.stop();
                        }
                    };
                }
            };
            return subscribable;
        };

        // NDK-provided publish method
        const publishMethod: NostrConnectSignerOptions['publishMethod'] = async (relays, event) => {
            this.log("NDK Publish called via wrapper for event:", event.id, relays);
            const ndkEvent = new NDKEvent(this.ndk, event);
            // NDK handles publishing to relays internally
            await ndkEvent.publish(); // Should we specify relays here? NDK might handle it.
            this.log("NDK Publish call completed for event:", event.id);
        };

        // Instantiate the underlying signer
        this.signer = new NostrConnectSigner({
            relays: options.relays || this.ndk.pool.urls(), // Default to NDK pool relays
            remote: options.remote,
            pubkey: options.pubkey,
            signer: options.signer,
            onAuth: options.onAuth,
            subscriptionMethod: subscriptionMethod,
            publishMethod: publishMethod,
        });

        this.remotePubkey = this.signer.remote;
        this.isConnected = this.signer.isConnected;

        // Listen for AbortSignal if provided
        if (options.signal) {
            options.signal.addEventListener('abort', () => {
                this.log("Abort signal received, closing connection.");
                this.close();
            }, { once: true });
        }

        // Initialize user promise (will be resolved after connection/user fetch)
        this.userPromise = new Promise((resolve, reject) => {
            const init = async () => {
                if (options.signal?.aborted) {
                    return reject(new DOMException('Aborted', 'AbortError'));
                }
                try {
                   // If already connected (e.g., fromBunkerURI), fetch user immediately
                   if (this.signer.isConnected) {
                       const pubkey = await this.signer.getPublicKey();
                       this._user = this.ndk.getUser({ hexpubkey: pubkey });
                       this.isConnected = true;
                       this.log("Wrapper connected (pre-connected), user fetched:", pubkey);
                       resolve(this._user);
                   } else if (this.signer.remote) {
                       // Wait for connection if remote is known but not connected yet
                       this.log("Waiting for signer connection...");
                       await this.signer.waitForSigner(); // This might throw if connection fails
                       if (options.signal?.aborted) {
                           return reject(new DOMException('Aborted', 'AbortError'));
                       }
                       const pubkey = await this.signer.getPublicKey();
                       this._user = this.ndk.getUser({ hexpubkey: pubkey });
                       this.isConnected = true;
                       this.log("Wrapper connected (waited), user fetched:", pubkey);
                       resolve(this._user);
                   } else {
                        // Case: QR Code flow (remote not known initially)
                        // Wait for the signer to connect via the nostrconnect protocol
                        this.log("Waiting for nostrconnect:// connection...");
                        try {
                            await this.signer.waitForSigner(); // Assume waitForSigner handles this case
                            if (options.signal?.aborted) {
                                return reject(new DOMException('Aborted', 'AbortError'));
                            }
                            const pubkey = await this.signer.getPublicKey();
                            this._user = this.ndk.getUser({ hexpubkey: pubkey });
                            this.isConnected = true;
                            this.log("Wrapper connected (nostrconnect), user fetched:", pubkey);
                            resolve(this._user);
                        } catch (connectError) {
                            this.log("Error waiting for nostrconnect connection:", connectError);
                            this.isConnected = false;
                            this.close(); // Ensure cleanup on error
                            reject(connectError); // Reject with the connection error
                        }
                   }
                } catch (error) {
                    this.log("Error during initial user fetch/connection wait:", error);
                    this.isConnected = false;
                    this.close(); // Ensure cleanup on error
                    reject(error);
                }
           };
           init();
        });
    }

    // blockUntilReady must return Promise<NDKUser>
    public async blockUntilReady(): Promise<NDKUser> {
        this.log("blockUntilReady called, awaiting userPromise...");
        const user = await this.userPromise; // Await and return the user
        this.log("blockUntilReady completed.");
        return user;
    }

    // userSync must be a getter returning NDKUser, throw if not ready
    public get userSync(): NDKUser {
        if (!this._user) {
            throw new Error("Signer not ready: User not available synchronously.");
        }
        return this._user;
    }

    // Add passthrough method for generating nostrconnect URI
    public getNostrConnectURI(metadata?: NostrConnectAppMetadata): string {
        this.log("Generating nostrconnect URI via underlying signer");
        // Assumes the underlying signer instance (`this.signer`) is available
        return this.signer.getNostrConnectURI(metadata);
    }

    // toPayload must return string (JSON serialized)
    public toPayload(): string {
        this.log("toPayload called");
        const payload: NostrConnectWrapperPayload = {
            type: "nostrconnect-wrapper",
            remotePubkey: this.signer.remote,
            relays: this.signer.relays,
            bunkerUri: this.options.bunkerUri, // Include bunkerUri if available
        };
        return JSON.stringify(payload);
    }

    public async user(): Promise<NDKUser> {
        return this.userPromise;
    }

    public async authUrl(url: string): Promise<void> {
        if (this.signer.onAuth) {
            return this.signer.onAuth(url);
        } else {
            this.log("No onAuth handler configured for URL:", url);
            return Promise.resolve();
        }
    }

    async encrypt(user: NDKUser | NDKUserProfile | string, value: string): Promise<string> {
        const targetUser = typeof user === 'string' ? this.ndk.getUser({hexpubkey: user}) : user;
        const targetPubkey = targetUser.pubkey;
        if (!targetPubkey) throw new Error("Target user pubkey is not available for encryption");

        // Prioritize NIP-04 for Kind 4 DMs
        if (!this.signer.nip04?.encrypt) {
            this.log("NIP-04 encrypt method not found on underlying signer!");
            // Optionally, fallback to NIP-44 if desired and available?
            // if (!this.signer.nip44?.encrypt) {
            //     throw new Error("Neither NIP-04 nor NIP-44 encrypt available on signer");
            // }
            // this.log(`Encrypting for ${targetPubkey} using NIP-44 (fallback)`);
            // return this.signer.nip44.encrypt(targetPubkey as string, value);
            throw new Error("NIP-04 encrypt not available on signer"); // Strict NIP-04 for now
        }
        this.log(`Encrypting for ${targetPubkey} using NIP-04`);
        // Explicitly cast targetPubkey to string if linter complains
        return this.signer.nip04.encrypt(targetPubkey as string, value);
    }

    async decrypt(user: NDKUser | NDKUserProfile | string, value: string): Promise<string> {
        const targetUser = typeof user === 'string' ? this.ndk.getUser({hexpubkey: user}) : user;
        const targetPubkey = targetUser.pubkey;
         if (!targetPubkey) throw new Error("Target user pubkey is not available for decryption");

        // Determine if NIP-04 or NIP-44 based on ciphertext format (basic check)
        const useNip44 = !value.includes("?iv="); // Simple heuristic, might need refinement

        if (useNip44) {
            if (!this.signer.nip44?.decrypt) {
                throw new Error("NIP-44 decrypt not available on signer");
            }
            this.log(`Decrypting from ${targetPubkey} using NIP-44`);
            // Explicitly cast targetPubkey to string if linter complains
            return this.signer.nip44.decrypt(targetPubkey as string, value);
        } else {
            if (!this.signer.nip04?.decrypt) {
                throw new Error("NIP-04 decrypt not available on signer");
            }
            this.log(`Decrypting from ${targetPubkey} using NIP-04`);
            // Explicitly cast targetPubkey to string if linter complains
            return this.signer.nip04.decrypt(targetPubkey as string, value);
        }
    }

    async sign(event: NostrEvent): Promise<string> {
        this.log(`Signing event kind: ${event.kind}`);
        // NDKSigner requires signing a NostrEvent. Convert to EventTemplate for the underlying signer.
        // The underlying signer (nostr-connect-signer) should handle adding the pubkey correctly.
        const template: EventTemplate = {
            kind: event.kind,
            tags: event.tags,
            content: event.content,
            created_at: event.created_at || Math.floor(Date.now() / 1000),
            // Do NOT add pubkey here, nostr-connect-signer/SimpleSigner should use the correct one
        };

        // Ensure the underlying signer is connected and has the user's pubkey available
        await this.signer.requireConnection(); // This ensures connection and implicitly the pubkey fetch

        const signedEvent = await this.signer.signEvent(template);

        // Verify the pubkey matches the expected user if possible
        const currentUser = await this.user();
        if (signedEvent.pubkey !== currentUser.pubkey) {
            this.log("Warning: Signed event pubkey mismatch!", { expected: currentUser.pubkey, actual: signedEvent.pubkey });
            throw new Error(`Signed event pubkey (${signedEvent.pubkey}) does not match expected signer pubkey (${currentUser.pubkey})`);
        }

        this.log(`Event signed, id: ${signedEvent.id}, sig: ${signedEvent.sig}`);
        return signedEvent.sig; // NDKSigner interface expects only the signature string
    }

    /**
     * Connects the underlying NostrConnectSigner.
     * Typically used when the wrapper is instantiated directly without fromBunkerURI.
     */
    async connect(secret?: string, permissions?: string[]): Promise<void> {
        if (!this.signer.remote) {
             throw new Error("Cannot connect: Remote pubkey not specified.");
        }
        if (this.isConnected) {
             this.log("Connect called but already connected.");
             return;
        }
        this.log("Attempting explicit connect call...");
        try {
            await this.signer.connect(secret, permissions);
            this.isConnected = this.signer.isConnected;
             // Re-trigger user fetch if connection succeeds here
             const pubkey = await this.signer.getPublicKey();
             this._user = this.ndk.getUser({ hexpubkey: pubkey });
             this.log("Explicit connect succeeded, user fetched:", pubkey);
             // Resolve the initial user promise if it was waiting for connection
             // This might need refinement - userPromise is likely already rejected or resolved
        } catch (error) {
            this.log("Explicit connect failed:", error);
            this.isConnected = false;
            this.close(); // Ensure cleanup
            throw error;
        }
    }

    /**
     * Closes the connection and cleans up resources.
     */
    public close(): void {
        this.log("Closing wrapper and underlying signer connection.");
        this.signer.close();
        this.isConnected = false;
        this._user = undefined;
        // Reset user promise? Or let it stay rejected/resolved?
    }

    /**
     * Static helper to create a wrapper instance from a bunker URI.
     */
    static async fromBunkerURI(uri: string, options: NostrConnectWrapperOptions): Promise<NostrConnectSignerWrapper> {
        const log = logger.extend("Wrapper:fromBunkerURI"); // Use extended logger
        log("Creating wrapper from bunker URI:", uri);
        const { remote, relays } = NostrConnectSigner.parseBunkerURI(uri);

        // Merge parsed URI parts with provided options, include bunkerUri
        const combinedOptions: NostrConnectWrapperOptions & { bunkerUri?: string } = {
            ...options,
            remote,
            relays,
            bunkerUri: uri, // Store the original URI
        };

        const wrapper = new NostrConnectSignerWrapper(combinedOptions);

        // The constructor now handles waiting for connection and fetching the user
        // if the connection is established via fromBunkerURI/connect.
        // We await the userPromise here to ensure connection is attempted.
        try {
             if (options.signal?.aborted) {
                 throw new DOMException('Aborted', 'AbortError');
             }
            await wrapper.user(); // Await the initial user fetch/connection attempt
            log("Wrapper created successfully from bunker URI, connected:", wrapper.isConnected);
        } catch (error) {
             // Correct logger usage
             log("Failed to connect or fetch user during fromBunkerURI: %o", error);
             // Even if connection failed, return the wrapper instance for potential debugging/retry?
             // Or should we re-throw?
             throw error; // Re-throw for now
        }

        return wrapper;
    }
} 