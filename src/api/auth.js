// Auth API Utilities
// These are helper functions for auth operations

import { AuthService } from '../services/AuthService';
import { SupabaseClient } from '../services/SupabaseClient';

/**
 * Check if email exists in system
 */
export async function checkEmailExists(email) {

    try {
        const user = await SupabaseClient.getUser(email);
        return !!user;
    } catch (error) {
        console.error('  Auth API: Error checking email:', error.message);
        return false;
    }
}

/**
 * Verify login credentials
 */
export async function verifyCredentials(email, password) {

    try {
        const result = await AuthService.login(email, password);
        return result;
    } catch (error) {
        console.error('  Auth API: Error verifying credentials:', error.message);
        return {
            success: false,
            error: 'An error occurred during verification'
        };
    }
}

/**
 * Verify existing session
 */
export async function verifySessionToken(token) {

    try {
        const result = await AuthService.verifySession(token);
        return result;
    } catch (error) {
        console.error('  Auth API: Error verifying session:', error.message);
        return {
            valid: false,
            user: null
        };
    }
}

/**
 * Logout and destroy session
 */
export async function destroySession(token) {

    try {
        const result = await AuthService.logout(token);
        return result;
    } catch (error) {
        console.error('  Auth API: Error destroying session:', error.message);
        return { success: false };
    }
}

export default {
    checkEmailExists,
    verifyCredentials,
    verifySessionToken,
    destroySession
};
