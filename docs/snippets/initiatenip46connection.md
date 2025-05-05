const initiateNip46Connection = useCallback(async () => {
    if (!ndkInstance) {
        setAuthError("NDK not initialized.");
        return;
    }
    if (isGeneratingUri || nip46ConnectUri) {
        console.log("NIP-46 connection already in progress or URI generated.");
        return; // Prevent multiple simultaneous attempts
    }

    console.log("Initiating NIP-46 connection...");
    setIsGeneratingUri(true);
    setAuthError(null);
    cleanupNip46Attempt(); // Clean up any previous attempt first

    try {
        // 1. Generate a temporary local key pair for this connection attempt
        const localAppSecretKey = generateSecretKey();
        const localAppPubKey = getPublicKey(localAppSecretKey);
        nip46TempPrivKeyRef.current = localAppSecretKey; // Store for later use

        // 2. Create the connection URI (bunker://...)
        const connectUri = nip19.nip46connectEncode(localAppPubKey, RELAYS); // Use your app's relays
        setNip46ConnectUri(connectUri);
        console.log("Generated NIP-46 URI:", connectUri);
        setIsGeneratingUri(false); // URI is generated, waiting for connection

        // 3. Create a TEMPORARY NDKNip46Signer instance using the *temporary* local key
        // This signer listens for the remote signer to connect back
        const tempNip46Signer = new NDKNip46Signer(ndkInstance, connectUri, new NDKPrivateKeySigner(localAppSecretKey));
        ndkInstance.signer = tempNip46Signer; // Temporarily set NDK signer to listen

        console.log("NIP-46: Waiting for remote signer connection...");

        // 4. Set a timeout for the connection attempt
        nip46TimeoutRef.current = setTimeout(() => {
            console.error("NIP-46 connection timed out.");
            setAuthError("Connection timed out. Please try again.");
            cleanupNip46Attempt();
        }, NIP46_CONNECT_TIMEOUT);

        // 5. Wait for the signer to be ready (remote signer connects and authenticates)
        // NDKNip46Signer emits 'authUrl' event which isn't standard NDK behavior shown here.
        // The standard way is to wait for blockUntilReady or listen for connect events.
        // This part might differ based on the exact NDKNip46Signer implementation details.
        // A common pattern is waiting for `blockUntilReady`.

        await tempNip46Signer.blockUntilReady(); // Wait for handshake completion

        // 6. If successful, get the *remote* user's pubkey
        const remoteUser: NDKUser = await tempNip46Signer.user();
        const remoteSignerPubkeyHex = remoteUser.pubkey;

        console.log("NIP-46 Signer connected! Remote Pubkey:", remoteSignerPubkeyHex);

        // 7. Success! Clear temporary data, set permanent state
        clearTimeout(nip46TimeoutRef.current!);
        nip46TimeoutRef.current = null;
        nip46SubscriptionRef.current = null; // Clear subscription if any was used
        nip46TempPrivKeyRef.current = null;
        setNip46ConnectUri(null); // Clear the URI display

        // 8. Set the ACTUAL NDK Signer to the one connected to the remote pubkey
        // Re-create the signer WITHOUT the temporary local secret key. NDK handles comms.
        const permanentNip46Signer = new NDKNip46Signer(ndkInstance, connectUri);
        ndkInstance.signer = permanentNip46Signer;
        activeSignerRef.current = permanentNip46Signer; // Store reference

        // 9. Update application auth state
        setNip46SignerPubkey(remoteSignerPubkeyHex);
        setCurrentUserNpub(nip19.npubEncode(remoteSignerPubkeyHex));
        setCurrentUserNsec(null); // Ensure nsec is cleared
        setAuthError(null);

        // 10. Persist the successful connection (e.g., store remote pubkey)
        localStorage.setItem('nip46SignerPubkey', remoteSignerPubkeyHex);
        localStorage.removeItem('currentUserNsec'); // Clear any old nsec

    } catch (error: any) {
        console.error("NIP-46 connection failed:", error);
        setAuthError(`NIP-46 connection failed: ${error.message || 'Unknown error'}`);
        cleanupNip46Attempt(); // Clean up on failure
    } finally {
        setIsGeneratingUri(false); // Ensure loading state is cleared
    }

}, [ndkInstance, cleanupNip46Attempt, isGeneratingUri, nip46ConnectUri]); // Dependencies
