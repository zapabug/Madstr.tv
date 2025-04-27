import React, { createContext, useContext, ReactNode } from 'react';
import { useWallet, UseWalletReturn } from '../hooks/useWallet'; // Correct path?
import type NDK from '@nostr-dev-kit/ndk';

// Define the context type
const WalletContext = createContext<UseWalletReturn | undefined>(undefined);

interface WalletProviderProps {
    children: ReactNode;
    ndkInstance: NDK | undefined;
    isNdkReady: boolean;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children, ndkInstance, isNdkReady }) => {
    const wallet = useWallet({ ndkInstance, isNdkReady });

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