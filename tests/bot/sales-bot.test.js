// Sales bot: payment parsing, conversation routing, webhook security, and full customer journeys
// against the real local database (PostgREST + PostgreSQL). WhatsApp, Telegram, Gemini and the
// Supabase Auth admin API are replaced by recording fakes: no message leaves this machine.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { parsePayment, extractForwarded, parseAllowedSenders } from "../../supabase/functions/sales-bot/lib/payments.mjs";
import { decide, keywordIntent } from "../../supabase/functions/sales-bot/lib/flow.mjs";
import { createBot } from "../../supabase/functions/sales-bot/lib/bot.mjs";
import { supabaseClient, verifyMetaSignature } from "../../supabase/functions/sales-bot/lib/clients.mjs";
import { normalizeDigits, extractEmail } from "../../supabase/functions/sales-bot/lib/util.mjs";
import { admin, env, hasBackend, signJwt } from "../e2e/helpers.js";

const ALLOWED = parseAllowedSenders("");

describe("payment notification parser", () => {
    it("reads Vodafone Cash Arabic SMS: the received amount, not the balance", () => {
        const p = parsePayment(
            { text: "تم استلام مبلغ 297.00 جنيه من رقم 01012345678 المسجل باسم احمد؛ رصيد حسابك الحالي 1,450.50 جنيه. رقم العملية: 0098877", sender: "VF-Cash" },
            ALLOWED
        );
        expect(p).toMatchObject({ amount: 297, payer: "01012345678", reference: "0098877", channel: "vodafone_cash", trusted: true });
    });
    it("reads English Vodafone Cash and Arabic-Indic digits", () => {
        expect(parsePayment({ text: "You have received 1,500.00 EGP from 01155556666. Your balance is 2000 EGP. Transaction ID 777AA1", sender: "VF-Cash" }, ALLOWED)).toMatchObject({
            amount: 1500,
            reference: "777AA1"
        });
        expect(parsePayment({ text: "تم استلام ٤٩٥ جنيه من ٠١٠٢٢٢٣٣٣٤٤", sender: "VF-Cash" }, ALLOWED).amount).toBe(495);
    });
    it("reads InstaPay notifications and bank SMS about InstaPay transfers", () => {
        const a = parsePayment({ text: "You have received EGP 180.00 from MOHAMED ALI via InstaPay. Ref: IP8822", app: "com.egyptianbanks.instapay" }, ALLOWED);
        expect(a).toMatchObject({ amount: 180, channel: "instapay", trusted: true, reference: "IP8822", payer: "MOHAMED ALI" });
        const b = parsePayment({ text: "تم إضافة مبلغ 1450 ج.م إلى حسابك رقم ***1234 عن طريق انستاباي", sender: "InstaPay" }, ALLOWED);
        expect(b).toMatchObject({ amount: 1450, channel: "instapay", trusted: true });
    });
    it("ignores money sent, balance-only and unrelated messages", () => {
        expect(parsePayment({ text: "تم تحويل مبلغ 200 جنيه إلى رقم 01012345678. رصيدك 50 جنيه", sender: "VF-Cash" }, ALLOWED)).toBeNull();
        expect(parsePayment({ text: "You have sent 200 EGP to 0101. Balance received bonus", sender: "VF-Cash" }, ALLOWED)).toBeNull();
        expect(parsePayment({ text: "كود التحقق الخاص بك 123456", sender: "VF-Cash" }, ALLOWED)).toBeNull();
        expect(parsePayment({ text: "رصيدك الحالي 300 جنيه", sender: "VF-Cash" }, ALLOWED)).toBeNull();
    });
    it("never trusts an SMS from a normal phone number, however it is worded", () => {
        const p = parsePayment({ text: "تم استلام مبلغ 297.00 جنيه من رقم 01012345678", sender: "+201012345678" }, ALLOWED);
        expect(p.trusted).toBe(false);
        expect(parsePayment({ text: "تم استلام مبلغ 297 جنيه" }, ALLOWED).trusted).toBe(false);
    });
    it("understands the body formats of common forwarder apps", () => {
        expect(extractForwarded(JSON.stringify({ from: "VF-Cash", text: "hi", receivedStamp: 1700000000000 }), "application/json")).toMatchObject({ sender: "VF-Cash", text: "hi" });
        expect(extractForwarded(JSON.stringify({ notification: { package: "com.egyptianbanks.instapay", title: "InstaPay", text: "You have received EGP 5" } }), "application/json")).toMatchObject({
            app: "com.egyptianbanks.instapay",
            text: "InstaPay - You have received EGP 5"
        });
        expect(extractForwarded("from=VF-Cash&message=abc", "application/x-www-form-urlencoded")).toMatchObject({ sender: "VF-Cash", text: "abc" });
        expect(extractForwarded("plain body", "text/plain").text).toBe("plain body");
    });
});

describe("conversation routing", () => {
    const base = { state: "idle", state_data: {}, account: null, is_new: false };
    const text = (t, contact = {}) => decide({ contact: { ...base, ...contact }, msg: { type: "text", text: t } });
    it("maps Egyptian Arabic keywords", () => {
        expect(keywordIntent("بكام الباقات؟")).toBe("prices");
        expect(keywordIntent("عايز اشترك")).toBe("buy");
        expect(keywordIntent("نسيت الباسورد")).toBe("forgot");
        expect(keywordIntent("عايز أكلم مسئول")).toBe("human");
        expect(keywordIntent("القائمة")).toBe("menu");
        expect(keywordIntent("إلغاء")).toBe("cancel");
        expect(keywordIntent("ممكن تفاصيل اكتر عن البرنامج")).toBeNull();
    });
    it("welcomes new contacts, asks the AI only when keywords fail", () => {
        expect(text("hi", { is_new: true }).step).toBe("welcome");
        expect(text("ممكن تفاصيل اكتر").step).toBe("classify");
        expect(decide({ contact: base, msg: { type: "text", text: "ممكن تفاصيل" }, aiIntent: { intent: "prices" } }).step).toBe("prices");
        expect(decide({ contact: base, msg: { type: "text", text: "؟؟" }, aiIntent: { intent: "other" } })).toMatchObject({ step: "menu", unclear: true });
    });
    it("collects and confirms the email, then hands off after 3 failures", () => {
        const st = { state: "awaiting_email", state_data: { package: "basic" } };
        expect(text("ده ايميلي Ahmed.X@Gmail.com", st)).toMatchObject({ step: "confirm_email", email: "ahmed.x@gmail.com", package: "basic" });
        expect(text("مش فاهم", st)).toMatchObject({ step: "email_again", tries: 1 });
        expect(text("مش فاهم", { ...st, state_data: { package: "basic", email_tries: 2 } }).step).toBe("human");
        expect(text("القائمة", st).step).toBe("menu");
    });
    it("only claims a payment with an image while an order is open", () => {
        expect(decide({ contact: { ...base, state: "awaiting_payment", state_data: { order_code: "EZ-1" } }, msg: { type: "image" } }).step).toBe("claim_payment");
        expect(decide({ contact: base, msg: { type: "image" } }).step).toBe("image_without_order");
        expect(text("حولت خلاص", { state: "awaiting_payment", state_data: { order_code: "EZ-1" } }).step).toBe("ask_screenshot");
    });
    it("stays silent while a person handles the chat, unless the customer asks for the menu", () => {
        const human = { human_until: new Date(Date.now() + 3600e3).toISOString() };
        expect(text("مرحبا", human).step).toBe("forward_to_owner");
        expect(text("القائمة", human)).toMatchObject({ step: "menu", release: true });
    });
    it("offers renewal to linked accounts", () => {
        expect(decide({ contact: { ...base, account: { email: "a@b.co" } }, msg: { type: "button", id: "buy" } }).step).toBe("renew_confirm");
        expect(decide({ contact: { ...base, state_data: { renew_email: "a@b.co" } }, msg: { type: "button", id: "pkg:pro" } })).toMatchObject({ step: "create_order", email: "a@b.co" });
    });
    it("helpers", () => {
        expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
        expect(extractEmail("mail: X@Y.io.")).toBe("x@y.io");
    });
});

describe("webhook signatures", () => {
    it("verifies Meta's X-Hub-Signature-256 and rejects anything else", async () => {
        const body = '{"a":1}';
        const sig = "sha256=" + crypto.createHmac("sha256", "app-secret").update(body).digest("hex");
        expect(await verifyMetaSignature(body, sig, "app-secret")).toBe(true);
        expect(await verifyMetaSignature(body + " ", sig, "app-secret")).toBe(false);
        expect(await verifyMetaSignature(body, sig, "")).toBe(false);
        expect(await verifyMetaSignature(body, undefined, "app-secret")).toBe(false);
    });
});

// ---------------------------------------------------------------- full journeys on the real database

const d = hasBackend ? describe : describe.skip;

d("sales bot journeys (real database, fake WhatsApp/Telegram/AI)", () => {
    const APP_SECRET = "meta-app-secret";
    const TG_SECRET = "telegram-secret-token";
    const PAY_KEY = "pay-key-0123456789abcdefghijklmnop";
    const CRON_KEY = "cron-key-0123456789abcdefghijklmnopqrstuvwxyz";
    const OWNER = "424242";
    let pgc;
    let bot;
    let deps;
    const wa = { sent: [] };
    const tg = { sent: [] };
    const passwords = [];
    const createdUsers = [];

    const signed = (payload) => {
        const rawBody = JSON.stringify(payload);
        return { method: "POST", query: {}, headers: { "x-hub-signature-256": "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(rawBody).digest("hex") }, rawBody };
    };
    const waMsg = (from, m, name = "Ahmed") =>
        signed({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "PNID" }, contacts: [{ wa_id: from, profile: { name } }], messages: [{ from, id: `wamid.${crypto.randomUUID()}`, ...m }] } }] }] });
    const say = async (from, text) => run(bot.handleWhatsApp(waMsg(from, { type: "text", text: { body: text } })));
    const tap = async (from, id) => run(bot.handleWhatsApp(waMsg(from, { type: "interactive", interactive: { type: "list_reply", list_reply: { id, title: id } } })));
    const photo = async (from) => run(bot.handleWhatsApp(waMsg(from, { type: "image", image: { id: "MEDIA1", mime_type: "image/jpeg" } })));
    const run = async (p) => {
        const r = await p;
        if (r.background) await r.background;
        return r;
    };
    const lastTo = (to) => wa.sent.filter((m) => m.to === to).at(-1);
    const tgUpdate = (u, secret = TG_SECRET) => run(bot.handleTelegram({ method: "POST", query: {}, headers: { "x-telegram-bot-api-secret-token": secret }, rawBody: JSON.stringify(u) }));
    const sms = (text, key = PAY_KEY, sender = "VF-Cash") =>
        run(bot.handlePayment({ method: "POST", query: {}, headers: { "x-elzoz-key": key, "content-type": "application/json" }, rawBody: JSON.stringify({ from: sender, text }) }));
    const order = async (code) => (await pgc.query("select * from public.bot_orders where code = $1", [code])).rows[0];
    const contact = async (wa_id) => (await pgc.query("select * from public.bot_contacts where wa_id = $1", [wa_id])).rows[0];
    const phone = () => "2010" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");

    beforeAll(async () => {
        pgc = await admin();
        // Vault stand-in (Supabase Vault is not in the local stub): only the cron key is needed.
        await pgc.query("create schema if not exists vault");
        await pgc.query("create table if not exists vault.decrypted_secrets (name text primary key, decrypted_secret text)");
        await pgc.query("insert into vault.decrypted_secrets values ('elzoz_bot_cron_key', $1) on conflict (name) do update set decrypted_secret = excluded.decrypted_secret", [CRON_KEY]);
        await pgc.query("update public.bot_settings set value = 'false' where key = 'paused'");

        const restFetch = (url, opts) => fetch(url.replace(`${env.rest}/rest/v1`, env.rest), opts);
        const db = supabaseClient({ url: env.rest, key: signJwt({ role: "service_role" }, env.secret, 3600), fetch: restFetch });
        // Supabase Auth admin API and Storage stand-ins.
        db.createUser = async (email, password) => {
            const exists = await pgc.query("select id from auth.users where lower(email) = lower($1)", [email]);
            if (exists.rows.length) throw Object.assign(new Error("already registered"), { status: 422 });
            const id = crypto.randomUUID();
            await pgc.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
            createdUsers.push({ id, email, password });
            return { id, email };
        };
        db.setPassword = async (id, password) => passwords.push({ id, password });
        db.signedUrl = async (bucket, path) => `https://storage.example/${bucket}/${path}?token=t`;

        deps = {
            db,
            wa: {
                text: async (to, body) => wa.sent.push({ to, kind: "text", body }),
                buttons: async (to, body, buttons) => wa.sent.push({ to, kind: "buttons", body, ids: buttons.map((b) => b.id) }),
                list: async (to, body, label, rows) => wa.sent.push({ to, kind: "list", body, ids: rows.map((r) => r.id) }),
                media: async () => ({ bytes: new Uint8Array([1, 2, 3]), mime: "image/jpeg" })
            },
            tg: {
                chatId: OWNER,
                send: async (text, buttons) => tg.sent.push({ kind: "text", text, buttons }),
                photo: async (bytes, mime, caption, buttons) => tg.sent.push({ kind: "photo", text: caption, buttons }),
                answer: async (id, text) => tg.sent.push({ kind: "answer", text }),
                clearButtons: async () => {}
            },
            ai: {
                classify: async (t) => ({ intent: /تفاصيل/.test(t) ? "prices" : "other", email: null }),
                readReceipt: async () => ({ is_receipt: true, amount: 1, reference: "R1", recipient: null })
            },
            config: { waAppSecret: APP_SECRET, waVerifyToken: "verify-me", waPhoneNumberId: "PNID", tgSecret: TG_SECRET, tgOwner: OWNER, payKey: PAY_KEY, allowedSenders: ALLOWED },
            password: () => {
                const p = `Pw-${crypto.randomUUID().slice(0, 8)}`;
                passwords.push({ issued: p });
                return p;
            }
        };
        bot = createBot(deps);
    });
    afterAll(async () => pgc && pgc.end());

    it("answers Meta's verification challenge only with the right token", async () => {
        const good = await bot.handleWhatsApp({ method: "GET", query: { "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "42" }, headers: {} });
        expect(good).toMatchObject({ status: 200, body: "42" });
        const bad = await bot.handleWhatsApp({ method: "GET", query: { "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "42" }, headers: {} });
        expect(bad.status).toBe(403);
    });

    it("rejects unsigned or tampered WhatsApp webhooks", async () => {
        const req = waMsg(phone(), { type: "text", text: { body: "hi" } });
        expect((await bot.handleWhatsApp({ ...req, headers: {} })).status).toBe(401);
        expect((await bot.handleWhatsApp({ ...req, rawBody: req.rawBody.replace("hi", "ho") })).status).toBe(401);
    });

    it("new customer → order → screenshot → payment SMS → account created and delivered, automatically", async () => {
        const me = phone();
        await say(me, "السلام عليكم [IG-BIO]");
        expect(lastTo(me)).toMatchObject({ kind: "list" });
        expect(tg.sent.at(-1).text).toMatch(/عميل جديد/);
        expect((await contact(me)).source).toBe("IG-BIO");

        await tap(me, "buy");
        expect(lastTo(me).ids).toContain("pkg:basic");
        await tap(me, "pkg:basic");
        expect(lastTo(me).body).toMatch(/الإيميل/);
        await say(me, `my email is Client.${me}@Example.com`);
        expect(lastTo(me)).toMatchObject({ kind: "buttons", ids: ["email_ok", "email_edit"] });
        await tap(me, "email_ok");
        const c = await contact(me);
        expect(c.state).toBe("awaiting_payment");
        const code = c.state_data.order_code;
        const o = await order(code);
        expect(o.status).toBe("awaiting_payment");
        expect(lastTo(me).body).toContain(`${Number(o.amount_due)} جنيه بالظبط`);
        expect(lastTo(me).body).toContain("elbadawi@instapay");

        await photo(me);
        expect((await order(code)).claimed_at).not.toBeNull();
        const alert = tg.sent.at(-1);
        expect(alert.kind).toBe("photo");
        expect(alert.buttons[0].map((b) => b.data)).toEqual([`ap:${code}`, `rj:${code}`]);
        expect(lastTo(me).body).toMatch(/استلمنا الإيصال/);
        expect(lastTo(me).body).toMatch(/المبلغ في الصورة 1/); // AI read a different amount: customer is told

        expect((await sms(`تم استلام مبلغ ${o.amount_due} جنيه من رقم 01012345678`, "wrong-key")).status).toBe(401);
        const paid = await sms(`تم استلام مبلغ ${o.amount_due} جنيه من رقم 01012345678؛ رصيدك 5000 جنيه. رقم العملية ${code.slice(3)}77`);
        expect(paid.body.matched).toBe(true);

        const done = await order(code);
        expect(done.status).toBe("fulfilled");
        expect(done.approved_by).toBe("auto");
        expect(done.credentials_sent).toBe(true);
        const user = createdUsers.find((u) => u.email === `client.${me}@example.com`);
        expect(user).toBeTruthy();
        const delivery = lastTo(me).body;
        expect(delivery).toContain(user.password);
        expect(delivery).toContain("https://storage.example/releases/elzoz.ccx");
        expect(delivery).toMatch(/REF-[A-F0-9]{6}/);
        const credits = await pgc.query("select balance from public.credit_accounts where user_id = $1", [user.id]);
        expect(Number(credits.rows[0].balance)).toBe(100);
        expect((await contact(me)).user_id).toBe(user.id);
        // the password is never logged or sent to the owner
        const logged = await pgc.query("select body from public.bot_messages m join public.bot_contacts c on c.id = m.contact_id where c.wa_id = $1", [me]);
        expect(logged.rows.some((r) => (r.body || "").includes(user.password))).toBe(false);
        expect(tg.sent.some((t) => (t.text || "").includes(user.password))).toBe(false);

        // the same SMS forwarded twice is ignored
        expect((await sms(`تم استلام مبلغ ${o.amount_due} جنيه من رقم 01012345678؛ رصيدك 5000 جنيه. رقم العملية ${code.slice(3)}77`)).body.duplicate).toBe(true);

        // ---- the same customer renews; the owner approves from Telegram
        await say(me, "عايز أجدد");
        expect(lastTo(me)).toMatchObject({ kind: "buttons", ids: ["renew_yes", "renew_other"] });
        await tap(me, "renew_yes");
        await tap(me, "pkg:trial");
        const renewal = await order((await contact(me)).state_data.order_code);
        expect(renewal).toMatchObject({ kind: "renewal", user_id: user.id });
        expect((await tgUpdate({ callback_query: { id: "q1", data: `ap:${renewal.code}`, message: { message_id: 1, chat: { id: 999 } } } })).status).toBe(200);
        expect((await order(renewal.code)).status).toBe("awaiting_payment"); // a stranger's chat is ignored
        expect((await tgUpdate({ callback_query: { id: "q1", data: `ap:${renewal.code}`, message: { message_id: 1, chat: { id: OWNER } } } }, "wrong")).status).toBe(401);
        await tgUpdate({ callback_query: { id: "q2", data: `ap:${renewal.code}`, message: { message_id: 1, chat: { id: OWNER } } } });
        expect((await order(renewal.code)).status).toBe("fulfilled");
        expect(lastTo(me).body).toMatch(/تم شحن حسابك/);
        const after = await pgc.query("select balance from public.credit_accounts where user_id = $1", [user.id]);
        expect(Number(after.rows[0].balance)).toBe(120);

        // ---- forgot password: only the linked phone gets a new one, at most every 10 minutes
        const before = passwords.length;
        await say(me, "نسيت الباسورد");
        expect(passwords.length).toBeGreaterThan(before);
        expect(lastTo(me).body).toMatch(/الباسورد الجديد/);
        await say(me, "نسيت الباسورد");
        expect(lastTo(me).body).toMatch(/استنى 10 دقايق/);
    });

    it("forgot password from an unknown phone goes to a person", async () => {
        const stranger = phone();
        await say(stranger, "اهلا");
        await say(stranger, "نسيت الباسورد");
        expect((await contact(stranger)).human_until).not.toBeNull();
        expect(tg.sent.at(-1).text).toMatch(/طلب دعم/);
    });

    it("hands off to the owner and relays the owner's Telegram replies", async () => {
        const me = phone();
        await say(me, "اهلا");
        await say(me, "عايز أكلم حد من الدعم");
        const c = await contact(me);
        expect(c.human_until).not.toBeNull();
        await say(me, "عندي مشكلة في الفاتورة");
        expect(tg.sent.at(-1).text).toContain(`#C${c.id}`);
        const count = wa.sent.filter((m) => m.to === me).length;
        await tgUpdate({ message: { chat: { id: OWNER }, text: "أهلاً، بنراجعها حالاً", reply_to_message: { text: `💬 Ahmed (+${me}) #C${c.id}:` } } });
        expect(lastTo(me).body).toBe("أهلاً، بنراجعها حالاً");
        expect(wa.sent.filter((m) => m.to === me).length).toBe(count + 1);
        await tgUpdate({ message: { chat: { id: OWNER }, text: `/bot ${c.id}` } });
        expect((await contact(me)).human_until).toBeNull();
    });

    it("uses the AI only for unclear text, and works without it", async () => {
        const me = phone();
        await say(me, "اهلا");
        await say(me, "ممكن تفاصيل اكتر عن البرنامج");
        expect(lastTo(me).body).toMatch(/الباقات/);
    });

    it("an unmatched trusted payment asks the owner; untrusted senders are flagged, never matched", async () => {
        const tagRun = crypto.randomUUID().slice(0, 8);
        const r = await sms(`تم استلام مبلغ 12345 جنيه من رقم 01099998888. رقم العملية X${tagRun}`);
        expect(r.body.matched).toBe(false);
        expect(tg.sent.at(-1).text).toMatch(/مش متطابق/);
        const u = await sms(`تم استلام مبلغ 12346 جنيه ${tagRun}`, PAY_KEY, "+201011112222");
        expect(u.body.matched).toBe(false);
        expect(tg.sent.at(-1).text).toMatch(/مش موثوق/);
        const ignored = await sms("كود التحقق 1234");
        expect(ignored.body.ignored).toBe(true);
    });

    it("cron: needs the Vault key, fulfils paid orders, expires old ones", async () => {
        const deny = await bot.handleCron({ method: "POST", query: {}, headers: { "x-cron-key": "x".repeat(40) } });
        expect(deny.status).toBe(401);
        const me = phone();
        await say(me, "اهلا");
        await tap(me, "buy");
        await tap(me, "pkg:pro");
        await say(me, `late.${me}@example.com`);
        await tap(me, "email_ok");
        const code = (await contact(me)).state_data.order_code;
        await pgc.query("update public.bot_orders set expires_at = now() - interval '1 minute' where code = $1", [code]);
        const res = await bot.handleCron({ method: "POST", query: {}, headers: { "x-cron-key": CRON_KEY } });
        expect(res.status).toBe(200);
        expect((await order(code)).status).toBe("expired");
        expect(lastTo(me).body).toMatch(/مهلة الطلب/);
        expect((await contact(me)).state).toBe("idle");
    });

    it("when paused, replies once and forwards everything to the owner", async () => {
        await pgc.query("update public.bot_settings set value = 'true' where key = 'paused'");
        try {
            const fresh = createBot(deps); // settings are cached per bot instance (= per request in production)
            const me = phone();
            await run(fresh.handleWhatsApp(waMsg(me, { type: "text", text: { body: "اهلا" } })));
            expect(lastTo(me).body).toMatch(/هنرد عليك/);
            expect(tg.sent.at(-1).text).toMatch(/💬/);
            const n = wa.sent.filter((m) => m.to === me).length;
            await run(fresh.handleWhatsApp(waMsg(me, { type: "text", text: { body: "تاني" } })));
            expect(wa.sent.filter((m) => m.to === me).length).toBe(n); // no second auto-reply
        } finally {
            await pgc.query("update public.bot_settings set value = 'false' where key = 'paused'");
        }
    });
});
