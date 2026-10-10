// The sales bot: four HTTP entry points (WhatsApp webhook, Telegram webhook, payment
// notifications, cron) on top of injected clients, so everything is testable offline.
//
// Rules that keep money safe:
//   * An order becomes "paid" only in SQL: exact unique-amount match with a trusted payment
//     notification (bot_record_payment), or an explicit owner approval. Never from a screenshot,
//     never from anything a customer or the AI says.
//   * Passwords are sent to the customer only, and are never logged or sent to Telegram.

import { decide } from "./flow.mjs";
import { MENU_ROWS, T, inWorkHours } from "./texts.mjs";
import { extractForwarded, parsePayment, unreadMoneyMessage } from "./payments.mjs";
import { verifyMetaSignature } from "./clients.mjs";
import { clip, escapeHtml, formatMoney, generatePassword, localHour, safeEqual, sha256Hex } from "./util.mjs";
import * as UI from "./ownerui.mjs";

const HUMAN_HOURS = 12;
const FLOOD_PER_MINUTE = 15;
const DOWNLOAD_LINK_SECONDS = 7 * 24 * 3600;

const ok = (body = { ok: true }) => ({ status: 200, body });
const STATUS_AR = { awaiting_payment: "مستني الدفع", paid: "اتدفع", fulfilling: "بيتجهز", fulfilled: "اتسلم", rejected: "مرفوض", expired: "انتهت مهلته", cancelled: "ملغي" };
const deny = (status = 401) => ({ status, body: { error: "unauthorized" } });

// Owner alerts about configuration problems: at most one per reason every 10 minutes per worker,
// so a misconfiguration is reported without flooding Telegram on every webhook.
const ALERT_EVERY_MS = 10 * 60 * 1000;
const lastAlert = new Map();

/**
 * @param {object} deps
 *   db: supabaseClient, wa: whatsappClient|null, tg: telegramClient|null, ai: geminiClient|null
 *   config: {waAppSecret, waVerifyToken, waPhoneNumberId, tgSecret, tgOwner, payKey, allowedSenders}
 *   now?: () => Date, log?: (level, msg, extra) => void, password?: () => string
 */
export function createBot(deps) {
    const { db, wa, tg, ai, config } = deps;
    const now = deps.now || (() => new Date());
    const log = deps.log || (() => {});
    const newPassword = deps.password || (() => generatePassword());

    // ------------------------------------------------------------ shared helpers

    let cache = null;
    async function settings() {
        if (!cache) {
            const [rows, packages] = await Promise.all([
                db.select("bot_settings", "select=key,value"),
                db.select("bot_packages", "select=*&active=is.true&order=sort.asc,id.asc")
            ]);
            cache = { s: Object.fromEntries(rows.map((r) => [r.key, r.value])), packages };
        }
        return cache;
    }

    async function owner(text, buttons) {
        if (!tg || !tg.chatId) return;
        try {
            await tg.send(text, buttons);
        } catch (e) {
            log("error", "telegram send failed", { error: e.message });
        }
    }
    const ownerCard = (v) => owner(v.text, v.buttons);

    async function alertOnce(reason, text) {
        const t = now().getTime();
        if (t - (lastAlert.get(reason) || 0) < ALERT_EVERY_MS) return;
        lastAlert.set(reason, t);
        await owner(UI.say.error(text));
    }

    function whatsapp() {
        if (!wa) throw new Error("WhatsApp is not configured: WA_TOKEN or WA_PHONE_NUMBER_ID is missing");
        return wa;
    }

    async function setContact(id, patch) {
        await db.update("bot_contacts", `id=eq.${id}`, { ...patch, updated_at: now().toISOString() });
    }

    async function logOut(contactId, kind, body) {
        try {
            await db.insert("bot_messages", { contact_id: contactId, direction: "out", kind, body: body == null ? null : clip(body, 2000) });
        } catch (e) {
            log("warn", "log failed", { error: e.message });
        }
    }

    // Send helpers. `secret: true` keeps the body out of the message log.
    const send = {
        text: async (c, body, opts = {}) => {
            await whatsapp().text(c.wa_id, body);
            await logOut(c.id, "text", opts.secret ? "[credentials]" : body);
        },
        buttons: async (c, body, buttons) => {
            await whatsapp().buttons(c.wa_id, body, buttons);
            await logOut(c.id, "buttons", body);
        },
        list: async (c, body, label, rows) => {
            await whatsapp().list(c.wa_id, body, label, rows);
            await logOut(c.id, "list", body);
        }
    };

    // ------------------------------------------------------------ fulfilment

    async function downloadLink(s) {
        if (s.ccx_path) {
            try {
                const url = await db.signedUrl("releases", s.ccx_path, DOWNLOAD_LINK_SECONDS);
                if (url) return url;
            } catch (e) {
                log("warn", "signed url failed", { error: e.message });
            }
        }
        return s.download_url || "";
    }

    /** Creates or tops up the account of a paid order and tells the customer. Safe to retry. */
    async function fulfill(orderId) {
        const o = await db.rpc("bot_begin_fulfillment", { p_order: orderId });
        if (!o) return null;
        const { s } = await settings();
        try {
            let uid = o.user_id || (await db.rpc("bot_find_user", { p_email: o.email }));
            let password = null;
            if (!uid) {
                password = newPassword();
                try {
                    const user = await db.createUser(o.email, password);
                    uid = user.id;
                } catch (e) {
                    if (e.status !== 422) throw e;
                    uid = await db.rpc("bot_find_user", { p_email: o.email }); // created meanwhile: treat as renewal
                    password = null;
                    if (!uid) throw e;
                }
                // Remember who created it, so a retry can safely issue a fresh password.
                await db.update("bot_orders", `id=eq.${o.id}`, { user_id: uid });
            } else if (o.kind === "new" && o.user_id && !o.credentials_sent) {
                password = newPassword(); // the account was created by an earlier attempt of this order
                await db.setPassword(uid, password);
            }
            const done = await db.rpc("bot_finish_fulfillment", { p_order: o.id, p_user: uid });
            const contact = { id: o.contact_id, wa_id: o.wa_id };
            let delivered = false;
            if (wa) {
                try {
                    if (password) {
                        const ref = await db.select("bot_contacts", `select=ref_code&id=eq.${o.contact_id}`);
                        const link = await downloadLink(s);
                        await send.text(contact, T.newAccount(o, o.email, password, link, s, done.account) + T.refCode(ref[0]?.ref_code || ""), {
                            secret: true
                        });
                        if (!link) {
                            log("warn", "no download link: releases/ccx_path missing and download_url empty", { order: o.code });
                            await owner(UI.say.error(`العميل (طلب <code>${escapeHtml(o.code)}</code>) اتقاله "هنبعتلك الملف حالاً": ابعتله ملف البلجن يدوي، وارفع <code>${escapeHtml(s.ccx_path || "elzoz.ccx")}</code> في Storage → releases عشان اللينك يتبعت تلقائي.`));
                        }
                    } else {
                        await send.text(contact, T.renewed(o, done.account));
                    }
                    delivered = true;
                    await db.update("bot_orders", `id=eq.${o.id}`, { credentials_sent: true });
                } catch (e) {
                    log("error", "delivery failed", { order: o.code, error: e.message });
                }
            }
            await setContact(o.contact_id, { state: "idle", state_data: {} });
            await owner(UI.saleAlert({ ...o, approved_by: o.approved_by }, delivered, !!password));
            if (done.referral && wa) {
                try {
                    await whatsapp().text(done.referral.wa_id, T.referral(done.referral.credits));
                } catch {
                    /* outside the 24h window: the owner is told below */
                }
                await owner(UI.say.info(`🎁 مكافأة ترشيح <b>${done.referral.credits}</b> كريدت لـ <code>+${done.referral.wa_id}</code>`));
            }
            return done;
        } catch (e) {
            log("error", "fulfillment failed", { order: o.code, error: e.message });
            await owner(UI.say.error(`فشل تجهيز الطلب <code>${escapeHtml(o.code)}</code>: ${escapeHtml(e.message)}\nهيتعاد تلقائي بعد 10 دقايق.`));
            return null;
        }
    }

    // ------------------------------------------------------------ client notifications (dashboard changes)

    /**
     * Tells the client about a change the owner made from the dashboard. Free-form WhatsApp
     * messages are allowed only within 24 hours of the client's last message, so outside that
     * window the notice waits and goes out with the bot's next reply (`replying`).
     */
    async function deliverNotice(n, replying = false) {
        const done = (status, error = null) => db.rpc("bot_notification_done", { p_id: n.id, p_status: status, p_error: error });
        const c = n.contact;
        if (!c) {
            await done("no_contact");
            return ownerCard({ text: UI.noticeResult(n, "no_contact") });
        }
        if (c.blocked) return done("skipped", "contact blocked");
        const text = T.notice(n);
        if (!text) return done("skipped", "unknown kind");
        if (!replying && !c.in_window) {
            await done("waiting");
            return ownerCard({ text: UI.noticeResult(n, "waiting") });
        }
        try {
            await send.text({ id: c.id, wa_id: c.wa_id }, text);
        } catch (e) {
            log("error", "notice failed", { id: n.id, kind: n.kind, error: e.message });
            await done("failed", e.message);
            return ownerCard({ text: UI.noticeResult(n, "failed", e.message) });
        }
        await done("sent");
        await ownerCard({ text: UI.noticeResult(n, "sent") });
    }

    async function deliverNotices(list, replying = false) {
        for (const n of list || []) {
            try {
                await deliverNotice(n, replying);
            } catch (e) {
                log("error", "notice delivery error", { id: n.id, error: e.message });
            }
        }
    }

    // ------------------------------------------------------------ WhatsApp

    function normalizeMessage(m) {
        if (m.type === "text") return { type: "text", text: m.text?.body || "" };
        if (m.type === "interactive") {
            const r = m.interactive?.button_reply || m.interactive?.list_reply;
            return { type: "button", id: r?.id || "", text: r?.title || "" };
        }
        if (m.type === "button") return { type: "button", id: m.button?.payload || "", text: m.button?.text || "" };
        if (m.type === "image") return { type: "image", mediaId: m.image?.id, text: m.image?.caption || "" };
        if (m.type === "document" && /^image\//.test(m.document?.mime_type || "")) return { type: "image", mediaId: m.document.id, text: m.document.caption || "" };
        return { type: "other", text: "" };
    }

    async function handleWhatsApp(req) {
        if (req.method === "GET") {
            const q = req.query;
            if (q["hub.mode"] === "subscribe" && config.waVerifyToken && safeEqual(q["hub.verify_token"], config.waVerifyToken)) {
                return { status: 200, body: String(q["hub.challenge"] || ""), text: true };
            }
            return deny(403);
        }
        if (!config.waAppSecret) {
            log("error", "wa webhook rejected: WA_APP_SECRET is not set");
            await alertOnce("wa_secret", "واتساب: WA_APP_SECRET مش متسجل، فكل رسايل واتساب بتترفض. ضيفه في أسرار الـ Edge Function.");
            return deny();
        }
        if (!(await verifyMetaSignature(req.rawBody, req.headers["x-hub-signature-256"], config.waAppSecret))) {
            log("warn", "wa webhook rejected: bad signature", { signed: Boolean(req.headers["x-hub-signature-256"]) });
            return deny();
        }
        let payload;
        try {
            payload = JSON.parse(req.rawBody);
        } catch {
            return { status: 400, body: { error: "bad_json" } };
        }
        const work = [];
        const seen = { messages: 0, statuses: 0, failed: 0, other_number: 0 };
        for (const entry of payload.entry || []) {
            for (const change of entry.changes || []) {
                const value = change.value || {};
                if (config.waPhoneNumberId && value.metadata?.phone_number_id && value.metadata.phone_number_id !== config.waPhoneNumberId) {
                    seen.other_number += (value.messages || []).length;
                    continue;
                }
                const names = Object.fromEntries((value.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
                for (const m of value.messages || []) work.push(() => processMessage(m, names[m.from]));
                seen.messages += (value.messages || []).length;
                for (const st of value.statuses || []) {
                    seen.statuses++;
                    if (st.status !== "failed") continue;
                    seen.failed++;
                    // Error code and title only: no recipient number or message content.
                    const err = (st.errors || [])[0] || {};
                    log("error", "wa delivery failed", { code: err.code ?? null, title: clip(String(err.title || err.message || ""), 120) });
                }
            }
        }
        log("info", "wa webhook", seen);
        if (seen.other_number) {
            log("warn", "wa messages ignored: phone_number_id does not match WA_PHONE_NUMBER_ID", { count: seen.other_number });
            await alertOnce("wa_number", `واتساب: وصلت ${seen.other_number} رسالة لرقم غير الرقم المتسجل في WA_PHONE_NUMBER_ID، والبوت تجاهلها. راجع Phone Number ID في Meta. (زرار Test في لوحة Meta بيعمل ده كمان، عادي.)`);
        }
        if (seen.failed) await alertOnce("wa_failed", `واتساب: ${seen.failed} رسالة من البوت ما اتسلمتش للعميل. التفاصيل (كود الخطأ) في سجلات sales-bot.`);
        if (work.length && !wa) {
            log("error", "wa messages received but WhatsApp is not configured: WA_TOKEN or WA_PHONE_NUMBER_ID is missing");
            await alertOnce("wa_config", "واتساب: رسايل بتوصل لكن البوت مش قادر يرد: WA_TOKEN أو WA_PHONE_NUMBER_ID مش متسجل.");
        }
        // Meta wants a fast 200; the caller keeps the promise alive (EdgeRuntime.waitUntil).
        const done = (async () => {
            for (const w of work) {
                try {
                    await w();
                } catch (e) {
                    log("error", "message failed", { error: e.message });
                    await owner(UI.say.error(`خطأ في معالجة رسالة: ${escapeHtml(e.message)}`));
                }
            }
        })();
        return { ...ok(), background: done };
    }

    async function processMessage(m, profileName) {
        if (!/^[0-9]{6,20}$/.test(String(m.from || ""))) return;
        const msg = normalizeMessage(m);
        const contact = await db.rpc("bot_touch_contact", { p_wa_id: m.from, p_name: profileName || null, p_text: msg.text || "" });
        const logged = await db.rpc("bot_log_in", { p_contact: contact.id, p_wa_message_id: m.id, p_kind: msg.type, p_body: clip(msg.text || msg.id || "", 2000) });
        if (!logged.fresh || contact.blocked) return; // WhatsApp retry, or blocked
        if (logged.recent > FLOOD_PER_MINUTE) return;
        // Account changes made while the 24-hour window was closed go out first.
        if (wa) {
            try {
                await deliverNotices(await db.rpc("bot_take_waiting_notifications", { p_contact: contact.id }), true);
            } catch (e) {
                log("error", "waiting notices failed", { error: e.message });
            }
        }
        const { s } = await settings();
        const ctx = { contact, msg, paused: s.paused === true, now: now() };
        let step = decide(ctx);
        if (step.step === "classify") {
            let aiIntent = { intent: "other", email: null };
            if (ai) {
                try {
                    aiIntent = await ai.classify(msg.text);
                } catch (e) {
                    log("warn", "ai classify failed", { error: e.message });
                }
            }
            step = decide({ ...ctx, aiIntent });
        }
        await execute(step, contact, msg);
    }

    async function showMenu(c, intro) {
        await send.list(c, intro || T.menuBody, T.menuLabel, MENU_ROWS);
    }

    async function choosePackage(c, renewEmail) {
        const { packages } = await settings();
        await send.list(
            c,
            T.choosePackage,
            T.choosePackageLabel,
            packages.map((p) => ({ id: `pkg:${p.code}`, title: p.name, description: `${p.price_egp} جنيه • ${p.credits} كريدت • ${p.valid_days} يوم` }))
        );
        await setContact(c.id, { state: "choosing_package", state_data: renewEmail ? { renew_email: renewEmail } : {} });
    }

    async function handoff(c, reason, text) {
        const { s } = await settings();
        const hours = localHour(now(), s.timezone || "Africa/Cairo");
        await setContact(c.id, { state: "idle", state_data: {}, human_until: new Date(now().getTime() + HUMAN_HOURS * 3600e3).toISOString() });
        await send.text(c, T.human(s, inWorkHours(hours, s)));
        await ownerCard(UI.supportAlert(c, reason, text));
    }

    async function execute(step, c, msg) {
        const { s, packages } = await settings();
        const data = c.state_data || {};
        switch (step.step) {
            case "welcome":
                await showMenu(c, c.account ? T.welcomeBack(c.name, c.account) : T.welcome(c.name));
                await setContact(c.id, { state: "idle", state_data: {} });
                await ownerCard(UI.newContactAlert(c, msg.text));
                return;
            case "menu":
                if (step.release) await setContact(c.id, { human_until: null });
                await showMenu(c, step.greet ? T.welcomeBack(c.name, c.account) : undefined);
                if (step.unclear && msg.text) await owner(UI.unclearAlert(c, msg.text));
                if (c.state !== "awaiting_payment") await setContact(c.id, { state: "idle", state_data: {} });
                return;
            case "prices":
                await send.buttons(c, T.prices(packages), [
                    { id: "buy", title: "🛒 اشترك" },
                    { id: "faq", title: "❓ أسئلة شائعة" },
                    { id: "menu", title: "القائمة" }
                ]);
                return;
            case "demo":
                await send.text(c, T.demo(s));
                return;
            case "renew_confirm":
                await send.buttons(c, T.renewAsk(c.account.email), [
                    { id: "renew_yes", title: "✅ أيوه" },
                    { id: "renew_other", title: "📧 إيميل تاني" }
                ]);
                await setContact(c.id, { state: "renew_confirm", state_data: {} });
                return;
            case "choose_package":
                await choosePackage(c, step.renewEmail);
                return;
            case "ask_email":
                if (!packages.some((p) => p.code === step.package)) return choosePackage(c);
                await send.text(c, T.askEmail);
                await setContact(c.id, { state: "awaiting_email", state_data: { package: step.package } });
                return;
            case "email_again":
                await send.text(c, T.emailAgain);
                await setContact(c.id, { state_data: { ...data, email_tries: step.tries } });
                return;
            case "confirm_email":
                await send.buttons(c, T.confirmEmail(step.email), [
                    { id: "email_ok", title: "✅ تأكيد" },
                    { id: "email_edit", title: "✏️ تعديل" }
                ]);
                await setContact(c.id, { state: "confirming_email", state_data: { package: step.package, email: step.email } });
                return;
            case "create_order":
                return createOrder(c, step.package, step.email);
            case "claim_payment":
                return claimPayment(c, msg, data);
            case "ask_screenshot":
                await send.text(c, T.askScreenshot);
                return;
            case "image_without_order":
                await send.text(c, T.notImage);
                await owner(UI.messageAlert(c, "صورة من غير طلب مفتوح", "image"));
                return;
            case "cancel_order":
                if (data.order_code) {
                    await db.update("bot_orders", `code=eq.${encodeURIComponent(data.order_code)}&status=eq.awaiting_payment`, { status: "cancelled", note: "cancelled by customer" });
                    await send.text(c, T.orderCancelled(data.order_code));
                } else await send.text(c, T.noOpenOrder);
                await setContact(c.id, { state: "idle", state_data: {} });
                return;
            case "no_open_order":
                await showMenu(c, T.noOpenOrder);
                return;
            case "faq": {
                const faq = Array.isArray(s.faq) ? s.faq : [];
                await send.list(c, T.faqIntro, T.faqLabel, faq.slice(0, 10).map((f, i) => ({ id: `faq:${i}`, title: f.q, description: f.q.length > 24 ? f.q : undefined })));
                return;
            }
            case "faq_answer": {
                const f = (Array.isArray(s.faq) ? s.faq : [])[step.index];
                if (!f) return showMenu(c);
                await send.buttons(c, `*${f.q}*\n${f.a}`, [
                    { id: "buy", title: "🛒 اشترك" },
                    { id: "faq", title: "❓ سؤال تاني" },
                    { id: "menu", title: "القائمة" }
                ]);
                return;
            }
            case "install":
                await send.buttons(c, T.install(s), [
                    { id: "install_ok", title: "✅ اتحلت" },
                    { id: "install_fail", title: "❌ لسه فيه مشكلة" }
                ]);
                await setContact(c.id, { state: "install", state_data: {} });
                return;
            case "install_ok":
                await send.text(c, T.installOk);
                await setContact(c.id, { state: "idle", state_data: {} });
                return;
            case "human":
                return handoff(c, step.reason, msg.text);
            case "forgot":
                return resetPassword(c, msg);
            case "thanks":
                await send.text(c, T.thanks);
                return;
            case "paused": {
                const last = data.paused_reply_at ? new Date(data.paused_reply_at) : null;
                if (!last || now() - last > 12 * 3600e3) {
                    await send.text(c, T.paused(s));
                    await setContact(c.id, { state_data: { ...data, paused_reply_at: now().toISOString() } });
                }
                return forwardToOwner(c, msg);
            }
            case "forward_to_owner":
                return forwardToOwner(c, msg);
            case "unsupported":
            default:
                await send.text(c, T.unsupported);
        }
    }

    async function forwardToOwner(c, msg) {
        if (!tg || !tg.chatId) return;
        if (msg.type === "image" && msg.mediaId && wa) {
            try {
                const media = await whatsapp().media(msg.mediaId);
                await tg.photo(media.bytes, media.mime, UI.messageAlert(c, msg.text || "صورة", "image"));
                return;
            } catch (e) {
                log("warn", "media forward failed", { error: e.message });
            }
        }
        await owner(UI.messageAlert(c, msg.text || msg.id, msg.type));
    }

    async function createOrder(c, pkg, email) {
        const { s } = await settings();
        let order;
        try {
            order = await db.rpc("bot_create_order", { p_contact: c.id, p_package: pkg, p_email: email });
        } catch (e) {
            const m = e.message || "";
            if (/invalid_email/.test(m)) {
                await send.text(c, T.askEmail);
                return setContact(c.id, { state: "awaiting_email", state_data: { package: pkg } });
            }
            if (/package_unavailable/.test(m)) return choosePackage(c);
            if (/too_many_orders/.test(m)) return send.text(c, T.tooManyOrders);
            if (/no_amount_slot/.test(m)) {
                await send.text(c, T.busy);
                return handoff(c, "no unique amount slot left", email);
            }
            throw e;
        }
        await send.text(c, T.payment(order, s));
        await setContact(c.id, { state: "awaiting_payment", state_data: { order_code: order.code, order_id: order.id, amount_due: order.amount_due } });
        await owner(UI.orderAlert(c, order));
    }

    async function claimPayment(c, msg, data) {
        let media = null;
        let read = null;
        try {
            media = await whatsapp().media(msg.mediaId);
        } catch (e) {
            log("warn", "media download failed", { error: e.message });
        }
        if (media && ai) {
            try {
                read = await ai.readReceipt(media.bytes, media.mime);
            } catch (e) {
                log("warn", "ai receipt failed", { error: e.message });
            }
        }
        const updated = await db.update("bot_orders", `code=eq.${encodeURIComponent(data.order_code)}&status=eq.awaiting_payment`, {
            claimed_at: now().toISOString(),
            claim: read || {},
            claim_media_id: msg.mediaId || null
        });
        if (!updated || !updated.length) {
            const rows = await db.select("bot_orders", `select=status,code&code=eq.${encodeURIComponent(data.order_code)}`);
            const st = rows[0]?.status;
            if (st === "paid" || st === "fulfilling" || st === "fulfilled") return; // already confirmed automatically
            await send.text(c, st === "expired" ? T.orderExpired(data.order_code) : T.noOpenOrder);
            await ownerCard(UI.lateReceiptAlert(c, data.order_code, st));
            return;
        }
        const order = updated[0];
        let reply = T.claimReceived;
        if (read?.is_receipt && read.amount != null && Math.abs(read.amount - Number(order.amount_due)) >= 0.01) reply += "\n\n" + T.amountMismatch(read.amount, order.amount_due);
        await send.text(c, reply);
        const alert = UI.receiptAlert(c, order, read);
        const caption = alert.text;
        const buttons = alert.buttons;
        if (tg && tg.chatId && media) {
            try {
                await tg.photo(media.bytes, media.mime, caption, buttons);
                return;
            } catch (e) {
                log("warn", "telegram photo failed", { error: e.message });
            }
        }
        await owner(caption, buttons);
    }

    async function resetPassword(c, msg) {
        if (!c.user_id) {
            await send.text(c, T.passwordNoAccount);
            return handoff(c, "forgot password, phone not linked", msg.text);
        }
        const data = c.state_data || {};
        if (data.reset_at && now() - new Date(data.reset_at) < 10 * 60e3) return send.text(c, T.passwordWait);
        const password = newPassword();
        await db.setPassword(c.user_id, password);
        await setContact(c.id, { state_data: { ...data, reset_at: now().toISOString() } });
        await send.text(c, T.passwordReset(c.account?.email || "", password), { secret: true });
        await owner(UI.say.info(`🔑 اتعمل باسورد جديد تلقائي لـ <code>${escapeHtml(c.account?.email || "")}</code>  ·  <code>#C${c.id}</code>`));
    }

    // ------------------------------------------------------------ Telegram (owner)

    async function handleTelegram(req) {
        if (!config.tgSecret || !safeEqual(req.headers["x-telegram-bot-api-secret-token"], config.tgSecret)) return deny();
        let u;
        try {
            u = JSON.parse(req.rawBody);
        } catch {
            return ok();
        }
        const chat = String(u.message?.chat?.id ?? u.callback_query?.message?.chat?.id ?? "");
        if (!config.tgOwner) {
            // Setup helper: reveals only the chat id, so the owner can set TG_OWNER_CHAT_ID.
            if (u.message?.text?.startsWith("/start") && tg) await tg.send(UI.lines(`🔑 chat id: <code>${escapeHtml(chat)}</code>`, "حطه في Secret اسمه <code>TG_OWNER_CHAT_ID</code>."), null, chat);
            return ok();
        }
        if (chat !== String(config.tgOwner)) {
            // Anyone else gets one polite line and nothing else.
            if (u.message?.text && tg) {
                try {
                    await tg.send(UI.lines("🔒 البوت ده خاص بإدارة Elzoz."), null, chat);
                } catch {
                    /* ignore */
                }
            }
            return ok();
        }
        try {
            if (u.callback_query) await ownerButton(u.callback_query);
            else if (u.message?.text) await ownerMessage(u.message);
        } catch (e) {
            log("error", "owner command failed", { error: e.message });
            await owner(UI.say.error(escapeHtml(e.message)));
        }
        return ok();
    }

    async function contactById(id) {
        if (!(Number.isInteger(Number(id)) && Number(id) > 0)) return null;
        const rows = await db.select("bot_contacts", `select=id,wa_id,name,user_id,state,state_data&id=eq.${Number(id)}`);
        return rows[0] || null;
    }

    async function approve(code, by, eventId = null) {
        const r = await db.rpc("bot_mark_paid", { p_code: code, p_by: by, p_event: eventId });
        if (!r.changed) return { ok: false, text: `الطلب <code>${escapeHtml(code)}</code> حالته: ${escapeHtml(STATUS_AR[r.status] || r.status || "مش موجود")}` };
        await fulfill(r.order.id);
        return { ok: true, text: `اتقبل الطلب <code>${escapeHtml(code)}</code>` };
    }

    async function reject(code, by, reason) {
        const r = await db.rpc("bot_reject", { p_code: code, p_by: by, p_reason: reason || "rejected by owner" });
        if (!r.changed) return { ok: false, text: `الطلب <code>${escapeHtml(code)}</code> حالته: ${escapeHtml(STATUS_AR[r.status] || r.status || "مش موجود")}` };
        const c = await contactById(r.order.contact_id);
        if (c && wa) {
            try {
                await send.text(c, T.rejected(code));
            } catch {
                /* outside the window */
            }
            await setContact(c.id, { state: "idle", state_data: {} });
        }
        return { ok: true, text: `اترفض الطلب <code>${escapeHtml(code)}</code> واتبلغ العميل` };
    }

    const result = (r) => (r.ok ? UI.say.ok(r.text) : UI.say.info(r.text));

    async function isPaused() {
        const rows = await db.select("bot_settings", "select=value&key=eq.paused");
        return rows[0]?.value === true;
    }

    async function setPaused(paused) {
        await db.update("bot_settings", "key=eq.paused", { value: paused, updated_at: now().toISOString() });
        cache = null;
        await tg.sendKeyboard(
            paused ? UI.lines("⏸️ <b>البوت واقف</b>", "كل رسايل العملاء هتجيلك هنا، وكل عميل هياخد رد واحد إننا هنرد عليه قريب.") : UI.lines("▶️ <b>البوت شغال</b>", "البوت بيرد على العملاء تلقائي."),
            UI.mainKeyboard(paused)
        );
    }

    async function showStatus() {
        const r = await db.rpc("bot_report", { p_since: new Date(now().getTime() - 86400e3).toISOString() });
        return ownerCard(UI.statusScreen(r, await isPaused()));
    }

    async function showOrders() {
        const rows = await db.select("bot_orders", "select=code,email,amount_due,claimed_at,created_at&status=eq.awaiting_payment&order=created_at.desc&limit=10");
        return ownerCard(UI.ordersScreen(rows, now()));
    }

    async function showContacts() {
        const rows = await db.select(
            "bot_contacts",
            "select=id,wa_id,name,user_id,blocked,human_until,last_inbound_at,bot_messages(body)&bot_messages.direction=eq.in&bot_messages.order=id.desc&bot_messages.limit=1&order=last_inbound_at.desc.nullslast&limit=10"
        );
        const t = now();
        return ownerCard(
            UI.contactsScreen(
                rows.map((c) => ({ ...c, human: c.human_until && new Date(c.human_until) > t, last: c.bot_messages?.[0]?.body || "" })),
                t
            )
        );
    }

    async function ownerButton(q) {
        const [kind, arg, extra] = String(q.data || "").split(":");
        let answer = "تم ✓";
        if (kind === "m") {
            await tg.answer(q.id, "");
            if (arg === "status") return showStatus();
            if (arg === "orders") return showOrders();
            if (arg === "contacts") return showContacts();
            if (arg === "pause" || arg === "resume") return setPaused(arg === "pause");
            if (arg === "help") return owner(UI.helpScreen());
            return;
        }
        if (kind === "ap" || kind === "rj") {
            const r = kind === "ap" ? await approve(arg, "owner:telegram", extra ? Number(extra) : null) : await reject(arg, "owner:telegram");
            answer = r.ok ? (kind === "ap" ? "✅ اتقبل" : "❌ اترفض") : "ℹ️ اتعمل قبل كده";
            await tg.answer(q.id, answer);
            if (q.message?.message_id) {
                try {
                    await tg.clearButtons(q.message.message_id);
                } catch {
                    /* already edited */
                }
            }
            return owner(result(r));
        }
        const cid = Number(arg);
        if (!(cid > 0)) return tg.answer(q.id, "");
        if (kind === "rl") {
            await setContact(cid, { human_until: null, state: "idle", state_data: {} });
            await tg.answer(q.id, "↩️ رجع للبوت");
            return owner(UI.say.ok(`<code>#C${cid}</code> رجع للبوت، والبوت هيرد عليه تاني.`));
        }
        if (kind === "hm") {
            await setContact(cid, { human_until: new Date(now().getTime() + HUMAN_HOURS * 3600e3).toISOString() });
            await tg.answer(q.id, "🙋 تمام، البوت هيسكت معاه");
            return owner(UI.say.ok(`البوت ساكت مع <code>#C${cid}</code> لمدة ${HUMAN_HOURS} ساعة. اعمل Reply على تنبيهه عشان ترد.`));
        }
        if (kind === "bk") {
            await setContact(cid, { blocked: true });
            await tg.answer(q.id, "🚫 اتحظر");
            return owner(UI.say.ok(`🚫 اتحظر <code>#C${cid}</code>. لفك الحظر: <code>/unblock ${cid}</code>`));
        }
        await tg.answer(q.id, answer);
    }

    async function ownerMessage(m) {
        const raw = String(m.text || "").trim();
        const replied = m.reply_to_message?.text || m.reply_to_message?.caption || "";
        const target = replied.match(/#C(\d+)/);
        if (target && !raw.startsWith("/") && !UI.keyboardCommand(raw)) return relay(Number(target[1]), raw);

        const text = UI.keyboardCommand(raw) || raw;
        const [cmdRaw, ...rest] = text.split(/\s+/);
        const cmd = cmdRaw.toLowerCase().replace(/@.*$/, "");
        const arg = rest[0];
        // Customer number for /msg, /bot, /block, /unblock: "12", "C12" or "#C12".
        const cid = Number(String(arg || "").replace(/^#?c/i, ""));
        if (["/msg", "/bot", "/block", "/unblock"].includes(cmd) && !(Number.isInteger(cid) && cid > 0)) {
            return owner(UI.say.info(`اكتب رقم العميل بعد الأمر، مثلاً: <code>${escapeHtml(cmd)} 12${cmd === "/msg" ? " أهلاً" : ""}</code>\nرقم العميل هو اللي بعد #C في التنبيهات.`));
        }
        switch (cmd) {
            case "/start": {
                try {
                    await tg.setProfile(UI.PROFILE);
                } catch (e) {
                    log("warn", "telegram profile failed", { error: e.message });
                }
                const w = UI.welcomeScreen(await isPaused());
                return tg.sendKeyboard(w.text, w.keyboard);
            }
            case "/help":
                return owner(UI.helpScreen());
            case "/status":
                return showStatus();
            case "/orders":
                return showOrders();
            case "/contacts":
                return showContacts();
            case "/approve":
                if (!arg) return owner(UI.say.info("اكتب رقم الطلب، مثلاً: <code>/approve EZ-123456</code>"));
                return owner(result(await approve(String(arg).toUpperCase(), "owner:telegram")));
            case "/reject":
                if (!arg) return owner(UI.say.info("اكتب رقم الطلب، مثلاً: <code>/reject EZ-123456 السبب</code>"));
                return owner(result(await reject(String(arg).toUpperCase(), "owner:telegram", rest.slice(1).join(" "))));
            case "/msg":
                return relay(cid, rest.slice(1).join(" "));
            case "/bot":
                if (!(await contactById(cid))) return owner(UI.say.info(`مفيش عميل <code>#C${cid}</code>`));
                await setContact(cid, { human_until: null, state: "idle", state_data: {} });
                return owner(UI.say.ok(`<code>#C${cid}</code> رجع للبوت.`));
            case "/block":
            case "/unblock":
                if (!(await contactById(cid))) return owner(UI.say.info(`مفيش عميل <code>#C${cid}</code>`));
                await setContact(cid, { blocked: cmd === "/block" });
                return owner(UI.say.ok(`${cmd === "/block" ? "🚫 اتحظر" : "اتفك حظر"} <code>#C${cid}</code>`));
            case "/pause":
            case "/resume":
                return setPaused(cmd === "/pause");
            default:
                return owner(UI.say.info("مش فاهم الأمر 🤔 اختار من الزراير اللي تحت، أو اكتب /help"));
        }
    }

    async function relay(contactId, text) {
        const c = await contactById(contactId);
        if (!c) return owner(UI.say.info(`مفيش عميل <code>#C${escapeHtml(String(contactId))}</code>`));
        if (!text) return owner(UI.say.info(`اكتب الرسالة بعد الرقم، مثلاً: <code>/msg ${c.id} أهلاً</code>`));
        try {
            await send.text(c, text);
        } catch (e) {
            return owner(UI.say.error(`الرسالة ما اتبعتتش. غالباً عدّى 24 ساعة من آخر رسالة من العميل.\n${escapeHtml(e.message)}`));
        }
        await setContact(c.id, { human_until: new Date(now().getTime() + HUMAN_HOURS * 3600e3).toISOString() });
        return ownerCard({
            text: UI.say.ok(`اتبعت لـ <code>#C${c.id}</code>. البوت ساكت معاه ${HUMAN_HOURS} ساعة.`),
            buttons: [[{ text: "↩️ رجّعه للبوت دلوقتي", data: `rl:${c.id}` }]]
        });
    }

    // ------------------------------------------------------------ payment notifications

    async function handlePayment(req) {
        const key = req.headers["x-elzoz-key"] || req.query.key || "";
        if (!config.payKey || config.payKey.length < 24 || !safeEqual(key, config.payKey)) return deny();
        const fwd = extractForwarded(req.rawBody, req.headers["content-type"] || "");
        const p = parsePayment(fwd, config.allowedSenders);
        if (!p) {
            // Not a received-money message: not stored. A money message from a trusted sender that
            // could not be read is shown to the owner instead of being dropped silently.
            if (unreadMoneyMessage(fwd, config.allowedSenders)) {
                log("warn", "payment message from a trusted sender not understood");
                await owner(UI.say.error(`💸 رسالة فلوس من <b>${escapeHtml(fwd.sender || fwd.app || "")}</b> البوت مفهمهاش. لو دي فلوس واصلة، وافق على الطلب يدوي من /orders، وابعتلي صيغة الرسالة (من غير أرقام) عشان أضيفها:\n<code>${escapeHtml(clip(fwd.text, 600))}</code>`));
                return ok({ ignored: true, unread: true });
            }
            log("info", "pay: not a received payment, ignored");
            return ok({ ignored: true });
        }
        const at = fwd.at && !Number.isNaN(Number(fwd.at)) ? new Date(Number(fwd.at) > 1e12 ? Number(fwd.at) : Number(fwd.at) * 1000) : now();
        const receivedAt = Math.abs(at - now()) < 7 * 86400e3 ? at : now();
        const fingerprint = await sha256Hex(`${fwd.sender || fwd.app || ""}|${fwd.text}|${fwd.at || ""}`);
        const r = await db.rpc("bot_record_payment", {
            p_channel: p.channel,
            p_sender: p.sender,
            p_trusted: p.trusted,
            p_amount: p.amount,
            p_payer: p.payer,
            p_reference: p.reference,
            p_raw_text: fwd.text,
            p_fingerprint: fingerprint,
            p_received_at: receivedAt.toISOString()
        });
        if (r.duplicate) return ok({ duplicate: true });
        if (r.matched) {
            const work = (async () => {
                await ownerCard(UI.paymentAlert("matched", p, { order: r.order.code }));
                await fulfill(r.order.id);
            })();
            return { ...ok({ matched: true }), background: work };
        }
        if (!p.trusted) {
            await ownerCard(UI.paymentAlert("untrusted", p));
            return ok({ matched: false });
        }
        const candidate = r.candidate || r.late_candidate;
        await ownerCard(UI.paymentAlert("unmatched", p, { candidate, eventId: r.event_id }));
        return ok({ matched: false });
    }

    // ------------------------------------------------------------ cron (every 5 minutes)

    async function handleCron(req) {
        const key = req.headers["x-cron-key"] || "";
        if (!(await db.rpc("bot_cron_key_ok", { p_key: key }))) return deny();
        const t = await db.rpc("bot_cron_tick", {});
        for (const id of t.to_fulfill || []) await fulfill(id);
        for (const e of t.expired || []) {
            const c = await contactById(e.contact_id);
            if (!c || !wa) continue;
            try {
                await send.text(c, T.orderExpired(e.code));
            } catch {
                /* outside the 24h window: nothing to do */
            }
            if (c.state === "awaiting_payment" && c.state_data?.order_code === e.code) await setContact(c.id, { state: "idle", state_data: {} });
        }
        if (t.report) {
            const { s } = await settings();
            await ownerCard(UI.statusScreen(t.report, s.paused === true));
        }
        const notices = wa ? await db.rpc("bot_claim_notifications", { p_limit: 20 }) : [];
        await deliverNotices(notices);
        return ok({ fulfilled: (t.to_fulfill || []).length, expired: (t.expired || []).length, report: !!t.report, notices: notices.length });
    }

    return { handleWhatsApp, handleTelegram, handlePayment, handleCron, fulfill, processMessage };
}
