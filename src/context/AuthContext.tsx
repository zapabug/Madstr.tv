import React, { createContext, useContext, ReactNode } from 'react';
import { useAuth, UseAuthReturn } from '../hooks/useAuth'; // Ensure correct path
import type NDK from '@nostr-dev-kit/ndk';

// Define the context type
// Use Partial<UseAuthReturn> initially if auth might be undefined during loading?
// Or ensure useAuth provides default values.
const AuthContext = createContext<UseAuthReturn | undefined>(undefined);

interface AuthProviderProps {
    children: ReactNode;
    ndkInstance: NDK | undefined;
    isNdkReady: boolean;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, ndkInstance, isNdkReady }) => {
    const auth = useAuth(ndkInstance, isNdkReady); // Initialize the hook here, passing NDK info

    return (
        <AuthContext.Provider value={auth}>
            {children}
        </AuthContext.Provider>
    );
};

// Custom hook for easy consumption
export const useAuthContext = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuthContext must be used within an AuthProvider');
    }
    return context;
}; 