import React, { createContext, useContext, ReactNode } from 'react';
import { useWallet, UseWalletReturn } from '../hooks/useWallet'; // Correct path?

// Define the context type
const WalletContext = createContext<UseWalletReturn | undefined>(undefined);

interface WalletProviderProps {
    children: ReactNode;
    // ndkInstance: NDK | undefined; // REMOVED
    // isNdkReady: boolean;          // REMOVED
}

// export const WalletProvider: React.FC<WalletProviderProps> = ({ children, ndkInstance, isNdkReady }) => {
export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
    // Pass ndkInstance and isNdkReady in an object conforming to UseWalletProps
    // const wallet = useWallet({ ndkInstance, isNdkReady }); // Initialize the hook here (REMOVED props)
    const wallet = useWallet(); // Initialize the hook here

    return (
        <WalletContext.Provider value={wallet}>
            {children}
        </WalletContext.Provider>
    );
};

// Custom hook for easy consumption
export const useWalletContext = () => {
    const context = useContext(WalletContext);
    if (context === undefined) {
        throw new Error('useWalletContext must be used within a WalletProvider');
    }
    return context;
}; 