// Admin user management (runs in the admin-users Edge Function; plain JS so it
// can also be tested in Node). Holds the service key; never shipped to a browser.
//
// Every request must carry the signed-in admin's access token. The caller is
// checked with the am_i_admin() RPC under THEIR token; credit changes are made
// through the admin RPCs under THEIR token too, so the ledger records which
// admin did what. Only creating users / setting passwords / banning uses the
// service key (Supabase Auth admin API).
//
// POST body: { action: "create_user", email, password?, credits?, valid_days?, note?, idempotency_key? }
//            { action: "reset_password", user_id, password? }
//            { action: "set_disabled", user_id, disabled }

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // no 0/O, 1/l/I
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BAN_FOREVER = "876000h"; // 100 years (Go duration, as Supabase Auth expects)

/** Readable random password, e.g. "Kq7m-Xw4p-Rt9z" (~70 bits). Uses rejection sampling: no modulo bias. */
export function generatePassword(getRandomValues = (a) => crypto.getRandomValues(a)) {
    const out = [];
    const limit = 256 - (256 % ALPHABET.length);
    while (out.length < 12) {
        const buf = getRandomValues(new Uint8Array(32));
        for (const b of buf) if (b < limit && out.length < 12) out.push(ALPHABET[b % ALPHABET.length]);
    }
    return `${out.slice(0, 4).join("")}-${out.slice(4, 8).join("")}-${out.slice(8).join("")}`;
}

/**
 * Supabase API key from the new JSON dictionary env ({"default": "sb_..."}),
 * falling back to the legacy single-key env.
 */
export function pickKey(dictJson, legacy) {
    if (dictJson) {
        try {
            const d = JSON.parse(dictJson);
            const v = d && (d.default || Object.values(d)[0]);
            if (v) return String(v);
        } catch (e) {
            /* not JSON: ignore */
        }
    }
    return legacy || undefined;
}

class HttpError extends Error {
    constructor(status, code, message) {
        super(message || code);
        this.status = status;
        this.code = code;
    }
}

function corsHeaders(origin, allowed) {
    // Tolerate "https://host/" or upper case in the secret; browsers send the bare origin.
    const norm = (s) => String(s || "").trim().replace(/\/+$/, "").toLowerCase();
    const list = String(allowed || "").split(/[,\s]+/).map(norm).filter(Boolean);
    const ok = origin && (list.includes("*") || list.includes(norm(origin)));
    return {
        ...(ok ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };
}

/**
 * @param {{method: string, headers: object, body: string}} req   header names lower-case
 * @param {{supabaseUrl, serviceKey, anonKey, allowedOrigins, fetch?, getRandomValues?}} env
 * @returns {Promise<{status: number, headers: object, body: string}>}
 */
export async function handleAdminRequest(req, env) {
    const doFetch = env.fetch || fetch;
    const cors = corsHeaders(req.headers.origin, env.allowedOrigins);
    const reply = (status, data) => ({ status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (req.method === "OPTIONS") return { status: 204, headers: cors, body: "" };

    try {
        if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
        if (!env.supabaseUrl || !env.serviceKey || !env.anonKey) throw new HttpError(500, "server_not_configured");
        const auth = req.headers.authorization || "";
        if (!/^Bearer\s+\S+$/.test(auth)) throw new HttpError(401, "not_authenticated");
        let input;
        try {
            input = JSON.parse(req.body || "{}");
        } catch (e) {
            throw new HttpError(400, "invalid_json");
        }

        const asCaller = async (fn, args) => {
            const res = await doFetch(`${env.supabaseUrl}/rest/v1/rpc/${fn}`, {
                method: "POST",
                headers: { apikey: env.anonKey, Authorization: auth, "Content-Type": "application/json" },
                body: JSON.stringify(args || {})
            });
            const text = await res.text();
            const data = text ? JSON.parse(text) : null;
            if (!res.ok) {
                const code = (data && data.message) || `rpc_${res.status}`;
                throw new HttpError(res.status === 401 ? 401 : 400, code, data && data.details ? `${code}: ${data.details}` : code);
            }
            return data;
        };
        const authAdmin = async (method, path, body) => {
            const res = await doFetch(`${env.supabaseUrl}/auth/v1/admin/users${path}`, {
                method,
                headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            const text = await res.text();
            const data = text ? JSON.parse(text) : {};
            if (!res.ok) {
                const msg = String(data.msg || data.message || data.error_description || data.error || `auth_${res.status}`);
                if (res.status === 422 && /already|registered|exists/i.test(msg + (data.error_code || ""))) throw new HttpError(409, "email_exists", "A user with this email already exists.");
                if (res.status === 404) throw new HttpError(404, "user_not_found");
                throw new HttpError(502, "auth_error", msg);
            }
            return data;
        };

        if ((await asCaller("am_i_admin")) !== true) throw new HttpError(403, "not_admin");

        if (input.action === "create_user") {
            const email = String(input.email || "").trim().toLowerCase();
            if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, "invalid_email");
            const password = input.password ? String(input.password) : generatePassword(env.getRandomValues);
            if (password.length < 8 || password.length > 72) throw new HttpError(400, "invalid_password", "Password must be 8-72 characters.");
            const given = (v) => v !== undefined && v !== null && v !== "";
            const credits = given(input.credits) ? Number(input.credits) : 0;
            const days = given(input.valid_days) ? Number(input.valid_days) : 30; // 0 is an error, not "default"
            if (!Number.isInteger(credits) || credits < 0) throw new HttpError(400, "invalid_amount");
            if (!Number.isInteger(days) || days < 1 || days > 3660) throw new HttpError(400, "invalid_validity");

            const user = await authAdmin("POST", "", { email, password, email_confirm: true });
            let grant = null;
            if (credits > 0) {
                grant = await asCaller("admin_grant_credits", {
                    p_user: user.id,
                    p_amount: credits,
                    p_valid_days: days,
                    p_note: input.note || "Initial credits",
                    p_idempotency_key: input.idempotency_key || `create-${user.id}`
                });
            }
            return reply(200, { user: { id: user.id, email: user.email || email }, password, grant });
        }

        if (input.action === "reset_password") {
            const id = String(input.user_id || "");
            if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "invalid_user_id");
            const password = input.password ? String(input.password) : generatePassword(env.getRandomValues);
            if (password.length < 8 || password.length > 72) throw new HttpError(400, "invalid_password", "Password must be 8-72 characters.");
            await authAdmin("PUT", `/${id}`, { password });
            return reply(200, { user_id: id, password });
        }

        if (input.action === "set_disabled") {
            const id = String(input.user_id || "");
            if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "invalid_user_id");
            const disabled = input.disabled === true;
            // Database first (blocks new jobs immediately), then sign-in.
            await asCaller("admin_set_disabled", { p_user: id, p_disabled: disabled });
            await authAdmin("PUT", `/${id}`, { ban_duration: disabled ? BAN_FOREVER : "none" });
            return reply(200, { user_id: id, disabled });
        }

        throw new HttpError(400, "unknown_action");
    } catch (e) {
        if (e instanceof HttpError) return reply(e.status, { error: e.code, message: e.message });
        return reply(500, { error: "internal_error", message: "Unexpected error." });
    }
}
