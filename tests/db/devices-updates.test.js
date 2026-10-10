// Features 1, 2 and 4 in the database: computers per account, forced update,
// expiring credits and reminders. Global settings changed here are restored.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { DB_URL, asAnon, asService, connect, createUser, designItems, key, rpc } from "./helpers.js";

const d = DB_URL ? describe : describe.skip;

d("devices, plugin version and expiring credits (database)", () => {
    let db;
    let admin;
    let saved;
    beforeAll(async () => {
        db = await connect();
        admin = await createUser(db);
        await db.query("insert into private.admins (user_id) values ($1)", [admin]);
        saved = (await db.query("select key, value from public.app_config")).rows;
        await db.query("update public.bot_notifications set status = 'skipped' where status in ('pending', 'sending', 'waiting')");
    });
    afterAll(async () => {
        for (const r of saved) await db.query("update public.app_config set value = $2 where key = $1", [r.key, JSON.stringify(r.value)]);
        await db.end();
    });

    const client = (device, plugin = "1.2.0", name = "Photoshop 26 · Windows") => JSON.stringify({ plugin, device_id: device, device_name: name });
    // Start a job and close it at once (at most 3 jobs may be open per account).
    const start = async (user, info) => {
        const r = await rpc(db, user, "start_job", ["design", designItems(1), key(), info]);
        await rpc(db, user, "finish_job", [r.job_id, "cancelled", key()]);
        return r;
    };
    const setConfig = (k, v) => rpc(db, admin, "admin_set_app_config", [k, JSON.stringify(v)]);
    const dev = () => `dev-${randomUUID()}`;

    it("compares versions like people do", async () => {
        const cmp = async (a, b) => (await db.query("select private.version_cmp($1, $2) as r", [a, b])).rows[0].r;
        expect(await cmp("1.10.0", "1.9.9")).toBe(1);
        expect(await cmp("1.0.0-e2e", "1.0.0")).toBe(-1);
        expect(await cmp("1.0", "1.0.0")).toBe(0);
        expect(await cmp("2", "1.99.99")).toBe(1);
    });

    it("forced update: below the minimum version, the plugin can't generate and check_in says so", async () => {
        const user = await createUser(db, { balance: 10 });
        await setConfig("min_plugin_version", "1.2.0");
        await setConfig("latest_plugin_version", "1.3.0");
        await setConfig("update_url", "https://example.com/elzoz.ccx");
        const pc = dev();
        await expect(start(user, client(pc, "1.1.9"))).rejects.toThrow(/update_required/);
        const c = await rpc(db, user, "check_in", [client(pc, "1.1.9")]);
        expect(c.update).toMatchObject({ required: true, available: true, min_version: "1.2.0", latest_version: "1.3.0", update_url: "https://example.com/elzoz.ccx" });
        const ok = await rpc(db, user, "check_in", [client(pc, "1.2.0")]);
        expect(ok.update).toMatchObject({ required: false, available: true });
        expect((await start(user, client(pc, "1.2.0"))).job_id).toBeTruthy();
        // Anyone (even signed out) can read what's needed to update.
        const anon = (await asAnon(db, "select public.plugin_config() as r")).rows[0].r;
        expect(anon).toMatchObject({ min_version: "1.2.0", latest_version: "1.3.0" });
        await setConfig("min_plugin_version", "0.0.0");
    });

    it("devices: up to the limit; an extra computer is refused with the list; the client can switch once per N days", async () => {
        const user = await createUser(db, { balance: 20 });
        await setConfig("device_limit", 2);
        await setConfig("device_switch_days", 7);
        const [a, b, c] = [dev(), dev(), dev()];
        expect((await start(user, client(a, "1.2.0", "Office PC"))).job_id).toBeTruthy();
        expect((await start(user, client(b, "1.2.0", "Home Mac"))).job_id).toBeTruthy();
        expect((await start(user, client(a, "1.2.0", "Office PC"))).job_id).toBeTruthy(); // a known computer keeps working
        await expect(start(user, client(c, "1.2.0", "Friend's laptop"))).rejects.toThrow(/device_limit/);
        const seen = await rpc(db, user, "check_in", [client(c)]);
        expect(seen.device).toMatchObject({ status: "limit", limit: 2, can_switch: true });
        expect(seen.device.devices.map((x) => x.name).sort()).toEqual(["Home Mac", "Office PC"]);
        // Move the account here: the least recently used computer (Home Mac) is unlinked.
        expect(await rpc(db, user, "switch_device", [client(c, "1.2.0", "New laptop")])).toMatchObject({ status: "ok" });
        expect((await start(user, client(c, "1.2.0", "New laptop"))).job_id).toBeTruthy();
        await expect(start(user, client(b))).rejects.toThrow(/device_limit/);
        await expect(rpc(db, user, "switch_device", [client(b)])).rejects.toThrow(/switch_too_soon/);
        const mine = await rpc(db, user, "my_devices", []);
        expect(mine.devices.map((x) => x.name).sort()).toEqual(["New laptop", "Office PC"]);
        expect(new Date(mine.next_switch_at) > new Date()).toBe(true);
    });

    it("a plugin that must update takes no computer slot; moving after the limit was lowered frees enough slots", async () => {
        const user = await createUser(db, { balance: 10 });
        await setConfig("device_limit", 2);
        await setConfig("min_plugin_version", "1.2.0");
        const old = dev();
        expect((await rpc(db, user, "check_in", [client(old, "1.0.0")])).device).toMatchObject({ status: "unknown" });
        await setConfig("min_plugin_version", "0.0.0");
        const [a, b, c] = [dev(), dev(), dev()];
        await start(user, client(a, "1.2.0", "A"));
        await start(user, client(b, "1.2.0", "B"));
        expect((await rpc(db, admin, "admin_user_devices", [user])).devices).toHaveLength(2);
        await rpc(db, admin, "admin_set_device_limit", [user, 1]);
        await rpc(db, user, "switch_device", [client(c, "1.2.0", "C")]);
        const mine = await rpc(db, user, "my_devices", []);
        expect(mine.devices.map((x) => x.name)).toEqual(["C"]);
        expect((await start(user, client(c, "1.2.0", "C"))).job_id).toBeTruthy();
    });

    it("the owner sees, unlinks and changes the limit per client; old plugins without a device id pass unless required", async () => {
        const user = await createUser(db, { balance: 20 });
        await setConfig("device_limit", 1);
        await start(user, client(dev(), "1.2.0", "Only PC"));
        await expect(start(user, client(dev()))).rejects.toThrow(/device_limit/);
        let info = await rpc(db, admin, "admin_user_devices", [user]);
        expect(info).toMatchObject({ limit: 1, custom_limit: null, default_limit: 1 });
        await rpc(db, admin, "admin_set_device_limit", [user, 3]);
        expect((await start(user, client(dev()))).job_id).toBeTruthy();
        info = await rpc(db, admin, "admin_user_devices", [user]);
        expect(info.limit).toBe(3);
        await rpc(db, admin, "admin_unlink_device", [info.devices[0].id]);
        info = await rpc(db, admin, "admin_user_devices", [user]);
        expect(info.devices.filter((x) => x.unlinked_at)).toHaveLength(1);
        expect(info.devices.find((x) => x.unlinked_at).unlinked_by).toMatch(/^admin:/);
        // A plugin from before this release sends no device id.
        expect((await start(user, JSON.stringify({ plugin: "1.2.0" }))).job_id).toBeTruthy();
        await setConfig("require_device_id", true);
        await expect(start(user, JSON.stringify({ plugin: "1.2.0" }))).rejects.toThrow(/update_required/);
        await setConfig("require_device_id", false);
        await setConfig("device_limit", 2);
    });

    it("settings are validated and only admins can change them", async () => {
        await expect(setConfig("min_plugin_version", "latest")).rejects.toThrow(/invalid_version/);
        await expect(setConfig("update_url", "http://insecure.example")).rejects.toThrow(/invalid_url/);
        await expect(setConfig("device_limit", 0)).rejects.toThrow(/invalid_value/);
        await expect(setConfig("whatever", 1)).rejects.toThrow(/unknown_setting/);
        const user = await createUser(db);
        await expect(rpc(db, user, "admin_set_app_config", ["device_limit", "3"])).rejects.toThrow(/not_admin/);
        await expect(rpc(db, user, "admin_expiring", [7])).rejects.toThrow(/not_admin/);
        await expect(asAnon(db, "select public.check_in('{}'::jsonb)")).rejects.toThrow(/permission denied/);
    });

    it("expiring credits: the owner's list, a manual reminder, and one automatic reminder per batch", async () => {
        const user = await createUser(db);
        await asService(db, "select public.grant_credits($1, 40, 'grant', null, 'test', null, now() + interval '2 days')", [user]);
        await asService(db, "select public.grant_credits($1, 100, 'grant', null, 'test', null, now() + interval '40 days')", [user]);
        await db.query(`insert into public.bot_contacts (wa_id, name, user_id, last_inbound_at) values ($1, 'Client', $2, now())`, ["20" + String(Date.now()).slice(-10), user]);
        const list = await rpc(db, admin, "admin_expiring", [7]);
        const row = list.find((r) => r.user_id === user);
        expect(row).toMatchObject({ credits: 40, available: 140, reminded_at: null });
        expect(row.wa_id).toMatch(/^20/);
        await rpc(db, admin, "admin_remind_expiring", [user]);
        let n = (await db.query("select kind, data, actor from public.bot_notifications where user_id = $1", [user])).rows;
        expect(n).toHaveLength(1);
        expect(n[0]).toMatchObject({ kind: "expiry_reminder", data: { credits: 40 } });
        expect(n[0].actor).toMatch(/^admin:/);
        // Automatic: none again right after a reminder; another client gets one.
        const other = await createUser(db);
        await asService(db, "select public.grant_credits($1, 15, 'grant', null, 'test', null, now() + interval '1 day')", [other]);
        await asService(db, "select public.bot_queue_expiry_reminders() as r");
        expect((await db.query("select count(*)::int as c from public.bot_notifications where user_id = $1", [user])).rows[0].c).toBe(1);
        expect((await db.query("select data, actor from public.bot_notifications where user_id = $1", [other])).rows[0]).toMatchObject({ data: { credits: 15 }, actor: "system" });
        await asService(db, "select public.bot_queue_expiry_reminders() as r");
        expect((await db.query("select count(*)::int as c from public.bot_notifications where user_id = $1", [other])).rows[0].c).toBe(1);
        const nothing = await createUser(db);
        await expect(rpc(db, admin, "admin_remind_expiring", [nothing])).rejects.toThrow(/nothing_expiring/);
    });
});
