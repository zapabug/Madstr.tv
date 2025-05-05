import { EventTemplate, Filter, kinds, NostrEvent, verifyEvent, getPublicKey } from "nostr-tools";
import { nanoid } from "nanoid";
import debug from 'debug'; // Use debug library

// Local imports (adjusted)
import { Nip07Interface } from "./types";
import { SimpleSigner } from "./simple-signer";
import { Deferred, createDefer, isHexKey, unixNow, isNIP04 } from "./helpers";

// Setup logger using debug
const logger = debug("Zapsliggers:applesauce-nip46"); // Changed namespace

// --- Start of copied code from packages/signers/src/signers/nostr-connect-signer.ts ---
// (Removed original imports for local files/applesauce-core, adjusted SimpleSigner usage)

export function isErrorResponse(response: any): response is NostrConnectErrorResponse {
  return !!response.error;
}

export enum Permission {
  GetPublicKey = "get_pubic_key", // Typo in original? Should be public_key? Keeping as is.
  SignEvent = "sign_event",
  Nip04Encrypt = "nip04_encrypt",
  Nip04Decrypt = "nip04_decrypt",
  Nip44Encrypt = "nip44_encrypt",
  Nip44Decrypt = "nip44_decrypt",
}

export enum NostrConnectMethod {
  Connect = "connect",
  CreateAccount = "create_account",
  GetPublicKey = "get_public_key",
  SignEvent = "sign_event",
  Nip04Encrypt = "nip04_encrypt",
  Nip04Decrypt = "nip04_decrypt",
  Nip44Encrypt = "nip44_encrypt",
  Nip44Decrypt = "nip44_decrypt",
}
type RequestParams = {
  [NostrConnectMethod.Connect]: [string] | [string, string] | [string, string, string];
  [NostrConnectMethod.CreateAccount]: [string, string] | [string, string, string] | [string, string, string, string];
  [NostrConnectMethod.GetPublicKey]: [];
  [NostrConnectMethod.SignEvent]: [string];
  [NostrConnectMethod.Nip04Encrypt]: [string, string];
  [NostrConnectMethod.Nip04Decrypt]: [string, string];
  [NostrConnectMethod.Nip44Encrypt]: [string, string];
  [NostrConnectMethod.Nip44Decrypt]: [string, string];
};
type ResponseResults = {
  [NostrConnectMethod.Connect]: "ack";
  [NostrConnectMethod.CreateAccount]: string;
  [NostrConnectMethod.GetPublicKey]: string;
  [NostrConnectMethod.SignEvent]: string; // Should be NostrEvent? JSON string in original
  [NostrConnectMethod.Nip04Encrypt]: string;
  [NostrConnectMethod.Nip04Decrypt]: string;
  [NostrConnectMethod.Nip44Encrypt]: string;
  [NostrConnectMethod.Nip44Decrypt]: string;
};

export type NostrConnectRequest<N extends NostrConnectMethod> = { id: string; method: N; params: RequestParams[N] };
export type NostrConnectResponse<N extends NostrConnectMethod> = {
  id: string;
  result: ResponseResults[N];
  error?: string;
};
export type NostrConnectErrorResponse = {
  id: string;
  result: string; // Should this be something else? Keeping as string
  error: string;
};

async function defaultHandleAuth(url: string) {
  // Consider if window.open is appropriate in Zapsliggers's context
  // Maybe pass this in via options?
  if (typeof window !== 'undefined' && window.open) {
    window.open(url, "auth", "width=400,height=600,resizable=no,status=no,location=no,toolbar=no,menubar=no");
  } else {
    logger("Auth URL (cannot open window):", url);
  }
}

// simple types copied from rxjs
interface Unsubscribable {
  unsubscribe(): void;
}
interface Observer<T> {
  next: (value: T) => void;
  error: (err: any) => void;
  complete: () => void;
}
type Subscribable<T extends unknown> = {
  subscribe: (observer: Partial<Observer<T>>) => Unsubscribable;
};

// These types will be provided by NDK's subscription/publish methods
export type NostrSubscriptionMethod = (relays: string[], filters: Filter[]) => Subscribable<NostrEvent>;
export type NostrPublishMethod = (relays: string[], event: NostrEvent) => void | Promise<void>;


export type NostrConnectSignerOptions = {
  /** The relays to communicate over */
  relays: string[];
  /** A {@link SimpleSigner} for this client */
  signer?: SimpleSigner;
  /** pubkey of the remote signer application */
  remote?: string;
  /** Users pubkey */
  pubkey?: string;
  /** A method for handling "auth" requests */
  onAuth?: (url: string) => Promise<void>;
  /** A method for subscribing to relays */
  subscriptionMethod: NostrSubscriptionMethod; // Made required
  /** A method for publishing events */
  publishMethod: NostrPublishMethod; // Made required
};


export type NostrConnectAppMetadata = {
  name?: string;
  image?: string;
  url?: string | URL;
  permissions?: string[];
};

export class NostrConnectSigner implements Nip07Interface {
  /** A method that is called when an event needs to be published */
  protected publishMethod: NostrPublishMethod;

  /** The active nostr subscription */
  protected subscriptionMethod: NostrSubscriptionMethod;

  protected log = logger.extend("NostrConnectSigner"); // Use local logger
  /** The local client signer */
  public signer: SimpleSigner;

  protected subscriptionOpen = false;

  /** Whether the signer is connected to the remote signer */
  isConnected = false;

  /** The users pubkey */
  protected pubkey?: string;
  /** Relays to communicate over */
  relays: string[];
  /** The remote signer pubkey */
  remote?: string;

  /** Client pubkey */
  get clientPubkey() {
    // Need to handle sync/async SimpleSigner.getPublicKey
    // For simplicity, assuming SimpleSigner generates key synchronously in constructor
     return getPublicKey(this.signer.key);
  }

  /** A method for handling "auth" requests */
  public onAuth: (url: string) => Promise<void> = defaultHandleAuth;

  verifyEvent: typeof verifyEvent = verifyEvent;

  /** A secret used when initiating a connection from the client side */
  protected clientSecret = nanoid(12);

  nip04?: Nip07Interface['nip04'];
  nip44?: Nip07Interface['nip44'];

  // Removed static fallback methods for subscription/publish

  constructor(opts: NostrConnectSignerOptions) {
    this.relays = opts.relays;
    this.pubkey = opts.pubkey;
    this.remote = opts.remote;

    // Directly use provided methods
    if (!opts.subscriptionMethod) throw new Error("Missing subscriptionMethod");
    if (!opts.publishMethod) throw new Error("Missing publishMethod");
    this.subscriptionMethod = opts.subscriptionMethod;
    this.publishMethod = opts.publishMethod;


    if (opts.onAuth) this.onAuth = opts.onAuth;

    // Ensure SimpleSigner is instantiated correctly
    this.signer = opts?.signer || new SimpleSigner();

    // Bind methods for nip04/nip44 interface compliance
    this.nip04 = {
      encrypt: this.nip04Encrypt.bind(this),
      decrypt: this.nip04Decrypt.bind(this),
    };
    this.nip44 = {
      encrypt: this.nip44Encrypt.bind(this),
      decrypt: this.nip44Decrypt.bind(this),
    };
  }

  /** The currently active REQ subscription */
  protected req?: Unsubscribable;

  /** Open the connection */
  async open() {
    if (this.subscriptionOpen) return;

    this.subscriptionOpen = true;
    const clientPubkey = this.clientPubkey; // Get client pubkey

    // Setup subscription
    this.req = this.subscriptionMethod(this.relays, [
      {
        kinds: [kinds.NostrConnect],
        "#p": [clientPubkey], // Use client pubkey here
      },
    ]).subscribe({
      next: (event) => this.handleEvent(event),
      error: (err) => this.log("Subscription error:", err), // Added error handling
      complete: () => this.log("Subscription complete"), // Added complete handling
    });

    this.log("Opened subscription", this.relays);
  }

  /** Close the connection */
  async close() {
    this.subscriptionOpen = false;
    this.isConnected = false;
    this.req?.unsubscribe();
    this.requests.forEach(r => r.reject('Connection closed')); // Reject pending requests
    this.requests.clear();
    this.waitingPromise?.reject('Connection closed'); // Reject waiting promise
    this.waitingPromise = null;
    this.log("Closed");
  }

  protected requests = new Map<string, Deferred<any>>();
  protected auths = new Set<string>(); // What is this used for? (Not obvious from code)

  /** Call this method with incoming events */
  public async handleEvent(event: NostrEvent) {
    if (!this.verifyEvent(event)) {
        this.log("Ignoring invalid event", event.id);
        return;
    }

    // ignore the event if its not from the expected remote signer (if known)
    if (this.remote && event.pubkey !== this.remote) {
        this.log("Ignoring event from unexpected pubkey", event.pubkey, "expected", this.remote);
        return;
    }
    // ignore events not addressed to us
     if (!event.tags.some(t => t[0] === 'p' && t[1] === this.clientPubkey)) {
        this.log("Ignoring event not tagged to client", event.id, "client", this.clientPubkey);
        return;
     }


    try {
      // Decrypt content using the local SimpleSigner
      const responseStr = isNIP04(event.content)
        ? await this.signer.nip04.decrypt(event.pubkey, event.content)
        : await this.signer.nip44.decrypt(event.pubkey, event.content);
      const response = JSON.parse(responseStr) as NostrConnectResponse<any> | NostrConnectErrorResponse;

      this.log("Received response:", response);

      // handle initial connection acknowledgment / secret confirmation
      if (!this.remote && response.result === "ack") { // Original had clientSecret check too
        this.log("Got ack response from potential remote signer", event.pubkey);
        this.isConnected = true;
        this.remote = event.pubkey; // Assume sender is the remote signer now
        this.waitingPromise?.resolve();
        this.waitingPromise = null;
        return;
      }
      // Handle case where we initiated with secret and get it back
       if (!this.isConnected && response.result === this.clientSecret) {
         this.log("Got secret confirmation from remote signer", event.pubkey);
         this.isConnected = true;
         if (!this.remote) this.remote = event.pubkey; // Should already be set, but belt & braces
         this.waitingPromise?.resolve(); // In case we were waiting
         this.waitingPromise = null;
         return;
       }


      // Resolve pending requests
      if (response.id && this.requests.has(response.id)) {
        const request = this.requests.get(response.id);
        if (isErrorResponse(response)) {
          this.log("Request error:", response.id, response.error);
          request?.reject(new Error(response.error));
        } else {
           this.log("Request success:", response.id, response.result);
          request?.resolve(response.result);
        }
        this.requests.delete(response.id);
      } else {
          this.log("Received response for unknown/untracked request ID:", response.id);
      }

    } catch (e) {
      this.log("Failed to handle event", event.id, e);
    }
  }

  protected async createRequestEvent(content: string, target = this.remote, kind = kinds.NostrConnect): Promise<NostrEvent> {
      if (!target) throw new Error("Target pubkey not known for request");

      const encryptedContent = await this.signer.nip44.encrypt(target, content); // Use NIP-44 by default? Original checked isNIP04

      const template: EventTemplate = {
        kind,
        created_at: unixNow(),
        content: encryptedContent,
        tags: [['p', target]],
      };
      // signEvent should return a full NostrEvent
      return this.signer.signEvent(template);
  }


  private async makeRequest<T extends NostrConnectMethod>(
    method: T,
    params: RequestParams[T],
    kind = kinds.NostrConnect,
  ): Promise<ResponseResults[T]> {
    const id = nanoid(8);
    const request: NostrConnectRequest<T> = { id, method, params };
    const event = await this.createRequestEvent(JSON.stringify(request), this.remote, kind);

    const deferred = createDefer<ResponseResults[T]>();
    this.requests.set(id, deferred);

    this.log("Making request:", id, method, params);
    await this.publishMethod(this.relays, event); // Use injected publish method

    // Timeout for request
    const timeout = setTimeout(() => {
        if (this.requests.has(id)) {
            this.log("Request timeout:", id);
            this.requests.get(id)?.reject(new Error("Request timed out"));
            this.requests.delete(id);
        }
    }, 30000); // 30 second timeout

    try {
        const result = await deferred;
        clearTimeout(timeout);
        return result;
    } catch (e) {
        clearTimeout(timeout);
         this.requests.delete(id); // Clean up just in case
        throw e; // Re-throw error
    }
  }

  async connect(secret?: string | undefined, permissions?: string[]): Promise<"ack"> {
    // Attempt to connect to the users pubkey if remote not set
    if (!this.remote && this.pubkey) this.remote = this.pubkey;

    if (!this.remote) throw new Error("Missing remote signer pubkey");

    await this.open(); // Ensure subscription is open
    try {
      const params: RequestParams[NostrConnectMethod.Connect] = [this.clientPubkey]; // Param 1 is client pubkey
      if (secret) params.push(secret); // Param 2 is secret (optional)
      if (permissions) params.push(permissions.join(",")); // Param 3 is permissions (optional)


      const result = await this.makeRequest(NostrConnectMethod.Connect, params);
      if (result === "ack") {
          this.isConnected = true;
          return result;
      } else {
          throw new Error(`Unexpected connect response: ${result}`);
      }
    } catch (e) {
      this.isConnected = false; // Ensure state is correct on failure
      this.close(); // Close connection on failure
      throw e;
    }
  }

  private waitingPromise: Deferred<void> | null = null;

  /** Wait for a remote signer to connect */
  waitForSigner(): Promise<void> {
    if (this.isConnected) return Promise.resolve();

    this.open(); // Ensure subscription is open
    if (!this.waitingPromise) { // Create only if not already waiting
        this.waitingPromise = createDefer();
    }
    return this.waitingPromise;
  }

  /** Request to create an account on the remote signer */
  async createAccount(username: string, domain: string, email?: string, permissions?: string[]): Promise<string> {
    if (!this.remote) throw new Error("Remote pubkey must be set");
    await this.open();

    try {
        const params: RequestParams[NostrConnectMethod.CreateAccount] = [username, domain];
        if (email) params.push(email);
        if (permissions) params.push(permissions.join(","));

      const newPubkey = await this.makeRequest(NostrConnectMethod.CreateAccount, params);

      // set the users new pubkey
      this.pubkey = newPubkey;
      this.isConnected = true;
      return newPubkey;
    } catch (e) {
      // Don't assume isConnected is false, depends on error type maybe?
      // Let requireConnection handle re-connect if needed?
      this.log("Create account failed", e);
      throw e;
    }
  }

  /** Ensure the signer is connected to the remote signer */
  async requireConnection() {
    if (!this.isConnected) {
        this.log("Require connection: Not connected, attempting connect...");
        // How to handle connect needing secret/permissions here?
        // Maybe it should only be called after an initial connect/waitForSigner?
        // Or maybe connect should be simpler if called internally?
        // For now, assuming initial connect happened. If not, this will likely fail.
        if (!this.remote) throw new Error("Cannot require connection without remote pubkey");
        // Cannot call this.connect() without secret/perms. Assume already connected or wait.
        await this.waitForSigner(); // Wait if connection pending
        if (!this.isConnected) throw new Error("Failed to establish connection");
         this.log("Require connection: Connection established.");
    }
  }

  /** Get the users pubkey */
  async getPublicKey(): Promise<string> {
    if (this.pubkey) return this.pubkey;

    await this.requireConnection();
    const pk = await this.makeRequest(NostrConnectMethod.GetPublicKey, []);
    this.pubkey = pk; // Cache the pubkey
    return pk;
  }
  /** Request to sign an event */
  async signEvent(template: EventTemplate & { pubkey?: string }): Promise<NostrEvent> {
    await this.requireConnection();
    // Ensure pubkey is set in template if not already
    if (!template.pubkey) {
        template = {...template, pubkey: await this.getPublicKey()};
    }

    const eventString = await this.makeRequest(NostrConnectMethod.SignEvent, [JSON.stringify(template)]);
    const event = JSON.parse(eventString) as NostrEvent;
    if (!this.verifyEvent(event)) throw new Error("Invalid event signature received from remote signer");
    return event;
  }

  // NIP-04
  async nip04Encrypt(pubkey: string, plaintext: string): Promise<string> {
    await this.requireConnection();
    return this.makeRequest(NostrConnectMethod.Nip04Encrypt, [pubkey, plaintext]);
  }
  async nip04Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    await this.requireConnection();
    const plaintext = await this.makeRequest(NostrConnectMethod.Nip04Decrypt, [pubkey, ciphertext]);

    // NOTE: Removed potentially problematic JSON parsing logic from original
    // if (plaintext.startsWith('["') && plaintext.endsWith('"]')) return JSON.parse(plaintext)[0] as string;

    return plaintext;
  }

  // NIP-44
  async nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
    await this.requireConnection();
    return this.makeRequest(NostrConnectMethod.Nip44Encrypt, [pubkey, plaintext]);
  }
  async nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    await this.requireConnection();
    const plaintext = await this.makeRequest(NostrConnectMethod.Nip44Decrypt, [pubkey, ciphertext]);

    // NOTE: Removed potentially problematic JSON parsing logic from original
    // if (plaintext.startsWith('["') && plaintext.endsWith('"]')) return JSON.parse(plaintext)[0] as string;

    return plaintext;
  }

  /** Returns the nostrconnect:// URI for this signer */
  getNostrConnectURI(metadata?: NostrConnectAppMetadata): string {
    const params = new URLSearchParams();

    params.set("secret", this.clientSecret);
    if (metadata?.name) params.set("name", metadata.name);
    if (metadata?.url) params.set("url", String(metadata.url));
    if (metadata?.image) params.set("image", metadata.image);
    if (metadata?.permissions) params.set("perms", metadata.permissions.join(","));
    for (const relay of this.relays) params.append("relay", relay);

    const clientPubkey = this.clientPubkey;
    return `nostrconnect://${clientPubkey}?${params.toString()}`;
  }

  /** Parses a bunker:// URI */
  static parseBunkerURI(uri: string): { remote: string; relays: string[]; secret?: string } {
    if (!uri.startsWith("bunker://")) throw new Error("Invalid bunker URI scheme");
    const url = new URL(uri);

    // firefox puts pubkey part in host, chrome puts pubkey in pathname
    const remote = url.host || url.pathname.replace(/^\/*/, ""); // Strip leading slashes too
    if (!isHexKey(remote)) throw new Error(`Invalid remote pubkey in bunker URI: ${remote}`);

    const relays = url.searchParams.getAll("relay");
    if (relays.length === 0) throw new Error("Missing relays in bunker URI");
    const secret = url.searchParams.get("secret") ?? undefined;

    return { remote, relays, secret };
  }

  /** Builds an array of signing permissions for event kinds */
  static buildSigningPermissions(kinds: number[]): string[] {
    // Ensure GetPublicKey is included, use correct enum value
    const permissions = new Set<string>([Permission.GetPublicKey, Permission.Nip04Encrypt, Permission.Nip04Decrypt, Permission.Nip44Encrypt, Permission.Nip44Decrypt]);
     kinds.forEach(k => permissions.add(`${Permission.SignEvent}:${k}`));
     return Array.from(permissions);
  }

  /** Create a {@link NostrConnectSigner} from a bunker:// URI */
  static async fromBunkerURI(
    uri: string,
    // Options now require publish/subscribe methods
    options: Omit<NostrConnectSignerOptions, "relays" | "remote" | "pubkey"> & { permissions?: string[] }
  ): Promise<NostrConnectSigner> {
    const { remote, relays, secret } = NostrConnectSigner.parseBunkerURI(uri);

    // Pass required methods from options
    const client = new NostrConnectSigner({ relays, remote, ...options });
    // Connect using the parsed secret and provided permissions
    await client.connect(secret, options?.permissions);

    return client;
  }
}

// --- End of copied code --- 