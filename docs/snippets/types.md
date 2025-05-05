// From packages/signers/src/nip-07.ts
import { EventTemplate, NostrEvent } from "nostr-tools";

export type Nip07Interface = {
  getPublicKey: () => Promise<string> | string;
  signEvent: (template: EventTemplate) => Promise<NostrEvent> | NostrEvent;
  getRelays?: () =>
    | Record<string, { read: boolean; write: boolean }>
    | Promise<Record<string, { read: boolean; write: boolean }>>;
  nip04?: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string> | string;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string> | string;
  };
  nip44?: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string> | string;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string> | string;
  };
}; 