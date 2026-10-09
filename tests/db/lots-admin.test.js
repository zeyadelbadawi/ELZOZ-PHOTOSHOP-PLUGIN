// Expiring credits (lots) and the admin RPCs (supabase/migrations/20261010000001_credit_lots_and_admin.sql).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB_URL, account, asService, asUser, connect, createUser, designItems, key, rpc } from "./helpers.js";

const d = DB_URL ? describe : describe.skip;

d("expiring credits and admin console", () => {
    let c;
    beforeAll(async () => {
        c = await connect();
    });
    afterAll(async () => {
        await c?.end();
    });

    const lots = async (u) => (await c.query("select id, amount, remaining, expires_at from public.credit_lots where user_id = $1 order by expires_at, id", [u])).rows.map((r) => ({ ...r, amount: Number(r.amount), remaining: Number(r.remaining) }));
    const ledger = async (u) => (await c.query("select kind, amount from public.credit_ledger where user_id = $1 order by id", [u])).rows.map((r) => [r.kind, Number(r.amount)]);
    /** balance must always equal the sum of what is left in the user's lots */
    const invariant = async (u) => {
        const a = await account(c, u);
        const sum = (await lots(u)).reduce((s, l) => s + l.remaining, 0);
        expect(sum, "balance = sum(lots.remaining)").toBe(a.balance);
        return a;
    };
    const topUp = (u, amount, days = 30) => asService(c, "select public.grant_credits($1, $2, 'purchase', null, 'test', null, now() + make_interval(days => $3))", [u, amount, days]);
    const expireLot = (id) => c.query("update public.credit_lots set expires_at = now() - interval '1 second' where id = $1", [id]);
    const startDesign = (u, n) => rpc(c, u, "start_job", ["design", designItems(n), key(), "{}"]);
    const report = (u, job, item, status = "succeeded") => rpc(c, u, "report_item", [job, item, status, "{}", key()]);
    const finish = (u, job) => rpc(c, u, "finish_job", [job, "completed", key()]);
    const makeAdmin = async () => {
        const a = await createUser(c);
        await c.query("insert into private.admins (user_id) values ($1)", [a]);
        return a;
    };

    describe("lots and expiry", () => {
        it("a top-up is a lot that expires 30 days later by default; my_credits shows it", async () => {
            const u = await createUser(c);
            await asService(c, "select public.grant_credits($1, 50, 'purchase', null, 'test')", [u]);
            const [lot] = await lots(u);
            const days = (new Date(lot.expires_at) - Date.now()) / 86400000;
            expect(days).toBeGreaterThan(29.9);
            expect(days).toBeLessThan(30.1);
            const mine = await rpc(c, u, "my_credits", []);
            expect(mine).toMatchObject({ balance: 50, reserved: 0, available: 50, disabled: false, next_expiry: { remaining: 50 } });
            await invariant(u);
        });

        it("spends the credits that expire first", async () => {
            const u = await createUser(c);
            await topUp(u, 5, 30);
            await topUp(u, 5, 3); // expires sooner, bought later
            const job = await startDesign(u, 3);
            for (const k of ["row-2", "row-3", "row-4"]) await report(u, job.job_id, k);
            await finish(u, job.job_id);
            const [soon, later] = await lots(u);
            expect([soon.remaining, later.remaining]).toEqual([2, 5]);
            await invariant(u);
        });

        it("expired credits disappear, with an 'expiry' ledger entry; credits that are still valid stay", async () => {
            const u = await createUser(c);
            await topUp(u, 10, 30);
            await topUp(u, 4, 30);
            const [a] = await lots(u);
            await expireLot(a.id);
            const mine = await rpc(c, u, "my_credits", []);
            expect(mine).toMatchObject({ balance: 4, available: 4 });
            expect(await ledger(u)).toEqual([["purchase", 10], ["purchase", 4], ["expiry", -10]]);
            await invariant(u);
            // A second call expires nothing more.
            await rpc(c, u, "my_credits", []);
            expect((await ledger(u)).filter(([k]) => k === "expiry")).toHaveLength(1);
        });

        it("an expired balance can't start a job", async () => {
            const u = await createUser(c);
            await topUp(u, 3);
            await expireLot((await lots(u))[0].id);
            await expect(startDesign(u, 1)).rejects.toThrow(/insufficient_credits/);
            await invariant(u);
        });

        it("never expires credits reserved by a running job; they expire once released", async () => {
            const u = await createUser(c);
            await topUp(u, 5);
            const job = await startDesign(u, 3); // reserves 3 of 5
            await expireLot((await lots(u))[0].id);
            await rpc(c, u, "my_credits", []);
            expect(await account(c, u)).toEqual({ balance: 3, reserved: 3 }); // the 2 free credits expired
            await report(u, job.job_id, "row-2"); // still chargeable
            await report(u, job.job_id, "row-3", "failed");
            await finish(u, job.job_id); // row-4 released
            const mine = await rpc(c, u, "my_credits", []);
            expect(mine).toMatchObject({ balance: 0, reserved: 0, available: 0 });
            expect(await ledger(u)).toEqual([["purchase", 5], ["expiry", -2], ["charge", -1], ["expiry", -2]]);
            await invariant(u);
        });

        it("the scheduled sweep expires everyone's lots", async () => {
            const u = await createUser(c);
            await topUp(u, 7);
            await expireLot((await lots(u))[0].id);
            await asService(c, "select public.expire_stale_jobs()");
            expect(await account(c, u)).toEqual({ balance: 0, reserved: 0 });
            await invariant(u);
        });

        it("refunds come back as a new 30-day lot", async () => {
            const u = await createUser(c);
            await topUp(u, 2);
            const job = await startDesign(u, 1);
            await report(u, job.job_id, "row-2");
            const charge = (await c.query("select id from public.credit_ledger where user_id = $1 and kind = 'charge'", [u])).rows[0].id;
            await asService(c, "select public.refund_charge($1, 'support', 'bad output')", [charge]);
            expect((await lots(u)).map((l) => l.remaining)).toEqual([1, 1]);
            await invariant(u);
        });

        it("a disabled account can't start jobs but still sees its balance", async () => {
            const u = await createUser(c);
            await topUp(u, 5);
            await c.query("update public.credit_accounts set disabled = true where user_id = $1", [u]);
            await expect(startDesign(u, 1)).rejects.toThrow(/account_disabled/);
            expect(await rpc(c, u, "my_credits", [])).toMatchObject({ balance: 5, disabled: true });
        });

        it("users can read only their own lots and can't write them", async () => {
            const a = await createUser(c);
            const b = await createUser(c);
            await topUp(a, 5);
            expect((await asUser(c, b, "select * from public.credit_lots where user_id = $1", [a])).rows).toEqual([]);
            await expect(asUser(c, a, "update public.credit_lots set remaining = 999 where true")).rejects.toThrow(/permission denied/);
            await expect(asUser(c, a, "select public.grant_credits(auth.uid(), 5, 'grant', null, 'me')")).rejects.toThrow(/permission denied/);
        });
    });

    describe("admin RPCs", () => {
        const adminCalls = [
            ["admin_list_users", "select public.admin_list_users()"],
            ["admin_user_detail", "select public.admin_user_detail(auth.uid())"],
            ["admin_grant_credits", "select public.admin_grant_credits(auth.uid(), 1000, 30, 'x', 'k-123456789')"],
            ["admin_remove_credits", "select public.admin_remove_credits(auth.uid(), 1, 'x', 'k-123456789')"],
            ["admin_set_disabled", "select public.admin_set_disabled(auth.uid(), false)"],
            ["admin_refund_charge", "select public.admin_refund_charge(1, 'x')"],
            ["admin_set_price", "select public.admin_set_price('design', 0)"],
            ["admin_stats", "select public.admin_stats()"]
        ];
        it.each(adminCalls)("a normal user can't call %s (not_admin)", async (_, sql) => {
            const u = await createUser(c);
            await expect(asUser(c, u, sql)).rejects.toThrow(/not_admin/);
            expect(await account(c, u)).toEqual({ balance: 0, reserved: 0 });
        });

        it("anonymous callers can't reach admin RPCs at all", async () => {
            await expect(c.query("begin; set local role anon; select public.admin_stats();")).rejects.toThrow(/permission denied/);
            await c.query("rollback");
        });

        it("am_i_admin tells the dashboard who is an admin", async () => {
            const admin = await makeAdmin();
            const u = await createUser(c);
            expect((await asUser(c, admin, "select public.am_i_admin() as r")).rows[0].r).toBe(true);
            expect((await asUser(c, u, "select public.am_i_admin() as r")).rows[0].r).toBe(false);
        });

        it("tops up a user once per idempotency key, records who did it, and sets the validity", async () => {
            const admin = await makeAdmin();
            const u = await createUser(c);
            const k = key();
            const first = await rpc(c, admin, "admin_grant_credits", [u, 100, 45, "WhatsApp transfer #12", k]);
            const again = await rpc(c, admin, "admin_grant_credits", [u, 100, 45, "WhatsApp transfer #12", k]);
            expect(again).toEqual(first);
            expect(await account(c, u)).toEqual({ balance: 100, reserved: 0 });
            const [lot] = await lots(u);
            expect(Math.round((new Date(lot.expires_at) - Date.now()) / 86400000)).toBe(45);
            const entry = (await c.query("select actor, note, kind from public.credit_ledger where user_id = $1", [u])).rows[0];
            expect(entry).toMatchObject({ actor: expect.stringMatching(/^admin:/), note: "WhatsApp transfer #12", kind: "purchase" });
            await expect(rpc(c, admin, "admin_grant_credits", [u, 0, 30, null, key()])).rejects.toThrow(/invalid_amount/);
            await expect(rpc(c, admin, "admin_grant_credits", [u, 5, 0, null, key()])).rejects.toThrow(/invalid_validity/);
            await invariant(u);
        });

        it("removes credits (with a note) but never below what a running job reserved", async () => {
            const admin = await makeAdmin();
            const u = await createUser(c);
            await rpc(c, admin, "admin_grant_credits", [u, 10, 30, null, key()]);
            await startDesign(u, 4);
            await expect(rpc(c, admin, "admin_remove_credits", [u, 3, "", key()])).rejects.toThrow(/note_required/);
            await expect(rpc(c, admin, "admin_remove_credits", [u, 7, "mistake", key()])).rejects.toThrow(/adjustment_below_reserved/);
            await rpc(c, admin, "admin_remove_credits", [u, 6, "mistake", key()]);
            expect(await account(c, u)).toEqual({ balance: 4, reserved: 4 });
            await invariant(u);
        });

        it("lists and searches users with balance, next expiry and usage; shows one user's history", async () => {
            const admin = await makeAdmin();
            const u = await createUser(c);
            await rpc(c, admin, "admin_grant_credits", [u, 20, 10, "first", key()]);
            const job = await startDesign(u, 2);
            await report(u, job.job_id, "row-2");
            await finish(u, job.job_id);
            const list = await rpc(c, admin, "admin_list_users", [u.slice(0, 8), 50, 0]);
            expect(list.total).toBe(1);
            expect(list.users[0]).toMatchObject({ id: u, balance: 19, available: 19, used_30d: 1, disabled: false, is_admin: false });
            expect(list.users[0].next_expiry).toBeTruthy();
            const detail = await rpc(c, admin, "admin_user_detail", [u]);
            expect(detail.account).toMatchObject({ balance: 19, available: 19 });
            expect(detail.lots).toHaveLength(1);
            expect(detail.ledger.map((e) => e.kind)).toEqual(["charge", "purchase"]);
            expect(detail.jobs).toHaveLength(1);
            await expect(rpc(c, admin, "admin_user_detail", ["00000000-0000-4000-8000-000000000000"])).rejects.toThrow(/user_not_found/);
        });

        it("disables and re-enables an account; changes prices; reports stats", async () => {
            const admin = await makeAdmin();
            const u = await createUser(c);
            await rpc(c, admin, "admin_grant_credits", [u, 5, 30, null, key()]);
            await rpc(c, admin, "admin_set_disabled", [u, true]);
            await expect(startDesign(u, 1)).rejects.toThrow(/account_disabled/);
            await rpc(c, admin, "admin_set_disabled", [u, false]);
            await startDesign(u, 1);
            const prices = await rpc(c, admin, "admin_set_price", ["design", 2]);
            expect(prices.find((p) => p.unit === "design").price).toBe(2);
            await expect(rpc(c, admin, "admin_set_price", ["design", -1])).rejects.toThrow(/invalid_price/);
            await rpc(c, admin, "admin_set_price", ["design", 1]);
            const stats = await rpc(c, admin, "admin_stats", []);
            expect(stats.users).toBeGreaterThan(0);
            expect(stats.credits_sold_30d).toBeGreaterThanOrEqual(5);
            expect(stats.pricing).toHaveLength(2);
        });

        it("refunds a charge through the admin RPC", async () => {
            const admin = await makeAdmin();
            const u = await createUser(c);
            await rpc(c, admin, "admin_grant_credits", [u, 3, 30, null, key()]);
            const job = await startDesign(u, 1);
            await report(u, job.job_id, "row-2");
            const charge = (await c.query("select id from public.credit_ledger where user_id = $1 and kind = 'charge'", [u])).rows[0].id;
            await rpc(c, admin, "admin_refund_charge", [charge, "client complaint"]);
            expect(await account(c, u)).toMatchObject({ balance: 3 });
            await expect(rpc(c, admin, "admin_refund_charge", [charge, "again"])).rejects.toThrow(/duplicate key|unique/);
            await invariant(u);
        });
    });
});
