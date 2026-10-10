// Talks to Supabase: Auth (sign-in), PostgREST (admin RPCs) and the
// admin-users Edge Function. Only the public anon key is in this bundle; every
// privileged action is authorised server-side by the signed-in admin's token.
const URL_ = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FUNCTIONS = import.meta.env.VITE_FUNCTIONS_URL || (URL_ ? `${URL_}/functions/v1` : "");
const KEY = "elzoz-admin-session";

export const configured = !!(URL_ && ANON);

export class ApiError extends Error {
    constructor(code, message, status) {
        super(message || code);
        this.code = code;
        this.status = status;
    }
}

let session = load();
function load() {
    try {
        return JSON.parse(sessionStorage.getItem(KEY)) || null;
    } catch (e) {
        return null;
    }
}
function save(s) {
    session = s;
    try {
        if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
        else sessionStorage.removeItem(KEY);
    } catch (e) {
        /* private mode: session lives in memory only */
    }
}

async function call(url, { method = "POST", body, token, headers = {} } = {}) {
    let res;
    try {
        res = await fetch(url, {
            method,
            headers: { apikey: ANON, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    } catch (e) {
        throw new ApiError("network", "network");
    }
    const text = await res.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch (e) {
        data = { message: text };
    }
    if (!res.ok) {
        const code = (data && (data.error_code || data.error || data.message || data.code)) || `http_${res.status}`;
        throw new ApiError(String(code), String((data && (data.msg || data.error_description || data.message)) || code), res.status);
    }
    return data;
}

const fromToken = (d) => ({ access: d.access_token, refresh: d.refresh_token, expiresAt: Date.now() + (d.expires_in || 3600) * 1000, email: d.user && d.user.email });

async function token() {
    if (!session) throw new ApiError("signed_out", "signed_out");
    if (session.expiresAt - 60000 > Date.now()) return session.access;
    try {
        const d = await call(`${URL_}/auth/v1/token?grant_type=refresh_token`, { body: { refresh_token: session.refresh } });
        save({ ...fromToken(d), email: session.email });
        return session.access;
    } catch (e) {
        save(null);
        throw new ApiError("signed_out", "signed_out");
    }
}

export const currentEmail = () => (session ? session.email : null);

export async function signIn(email, password) {
    const d = await call(`${URL_}/auth/v1/token?grant_type=password`, { body: { email: String(email).trim(), password } });
    const s = fromToken(d);
    const isAdmin = await call(`${URL_}/rest/v1/rpc/am_i_admin`, { body: {}, token: s.access });
    if (isAdmin !== true) throw new ApiError("not_admin", "not_admin");
    save(s);
    return s.email;
}

export async function signOut() {
    const t = session && session.access;
    save(null);
    if (t) await call(`${URL_}/auth/v1/logout`, { body: {}, token: t }).catch(() => {});
}

export async function restore() {
    if (!session) return null;
    try {
        const ok = await call(`${URL_}/rest/v1/rpc/am_i_admin`, { body: {}, token: await token() });
        return ok === true ? session.email : (save(null), null);
    } catch (e) {
        return null;
    }
}

const rpc = async (fn, args = {}) => call(`${URL_}/rest/v1/rpc/${fn}`, { body: args, token: await token() });
const adminFn = async (body) => call(`${FUNCTIONS}/admin-users`, { body, token: await token() });
const quiet = (notify) => (notify === false ? { p_notify: false } : {});
const key = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const api = {
    stats: () => rpc("admin_stats"),
    listUsers: (search, limit, offset) => rpc("admin_list_users", { p_search: search || null, p_limit: limit, p_offset: offset }),
    userDetail: (id) => rpc("admin_user_detail", { p_user: id }),
    // One idempotency key per form submission: a double click or a retried request adds credits once.
    // notify: tell the client on WhatsApp (the sales bot sends the message). Sent only when false,
    // so the default call also works against a database without the p_notify argument.
    grant: (id, amount, days, note, idemKey = key(), notify = true) =>
        rpc("admin_grant_credits", { p_user: id, p_amount: amount, p_valid_days: days, p_note: note || null, p_idempotency_key: idemKey, ...quiet(notify) }),
    remove: (id, amount, note, idemKey = key(), notify = true) =>
        rpc("admin_remove_credits", { p_user: id, p_amount: amount, p_note: note, p_idempotency_key: idemKey, ...quiet(notify) }),
    refund: (ledgerId, note, notify = true) => rpc("admin_refund_charge", { p_ledger_id: ledgerId, p_note: note, ...quiet(notify) }),
    setPrice: (unit, price) => rpc("admin_set_price", { p_unit: unit, p_price: price }),
    createUser: (input) => adminFn({ action: "create_user", ...input, idempotency_key: key() }),
    resetPassword: (userId, notify = true) => adminFn({ action: "reset_password", user_id: userId, notify }),
    clientNotices: (userId) => rpc("admin_client_notifications", { p_user: userId, p_limit: 20 }),
    setDisabled: (userId, disabled, notify = true) => adminFn({ action: "set_disabled", user_id: userId, disabled, notify }),
    // WhatsApp sales bot
    botOverview: () => rpc("admin_bot_overview"),
    botOrders: (status, search) => rpc("admin_bot_orders", { p_status: status, p_search: search, p_limit: 100 }),
    botContacts: (search) => rpc("admin_bot_contacts", { p_search: search, p_limit: 100 }),
    botPayments: () => rpc("admin_bot_payments", { p_limit: 100 }),
    botApprove: (code) => rpc("admin_bot_approve", { p_code: code }),
    botReject: (code, reason, notify = true) => rpc("admin_bot_reject", { p_code: code, p_reason: reason, ...quiet(notify) }),
    botPackages: () => rpc("admin_bot_packages"),
    botSavePackage: (p) =>
        rpc("admin_bot_save_package", { p_code: p.code, p_name: p.name, p_credits: p.credits, p_valid_days: p.valid_days, p_price_egp: p.price_egp, p_active: p.active, p_sort: p.sort }),
    botSettings: () => rpc("admin_bot_settings"),
    botSetSetting: (key, value) => rpc("admin_bot_set_setting", { p_key: key, p_value: value }),
    // Features 1, 2 and 4
    userDevices: (id) => rpc("admin_user_devices", { p_user: id }),
    unlinkDevice: (deviceId) => rpc("admin_unlink_device", { p_device: deviceId }),
    setDeviceLimit: (id, limit) => rpc("admin_set_device_limit", { p_user: id, p_limit: limit }),
    appConfig: () => rpc("admin_app_config"),
    setAppConfig: (key, value) => rpc("admin_set_app_config", { p_key: key, p_value: value }),
    expiring: (days) => rpc("admin_expiring", { p_days: days }),
    remindExpiring: (id) => rpc("admin_remind_expiring", { p_user: id }),
    botContactUpdate: (id, blocked, release) => rpc("admin_bot_contact_update", { p_contact: id, p_blocked: blocked, p_release: !!release }),
    newKey: key
};
