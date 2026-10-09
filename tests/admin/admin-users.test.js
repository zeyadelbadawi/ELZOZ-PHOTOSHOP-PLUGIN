// The admin-users Edge Function logic over HTTP, against the real credits DB
// (local Postgres + PostgREST) and a stub of the Supabase Auth admin API
// (tests/harness/e2e-server.js). Optionally also through the real Deno entry
// point when ELZOZ_DENO points at a deno binary.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import { generatePassword } from "../../supabase/functions/admin-users/core.mjs";

const hasBackend = !!(process.env.ELZOZ_TEST_DATABASE_URL && process.env.ELZOZ_TEST_POSTGREST_URL && process.env.ELZOZ_TEST_JWT_SECRET);
const PORT = 54350;
const BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);

describe("generatePassword", () => {
    it("makes readable 3x4 passwords without look-alike characters", () => {
        for (let i = 0; i < 200; i++) expect(generatePassword()).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{4}-[A-HJ-NP-Za-km-np-z2-9]{4}-[A-HJ-NP-Za-km-np-z2-9]{4}$/);
        expect(new Set(Array.from({ length: 200 }, () => generatePassword())).size).toBe(200);
    });
    it("rejects biased bytes instead of using modulo (bytes >= 224 are skipped)", () => {
        let calls = 0;
        const fake = (a) => {
            calls++;
            a.fill(calls === 1 ? 255 : 0); // first buffer all rejected, then 'A'
            return a;
        };
        expect(generatePassword(fake)).toBe("AAAA-AAAA-AAAA");
        expect(calls).toBe(2);
    });
});

const d = hasBackend ? describe : describe.skip;

d("admin-users function over HTTP (real DB, stub Auth admin API)", () => {
    let server;
    beforeAll(async () => {
        server = spawn(process.execPath, [path.resolve("tests/harness/e2e-server.js")], { env: { ...process.env, ELZOZ_E2E_PORT: String(PORT) }, stdio: "pipe" });
        await new Promise((resolve, reject) => {
            server.stdout.on("data", (b) => /e2e server on/.test(b.toString()) && resolve());
            server.on("exit", (code) => reject(new Error(`server exited ${code}`)));
        });
    }, 20000);
    afterAll(() => server && server.kill());

    const json = async (res) => ({ status: res.status, body: await res.json().catch(() => null), headers: res.headers });
    const post = (p, data, token, extra = {}) =>
        fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, body: JSON.stringify(data) }).then(json);
    const signIn = async (email, password) => post("/auth/v1/token?grant_type=password", { email, password });
    const token = async (email, password) => (await signIn(email, password)).body.access_token;
    const fn = (data, t, extra) => post("/functions/v1/admin-users", data, t, extra);
    const myCredits = (t) => post("/rest/v1/rpc/my_credits", {}, t);

    let adminToken;
    beforeAll(async () => {
        await post("/__e2e/users", { email: `admin-${RUN}@e2e.test`, password: "admin pass 123", admin: true });
        await post("/__e2e/users", { email: `plain-${RUN}@e2e.test`, password: "plain pass 123" });
        adminToken = await token(`admin-${RUN}@e2e.test`, "admin pass 123");
    });

    it("refuses anonymous callers and non-admins", async () => {
        expect((await fn({ action: "create_user", email: "x@y.z" })).body).toMatchObject({ error: "not_authenticated" });
        const t = await token(`plain-${RUN}@e2e.test`, "plain pass 123");
        const r = await fn({ action: "create_user", email: `sneaky-${RUN}@e2e.test`, credits: 1000 }, t);
        expect(r).toMatchObject({ status: 403, body: { error: "not_admin" } });
        expect((await signIn(`sneaky-${RUN}@e2e.test`, "x")).status).toBe(400); // nothing was created
    });

    it("creates a user with a generated password and initial credits valid for N days", async () => {
        const email = `Client-${RUN}@E2E.test`;
        const r = await fn({ action: "create_user", email, credits: 100, valid_days: 30, note: "WhatsApp transfer" }, adminToken);
        expect(r.status).toBe(200);
        expect(r.body.user.email).toBe(email.toLowerCase());
        expect(r.body.password).toMatch(/^\S{4}-\S{4}-\S{4}$/);
        const t = await token(email.toLowerCase(), r.body.password);
        const mine = await myCredits(t);
        expect(mine.body).toMatchObject({ balance: 100, available: 100, disabled: false });
        const days = (new Date(mine.body.next_expiry.expires_at) - Date.now()) / 86400000;
        expect(Math.round(days)).toBe(30);
        const acct = await (await fetch(`${BASE}/__e2e/account?email=${encodeURIComponent(email.toLowerCase())}`)).json();
        expect(acct.ledger).toEqual([expect.objectContaining({ kind: "purchase", amount: "100" })]);
    });

    it("rejects a duplicate email and bad input without side effects", async () => {
        const email = `dup-${RUN}@e2e.test`;
        expect((await fn({ action: "create_user", email }, adminToken)).status).toBe(200);
        expect(await fn({ action: "create_user", email, credits: 50 }, adminToken)).toMatchObject({ status: 409, body: { error: "email_exists" } });
        expect((await fn({ action: "create_user", email: "not-an-email" }, adminToken)).body.error).toBe("invalid_email");
        expect((await fn({ action: "create_user", email: `p-${RUN}@e2e.test`, password: "short" }, adminToken)).body.error).toBe("invalid_password");
        expect((await fn({ action: "create_user", email: `v-${RUN}@e2e.test`, valid_days: 0 }, adminToken)).body.error).toBe("invalid_validity");
        expect((await fn({ action: "nope" }, adminToken)).body.error).toBe("unknown_action");
    });

    it("resets a password: the old one stops working, the new one works", async () => {
        const email = `reset-${RUN}@e2e.test`;
        const created = await fn({ action: "create_user", email }, adminToken);
        const r = await fn({ action: "reset_password", user_id: created.body.user.id }, adminToken);
        expect(r.status).toBe(200);
        expect(r.body.password).not.toBe(created.body.password);
        expect((await signIn(email, created.body.password)).status).toBe(400);
        expect((await signIn(email, r.body.password)).status).toBe(200);
    });

    it("disables an account (no sign-in, no new jobs) and enables it again", async () => {
        const email = `off-${RUN}@e2e.test`;
        const created = await fn({ action: "create_user", email, credits: 5 }, adminToken);
        const userToken = await token(email, created.body.password);
        expect((await fn({ action: "set_disabled", user_id: created.body.user.id, disabled: true }, adminToken)).status).toBe(200);
        expect((await signIn(email, created.body.password)).body).toMatchObject({ error_code: "user_banned" });
        // An access token issued before the ban can't start jobs either.
        const start = await post("/rest/v1/rpc/start_job", { p_kind: "design", p_items: [{ key: "row-2" }], p_idempotency_key: `k-${RUN}-off-1`, p_client_info: {} }, userToken);
        expect(start.body.message).toBe("account_disabled");
        await fn({ action: "set_disabled", user_id: created.body.user.id, disabled: false }, adminToken);
        expect((await signIn(email, created.body.password)).status).toBe(200);
    });

    it("answers CORS preflight only for the configured dashboard origin", async () => {
        const ok = await fetch(`${BASE}/functions/v1/admin-users`, { method: "OPTIONS", headers: { Origin: BASE } });
        expect(ok.status).toBe(204);
        expect(ok.headers.get("access-control-allow-origin")).toBe(BASE);
        const bad = await fetch(`${BASE}/functions/v1/admin-users`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
        expect(bad.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("the Auth admin API refuses anything but the service key", async () => {
        const r = await post("/auth/v1/admin/users", { email: `x-${RUN}@e2e.test`, password: "12345678" }, adminToken);
        expect(r.status).toBe(401);
    });
});

// The same function through its real Deno entry point (index.ts), when a deno binary is available.
const DENO = process.env.ELZOZ_DENO;
(hasBackend && DENO ? describe : describe.skip)("admin-users through the Deno entry point", () => {
    let server;
    let deno;
    const DPORT = 54352;
    beforeAll(async () => {
        server = spawn(process.execPath, [path.resolve("tests/harness/e2e-server.js")], { env: { ...process.env, ELZOZ_E2E_PORT: String(DPORT) }, stdio: "pipe" });
        await new Promise((resolve) => server.stdout.on("data", (b) => /e2e server on/.test(b.toString()) && resolve()));
        const crypto = await import("node:crypto");
        const b64 = (x) => Buffer.from(x).toString("base64url");
        const sign = (claims) => {
            const h = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
            const p = b64(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 }));
            return `${h}.${p}.${crypto.createHmac("sha256", process.env.ELZOZ_TEST_JWT_SECRET).update(`${h}.${p}`).digest("base64url")}`;
        };
        deno = spawn(DENO, ["run", "--allow-net", "--allow-env", path.resolve("supabase/functions/admin-users/index.ts")], {
            env: { ...process.env, DENO_DIR: "/tmp/deno/cache", HOME: "/tmp/deno", SUPABASE_URL: `http://127.0.0.1:${DPORT}`, SUPABASE_ANON_KEY: sign({ role: "anon" }), SUPABASE_SERVICE_ROLE_KEY: sign({ role: "service_role" }), ELZOZ_ADMIN_ORIGINS: "https://admin.example" },
            stdio: "pipe"
        });
        await new Promise((resolve) => {
            const ready = (b) => /Listening/i.test(b.toString()) && resolve();
            deno.stdout.on("data", ready);
            deno.stderr.on("data", ready); // Deno prints its banner on stderr
        });
    }, 60000);
    afterAll(() => {
        deno && deno.kill();
        server && server.kill();
    });

    it("creates a user and the user can sign in", async () => {
        const base = `http://127.0.0.1:${DPORT}`;
        const call = (p, data, t) => fetch(p.startsWith("http") ? p : base + p, { method: "POST", headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(data) }).then(async (r) => ({ status: r.status, body: await r.json() }));
        await call("/__e2e/users", { email: `deno-admin-${RUN}@e2e.test`, password: "admin pass 123", admin: true });
        const t = (await call("/auth/v1/token?grant_type=password", { email: `deno-admin-${RUN}@e2e.test`, password: "admin pass 123" })).body.access_token;
        const r = await call("http://127.0.0.1:8000/", { action: "create_user", email: `deno-client-${RUN}@e2e.test`, credits: 10 }, t);
        expect(r.status).toBe(200);
        expect((await call("/auth/v1/token?grant_type=password", { email: `deno-client-${RUN}@e2e.test`, password: r.body.password })).status).toBe(200);
        const pre = await fetch("http://127.0.0.1:8000/", { method: "OPTIONS", headers: { Origin: "https://admin.example" } });
        expect(pre.headers.get("access-control-allow-origin")).toBe("https://admin.example");
    });
});
