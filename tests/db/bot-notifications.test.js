// Client notifications: dashboard changes are queued for the sales bot, delivery bookkeeping, privileges.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { DB_URL, asAnon, asService, asUser, connect, createUser, key, rpc } from "./helpers.js";

const d = DB_URL ? describe : describe.skip;

d("bot notifications (database)", () => {
    let db;
    let admin;
    beforeAll(async () => {
        db = await connect();
        // Notices left open by earlier runs (other test files, e2e users) must not fill the claim batches.
        await db.query("update public.bot_notifications set status = 'skipped' where status in ('pending', 'sending', 'waiting')");
        admin = await createUser(db);
        await db.query("insert into private.admins (user_id) values ($1)", [admin]);
    });
    afterAll(async () => db && db.end());

    const svc = async (sql, params = []) => (await asService(db, sql, params)).rows[0].r;
    const notices = async (user) => (await db.query("select * from public.bot_notifications where user_id = $1 order by id", [user])).rows;
    const phone = () => "20" + String(Math.floor(Math.random() * 1e10)).padStart(10, "0");
    const linkedContact = async (user, lastInbound = "now()") => {
        const { rows } = await db.query(
            `insert into public.bot_contacts (wa_id, name, user_id, last_inbound_at) values ($1, 'Client', $2, ${lastInbound}) returning id`,
            [phone(), user]
        );
        return rows[0].id;
    };
    const claimMine = async (user) => (await svc("select public.bot_claim_notifications(50) as r")).filter((n) => n.account?.user_id === user);

    it("queues admin credit changes with amount, reason and expiry; ignores the bot's own sales", async () => {
        const user = await createUser(db);
        await rpc(db, admin, "admin_grant_credits", [user, 100, 30, "bonus for feedback", key()]);
        await rpc(db, admin, "admin_remove_credits", [user, 40, "duplicate top-up", key()]);
        await asService(db, "select public.grant_credits($1, 50, 'purchase', $2, 'bot', 'WhatsApp order')", [user, `EZ-${randomUUID()}`]);
        const rows = await notices(user);
        expect(rows.map((r) => r.kind)).toEqual(["credits_added", "credits_removed"]);
        expect(rows[0].data).toMatchObject({ amount: 100, note: "bonus for feedback" });
        expect(new Date(rows[0].data.expires_at) > new Date()).toBe(true);
        expect(rows[1].data).toMatchObject({ amount: 40, note: "duplicate top-up" });
        expect(rows.every((r) => r.status === "pending" && /^admin:/.test(r.actor))).toBe(true);
    });

    it("pause/resume notify only on a real change; password reset is admin-only and stores no password", async () => {
        const user = await createUser(db);
        await rpc(db, admin, "admin_set_disabled", [user, true]);
        await rpc(db, admin, "admin_set_disabled", [user, true]);
        await rpc(db, admin, "admin_set_disabled", [user, false]);
        await rpc(db, admin, "admin_note_password_reset", [user]);
        const stranger = await createUser(db);
        await expect(rpc(db, stranger, "admin_note_password_reset", [user])).rejects.toThrow(/not_admin/);
        const rows = await notices(user);
        expect(rows.map((r) => r.kind)).toEqual(["disabled", "enabled", "password_reset"]);
        expect(JSON.stringify(rows.map((r) => r.data))).not.toMatch(/password/i);
    });

    it("claims once, with the linked contact, the 24-hour window and the current balance", async () => {
        const user = await createUser(db);
        const contact = await linkedContact(user);
        await rpc(db, admin, "admin_grant_credits", [user, 25, 30, null, key()]);
        const [n] = await claimMine(user);
        expect(n).toMatchObject({ kind: "credits_added", contact: { id: Number(contact), in_window: true }, account: { available: 25 } });
        expect(await claimMine(user)).toEqual([]);
        await svc("select public.bot_notification_done($1, 'sent') as r", [n.id]);
        const [row] = await notices(user);
        expect(row.status).toBe("sent");
        expect(row.sent_at).not.toBeNull();
    });

    it("outside the window or without a contact: reported as such; waiting notices are taken by the contact's next message", async () => {
        const lonely = await createUser(db);
        await rpc(db, admin, "admin_grant_credits", [lonely, 5, 30, null, key()]);
        expect((await claimMine(lonely))[0].contact).toBeNull();

        const user = await createUser(db);
        const contact = await linkedContact(user, "now() - interval '2 days'");
        await expect(rpc(db, admin, "admin_remove_credits", [user, 1, "test", key()])).rejects.toThrow(); // no balance: rolled back, nothing queued
        await rpc(db, admin, "admin_grant_credits", [user, 10, 30, null, key()]);
        const [n] = await claimMine(user);
        expect(n.contact.in_window).toBe(false);
        await svc("select public.bot_notification_done($1, 'waiting') as r", [n.id]);
        const taken = await svc("select public.bot_take_waiting_notifications($1) as r", [contact]);
        expect(taken.map((x) => x.id)).toEqual([n.id]);
        expect(await svc("select public.bot_take_waiting_notifications($1) as r", [contact])).toEqual([]);
        await expect(svc("select public.bot_notification_done($1, 'bogus') as r", [n.id])).rejects.toThrow(/invalid_status/);
    });

    it("an order rejected from the dashboard notifies its contact", async () => {
        const c = await svc("select public.bot_touch_contact($1, 'T', 'hi') as r", [phone()]);
        const o = await svc("select public.bot_create_order($1, 'basic', $2) as r", [c.id, `${randomUUID()}@x.test`]);
        await rpc(db, admin, "admin_bot_reject", [o.code, "rejected from dashboard"]);
        const { rows } = await db.query("select * from public.bot_notifications where contact_id = $1", [c.id]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ kind: "order_rejected", data: { code: o.code } });
    });

    it("the admin can choose not to notify: nothing is queued, the change itself still happens", async () => {
        const user = await createUser(db);
        await rpc(db, admin, "admin_grant_credits", [user, 50, 30, "quiet top-up", key(), false]);
        await rpc(db, admin, "admin_remove_credits", [user, 5, "quiet fix", key(), false]);
        await rpc(db, admin, "admin_set_disabled", [user, true, false]);
        await rpc(db, admin, "admin_set_disabled", [user, false, true]);
        await rpc(db, admin, "admin_grant_credits", [user, 1, 30, null, key()]); // default: notify
        const rows = await notices(user);
        expect(rows.map((r) => r.kind)).toEqual(["enabled", "credits_added"]);
        const bal = (await db.query("select balance, disabled from public.credit_accounts where user_id = $1", [user])).rows[0];
        expect(Number(bal.balance)).toBe(46);
        expect(bal.disabled).toBe(false);

        const c = await svc("select public.bot_touch_contact($1, 'T', 'hi') as r", [phone()]);
        const o = await svc("select public.bot_create_order($1, 'basic', $2) as r", [c.id, `${randomUUID()}@x.test`]);
        const r = await rpc(db, admin, "admin_bot_reject", [o.code, "quiet", false]);
        expect(r.changed).toBe(true);
        expect((await db.query("select count(*)::int n from public.bot_notifications where contact_id = $1", [c.id])).rows[0].n).toBe(0);
    });

    it("only service_role reads or delivers notices; admins read a client's list", async () => {
        const user = await createUser(db);
        await expect(asUser(db, user, "select * from public.bot_notifications")).rejects.toThrow(/permission denied/);
        await expect(asAnon(db, "select * from public.bot_notifications")).rejects.toThrow(/permission denied/);
        await expect(asUser(db, admin, "select public.bot_claim_notifications(5)")).rejects.toThrow(/permission denied/);
        await expect(asUser(db, admin, "select public.bot_take_waiting_notifications(1)")).rejects.toThrow(/permission denied/);
        await rpc(db, admin, "admin_grant_credits", [user, 3, 30, null, key()]);
        const list = await rpc(db, admin, "admin_client_notifications", [user, 10]);
        expect(list).toHaveLength(1);
        await expect(rpc(db, user, "admin_client_notifications", [user, 10])).rejects.toThrow(/not_admin/);
    });
});
