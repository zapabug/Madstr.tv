const cleanupNip46Attempt = useCallback(() => {
    console.log("Cleaning up NIP-46 attempt...");
    // Clear timeout
    if (nip46TimeoutRef.current) {
        clearTimeout(nip46TimeoutRef.current);
        nip46TimeoutRef.current = null;
    }
    // Stop NDK subscription if used (may not be necessary with blockUntilReady)
    if (nip46SubscriptionRef.current) {
        try {
            nip46SubscriptionRef.current.stop();
        } catch (e) { console.warn("Error stopping NIP-46 subscription:", e); }
        nip46SubscriptionRef.current = null;
    }
    // Clear state
    setNip46ConnectUri(null);
    setIsGeneratingUri(false);

    // Clear temporary signer from NDK instance IF it's still set
    if (ndkInstance && ndkInstance.signer instanceof NDKNip46Signer && nip46TempPrivKeyRef.current) {
         // Check if the current NDK signer is the temporary one we created
         // This check might need adjustment based on how NDKNip46Signer exposes info
         // A simpler check might be sufficient if only one NIP-46 attempt happens at a time.
         const tempPubkey = getPublicKey(nip46TempPrivKeyRef.current);
         // Caution: Comparing signer instances directly might not work. Compare properties if possible.
         // Or simply clear the signer if we know a cleanup corresponds to the temp signer.
         console.log("useAuth: Clearing temporary NIP-46 signer from NDK.");
         ndkInstance.signer = undefined;
    }

    // Clear the temporary private key reference
    nip46TempPrivKeyRef.current = null;

}, [ndkInstance]); // Dependency
