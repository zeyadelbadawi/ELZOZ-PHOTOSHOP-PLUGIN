// Sales bot database: privileges, unique amounts, payment matching, fulfilment, referrals, admin RPCs.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { DB_URL, account, asAnon, asService, asUser, connect, createUser } from "./helpers.js";

const d = DB_URL ? describe : describe.skip;

d("sales bot (database)", () => {
    let db;
    let admin;
    beforeAll(async () => {
        db = await connect();
        admin = await createUser(db);
        await db.query("insert into private.admins (user_id) values ($1)", [admin]);
    });
    afterAll(async () => db && db.end());

    const svc = async (sql, params = []) => (await asService(db, sql, params)).rows[0].r;
    const phone = () => "20" + String(Math.floor(Math.random() * 1e10)).padStart(10, "0");
    const touch = (wa, text = "hi") => svc("select public.bot_touch_contact($1, 'Test', $2) as r", [wa, text]);
    const order = (contact, pkg, email) => svc("select public.bot_create_order($1, $2, $3) as r", [contact, pkg, email]);
    const pay = (amount, { trusted = true, ref = null, text = null } = {}) =>
        svc("select public.bot_record_payment('vodafone_cash', 'VF-Cash', $1, $2, '010', $3, $4, $5) as r",
            [trusted, amount, ref, text || `received ${amount} ${randomUUID()}`, randomUUID()]);

    it("hides every bot table and function from anon and signed-in users", async () => {
        for (const t of ["bot_packages", "bot_contacts", "bot_messages", "bot_orders", "bot_payment_events", "bot_settings"]) {
            await expect(asAnon(db, `select * from public.${t} limit 1`)).rejects.toThrow(/permission denied/);
            await expect(asUser(db, admin, `select * from public.${t} limit 1`)).rejects.toThrow(/permission denied/);
        }
        await expect(asUser(db, admin, "select public.bot_touch_contact('201', 'x', 'y')")).rejects.toThrow(/permission denied/);
        await expect(asUser(db, admin, "select public.bot_mark_paid('EZ-1', 'me')")).rejects.toThrow(/permission denied/);
        await expect(asAnon(db, "select public.bot_record_payment('bank','x',true,1,null,null,'t','f')")).rejects.toThrow(/permission denied/);
    });

    it("records the source tag of the first message and links referrals", async () => {
        const a = await touch(phone(), "أهلاً [IG-BIO]");
        expect(a.is_new).toBe(true);
        expect(a.source).toBe("IG-BIO");
        const b = await touch(phone(), `عايز أشترك [REF-${a.ref_code}]`);
        expect(String(b.referred_by)).toBe(String(a.id));
        const again = await touch(b.wa_id, "[FB-AD1]");
        expect(again.is_new).toBe(false);
        expect(again.source).toBe(`REF-${a.ref_code}`); // first source wins
    });

    it("deduplicates WhatsApp retries and counts recent messages", async () => {
        const c = await touch(phone());
        const id = `wamid.${randomUUID()}`;
        const first = await svc("select public.bot_log_in($1, $2, 'text', 'hi') as r", [c.id, id]);
        const retry = await svc("select public.bot_log_in($1, $2, 'text', 'hi') as r", [c.id, id]);
        expect(first.fresh).toBe(true);
        expect(retry.fresh).toBe(false);
        expect(retry.recent).toBe(1);
    });

    it("gives every open order a different amount and replaces a contact's previous open order", async () => {
        const c1 = await touch(phone());
        const c2 = await touch(phone());
        const o1 = await order(c1.id, "pro", "one@example.com");
        const o2 = await order(c2.id, "pro", "two@example.com");
        expect(Number(o1.amount_due)).not.toBe(Number(o2.amount_due));
        expect(Number(o1.amount_due)).toBeLessThanOrEqual(500);
        expect(Number(o2.amount_due)).toBeGreaterThanOrEqual(470);
        const o1b = await order(c1.id, "pro", "one@example.com");
        const { rows } = await db.query("select status from public.bot_orders where id = $1", [o1.id]);
        expect(rows[0].status).toBe("cancelled");
        expect(o1b.code).toMatch(/^EZ-\d{6}$/);
        await expect(order(c1.id, "pro", "not-an-email")).rejects.toThrow(/invalid_email/);
        await expect(order(c1.id, "nope", "a@b.co")).rejects.toThrow(/package_unavailable/);
    });

    it("detects renewals by email", async () => {
        const existing = await createUser(db);
        const { rows } = await db.query("select email from auth.users where id = $1", [existing]);
        const o = await order((await touch(phone())).id, "basic", rows[0].email.toUpperCase());
        expect(o.kind).toBe("renewal");
        expect(o.user_id).toBe(existing);
    });

    it("pays exactly the order whose unique amount matches a trusted notification, once", async () => {
        const c = await touch(phone());
        const o = await order(c.id, "agency", "pay@example.com");
        const untrusted = await pay(o.amount_due, { trusted: false });
        expect(untrusted.matched).toBe(false);
        const wrong = await pay(Number(o.amount_due) + 0.5);
        expect(wrong.matched).toBe(false);
        const ref = `T${Date.now()}`;
        const ok = await pay(o.amount_due, { ref });
        expect(ok.matched).toBe(true);
        expect(ok.order.code).toBe(o.code);
        expect(ok.order.approved_by).toBe("auto");
        const sameRef = await pay(o.amount_due, { ref });
        expect(sameRef.duplicate).toBe(true);
        const again = await pay(o.amount_due);
        expect(again.matched).toBe(false); // the order is no longer open
    });

    it("never auto-pays when auto-approval is off, and reports late payments for expired orders", async () => {
        await db.query("update public.bot_settings set value = 'false' where key = 'auto_approve'");
        try {
            const o = await order((await touch(phone())).id, "trial", "off@example.com");
            const r = await pay(o.amount_due);
            expect(r.matched).toBe(false);
            expect(r.candidate).toBe(o.code);
        } finally {
            await db.query("update public.bot_settings set value = 'true' where key = 'auto_approve'");
        }
        const o2 = await order((await touch(phone())).id, "trial", "late@example.com");
        await db.query("update public.bot_orders set expires_at = now() - interval '1 minute' where id = $1", [o2.id]);
        const tick = await svc("select public.bot_cron_tick() as r");
        expect(tick.expired.map((e) => e.code)).toContain(o2.code);
        const late = await pay(o2.amount_due);
        expect(late.matched).toBe(false);
        expect(late.late_candidate).toBe(o2.code);
    });

    it("fulfils once: credits with the package validity, linked contact, idempotent retry", async () => {
        const c = await touch(phone());
        const o = await order(c.id, "basic", `new-${randomUUID()}@example.com`);
        expect((await svc("select public.bot_begin_fulfillment($1) as r", [o.id]))).toBeNull(); // not paid yet
        await svc("select public.bot_mark_paid($1, 'owner') as r", [o.code]);
        const started = await svc("select public.bot_begin_fulfillment($1) as r", [o.id]);
        expect(started.wa_id).toBe(c.wa_id);
        expect(await svc("select public.bot_begin_fulfillment($1) as r", [o.id])).toBeNull(); // one worker only
        const user = randomUUID();
        await db.query("insert into auth.users (id, email) values ($1, $2)", [user, o.email]);
        const done = await svc("select public.bot_finish_fulfillment($1, $2) as r", [o.id, user]);
        expect(done.order.status).toBe("fulfilled");
        expect(done.account.available).toBe(100);
        const lot = await db.query("select expires_at - now() as left from public.credit_lots where user_id = $1", [user]);
        expect(lot.rows[0].left.days).toBeGreaterThanOrEqual(29);
        const retry = await svc("select public.bot_finish_fulfillment($1, $2) as r", [o.id, user]);
        expect(retry.grant.duplicate).toBe(true);
        expect((await account(db, user)).balance).toBe(100);
        const linked = await db.query("select user_id from public.bot_contacts where id = $1", [c.id]);
        expect(linked.rows[0].user_id).toBe(user);
    });

    it("pays the referral bonus once, on the referred client's first order", async () => {
        const referrer = await touch(phone());
        const refUser = await createUser(db);
        await db.query("update public.bot_contacts set user_id = $1 where id = $2", [refUser, referrer.id]);
        const friend = await touch(phone(), `[REF-${referrer.ref_code}]`);
        const fulfil = async () => {
            const o = await order(friend.id, "trial", `friend-${friend.id}@example.com`);
            await svc("select public.bot_mark_paid($1, 'owner') as r", [o.code]);
            await svc("select public.bot_begin_fulfillment($1) as r", [o.id]);
            let uid = await svc("select public.bot_find_user($1) as r", [o.email]);
            if (!uid) {
                uid = randomUUID();
                await db.query("insert into auth.users (id, email) values ($1, $2)", [uid, o.email]);
            }
            return svc("select public.bot_finish_fulfillment($1, $2) as r", [o.id, uid]);
        };
        const first = await fulfil();
        expect(first.referral.credits).toBe(10);
        const second = await fulfil();
        expect(second.referral).toBeNull();
        expect((await account(db, refUser)).balance).toBe(10);
    });

    it("lets the owner approve or reject only open/expired orders", async () => {
        const o = await order((await touch(phone())).id, "basic", "rej@example.com");
        const r = await svc("select public.bot_reject($1, 'owner', 'fake screenshot') as r", [o.code]);
        expect(r.changed).toBe(true);
        const again = await svc("select public.bot_mark_paid($1, 'owner') as r", [o.code]);
        expect(again.changed).toBe(false);
        expect(again.status).toBe("rejected");
    });

    it("produces the daily report once per local day", async () => {
        await db.query("update public.bot_settings set value = '0' where key = 'report_hour'");
        await db.query(`update public.bot_settings set value = '""' where key = 'last_report_date'`);
        const t1 = await svc("select public.bot_cron_tick() as r");
        const t2 = await svc("select public.bot_cron_tick() as r");
        expect(t1.report).toBeTruthy();
        expect(typeof t1.report.revenue).not.toBe("undefined");
        expect(t2.report).toBeNull();
    });

    it("rejects a cron key when Vault is unavailable", async () => {
        expect(await svc("select public.bot_cron_key_ok($1) as r", ["x".repeat(40)])).toBe(false);
    });

    it("admin RPCs work for admins only", async () => {
        const stranger = await createUser(db);
        await expect(asUser(db, stranger, "select public.admin_bot_orders()")).rejects.toThrow(/not_admin/);
        const res = await asUser(db, admin, "select public.admin_bot_orders('fulfilled') as r");
        expect(Array.isArray(res.rows[0].r)).toBe(true);
        const pkg = await asUser(db, admin, "select public.admin_bot_save_package('vip', 'VIP', 50, 10, 99, true, 9) as r");
        expect(pkg.rows[0].r.price_egp).toBe(99);
        await expect(asUser(db, admin, "select public.admin_bot_set_setting('evil', '1')")).rejects.toThrow(/unknown_setting/);
        const s = await asUser(db, admin, `select public.admin_bot_set_setting('paused', 'true') as r`);
        expect(s.rows[0].r.value).toBe(true);
        await asUser(db, admin, `select public.admin_bot_set_setting('paused', 'false')`);
        const ov = await asUser(db, admin, "select public.admin_bot_overview() as r");
        expect(ov.rows[0].r.paused).toBe(false);
        const o = await order((await touch(phone())).id, "basic", "dash@example.com");
        const ap = await asUser(db, admin, "select public.admin_bot_approve($1) as r", [o.code]);
        expect(ap.rows[0].r.order.approved_by).toMatch(/^admin:/);
    });
});
