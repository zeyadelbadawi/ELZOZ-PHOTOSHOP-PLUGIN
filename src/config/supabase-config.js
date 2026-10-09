// Supabase configuration, injected at build time by webpack DefinePlugin
// (see webpack.config.js). Values come from ELZOZ_SUPABASE_URL and
// ELZOZ_SUPABASE_ANON_KEY in the environment or a local, git-ignored .env file.
// Only the public anon key may ever be used here — never a service_role key.

export const supabaseConfig = {
    url: __ELZOZ_SUPABASE_URL__,
    anonKey: __ELZOZ_SUPABASE_ANON_KEY__
};

// Where clients contact the seller for an account, a top-up or a new password
// (accounts are created by the seller in the admin dashboard; there is no self sign-up).
export const contactUrl = __ELZOZ_CONTACT_URL__;

export function validateSupabaseConfig() {
    if (!supabaseConfig.url || !supabaseConfig.anonKey) {
        console.error('Supabase is not configured. Set ELZOZ_SUPABASE_URL and ELZOZ_SUPABASE_ANON_KEY before building.');
        return false;
    }
    return true;
}
