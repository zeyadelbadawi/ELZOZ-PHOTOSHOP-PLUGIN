// Supabase Auth (GoTrue) client for the plugin, without the SDK.
//  * access token: memory only
//  * refresh token: UXP secureStorage (encrypted per OS user; Adobe documents
//    it as a cache, so losing it just means signing in again)
//  * concurrent refreshes are coalesced (Supabase rotates refresh tokens and
//    rejects reuse, so two parallel refreshes would log the user out)

const REFRESH_KEY = "elzoz.auth.refresh";
const SKEW_SECONDS = 60;

export class AuthError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

// secureStorage.getItem resolves to a Uint8Array. TextDecoder is not in UXP's
// documented globals, and refresh tokens are ASCII, so decode bytes directly.
function decodeUtf8(value) {
    if (typeof value === "string") return value;
    if (!value || !value.length) return null;
    if (typeof TextDecoder === "function") return new TextDecoder().decode(value);
    let s = "";
    for (let i = 0; i < value.length; i++) s += String.fromCharCode(value[i]);
    return s;
}

export function createAuthClient({ url, anonKey, fetchImpl = globalThis.fetch, secureStorage, now = () => Date.now() }) {
    let session = null; // { accessToken, expiresAt (ms), user }
    let refreshing = null;
    const listeners = new Set();

    const emit = () => listeners.forEach((fn) => fn(session ? { user: session.user } : null));

    async function call(path, body, accessToken) {
        let res;
        try {
            res = await fetchImpl(`${url}/auth/v1${path}`, {
                method: "POST",
                headers: {
                    apikey: anonKey,
                    "Content-Type": "application/json",
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
                },
                body: JSON.stringify(body || {})
            });
        } catch (e) {
            throw new AuthError("network", "Can't reach the Elzoz server. Check your internet connection.");
        }
        const text = await res.text();
        const data = text ? JSON.parse(text) : {};
        if (!res.ok) {
            const raw = String(data.error_code || data.error || data.code || "");
            const msg = String(data.error_description || data.msg || data.message || "");
            if (res.status === 429) throw new AuthError("rate_limited", "Too many attempts. Wait a minute and try again.");
            if (/user_banned|banned/i.test(raw + msg + String(data.error_code || ""))) throw new AuthError("account_disabled", "This account is disabled. Contact us to reactivate it.");
            if (/email_not_confirmed/i.test(raw + msg)) throw new AuthError("email_not_confirmed", "Confirm your email address first (check your inbox).");
            if (raw === "invalid_grant" || /invalid_credentials|Invalid login credentials/i.test(raw + msg)) {
                throw new AuthError("invalid_credentials", "Email or password is incorrect.");
            }
            throw new AuthError("auth_failed", msg || `Sign-in failed (${res.status}).`);
        }
        return data;
    }

    async function adopt(data) {
        if (!data.access_token || !data.refresh_token) throw new AuthError("auth_failed", "The server returned an incomplete session.");
        session = {
            accessToken: data.access_token,
            expiresAt: now() + Number(data.expires_in || 3600) * 1000,
            user: data.user ? { id: data.user.id, email: data.user.email } : session && session.user
        };
        await secureStorage.setItem(REFRESH_KEY, data.refresh_token);
        emit();
        return session;
    }

    async function clear() {
        session = null;
        try {
            await secureStorage.removeItem(REFRESH_KEY);
        } catch (e) {
            /* already gone */
        }
        emit();
    }

    async function refresh() {
        if (!refreshing) {
            refreshing = (async () => {
                const token = decodeUtf8(await secureStorage.getItem(REFRESH_KEY).catch(() => null));
                if (!token) {
                    await clear();
                    throw new AuthError("signed_out", "Please sign in.");
                }
                try {
                    return await adopt(await call("/token?grant_type=refresh_token", { refresh_token: token }));
                } catch (e) {
                    if (e.code !== "network") await clear();
                    throw e;
                }
            })().finally(() => {
                refreshing = null;
            });
        }
        return refreshing;
    }

    return {
        onChange(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
        get user() {
            return session ? session.user : null;
        },
        async signIn(email, password) {
            if (!email || !password) throw new AuthError("invalid_credentials", "Enter your email and password.");
            return adopt(await call("/token?grant_type=password", { email: String(email).trim(), password }));
        },
        /** Restore a session from secureStorage at startup. Returns null when signed out. */
        async restore() {
            try {
                return await refresh();
            } catch (e) {
                if (e.code === "network") throw e;
                return null;
            }
        },
        async getAccessToken({ forceRefresh = false } = {}) {
            if (!forceRefresh && session && session.expiresAt - SKEW_SECONDS * 1000 > now()) return session.accessToken;
            return (await refresh()).accessToken;
        },
        async signOut() {
            const token = session && session.accessToken;
            try {
                if (token) await call("/logout", {}, token);
            } finally {
                await clear();
            }
        }
    };
}
