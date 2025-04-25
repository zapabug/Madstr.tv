import React, { createContext, useContext, ReactNode } from 'react';
import { useAuth, UseAuthReturn } from '../hooks/useAuth'; // Ensure correct path

// Define the context type
// Use Partial<UseAuthReturn> initially if auth might be undefined during loading?
// Or ensure useAuth provides default values.
const AuthContext = createContext<UseAuthReturn | undefined>(undefined);

interface AuthProviderProps {
    children: ReactNode;
    // ndkInstance: NDK | undefined; // REMOVED - useAuth now uses useNDK()
}

// export const AuthProvider: React.FC<AuthProviderProps> = ({ children, ndkInstance }) => {
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    // const auth = useAuth(ndkInstance); // Initialize the hook here (REMOVED ndkInstance)
    const auth = useAuth(); // Initialize the hook here

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