# NIP-46 QR Code Connection - What We Learned

## Summary

The QR code flow for NIP-46 (remote signer) authentication now works correctly. The key insight was that the handshake protocol has specific requirements that NDK's built-in `NDKNip46Signer.blockUntilReady()` wasn't handling correctly for the QR flow.

## The Problem

### Why NDK's `blockUntilReady()` Failed

NDK's `NDKNip46Signer.blockUntilReady()` has a bug for the QR code flow:

```typescript
// From NDK source: src/signers/nip46/index.ts
public async blockUntilReady(): Promise<NDKUser> {
    // ...
    return new Promise((resolve, reject) => {
        const connectParams = [this.userPubkey ?? ""];
        if (this.secret) connectParams.push(this.secret);

        this.rpc.sendRequest(this.bunkerPubkey, "connect", connectParams, 24133, (response: NDKRpcResponse) => {
            if (response.result === "ack") {
                this.getPublicKey().then((pubkey) => {
                    this.userPubkey = pubkey;  // BUG: This sets userPubkey to pubkey
                    this._user = this.ndk.getUser({ pubkey });
                    resolve(this._user);
                });
            }
        });
    });
}

public async getPublicKey(): Promise<Hexpubkey> {
    if (this.userPubkey) return this.userPubkey;  // BUG: Returns early if userPubkey is set!
    // ...
}
```

**The Bug**: After `connect` returns ACK, `blockUntilReady()` calls `getPublicKey()`. But `getPublicKey()` checks `if (this.userPubkey)` and returns early - meaning it returns the **passphrase pubkey** (the temp key) instead of the actual user's pubkey from the bunker.

### Why the Paste Flow Worked

The paste flow works because the bunker URI contains a `pubkey` parameter that sets the user's pubkey directly:

```
bunker://ed199f...?pubkey=<actual_user_pubkey>&secret=...
```

This bypasses the buggy code path because the userPubkey is already set.

## The Solution

### Manual Handshake Implementation

We implemented the NIP-46 handshake manually for the QR code flow:

```typescript
const initiateNip46Connection = async () => {
    // 1. Generate a temporary key pair
    const tempPrivKeyBytes = generateSecretKey();
    const tempPubKeyHex = getPublicKey(tempPrivKeyBytes);
    const localSigner = new NDKPrivateKeySigner(tempPrivKeyBytes);

    // 2. Create connect URI for QR code display
    const connectUri = `nostrconnect://${tempPubKeyHex}?relay=wss://nsec.app&...`;
    displayQRCode(connectUri);  // User scans with Amber

    // 3. Subscribe to responses
    const filter = { kinds: [24133], '#p': [tempPubKeyHex], since: now - 10 };
    subscription = ndk.subscribe(filter);

    // 4. Send connect request (NO secret for QR flow)
    const connectRequest = { id: "request_id", method: "connect", params: [tempPubKeyHex] };
    const encryptedConnect = await nip44Encrypt(tempPrivKeyBytes, bunkerPubkey, JSON.stringify(connectRequest));
    await publishEncryptedEvent(24133, bunkerPubkey, encryptedConnect);

    // 5. Wait for ACK
    subscription.on('event', async (event) => {
        const response = JSON.parse(nip44Decrypt(tempPrivKeyBytes, event.pubkey, event.content));

        if (response.result === "ack") {
            // 6. IMPORTANT: Send get_public_key WITHOUT secret
            // Connection is already established after ACK!
            const getPkRequest = { id: "new_id", method: "get_public_key", params: [] };
            const encryptedRequest = await nip44Encrypt(tempPrivKeyBytes, event.pubkey, JSON.stringify(getPkRequest));
            await publishEncryptedEvent(24133, event.pubkey, encryptedRequest);
        }

        // 7. Receive and use the actual public key
        if (response.result && response.result !== "ack" && isValidHex(response.result)) {
            const actualUserPubkey = response.result;  // This is the real user pubkey
            // Use this for login
        }
    });
};
```

## Key Lessons

### 1. Don't Trust NDK's `blockUntilReady()` for QR Flow

```typescript
// WRONG for QR flow - will return passphrase pubkey instead of user pubkey
const signer = new NDKNip46Signer(ndk, bunkerUri, localSigner);
const user = await signer.blockUntilReady();  // Buggy!
```

### 2. After ACK, Connection IS Established - No Secret Needed

```typescript
// WRONG - Don't include secret with get_public_key after ACK
const params = [tempPubKeyHex, secret];  // Wrong!
const request = { method: "get_public_key", params };

// CORRECT - No secret needed after ACK
const params = [];
const request = { method: "get_public_key", params };  // Correct!
```

### 3. ID Matching is Asymmetric

The bunker may respond with a different ID than you sent. Check `result === "ack"` instead of ID matching for ACK:

```typescript
// WRONG - ID may not match
if (response.id === connectRequestId && response.result === "ack") { ... }

// CORRECT - Check result directly
if (response.result === "ack") { ... }
```

### 4. For QR Flow, Don't Convert to bunker:// URI

```typescript
// WRONG - Converts to bunker:// which NDK handles differently
const bunkerUri = convertNostrconnectToBunker(connectUri);
const signer = new NDKNip46Signer(ndk, bunkerUri, localSigner);

// CORRECT - Use manual handshake for QR flow
// Parse the pubkey from nostrconnect:// for manual handling
const url = new URL(connectUri);
const passphrasePubkey = url.hostname;  // Use this directly
```

### 5. Always Validate Received Pubkeys

```typescript
const isValidHex = (str) => str && str.length === 64 && /^[a-fA-F0-9]+$/.test(str);

if (response.result && isValidHex(response.result)) {
    const userPubkey = response.result;
    // Safe to use
}
```

## Session Persistence

When saving the session, construct the payload manually:

```typescript
// DON'T rely on signer.toPayload() after manual handshake
// const payload = signer.toPayload();  // Will fail!

// DO construct the payload manually
const payloadObj = {
    type: "nip46",
    payload: {
        bunkerPubkey: bunkerPubkey,
        userPubkey: actualUserPubkey,  // From get_public_key response
        relayUrls: NIP46_RELAYS,
        secret: null,  // No secret for QR flow
        localSignerPayload: localSignerPrivateKey,
        nip05: null,
    },
};
const payload = JSON.stringify(payloadObj);
saveToDb(payload);
```

## Complete Working Code

See `src/hooks/useAuth.ts` - look for `initiateNip46Connection` function for the complete implementation.

## NIP-46 Relay Configuration

```typescript
const NIP46_RELAYS = ['wss://nsec.app', 'wss://relay.damus.io', 'wss://relay.primal.net'];
```

These relays are used for:
1. Including in the QR code URI
2. Subscribing to NIP-46 responses
3. Publishing NIP-46 requests

## Testing Checklist

- [ ] QR code displays correctly
- [ ] Amber scans and shows connection prompt
- [ ] User approves in Amber
- [ ] ACK is received
- [ ] get_public_key returns actual user pubkey (not passphrase)
- [ ] Session saves correctly
- [ ] Session restores on page reload
- [ ] Can sign events after restoration

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `padded hex string expected` | Trying to npubEncode non-hex or wrong value | Validate pubkey is 64-char hex |
| `NIP-46 signer not fully initialized` | Missing required fields for toPayload() | Construct payload manually |
| `Connection timed out` | Relay connectivity or subscription issue | Check relay URLs, verify subscription |
| Returns wrong pubkey | Using NDK's blockUntilReady() | Implement manual handshake |
