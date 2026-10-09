// Security and correctness tests for supabase/migrations/*credits.sql.
// Run with scripts/test-db.sh (creates a throwaway PostgreSQL with a Supabase-like stub).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB_URL, account, asAnon, asService, asUser, connect, createUser, designItems, key, rpc } from "./helpers.js";

const d = DB_URL ? describe : describe.skip;

d("credits database", () => {
    let c;
    beforeAll(async () => {
        c = await connect();
    });
    afterAll(async () => {
        await c?.end();
    });

    const startDesign = (uid, n, k = key()) => rpc(c, uid, "start_job", ["design", designItems(n), k, "{}"]);
    const report = (uid, job, item, status, k = key(), evidence = {}) => rpc(c, uid, "report_item", [job, item, status, JSON.stringify(evidence), k]);
    const finish = (uid, job, status = "completed", k = key()) => rpc(c, uid, "finish_job", [job, status, k]);

    describe("access control", () => {
        it("creates a zero-balance account for every new auth user", async () => {
            const u = await createUser(c);
            expect(await account(c, u)).toEqual({ balance: 0, reserved: 0 });
        });

        it.each([
            ["update public.credit_accounts set balance = 1000000 where true"],
            ["insert into public.credit_ledger (user_id, kind, amount, balance_after, actor) values (auth.uid(), 'grant', 999, 999, 'me')"],
            ["insert into public.jobs (user_id, kind, unit_price, planned_items, reserved_total, expires_at) values (auth.uid(), 'design', 0, 1, 0, now())"],
            ["update public.job_items set status = 'failed' where true"],
            ["delete from public.credit_ledger where true"],
            ["update public.pricing_rules set price = 0 where true"],
            ["select * from private.idempotency_keys"],
            ["select private.expire_jobs(null)"]
        ])("authenticated cannot: %s", async (sql) => {
            const u = await createUser(c, { balance: 5 });
            await expect(asUser(c, u, sql)).rejects.toThrow(/permission denied/);
            expect(await account(c, u)).toEqual({ balance: 5, reserved: 0 });
        });

        it.each([
            ["select public.grant_credits(auth.uid(), 1000, 'grant', null, 'me')"],
            ["select public.refund_charge(1, 'me', 'x')"],
            ["select public.expire_stale_jobs()"]
        ])("authenticated cannot call service functions: %s", async (sql) => {
            const u = await createUser(c);
            await expect(asUser(c, u, sql)).rejects.toThrow(/permission denied/);
        });

        it("anon can neither read tables nor call RPCs", async () => {
            await expect(asAnon(c, "select * from public.credit_accounts")).rejects.toThrow(/permission denied/);
            await expect(asAnon(c, "select public.start_job('design', '[{\"key\":\"a\"}]', 'k-anon-123', '{}')")).rejects.toThrow(/permission denied/);
        });

        it("rejects calls without a user identity", async () => {
            await expect(asUser(c, null, "select public.start_job('design', '[{\"key\":\"a\"}]', 'k-anon-123', '{}')")).rejects.toThrow(/not_authenticated/);
        });

        it("isolates users: B can't see or touch A's data", async () => {
            const a = await createUser(c, { balance: 10 });
            const b = await createUser(c, { balance: 10 });
            const job = await startDesign(a, 2);
            await report(a, job.job_id, "row-2", "succeeded");

            for (const t of ["credit_accounts", "jobs", "credit_ledger"]) {
                const { rows } = await asUser(c, b, `select * from public.${t} where user_id = $1`, [a]);
                expect(rows).toEqual([]);
            }
            const items = await asUser(c, b, "select * from public.job_items where job_id = $1", [job.job_id]);
            expect(items.rows).toEqual([]);
            await expect(report(b, job.job_id, "row-3", "succeeded")).rejects.toThrow(/job_not_found/);
            await expect(finish(b, job.job_id)).rejects.toThrow(/job_not_found/);
            // A sees exactly its own account.
            const own = await asUser(c, a, "select user_id from public.credit_accounts");
            expect(own.rows.map((r) => r.user_id)).toEqual([a]);
        });
    });

    describe("billing semantics", () => {
        it("reserves on start, charges only succeeded items, releases the rest", async () => {
            const u = await createUser(c, { balance: 10 });
            const job = await startDesign(u, 3);
            expect(job).toMatchObject({ reserved: 3, items: 3, available_after: 7 });
            expect(await account(c, u)).toEqual({ balance: 10, reserved: 3 });

            expect(await report(u, job.job_id, "row-2", "succeeded")).toMatchObject({ charged: 1, balance: 9 });
            expect(await report(u, job.job_id, "row-3", "failed")).toMatchObject({ charged: 0, balance: 9 });
            expect(await account(c, u)).toEqual({ balance: 9, reserved: 1 });

            const done = await finish(u, job.job_id, "completed_with_errors");
            expect(done).toMatchObject({ status: "completed_with_errors", charged: 1, released_now: 1, balance: 9 });
            expect(await account(c, u)).toEqual({ balance: 9, reserved: 0 });

            const ledger = await asUser(c, u, "select kind, amount, item_key from public.credit_ledger where job_id = $1", [job.job_id]);
            expect(ledger.rows).toEqual([{ kind: "charge", amount: "-1", item_key: "row-2" }]);
        });

        it("refuses a job the user can't afford and leaves no trace", async () => {
            const u = await createUser(c, { balance: 2 });
            await expect(startDesign(u, 3)).rejects.toThrow(/insufficient_credits/);
            expect(await account(c, u)).toEqual({ balance: 2, reserved: 0 });
            const jobs = await asUser(c, u, "select count(*)::int as n from public.jobs");
            expect(jobs.rows[0].n).toBe(0);
        });

        it("never charges an item twice", async () => {
            const u = await createUser(c, { balance: 5 });
            const job = await startDesign(u, 1);
            await report(u, job.job_id, "row-2", "succeeded");
            await expect(report(u, job.job_id, "row-2", "succeeded")).rejects.toThrow(/item_already_reported/);
            await expect(report(u, job.job_id, "row-2", "failed")).rejects.toThrow(/item_already_reported/);
            expect(await account(c, u)).toEqual({ balance: 4, reserved: 0 });
        });

        it("replays an idempotent request without side effects; rejects key reuse with different data", async () => {
            const u = await createUser(c, { balance: 5 });
            const k1 = key();
            const first = await startDesign(u, 2, k1);
            const again = await startDesign(u, 2, k1);
            expect(again).toEqual(first);
            expect(await account(c, u)).toEqual({ balance: 5, reserved: 2 });
            await expect(startDesign(u, 3, k1)).rejects.toThrow(/idempotency_key_reused/);

            const k2 = key();
            const r1 = await report(u, first.job_id, "row-2", "succeeded", k2);
            const r2 = await report(u, first.job_id, "row-2", "succeeded", k2);
            expect(r2).toEqual(r1);
            expect(await account(c, u)).toEqual({ balance: 4, reserved: 1 });
        });

        it("rejects reports after a job is finished", async () => {
            const u = await createUser(c, { balance: 5 });
            const job = await startDesign(u, 2);
            await finish(u, job.job_id, "cancelled");
            await expect(report(u, job.job_id, "row-2", "succeeded")).rejects.toThrow(/job_not_active/);
            expect(await account(c, u)).toEqual({ balance: 5, reserved: 0 });
            // finishing again is harmless
            expect(await finish(u, job.job_id, "cancelled")).toMatchObject({ status: "cancelled", released_now: 0 });
        });

        it("prices video by started 5 s and resolution, server-side", async () => {
            const u = await createUser(c, { balance: 20 });
            const items = JSON.stringify([
                { key: "v1", duration_ms: 6000, width: 1080, height: 1920 }, // 2 units
                { key: "v2", duration_ms: 5000, width: 1080, height: 1080 }, // 1 unit
                { key: "v3", duration_ms: 6000, width: 3840, height: 2160 } // 2 x 2 = 4 units
            ]);
            const job = await rpc(c, u, "start_job", ["video", items, key(), "{}"]);
            expect(job.reserved).toBe(7);
            await expect(rpc(c, u, "start_job", ["video", JSON.stringify([{ key: "x", duration_ms: 500, width: 10, height: 10 }]), key(), "{}"])).rejects.toThrow(/invalid_video_spec/);
        });

        it("validates inputs", async () => {
            const u = await createUser(c, { balance: 5 });
            await expect(rpc(c, u, "start_job", ["design", "[]", key(), "{}"])).rejects.toThrow(/invalid_items/);
            await expect(rpc(c, u, "start_job", ["design", JSON.stringify([{ key: "a" }, { key: "a" }]), key(), "{}"])).rejects.toThrow(/invalid_items/);
            await expect(rpc(c, u, "start_job", ["design", designItems(1), "short", "{}"])).rejects.toThrow(/invalid_idempotency_key/);
            await expect(rpc(c, u, "start_job", ["print", designItems(1), key(), "{}"])).rejects.toThrow(/invalid_kind/);
            const job = await startDesign(u, 1);
            await expect(report(u, job.job_id, "row-2", "paid")).rejects.toThrow(/invalid_status/);
            await expect(report(u, job.job_id, "row-2", "succeeded", key(), { blob: "x".repeat(9000) })).rejects.toThrow(/evidence_too_large/);
        });
    });

    describe("concurrency, expiry and abuse limits", () => {
        it("two concurrent jobs can't spend the same credits", async () => {
            const u = await createUser(c, { balance: 5 });
            const [c1, c2] = [await connect(), await connect()];
            try {
                const attempt = (cl) => asUser(cl, u, "select public.start_job('design', $1, $2, '{}') as r", [designItems(4), key()]);
                const results = await Promise.allSettled([attempt(c1), attempt(c2)]);
                expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
                expect(results.find((r) => r.status === "rejected").reason.message).toMatch(/insufficient_credits/);
                expect(await account(c, u)).toEqual({ balance: 5, reserved: 4 });
            } finally {
                await c1.end();
                await c2.end();
            }
        });

        it("releases reservations of abandoned jobs after expiry", async () => {
            const u = await createUser(c, { balance: 5 });
            const job = await startDesign(u, 3);
            await report(u, job.job_id, "row-2", "succeeded");
            await c.query("update public.jobs set expires_at = now() - interval '1 minute' where id = $1", [job.job_id]);
            await expect(report(u, job.job_id, "row-3", "succeeded")).rejects.toThrow(/job_expired/);
            const swept = await asService(c, "select public.expire_stale_jobs() as n");
            expect(swept.rows[0].n).toBeGreaterThanOrEqual(1);
            expect(await account(c, u)).toEqual({ balance: 4, reserved: 0 });
            const { rows } = await c.query("select status from public.jobs where id = $1", [job.job_id]);
            expect(rows[0].status).toBe("expired");
        });

        it("limits concurrently active jobs per user", async () => {
            const u = await createUser(c, { balance: 50 });
            for (let i = 0; i < 3; i++) await startDesign(u, 1);
            await expect(startDesign(u, 1)).rejects.toThrow(/too_many_active_jobs/);
        });

        it("rate-limits job creation", async () => {
            const u = await createUser(c, { balance: 100 });
            await c.query("delete from private.rate_limits where user_id = $1", [u]);
            let limited = null;
            for (let i = 0; i < 25 && !limited; i++) {
                try {
                    const j = await startDesign(u, 1);
                    await finish(u, j.job_id, "cancelled");
                } catch (e) {
                    limited = e;
                }
            }
            expect(limited?.message).toMatch(/rate_limited/);
        });
    });

    describe("ledger and administration", () => {
        it("ledger is append-only even for privileged roles", async () => {
            const u = await createUser(c, { balance: 3 });
            await expect(c.query("update public.credit_ledger set amount = 100000 where user_id = $1", [u])).rejects.toThrow(/append-only/);
            await expect(c.query("delete from public.credit_ledger where user_id = $1", [u])).rejects.toThrow(/append-only/);
            await expect(asService(c, "truncate public.credit_ledger")).rejects.toThrow();
        });

        it("records a purchase once per external reference", async () => {
            const u = await createUser(c);
            const ref = `pay_${key()}`;
            await asService(c, "select public.grant_credits($1, 50, 'purchase', $2, 'stripe')", [u, ref]);
            const dup = await asService(c, "select public.grant_credits($1, 50, 'purchase', $2, 'stripe') as r", [u, ref]);
            expect(dup.rows[0].r).toMatchObject({ duplicate: true, balance: 50 });
            expect(await account(c, u)).toEqual({ balance: 50, reserved: 0 });
        });

        it("refunds a charge exactly once", async () => {
            const u = await createUser(c, { balance: 3 });
            const job = await startDesign(u, 1);
            await report(u, job.job_id, "row-2", "succeeded");
            const { rows } = await c.query("select id from public.credit_ledger where job_id = $1 and kind = 'charge'", [job.job_id]);
            await asService(c, "select public.refund_charge($1, 'support:alice', 'defective output')", [rows[0].id]);
            expect(await account(c, u)).toEqual({ balance: 3, reserved: 0 });
            await expect(asService(c, "select public.refund_charge($1, 'support:alice', 'again')", [rows[0].id])).rejects.toThrow(/duplicate key/);
        });

        it("adjustments can't push the balance below active reservations", async () => {
            const u = await createUser(c, { balance: 5 });
            await startDesign(u, 4);
            await expect(asService(c, "select public.grant_credits($1, -3, 'adjustment', null, 'admin:bob')", [u])).rejects.toThrow(/adjustment_below_reserved/);
        });
    });
});
