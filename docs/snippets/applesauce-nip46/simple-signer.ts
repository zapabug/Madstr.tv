// From packages/signers/src/signers/simple-signer.ts
import { Buffer } from 'buffer'; // Import Buffer
import { EventTemplate, finalizeEvent, generateSecretKey, getPublicKey, nip04, nip44, NostrEvent } from "nostr-tools";
import { Nip07Interface } from "./types"; // Import local type

/** A Simple NIP-07 signer class */
export class SimpleSigner implements Nip07Interface {
  key: Uint8Array;
  constructor(key?: Uint8Array | string) {
    // Allow passing hex key string
    if (typeof key === 'string') {
      if (key.match(/^[0-9a-f]{64}$/i)) {
          this.key = Uint8Array.from(Buffer.from(key, 'hex'));
      } else {
          throw new Error('Invalid private key format');
      }
    } else {
        this.key = key || generateSecretKey();
    }
  }

  getPublicKey(): Promise<string> {
    return Promise.resolve(getPublicKey(this.key));
  }
  signEvent(event: EventTemplate): Promise<NostrEvent> {
    // Ensure event is finalized correctly
    const signedEvent = finalizeEvent(event, this.key);
    return Promise.resolve(signedEvent);
  }

  nip04 = {
    encrypt: (pubkey: string, plaintext: string): Promise<string> => {
        return Promise.resolve(nip04.encrypt(this.key, pubkey, plaintext));
    },
    decrypt: (pubkey: string, ciphertext: string): Promise<string> => {
        return Promise.resolve(nip04.decrypt(this.key, pubkey, ciphertext));
    }
  };
  nip44 = {
    encrypt: (pubkey: string, plaintext: string): Promise<string> => {
        const conversationKey = nip44.v2.utils.getConversationKey(this.key, pubkey);
        return Promise.resolve(nip44.v2.encrypt(plaintext, conversationKey));
    },
    decrypt: (pubkey: string, ciphertext: string): Promise<string> => {
        const conversationKey = nip44.v2.utils.getConversationKey(this.key, pubkey);
        return Promise.resolve(nip44.v2.decrypt( ciphertext, conversationKey)); // Added missing space for clarity
    }
  };
} 