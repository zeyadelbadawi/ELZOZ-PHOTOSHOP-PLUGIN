// End-to-end test server (development tool, never shipped).
//
//   /                 the e2e harness build (.harness-e2e)
//   /fixtures/...     files from test-artifacts/fixtures; /fixtures-list/<dir> lists a folder
//   /auth/v1/...      STUB of Supabase Auth: issues HS256 JWTs signed with the
//                     disposable test secret for users created through /__e2e/users
//   /rest/v1/...      proxied to the REAL PostgREST + Postgres credits backend
//                     started by scripts/test-env.sh (migrations, RLS, RPCs)
//   /auth/v1/admin/users  STUB of the Supabase Auth admin API (create user, set
//                     password, ban) - requires a service_role JWT, like the real one
//   /functions/v1/admin-users  the REAL Edge Function logic (supabase/functions/admin-users/core.mjs)
//   /admin/...        the admin dashboard build (admin/dist-e2e)
//   /__e2e/...        test control: create users, read balances/ledger, inject faults
//
// Needs the env written by `npm run test-env start` (ELZOZ_TEST_*). Refuses to
// start unless the database URL points at localhost: it creates and charges users.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");

const ROOT = path.resolve(__dirname, "../..");
const STATIC = path.join(ROOT, ".harness-e2e");
const ADMIN_STATIC = path.join(ROOT, "admin/dist-e2e");
const FIXTURES = path.join(ROOT, "test-artifacts/fixtures");
const PORT = Number(process.env.ELZOZ_E2E_PORT || 54340);
const DB = process.env.ELZOZ_TEST_DATABASE_URL;
const REST = process.env.ELZOZ_TEST_POSTGREST_URL;
const SECRET = process.env.ELZOZ_TEST_JWT_SECRET;

if (!DB || !REST || !SECRET) {
    console.error("Missing ELZOZ_TEST_* env. Run: npm run test-env start && source /tmp/elzoz-test/env");
    process.exit(2);
}
if (!/@(localhost|127\.0\.0\.1)|host=\/|%2F/.test(DB)) {
    console.error("Refusing to run: ELZOZ_TEST_DATABASE_URL is not a local database.");
    process.exit(2);
}

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
function signJwt(claims, ttl = 3600) {
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = b64url(JSON.stringify({ iat: now, exp: now + ttl, ...claims }));
    return `${head}.${body}.${b64url(crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest())}`;
}

function verifyJwt(token) {
    const [head, body, sig] = String(token || "").split(".");
    if (!sig) return null;
    const expect = b64url(crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest());
    if (expect !== sig) return null;
    const claims = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    return claims.exp && claims.exp * 1000 < Date.now() ? null : claims;
}
const SERVICE_KEY = signJwt({ role: "service_role" }, 3600 * 24);
const ANON_KEY = signJwt({ role: "anon" }, 3600 * 24 * 30);

const users = new Map(); // email -> {id, email, password, banned}
const refreshTokens = new Map(); // token -> email
const faults = []; // {match, mode: "drop-response"|"status", status, remaining}
const log = []; // request log for reports

async function db(fn) {
    const c = new Client({ connectionString: DB });
    await c.connect();
    try {
        return await fn(c);
    } finally {
        await c.end();
    }
}

const send = (res, status, body, headers = {}) => {
    const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, { "Content-Type": typeof body === "object" && !Buffer.isBuffer(body) ? "application/json" : "text/plain", ...headers });
    res.end(data);
};
const readBody = (req) =>
    new Promise((resolve) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => resolve(Buffer.concat(chunks)));
    });

function session(user) {
    const refresh = crypto.randomBytes(24).toString("hex");
    refreshTokens.set(refresh, user.email);
    return {
        access_token: signJwt({ sub: user.id, role: "authenticated", aud: "authenticated", email: user.email }),
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: refresh,
        user: { id: user.id, email: user.email }
    };
}

async function auth(req, res, url) {
    const body = JSON.parse((await readBody(req)).toString() || "{}");
    if (url.pathname.startsWith("/auth/v1/admin/users")) return authAdmin(req, res, url, body);
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
        const u = users.get(String(body.email || "").toLowerCase());
        if (!u || u.password !== body.password) return send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
        if (u.banned) return send(res, 400, { code: 400, error_code: "user_banned", msg: "User is banned" });
        return send(res, 200, session(u));
    }
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
        const email = refreshTokens.get(body.refresh_token);
        if (!email) return send(res, 400, { error: "invalid_grant", error_description: "Invalid Refresh Token" });
        refreshTokens.delete(body.refresh_token);
        if (users.get(email).banned) return send(res, 400, { code: 400, error_code: "user_banned", msg: "User is banned" });
        return send(res, 200, session(users.get(email)));
    }
    if (url.pathname === "/auth/v1/logout") return send(res, 204, "");
    if (url.pathname === "/auth/v1/recover") return send(res, 200, {});
    return send(res, 404, { error: "not_found" });
}

// Supabase Auth admin API (subset): POST /admin/users, PUT /admin/users/{id}. Service key only.
async function authAdmin(req, res, url, body) {
    const claims = verifyJwt(String(req.headers.authorization || "").replace(/^Bearer\s+/, ""));
    if (!claims || claims.role !== "service_role") return send(res, 401, { code: 401, msg: "This endpoint requires a valid Bearer token (service_role)" });
    if (req.method === "POST" && url.pathname === "/auth/v1/admin/users") {
        const email = String(body.email || "").toLowerCase();
        if ([...users.values()].some((u) => u.email === email)) return send(res, 422, { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" });
        const id = crypto.randomUUID();
        await db((c) => c.query("insert into auth.users (id, email) values ($1, $2)", [id, email]));
        users.set(email, { id, email, password: body.password, banned: false });
        log.push({ t: Date.now(), path: "admin/users POST", email });
        return send(res, 200, { id, email, email_confirmed_at: body.email_confirm ? new Date().toISOString() : null });
    }
    const m = url.pathname.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/);
    if (req.method === "PUT" && m) {
        const u = [...users.values()].find((x) => x.id === m[1]);
        if (!u) return send(res, 404, { code: 404, error_code: "user_not_found", msg: "User not found" });
        if (body.password) u.password = body.password;
        if (body.ban_duration) u.banned = body.ban_duration !== "none";
        if (u.banned) for (const [t, e] of refreshTokens) if (e === u.email) refreshTokens.delete(t);
        log.push({ t: Date.now(), path: "admin/users PUT", email: u.email, password: !!body.password, ban: body.ban_duration || null });
        return send(res, 200, { id: u.id, email: u.email, banned_until: u.banned ? "2126-01-01T00:00:00Z" : null });
    }
    return send(res, 404, { code: 404, msg: "not found" });
}

// The real Edge Function logic, with this server standing in for Supabase.
let adminCore = null;
async function adminFunction(req, res) {
    adminCore = adminCore || (await import(path.join(ROOT, "supabase/functions/admin-users/core.mjs")));
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const r = await adminCore.handleAdminRequest(
        { method: req.method, headers, body: (await readBody(req)).toString() },
        { supabaseUrl: `http://127.0.0.1:${PORT}`, serviceKey: SERVICE_KEY, anonKey: ANON_KEY, allowedOrigins: `http://127.0.0.1:${PORT}` }
    );
    res.writeHead(r.status, r.headers);
    res.end(r.body);
}

function proxy(req, res, url) {
    const fault = faults.find((f) => f.remaining > 0 && url.pathname.includes(f.match));
    if (fault) fault.remaining--;
    return readBody(req).then(
        (body) =>
            new Promise((resolve) => {
                const target = new URL(REST + url.pathname.replace(/^\/rest\/v1/, "") + url.search);
                const headers = { ...req.headers, host: target.host, "content-length": body.length };
                if (fault && fault.mode === "status") {
                    log.push({ t: Date.now(), path: url.pathname, fault: `status ${fault.status}` });
                    send(res, fault.status, { message: "injected fault" });
                    return resolve();
                }
                const up = http.request(target, { method: req.method, headers }, (upRes) => {
                    const chunks = [];
                    upRes.on("data", (c) => chunks.push(c));
                    upRes.on("end", () => {
                        log.push({ t: Date.now(), path: url.pathname, status: upRes.statusCode, fault: fault ? fault.mode : null });
                        if (fault && fault.mode === "drop-response") {
                            // The server committed the call; the client never hears back (lost response).
                            req.socket.destroy();
                        } else {
                            res.writeHead(upRes.statusCode, upRes.headers);
                            res.end(Buffer.concat(chunks));
                        }
                        resolve();
                    });
                });
                up.on("error", (e) => {
                    send(res, 502, { message: e.message });
                    resolve();
                });
                up.end(body);
            })
    );
}

async function control(req, res, url) {
    const body = req.method === "POST" ? JSON.parse((await readBody(req)).toString() || "{}") : {};
    if (url.pathname === "/__e2e/users" && req.method === "POST") {
        const email = String(body.email).toLowerCase();
        const id = crypto.randomUUID();
        await db(async (c) => {
            await c.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
            if (body.admin) await c.query("insert into private.admins (user_id) values ($1)", [id]);
            if (body.credits) {
                await c.query("begin");
                await c.query("set local role service_role");
                await c.query("select public.grant_credits($1, $2, 'grant', null, 'e2e-setup')", [id, body.credits]);
                await c.query("commit");
            }
        });
        users.set(email, { id, email, password: body.password, banned: false });
        return send(res, 200, { id, email });
    }
    if (url.pathname === "/__e2e/account") {
        const u = users.get(String(url.searchParams.get("email")).toLowerCase());
        if (!u) return send(res, 404, { error: "no such user" });
        const out = await db(async (c) => ({
            balance: (await c.query("select balance, reserved, disabled from public.credit_accounts where user_id = $1", [u.id])).rows[0] || null,
            lots: (await c.query("select amount, remaining, expires_at from public.credit_lots where user_id = $1 order by id", [u.id])).rows,
            password: u.password,
            banned: u.banned,
            ledger: (await c.query("select kind, amount, item_key, job_id from public.credit_ledger where user_id = $1 order by id", [u.id])).rows,
            jobs: (await c.query("select id, status, planned_items, reserved_total, charged_total from public.jobs where user_id = $1 order by created_at", [u.id])).rows,
            items: (await c.query("select i.item_key, i.status, i.units, i.cost from public.job_items i join public.jobs j on j.id = i.job_id where j.user_id = $1 order by j.created_at, i.item_key", [u.id])).rows
        }));
        return send(res, 200, out);
    }
    if (url.pathname === "/__e2e/expire-oldest-lot" && req.method === "POST") {
        // Time travel for tests: make the user's soonest-expiring open lot expire now.
        const u = users.get(String(body.email).toLowerCase());
        const r = await db((c) => c.query("update public.credit_lots set expires_at = now() - interval '1 second' where id = (select id from public.credit_lots where user_id = $1 and remaining > 0 order by expires_at, id limit 1) returning remaining", [u.id]));
        return send(res, 200, { expired: r.rows[0] ? Number(r.rows[0].remaining) : 0 });
    }
    if (url.pathname === "/__e2e/fault" && req.method === "POST") {
        faults.push({ match: body.match, mode: body.mode, status: body.status || 503, remaining: body.count || 1 });
        return send(res, 200, { ok: true });
    }
    if (url.pathname === "/__e2e/log") return send(res, 200, log);
    return send(res, 404, { error: "not_found" });
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
function serveFile(res, base, rel) {
    const file = path.resolve(base, "." + decodeURIComponent(rel));
    if (!file.startsWith(base + path.sep) && file !== base) return send(res, 403, "forbidden");
    fs.readFile(file, (err, data) => (err ? send(res, 404, "not found") : send(res, 200, data, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" })));
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
        if (url.pathname.startsWith("/auth/v1/")) return await auth(req, res, url);
        if (url.pathname.startsWith("/rest/v1/")) return await proxy(req, res, url);
        if (url.pathname.startsWith("/__e2e/")) return await control(req, res, url);
        if (url.pathname === "/functions/v1/admin-users") return await adminFunction(req, res);
        if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
            const rel = url.pathname.replace(/^\/admin\/?/, "/");
            return serveFile(res, ADMIN_STATIC, rel === "/" || !path.extname(rel) ? "/index.html" : rel);
        }
        if (url.pathname.startsWith("/fixtures-list/")) {
            const dir = path.resolve(FIXTURES, "." + decodeURIComponent(url.pathname.slice("/fixtures-list".length)));
            if (!dir.startsWith(FIXTURES)) return send(res, 403, "forbidden");
            return send(res, 200, fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isFile()));
        }
        if (url.pathname.startsWith("/fixtures/")) return serveFile(res, FIXTURES, url.pathname.slice("/fixtures".length));
        return serveFile(res, STATIC, url.pathname === "/" ? "/index.html" : url.pathname);
    } catch (e) {
        send(res, 500, { message: e.message });
    }
});
server.listen(PORT, "127.0.0.1", () => console.log(`e2e server on http://127.0.0.1:${PORT} (auth STUB, credits REAL via ${REST})`));
module.exports = { server, anonKey: () => ANON_KEY };
