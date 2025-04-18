import { CashuMint, CashuWallet, Proof, getEncodedTokenV4, getDecodedToken, Token, ProofState, CheckStateEnum } from '@cashu/cashu-ts';
import { idb, StoredProof } from './idb'; // Assuming your idb utility exports 'idb' and StoredProof

// Cache mint keys to avoid refetching on every operation
const mintKeysCache: Record<string, any> = {}; // Consider a more specific type if available from cashu-ts

/**
 * Initializes a CashuWallet instance for a specific mint.
 * It tries to load the mint's keys from cache or fetches them if not cached.
 */
const initCashuWallet = async (mintUrl: string): Promise<CashuWallet> => {
    const mint = new CashuMint(mintUrl);
    let keys = mintKeysCache[mintUrl];

    if (!keys) {
        try {
            keys = await mint.getKeys();
            mintKeysCache[mintUrl] = keys;
            console.log(`Fetched and cached keys for mint: ${mintUrl}`);
        } catch (e) {
            console.error(`Failed to get keys for mint ${mintUrl}:`, e);
            throw new Error(`Could not connect to mint: ${mintUrl}`);
        }
    }

    // Pass the potentially cached keys to the wallet constructor
    // Note: Check cashu-ts docs if constructor signature changes. This assumes keys can be passed.
    // If not, the wallet might fetch them internally again, but caching helps avoid redundant fetches
    // in rapid succession within this helper module.
    return new CashuWallet(mint, keys);
};

/**
 * Redeems a Cashu token string (cashuA...). Verifies with the mint and returns new proofs.
 */
const redeemToken = async (tokenString: string): Promise<{ proofs: Proof[], amount: number, mintUrl: string }> => {
    try {
        // getDecodedToken should return the Token structure for V4
        const decodedToken: Token = getDecodedToken(tokenString);

        // Directly access properties from the decoded Token object
        const mintUrl = decodedToken.mint;
        const inputProofs = decodedToken.proofs;

        if (!mintUrl || !inputProofs || inputProofs.length === 0) {
            throw new Error("Decoded token is invalid or missing mint/proofs.");
        }

        const wallet = await initCashuWallet(mintUrl);

        // Use checkProofsStates (from migration guide v2.0.0)
        // It returns ProofState[] where state can be SPENT, UNSPENT, PENDING
        const proofsStates: ProofState[] = await wallet.checkProofsStates(inputProofs);

        // Filter the proofs based on their state
        const spentProofs = inputProofs.filter((_proof: Proof, index: number) => 
            proofsStates[index]?.state === CheckStateEnum.SPENT
        );
        const pendingProofs = inputProofs.filter((_proof: Proof, index: number) => 
             proofsStates[index]?.state === CheckStateEnum.PENDING
        );

        if (spentProofs.length > 0) {
             console.warn(`Attempted to redeem already spent proofs: ${spentProofs.map((p: Proof) => p.secret).join(", ")}`);
             // Decide how to handle spent proofs - error out for now
             throw new Error("Token contains spent proofs");
        }

        if (pendingProofs.length > 0) {
            console.warn(`Attempted to redeem pending proofs: ${pendingProofs.map((p: Proof) => p.secret).join(", ")}`);
            // Decide how to handle pending proofs - error out for now
            throw new Error("Token contains proofs in pending state");
        }

        // Redeem (receive) the token proofs - assuming receive returns Proof[]
        const receivedProofs = await wallet.receive(tokenString);

        // Check if receive returned proofs directly or a structured object
        const finalProofs = Array.isArray(receivedProofs) ? receivedProofs : (receivedProofs as any).proofs;
        if (!finalProofs) {
            throw new Error("Receiving token did not return valid proofs.")
        }

        // Calculate the total amount received
        const amount = finalProofs.reduce((sum: number, p: Proof) => sum + p.amount, 0);

        console.log(`Successfully redeemed ${amount} sats from mint ${mintUrl}`);
        return { proofs: finalProofs, amount, mintUrl };
    } catch (e: any) {
        console.error("Failed to redeem token:", e);
        throw new Error(`Redeem failed: ${e.message || e}`);
    }
};

/**
 * Creates a new Cashu token string for a specific amount, using available proofs from a given mint.
 * Handles proof selection and interaction with the mint for splitting if necessary.
 */
const createTokenForAmount = async (
    amountSats: number,
    availableProofs: Proof[], // Proofs from the *specific mint* we are operating on
    mintUrl: string
): Promise<{ token: string; remainingProofs: Proof[] }> => {
    if (getProofsBalance(availableProofs) < amountSats) { // Use helper for clarity
        throw new Error("Insufficient funds for the specified amount.");
    }

    try {
        const wallet = await initCashuWallet(mintUrl);

        // Use wallet.send to select proofs and potentially split them via the mint
        // Assuming the signature is send(amount, proofs)
        const { keep: remainingProofs, send: proofsToSend } = await wallet.send(
            amountSats,
            availableProofs
            // Removed preferences and options based on linter errors
        );

        // Ensure we actually got proofs to send
        if (!proofsToSend || proofsToSend.length === 0) {
            throw new Error("Mint did not return proofs to send after splitting.");
        }

        // Encode the proofs to send into a token string using the Token structure
        const tokenToEncode: Token = {
            mint: mintUrl,
            proofs: proofsToSend,
            // unit: "sat", // Optional: specify unit if needed
            // memo: "Sent via Madstr.tv" // Optional memo
        };
        const encodedToken = getEncodedTokenV4(tokenToEncode);

        console.log(`Created token for ${amountSats} sats from mint ${mintUrl}`);
        return { token: encodedToken, remainingProofs };

    } catch (e: any) {
        console.error(`Failed to create token for ${amountSats} sats from ${mintUrl}:`, e);
        throw new Error(`Token creation failed: ${e.message || e}`);
    }
};

/**
 * Calculates the total satoshi value from an array of Proofs.
 */
const getProofsBalance = (proofs: Proof[]): number => {
    return proofs.reduce((sum: number, p: Proof) => sum + p.amount, 0);
};

// --- Export Cashu Helper Functions ---
export const cashuHelper = {
    initCashuWallet,
    redeemToken,
    createTokenForAmount,
    getProofsBalance,
}; 