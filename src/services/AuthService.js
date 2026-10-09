// Authentication Service
// Handles password hashing, login verification, and session management
// Uses a simple but consistent hash function for UXP compatibility

import { SupabaseClient } from './SupabaseClient';

export class AuthService {
    /**
     * Simple hash function that works in both Node.js and browser/UXP
     * This creates a consistent hash from a string
     */
    static simpleHash(str) {
        let hash = 0;
        let i, chr;
        for (i = 0; i < str.length; i++) {
            chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash = hash & hash; // Convert to 32bit integer
        }
        // Convert to hex string (padded to 64 chars to look like SHA-256)
        const hashHex = Math.abs(hash).toString(16).padStart(64, '0');
        return hashHex;
    }

    /**
     * Hash a password using simple hash (works in UXP)
     * Format: simple$salt$hash
     */
    static hashPassword(password) {
        try {

            // Generate a random salt
            const salt = this.generateSalt();

            // Combine password + salt
            const combined = password + salt;

            // Use simple hash function
            const hashHex = this.simpleHash(combined);

            // Return combined hash with salt for verification
            const hashedPassword = `simple$${salt}$${hashHex}`;
            return hashedPassword;
        } catch (error) {
            console.error('  AuthService: Error hashing password:', error.message);
            throw error;
        }
    }

    /**
     * Generate a random salt for password hashing
     */
    static generateSalt() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let salt = '';
        for (let i = 0; i < 16; i++) {
            salt += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return salt;
    }

    /**
     * Verify password against hash
     * Hash format: simple$salt$hash or sha256$salt$hash (for compatibility)
     */
    static verifyPassword(password, hash) {
        try {

            // Parse the hash format
            const parts = hash.split('$');
            if (parts.length !== 3) {
                console.error('  AuthService: Invalid hash format');
                return false;
            }

            const hashType = parts[0];
            const salt = parts[1];
            const storedHash = parts[2];


            // Hash the provided password with the same salt
            const combined = password + salt;

            // Use appropriate hash function based on type
            let computedHash;
            if (hashType === 'simple') {
                computedHash = this.simpleHash(combined);
            } else if (hashType === 'sha256') {
                // For sha256, we can only verify if we're in Node.js environment
                computedHash = this.simpleHash(combined);
            } else {
                console.error('  AuthService: Unknown hash type:', hashType);
                return false;
            }


            // Compare hashes
            const matches = computedHash === storedHash;
            return matches;
        } catch (error) {
            console.error('  AuthService: Error verifying password:', error.message);
            return false;
        }
    }

    /**
     * Generate a session token (UXP environment, no crypto module available)
     */
    static generateSessionToken() {
        try {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let token = '';
            for (let i = 0; i < 64; i++) {
                token += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return token;
        } catch (error) {
            console.error('  AuthService: Error generating token:', error.message);
            throw error;
        }
    }

    /**
     * Login user with email and password
     */
    static async login(email, password) {

        try {
            // Get user from database
            const user = await SupabaseClient.getUser(email);

            if (!user) {
                console.error('  AuthService: User not found:', email);
                return {
                    success: false,
                    error: 'Invalid email or password'
                };
            }


            // Verify password
            const passwordMatch = this.verifyPassword(password, user.password_hash);

            if (!passwordMatch) {
                console.error('  AuthService: Password mismatch for user:', email);
                return {
                    success: false,
                    error: 'Invalid email or password'
                };
            }


            // Check user status
            if (user.status !== 'active') {
                console.error('  AuthService: User account is not active:', user.status);
                return {
                    success: false,
                    error: `Account is ${user.status}. Contact support.`
                };
            }

            // Generate session token
            const sessionToken = this.generateSessionToken();

            // Create session in database
            const session = await SupabaseClient.createSession(user.id, sessionToken);

            if (!session) {
                console.error('  AuthService: Failed to create session');
                return {
                    success: false,
                    error: 'Failed to create session'
                };
            }

            return {
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    credits: user.credits
                },
                sessionToken: sessionToken
            };
        } catch (error) {
            console.error('  AuthService: Login error:', error.message);
            return {
                success: false,
                error: 'An error occurred during login'
            };
        }
    }

    /**
     * Verify session token
     */
    static async verifySession(sessionToken) {

        try {
            const session = await SupabaseClient.getSession(sessionToken);

            if (!session) {
                console.error('  AuthService: Invalid or expired session');
                return {
                    valid: false,
                    user: null
                };
            }

            // Get user data
            const user = await SupabaseClient.getUserById(session.user_id);

            if (!user) {
                console.error('  AuthService: User not found for session');
                return {
                    valid: false,
                    user: null
                };
            }

            return {
                valid: true,
                user: {
                    id: user.id,
                    email: user.email,
                    credits: user.credits
                }
            };
        } catch (error) {
            console.error('  AuthService: Session verification error:', error.message);
            return {
                valid: false,
                user: null
            };
        }
    }

    /**
     * Logout user
     */
    static async logout(sessionToken) {

        try {
            await SupabaseClient.deleteSession(sessionToken);
            return { success: true };
        } catch (error) {
            console.error('  AuthService: Logout error:', error.message);
            return { success: false };
        }
    }

    /**
     * Convert string to Uint8Array (UXP compatible - no TextEncoder)
     */
    static stringToUint8Array(str) {
        const arr = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
            arr[i] = str.charCodeAt(i);
        }
        return arr;
    }

    /**
     * Hash a password using SHA-256 (UXP compatible)
     * Format: sha256$salt$hash for verification flexibility
     */
    static async hashPasswordWithSHA256(password) {
        try {

            // Generate a random salt
            const salt = this.generateSalt();

            // Combine password + salt
            const combined = password + salt;

            // Use SubtleCrypto API with manual string-to-bytes conversion
            const data = this.stringToUint8Array(combined);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);

            // Convert to hex string
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            // Return combined hash with salt for verification
            const hashedPassword = `sha256$${salt}$${hashHex}`;
            return hashedPassword;
        } catch (error) {
            console.error('  AuthService: Error hashing password:', error.message);
            throw error;
        }
    }

    /**
     * Verify password against hash
     * Hash format: sha256$salt$hash
     */
    static async verifyPasswordWithSHA256(password, hash) {
        try {

            // Parse the hash format
            const parts = hash.split('$');
            if (parts.length !== 3 || parts[0] !== 'sha256') {
                console.error('  AuthService: Invalid hash format');
                return false;
            }

            const salt = parts[1];
            const storedHash = parts[2];


            // Hash the provided password with the same salt
            const combined = password + salt;

            // Use manual string-to-bytes conversion (UXP compatible)
            const data = this.stringToUint8Array(combined);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);

            // Convert to hex string
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');


            // Compare hashes
            const matches = computedHash === storedHash;
            return matches;
        } catch (error) {
            console.error('  AuthService: Error verifying password:', error.message);
            return false;
        }
    }
}

export default AuthService;
