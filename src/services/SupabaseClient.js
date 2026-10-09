// Supabase REST API Client
// Uses direct HTTP requests instead of the JS library (UXP compatible)

import { supabaseConfig, validateSupabaseConfig } from '../config/supabase-config';

// Validate configuration
if (!validateSupabaseConfig()) {
    console.error('  SupabaseRestClient: Configuration validation failed');
}

const SUPABASE_URL = supabaseConfig.url;
const SUPABASE_ANON_KEY = supabaseConfig.anonKey;


export class SupabaseClient {
    /**
     * Make a REST API call to Supabase
     */
    static async makeRequest(table, method = 'GET', filters = {}, body = null) {
        try {
            let url = `${SUPABASE_URL}/rest/v1/${table}`;

            // Add filters to URL for GET requests
            if (method === 'GET' && Object.keys(filters).length > 0) {
                const filterParams = Object.entries(filters)
                    .map(([key, value]) => `${key}=eq.${encodeURIComponent(value)}`)
                    .join('&');
                url += `?${filterParams}`;
            }

            const options = {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            };

            if (body) {
                options.body = JSON.stringify(body);
            }

            const response = await fetch(url, options);

            if (!response.ok) {
                const error = await response.text();
                console.error('  SupabaseRestClient: Error:', response.status, error);
                return { data: null, error: error };
            }

            // Handle empty responses (e.g., 204 No Content)
            const contentLength = response.headers.get('content-length');
            const contentType = response.headers.get('content-type');

            if (contentLength === '0' || !contentType || !contentType.includes('application/json')) {
                return { data: { success: true }, error: null };
            }

            const text = await response.text();
            if (!text) {
                return { data: { success: true }, error: null };
            }

            const data = JSON.parse(text);
            return { data, error: null };
        } catch (error) {
            console.error('  SupabaseRestClient: Exception:', error.message);
            return { data: null, error: error.message };
        }
    }

    /**
     * Query users table by email
     */
    static async getUser(email) {

        const { data, error } = await this.makeRequest('users', 'GET', { email });

        if (error || !data || data.length === 0) {
            console.error('  SupabaseClient: User not found:', email);
            return null;
        }

        return data[0];
    }

    /**
     * Get user by ID
     */
    static async getUserById(userId) {

        const { data, error } = await this.makeRequest('users', 'GET', { id: userId });

        if (error || !data || data.length === 0) {
            console.error('  SupabaseClient: User not found');
            return null;
        }

        return data[0];
    }

    /**
     * Create session
     */
    static async createSession(userId, sessionToken) {

        const body = {
            user_id: userId,
            session_token: sessionToken,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };

        const { data, error } = await this.makeRequest('sessions', 'POST', {}, body);

        if (error || !data) {
            console.error('  SupabaseClient: Error creating session:', error);
            return null;
        }

        return data[0] || data;
    }

    /**
     * Get session by token
     */
    static async getSession(sessionToken) {

        const { data, error } = await this.makeRequest('sessions', 'GET', { session_token: sessionToken });

        if (error || !data || data.length === 0) {
            console.error('  SupabaseClient: Session not found');
            return null;
        }

        const session = data[0];

        // Check if session is expired
        if (new Date(session.expires_at) < new Date()) {
            return null;
        }

        return session;
    }

    /**
     * Delete session
     */
    static async deleteSession(sessionToken) {

        try {
            const url = `${SUPABASE_URL}/rest/v1/sessions?session_token=eq.${encodeURIComponent(sessionToken)}`;
            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            });

            if (!response.ok) {
                console.error('  SupabaseClient: Error deleting session');
                return false;
            }

            return true;
        } catch (error) {
            console.error('  SupabaseClient: Exception in deleteSession:', error.message);
            return false;
        }
    }

    /**
     * Insert transaction
     */
    static async insertTransaction(userId, creditsAmount, metadata) {

        const body = {
            user_id: userId,
            credits: creditsAmount,
            metadata: metadata
        };

        const { data, error } = await this.makeRequest('transactions', 'POST', {}, body);

        if (error || !data) {
            console.error('  SupabaseClient: Error inserting transaction:', error);
            return null;
        }

        return data[0] || data;
    }

    /**
     * Update user credits
     */
    static async updateUserCredits(userId, newCredits) {

        try {
            const url = `${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`;
            const response = await fetch(url, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({ credits: newCredits })
            });

            if (!response.ok) {
                console.error('  SupabaseClient: Error updating credits');
                return null;
            }

            const data = await response.json();
            return data[0] || data;
        } catch (error) {
            console.error('  SupabaseClient: Exception in updateUserCredits:', error.message);
            return null;
        }
    }

    /**
     * Get user balance (credits)
     */
    static async getUserBalance(userId) {

        const { data, error } = await this.makeRequest('users', 'GET', { id: userId });

        if (error || !data || data.length === 0) {
            console.error('  SupabaseClient: Error getting balance');
            return null;
        }

        return data[0].credits;
    }
}

export default SupabaseClient;
