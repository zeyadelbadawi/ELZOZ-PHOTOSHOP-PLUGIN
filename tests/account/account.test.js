import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "../../src/account/auth.js";
import { createBilling, createCreditsClient } from "../../src/account/credits.js";
import { secureUuid } from "../../src/account/random.js";

const URL_ = "https://proj.supabase.co";
const ANON = "anon-key";

function memoryStorage() {
    const m = new Map();
    return {
        m,
        async setItem(k, v) {
            m.set(k, new TextEncoder().encode(v));
        },
        async getItem(k) {
            if (!m.has(k)) throw new Error("missing");
            return m.get(k);
        },
        async removeItem(k) {
            m.delete(k);
        }
    };
}

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });

describe("auth client", () => {
    it("signs in, keeps the access token in memory and the refresh token in secureStorage", async () => {
        const fetchImpl = vi.fn(async () => json(200, { access_token: "at1", refresh_token: "rt1", expires_in: 3600, user: { id: "u1", email: "a@b.c" } }));
        const storage = memoryStorage();
        const auth = createAuthClient({ url: URL_, anonKey: ANON, fetchImpl, secureStorage: storage });
        await auth.signIn(" a@b.c ", "pw");
        const [calledUrl, init] = fetchImpl.mock.calls[0];
        expect(calledUrl).toBe(`${URL_}/auth/v1/token?grant_type=password`);
        expect(JSON.parse(init.body)).toEqual({ email: "a@b.c", password: "pw" });
        expect(init.headers.apikey).toBe(ANON);
        expect(new TextDecoder().decode(storage.m.get("elzoz.auth.refresh"))).toBe("rt1");
        expect(await auth.getAccessToken()).toBe("at1");
        expect(auth.user).toEqual({ id: "u1", email: "a@b.c" });
    });

    it("maps wrong passwords and unconfirmed emails to clear errors", async () => {
        const auth = (body, status = 400) => createAuthClient({ url: URL_, anonKey: ANON, fetchImpl: async () => json(status, body), secureStorage: memoryStorage() });
        await expect(auth({ error: "invalid_grant", error_description: "Invalid login credentials" }).signIn("a", "b")).rejects.toMatchObject({ code: "invalid_credentials" });
        await expect(auth({ error_code: "email_not_confirmed", msg: "Email not confirmed" }).signIn("a", "b")).rejects.toMatchObject({ code: "email_not_confirmed" });
        await expect(auth({}, 429).signIn("a", "b")).rejects.toMatchObject({ code: "rate_limited" });
    });

    it("refreshes an expiring token once even when asked concurrently (rotation-safe)", async () => {
        let t = 0;
        const calls = [];
        const fetchImpl = async (u, init) => {
            calls.push(u);
            if (u.endsWith("grant_type=password")) return json(200, { access_token: "at1", refresh_token: "rt1", expires_in: 100 });
            return json(200, { access_token: "at2", refresh_token: "rt2", expires_in: 3600 });
        };
        const storage = memoryStorage();
        const auth = createAuthClient({ url: URL_, anonKey: ANON, fetchImpl, secureStorage: storage, now: () => t });
        await auth.signIn("a@b.c", "pw");
        t = 50_000; // within the 60 s skew
        const [a, b] = await Promise.all([auth.getAccessToken(), auth.getAccessToken()]);
        expect([a, b]).toEqual(["at2", "at2"]);
        expect(calls.filter((u) => u.includes("refresh_token"))).toHaveLength(1);
        expect(new TextDecoder().decode(storage.m.get("elzoz.auth.refresh"))).toBe("rt2");
    });

    it("signs out locally when the refresh token is rejected", async () => {
        const storage = memoryStorage();
        await storage.setItem("elzoz.auth.refresh", "stale");
        const auth = createAuthClient({ url: URL_, anonKey: ANON, fetchImpl: async () => json(400, { error: "invalid_grant" }), secureStorage: storage });
        expect(await auth.restore()).toBeNull();
        expect(storage.m.has("elzoz.auth.refresh")).toBe(false);
    });

    it("keeps the stored session when the network is down at startup", async () => {
        const storage = memoryStorage();
        await storage.setItem("elzoz.auth.refresh", "rt");
        const auth = createAuthClient({ url: URL_, anonKey: ANON, fetchImpl: async () => { throw new Error("offline"); }, secureStorage: storage });
        await expect(auth.restore()).rejects.toMatchObject({ code: "network" });
        expect(storage.m.has("elzoz.auth.refresh")).toBe(true);
    });
});

describe("credits client", () => {
    const auth = { getAccessToken: vi.fn(async ({ forceRefresh } = {}) => (forceRefresh ? "fresh" : "old")) };

    it("calls RPCs with the user's token and a secure idempotency key", async () => {
        const fetchImpl = vi.fn(async () => json(200, { job_id: "j1", reserved: 2, available_after: 8 }));
        const credits = createCreditsClient({ url: URL_, anonKey: ANON, auth, fetchImpl, newKey: () => "key-1234567890" });
        const billing = createBilling(credits);
        expect(await billing.startJob({ kind: "design", itemKeys: ["row-2", "row-3"] })).toEqual({ jobId: "j1", reserved: 2, availableAfter: 8 });
        const [u, init] = fetchImpl.mock.calls[0];
        expect(u).toBe(`${URL_}/rest/v1/rpc/start_job`);
        expect(init.headers.Authorization).toBe("Bearer old");
        expect(JSON.parse(init.body)).toEqual({ p_kind: "design", p_items: [{ key: "row-2" }, { key: "row-3" }], p_client_info: {}, p_idempotency_key: "key-1234567890" });
    });

    it("retries transient failures with the SAME idempotency key", async () => {
        const responses = [() => { throw new Error("socket hang up"); }, () => json(503, {}), () => json(200, { item_key: "row-2", charged: 1 })];
        const fetchImpl = vi.fn(async () => responses.shift()());
        let n = 0;
        const credits = createCreditsClient({ url: URL_, anonKey: ANON, auth, fetchImpl, backoffMs: 1, newKey: () => `key-${++n}-abcdefgh` });
        await credits.reportItem({ jobId: "j", itemKey: "row-2", status: "succeeded", evidence: {} });
        const keys = fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body).p_idempotency_key);
        expect(keys).toEqual(["key-1-abcdefgh", "key-1-abcdefgh", "key-1-abcdefgh"]);
    });

    it("refreshes once on 401 and does not retry business errors", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(json(401, {}))
            .mockResolvedValueOnce(json(400, { code: "P0001", message: "insufficient_credits", details: '{"needed": 5, "available": 2}' }));
        const credits = createCreditsClient({ url: URL_, anonKey: ANON, auth, fetchImpl, backoffMs: 1 });
        await expect(credits.startJob({ kind: "design", items: [{ key: "a" }] })).rejects.toMatchObject({
            code: "insufficient_credits",
            message: "Not enough credits for this job.",
            details: { needed: 5, available: 2 }
        });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe("Bearer fresh");
    });

    it("reads the balance from the server", async () => {
        const credits = createCreditsClient({ url: URL_, anonKey: ANON, auth, fetchImpl: async () => json(200, [{ balance: "10", reserved: "3" }]) });
        expect(await credits.getAccount()).toEqual({ balance: 10, reserved: 3, available: 7 });
    });
});

describe("secureUuid", () => {
    it("uses randomUUID when present, getRandomValues otherwise, and never Math.random", () => {
        expect(secureUuid({ randomUUID: () => "x" })).toBe("x");
        const id = secureUuid({ getRandomValues: (a) => a.fill(255) });
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(() => secureUuid({})).toThrow(/Secure random/);
    });
});
