// Supabase Configuration
// This file stores your Supabase credentials
// UPDATE THESE VALUES with your actual Supabase project details

export const supabaseConfig = {
    // Go to https://app.supabase.com
    // Select your project → Settings → API
    // Copy your Project URL here
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',

    // Copy your Anon Key here (public key, safe to expose)
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
};

// Validate configuration
export function validateSupabaseConfig() {
    if (!supabaseConfig.url || supabaseConfig.url === 'https://your-project.supabase.co') {
        console.error('  ERROR: Supabase URL not configured!');
        console.error('  Please update src/config/supabase-config.js with your Supabase project URL');
        return false;
    }

    if (!supabaseConfig.anonKey || supabaseConfig.anonKey === 'your-anon-key-here') {
        console.error('  ERROR: Supabase Anon Key not configured!');
        console.error('  Please update src/config/supabase-config.js with your Supabase Anon Key');
        return false;
    }

    return true;
}
