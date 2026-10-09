'use client';

import React, { createContext, useState, useEffect } from 'react';
import { AuthService } from '../services/AuthService';
import { CreditService } from '../services/CreditService';

export const AuthContext = createContext();

// Storage helper that works in UXP
const storage = {
    getItem: (key) => {
        try {
            if (typeof localStorage !== 'undefined') {
                return localStorage.getItem(key);
            }
            return sessionStorage.getItem(key);
        } catch (e) {
            console.warn('  Storage unavailable:', e.message);
            return null;
        }
    },
    setItem: (key, value) => {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(key, value);
            } else {
                sessionStorage.setItem(key, value);
            }
        } catch (e) {
            console.warn('  Storage unavailable:', e.message);
        }
    },
    removeItem: (key) => {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(key);
            } else {
                sessionStorage.removeItem(key);
            }
        } catch (e) {
            console.warn('  Storage unavailable:', e.message);
        }
    }
};

export function AuthProvider({ children }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [sessionToken, setSessionToken] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Check for existing session on mount
    useEffect(() => {
        checkExistingSession();
    }, []);

    // Periodically refresh session
    useEffect(() => {
        if (!sessionToken) return;

        const interval = setInterval(() => {
            verifyAndRefreshSession(sessionToken);
        }, 5 * 60 * 1000); // Every 5 minutes

        return () => clearInterval(interval);
    }, [sessionToken]);

    /**
     * Check if there's a saved session in storage
     */
    const checkExistingSession = async () => {
        try {
            const savedToken = storage.getItem('elzoz_session_token');
            const savedUser = storage.getItem('elzoz_user');

            if (!savedToken || !savedUser) {
                setIsLoading(false);
                return;
            }


            const verification = await AuthService.verifySession(savedToken);

            if (verification.valid && verification.user) {
                setUser(verification.user);
                setSessionToken(savedToken);
                setIsAuthenticated(true);
            } else {
                storage.removeItem('elzoz_session_token');
                storage.removeItem('elzoz_user');
            }
        } catch (err) {
            console.error('  AuthContext: Error checking session:', err.message);
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Login user with email and password
     */
    const login = async (email, password) => {
        setIsLoading(true);
        setError(null);

        try {
            const result = await AuthService.login(email, password);

            if (!result.success) {
                console.error('  AuthContext: Login failed:', result.error);
                setError(result.error);
                setIsLoading(false);
                return { success: false, error: result.error };
            }


            // Save to storage
            storage.setItem('elzoz_session_token', result.sessionToken);
            storage.setItem('elzoz_user', JSON.stringify(result.user));

            // Update state
            setUser(result.user);
            setSessionToken(result.sessionToken);
            setIsAuthenticated(true);
            setError(null);
            setIsLoading(false);

            return { success: true };
        } catch (err) {
            console.error('  AuthContext: Login error:', err.message);
            setError('An error occurred during login');
            setIsLoading(false);
            return { success: false, error: 'An error occurred during login' };
        }
    };

    /**
     * Logout user
     */
    const logout = async () => {

        try {
            if (sessionToken) {
                await AuthService.logout(sessionToken);
            }

            // Clear storage
            storage.removeItem('elzoz_session_token');
            storage.removeItem('elzoz_user');

            // Clear state
            setUser(null);
            setSessionToken(null);
            setIsAuthenticated(false);
            setError(null);

            return { success: true };
        } catch (err) {
            console.error('  AuthContext: Logout error:', err.message);
            return { success: false };
        }
    };

    /**
     * Verify and refresh session
     */
    const verifyAndRefreshSession = async (token) => {
        try {
            const verification = await AuthService.verifySession(token);

            if (!verification.valid) {
                await logout();
            }
        } catch (err) {
            console.error('  AuthContext: Error verifying session:', err.message);
        }
    };

    /**
     * Update user credits after deduction
     */
    const updateCredits = (newCredits) => {
        if (user) {
            const updatedUser = { ...user, credits: newCredits };
            setUser(updatedUser);
            storage.setItem('elzoz_user', JSON.stringify(updatedUser));
        }
    };

    /**
     * Refresh user data from database
     */
    const refreshUserData = async () => {

        if (!user) return;

        try {
            const balance = await CreditService.getBalance(user.id);
            if (balance.status === 'success') {
                updateCredits(balance.credits);
            }
        } catch (err) {
            console.error('  AuthContext: Error refreshing user data:', err.message);
        }
    };

    const value = {
        isAuthenticated,
        user,
        sessionToken,
        isLoading,
        error,
        login,
        logout,
        updateCredits,
        refreshUserData
    };


    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export default AuthContext;
