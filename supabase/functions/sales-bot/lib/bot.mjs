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
import { extractForwarded, parsePayment } from "./payments.mjs";
import { verifyMetaSignature } from "./clients.mjs";
import { clip, escapeHtml, formatMoney, generatePassword, localHour, safeEqual, sha256Hex } from "./util.mjs";

const HUMAN_HOURS = 12;
const FLOOD_PER_MINUTE = 15;
const DOWNLOAD_LINK_SECONDS = 7 * 24 * 3600;

const ok = (body = { ok: true }) => ({ status: 200, body });
const deny = (status = 401) => ({ status, body: { error: "unauthorized" } });

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
            log("warn", "telegram send failed", { error: e.message });
        }
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
            await wa.text(c.wa_id, body);
            await logOut(c.id, "text", opts.secret ? "[credentials]" : body);
        },
        buttons: async (c, body, buttons) => {
            await wa.buttons(c.wa_id, body, buttons);
            await logOut(c.id, "buttons", body);
        },
        list: async (c, body, label, rows) => {
            await wa.list(c.wa_id, body, label, rows);
            await logOut(c.id, "list", body);
        }
    };

    const tag = (c) => `#C${c.id}`;
    const who = (c) => `${escapeHtml(c.name || "")} (+${c.wa_id}) ${tag(c)}`;

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
            await owner(
                `✅ <b>بيع ${escapeHtml(o.code)}</b>: ${formatMoney(o.amount_due)} جنيه\n${o.kind === "new" ? "حساب جديد" : "تجديد"}: ${escapeHtml(o.email)}\n` +
                    `الموافقة: ${escapeHtml(o.approved_by || "")}` +
                    (delivered ? "" : `\n⚠️ رسالة واتساب للعميل فشلت. ${password ? "اعمل له Reset Password من الداشبورد وابعتهوله." : "بلغه بنفسك."}`)
            );
            if (done.referral && wa) {
                try {
                    await wa.text(done.referral.wa_id, T.referral(done.referral.credits));
                } catch {
                    /* outside the 24h window: the owner is told below */
                }
                await owner(`🎁 مكافأة ترشيح ${done.referral.credits} كريدت لـ +${done.referral.wa_id}`);
            }
            return done;
        } catch (e) {
            log("error", "fulfillment failed", { order: o.code, error: e.message });
            await owner(`⛔ فشل تجهيز الطلب ${escapeHtml(o.code)}: ${escapeHtml(e.message)}\nهيتعاد تلقائي بعد 10 دقايق.`);
            return null;
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
        if (!(await verifyMetaSignature(req.rawBody, req.headers["x-hub-signature-256"], config.waAppSecret))) return deny();
        let payload;
        try {
            payload = JSON.parse(req.rawBody);
        } catch {
            return { status: 400, body: { error: "bad_json" } };
        }
        const work = [];
        for (const entry of payload.entry || []) {
            for (const change of entry.changes || []) {
                const value = change.value || {};
                if (config.waPhoneNumberId && value.metadata?.phone_number_id && value.metadata.phone_number_id !== config.waPhoneNumberId) continue;
                const names = Object.fromEntries((value.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
                for (const m of value.messages || []) work.push(() => processMessage(m, names[m.from]));
            }
        }
        // Meta wants a fast 200; the caller keeps the promise alive (EdgeRuntime.waitUntil).
        const done = (async () => {
            for (const w of work) {
                try {
                    await w();
                } catch (e) {
                    log("error", "message failed", { error: e.message });
                    await owner(`⛔ خطأ في معالجة رسالة: ${escapeHtml(e.message)}`);
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
        await owner(`👤 <b>طلب دعم</b> ${who(c)}\nالسبب: ${escapeHtml(reason)}\n${text ? "آخر رسالة: " + escapeHtml(clip(text, 500)) : ""}\n\nرد على الرسالة دي وردك هيوصل للعميل.`, [
            [{ text: "↩️ رجّعه للبوت", data: `rl:${c.id}` }]
        ]);
    }

    async function execute(step, c, msg) {
        const { s, packages } = await settings();
        const data = c.state_data || {};
        switch (step.step) {
            case "welcome":
                await showMenu(c, c.account ? T.welcomeBack(c.name, c.account) : T.welcome(c.name));
                await setContact(c.id, { state: "idle", state_data: {} });
                await owner(`🆕 <b>عميل جديد</b> ${who(c)}\nالمصدر: ${escapeHtml(c.source || "")}\nأول رسالة: ${escapeHtml(clip(msg.text, 300))}`);
                return;
            case "menu":
                if (step.release) await setContact(c.id, { human_until: null });
                await showMenu(c, step.greet ? T.welcomeBack(c.name, c.account) : undefined);
                if (step.unclear && msg.text) await owner(`❓ رسالة مش مفهومة من ${who(c)}:\n${escapeHtml(clip(msg.text, 400))}`);
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
                await owner(`📷 صورة من ${who(c)} من غير طلب مفتوح.`);
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
                const media = await wa.media(msg.mediaId);
                await tg.photo(media.bytes, media.mime, `💬 ${who(c)}${msg.text ? ": " + escapeHtml(clip(msg.text, 300)) : ""}`);
                return;
            } catch (e) {
                log("warn", "media forward failed", { error: e.message });
            }
        }
        await owner(`💬 ${who(c)}:\n${escapeHtml(clip(msg.text || msg.id || `[${msg.type}]`, 1500))}`);
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
        await owner(
            `🧾 <b>طلب ${escapeHtml(order.code)}</b> ${who(c)}\n${escapeHtml(order.package_name)} — المطلوب ${formatMoney(order.amount_due)} جنيه\n` +
                `${order.kind === "new" ? "حساب جديد" : "تجديد"}: ${escapeHtml(order.email)}`
        );
    }

    async function claimPayment(c, msg, data) {
        let media = null;
        let read = null;
        try {
            media = await wa.media(msg.mediaId);
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
            await owner(`📷 إيصال لطلب ${escapeHtml(data.order_code)} (الحالة: ${escapeHtml(st || "?")}) من ${who(c)}`, [
                [{ text: "✅ قبول", data: `ap:${data.order_code}` }, { text: "❌ رفض", data: `rj:${data.order_code}` }]
            ]);
            return;
        }
        const order = updated[0];
        let reply = T.claimReceived;
        if (read?.is_receipt && read.amount != null && Math.abs(read.amount - Number(order.amount_due)) >= 0.01) reply += "\n\n" + T.amountMismatch(read.amount, order.amount_due);
        await send.text(c, reply);
        const caption =
            `📸 <b>إيصال للطلب ${escapeHtml(order.code)}</b> ${who(c)}\nالمطلوب: ${formatMoney(order.amount_due)} جنيه\n` +
            (read ? `قراءة الذكاء الاصطناعي: ${read.is_receipt ? "إيصال" : "مش إيصال؟"} — ${read.amount ?? "?"} جنيه — مرجع ${escapeHtml(read.reference || "?")}\n` : "") +
            `لو إشعار الدفع وصل للموبايل هيتأكد لوحده. أو قرر إنت:`;
        const buttons = [[{ text: "✅ قبول", data: `ap:${order.code}` }, { text: "❌ رفض", data: `rj:${order.code}` }]];
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
        await owner(`🔑 اتعمل باسورد جديد تلقائي لـ ${escapeHtml(c.account?.email || "")} ${who(c)}`);
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
            if (u.message?.text?.startsWith("/start") && tg) await tg.send(`chat id: <code>${escapeHtml(chat)}</code>\nحطه في TG_OWNER_CHAT_ID.`, null, chat);
            return ok();
        }
        if (chat !== String(config.tgOwner)) return ok(); // anyone else is ignored
        try {
            if (u.callback_query) await ownerButton(u.callback_query);
            else if (u.message?.text) await ownerMessage(u.message);
        } catch (e) {
            log("error", "owner command failed", { error: e.message });
            await owner(`⛔ ${escapeHtml(e.message)}`);
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
        if (!r.changed) return `الطلب ${code} حالته ${r.status || "مش موجود"}`;
        await fulfill(r.order.id);
        return `✅ اتقبل ${code}`;
    }

    async function reject(code, by, reason) {
        const r = await db.rpc("bot_reject", { p_code: code, p_by: by, p_reason: reason || "rejected by owner" });
        if (!r.changed) return `الطلب ${code} حالته ${r.status || "مش موجود"}`;
        const c = await contactById(r.order.contact_id);
        if (c && wa) {
            try {
                await send.text(c, T.rejected(code));
            } catch {
                /* outside the window */
            }
            await setContact(c.id, { state: "idle", state_data: {} });
        }
        return `❌ اترفض ${code}`;
    }

    async function ownerButton(q) {
        const [kind, arg, extra] = String(q.data || "").split(":");
        let answer = "تم";
        if (kind === "ap") answer = await approve(arg, "owner:telegram", extra ? Number(extra) : null);
        else if (kind === "rj") answer = await reject(arg, "owner:telegram");
        else if (kind === "rl" && Number(arg) > 0) {
            await setContact(Number(arg), { human_until: null, state: "idle", state_data: {} });
            answer = `↩️ #C${arg} رجع للبوت`;
        }
        await tg.answer(q.id, answer);
        if (q.message?.message_id && (kind === "ap" || kind === "rj")) {
            try {
                await tg.clearButtons(q.message.message_id);
            } catch {
                /* already edited */
            }
        }
        await owner(escapeHtml(answer));
    }

    async function ownerMessage(m) {
        const text = String(m.text || "").trim();
        const replied = m.reply_to_message?.text || m.reply_to_message?.caption || "";
        const target = replied.match(/#C(\d+)/);
        if (target && !text.startsWith("/")) return relay(Number(target[1]), text);

        const [cmd, ...rest] = text.split(/\s+/);
        const arg = rest[0];
        // Customer number for /msg, /bot, /block, /unblock: "12", "C12" or "#C12".
        const cid = Number(String(arg || "").replace(/^#?c/i, ""));
        const needsContact = ["/msg", "/bot", "/block", "/unblock"].includes(cmd.toLowerCase());
        if (needsContact && !(Number.isInteger(cid) && cid > 0)) {
            return owner(`اكتب رقم العميل بعد الأمر، مثلاً: <code>${escapeHtml(cmd)} 12</code>${cmd === "/msg" ? " النص" : ""}\nرقم العميل هو اللي بعد #C في التنبيهات.`);
        }
        switch (cmd.toLowerCase().replace(/@.*$/, "")) {
            case "/start":
            case "/help":
                return owner(
                    "<b>أوامر Elzoz</b>\n/status — ملخص آخر 24 ساعة\n/orders — الطلبات المفتوحة\n/approve EZ-123456 — قبول طلب\n/reject EZ-123456 السبب — رفض\n" +
                        "/msg 12 النص — رسالة لعميل #C12\n/bot 12 — رجّع #C12 للبوت\n/block 12 · /unblock 12\n/pause — إيقاف البوت (كل الرسايل ليك)\n/resume — تشغيل البوت\n\nوللرد على عميل: اعمل Reply على تنبيهه."
                );
            case "/status": {
                const r = await db.rpc("bot_report", { p_since: new Date(now().getTime() - 86400e3).toISOString() });
                const { s } = await settings();
                return owner(reportText(r, s.paused === true));
            }
            case "/orders": {
                const rows = await db.select("bot_orders", "select=code,email,amount_due,claimed_at,created_at&status=eq.awaiting_payment&order=created_at.desc&limit=15");
                if (!rows.length) return owner("مفيش طلبات مفتوحة.");
                return owner(
                    rows.map((o) => `• ${escapeHtml(o.code)} — ${formatMoney(o.amount_due)} ج — ${escapeHtml(o.email)}${o.claimed_at ? " 📸" : ""}`).join("\n"),
                    rows.filter((o) => o.claimed_at).slice(0, 5).map((o) => [{ text: `✅ ${o.code}`, data: `ap:${o.code}` }, { text: `❌ ${o.code}`, data: `rj:${o.code}` }])
                );
            }
            case "/approve":
                return owner(escapeHtml(await approve(String(arg || "").toUpperCase(), "owner:telegram")));
            case "/reject":
                return owner(escapeHtml(await reject(String(arg || "").toUpperCase(), "owner:telegram", rest.slice(1).join(" "))));
            case "/msg":
                return relay(cid, rest.slice(1).join(" "));
            case "/bot":
                if (!(await contactById(cid))) return owner(`مفيش عميل #C${cid}`);
                await setContact(cid, { human_until: null, state: "idle", state_data: {} });
                return owner(`↩️ #C${cid} رجع للبوت`);
            case "/block":
            case "/unblock":
                if (!(await contactById(cid))) return owner(`مفيش عميل #C${cid}`);
                await setContact(cid, { blocked: cmd.toLowerCase() === "/block" });
                return owner(`${cmd.toLowerCase() === "/block" ? "🚫 اتحظر" : "✅ اتفك حظر"} #C${cid}`);
            case "/pause":
            case "/resume":
                await db.update("bot_settings", "key=eq.paused", { value: cmd === "/pause", updated_at: now().toISOString() });
                cache = null;
                return owner(cmd === "/pause" ? "⏸️ البوت واقف: كل الرسايل هتجيلك هنا." : "▶️ البوت شغال.");
            default:
                return owner("مش فاهم الأمر. اكتب /help");
        }
    }

    async function relay(contactId, text) {
        const c = await contactById(contactId);
        if (!c) return owner(`مفيش عميل #C${escapeHtml(String(contactId))}`);
        if (!text) return owner(`اكتب الرسالة بعد الرقم، مثلاً: <code>/msg ${c.id} أهلاً</code>`);
        try {
            await send.text(c, text);
        } catch (e) {
            return owner(`⛔ الرسالة ما اتبعتتش (غالباً عدّى 24 ساعة من آخر رسالة للعميل): ${escapeHtml(e.message)}`);
        }
        await setContact(c.id, { human_until: new Date(now().getTime() + HUMAN_HOURS * 3600e3).toISOString() });
        return owner(`✓ اتبعت لـ #C${c.id}. البوت ساكت معاه ${HUMAN_HOURS} ساعة (أو /bot ${c.id}).`);
    }

    function reportText(r, paused) {
        const lines = [
            `📊 <b>تقرير آخر 24 ساعة</b>${paused ? " — ⏸️ البوت واقف" : ""}`,
            `عملاء جدد: ${r.new_contacts} · طلبات: ${r.orders_created}`,
            `مبيعات: ${r.sales} · إيراد: ${formatMoney(r.revenue)} جنيه (تلقائي: ${r.auto_approved})`,
            `مستني موافقتك: ${(r.waiting_owner || []).join(", ") || "لا"}`,
            `تحويلات مش متطابقة: ${r.unmatched_payments}`
        ];
        if ((r.expiring_3d || []).length) lines.push(`⏳ بيخلص خلال 3 أيام: ${r.expiring_3d.map((x) => escapeHtml(x.email)).join(", ")}`);
        if ((r.inactive_new || []).length) lines.push(`😴 اشتركوا وما استخدموش لسه: ${r.inactive_new.map(escapeHtml).join(", ")}`);
        return lines.join("\n");
    }

    // ------------------------------------------------------------ payment notifications

    async function handlePayment(req) {
        const key = req.headers["x-elzoz-key"] || req.query.key || "";
        if (!config.payKey || config.payKey.length < 24 || !safeEqual(key, config.payKey)) return deny();
        const fwd = extractForwarded(req.rawBody, req.headers["content-type"] || "");
        const p = parsePayment(fwd, config.allowedSenders);
        if (!p) return ok({ ignored: true }); // not a received-money message: not stored
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
        const line = `${formatMoney(p.amount)} جنيه — ${p.channel}${p.payer ? " من " + escapeHtml(p.payer) : ""}${p.reference ? " — مرجع " + escapeHtml(p.reference) : ""}`;
        if (r.matched) {
            const work = (async () => {
                await owner(`💰 تحويل وصل واتطابق مع ${escapeHtml(r.order.code)}: ${line}`);
                await fulfill(r.order.id);
            })();
            return { ...ok({ matched: true }), background: work };
        }
        if (!p.trusted) {
            await owner(`⚠️ رسالة دفع من مصدر مش موثوق (${escapeHtml(p.sender || "?")}): ${line}\nلو المصدر ده سليم ضيفه في PAY_ALLOWED_SENDERS.`);
            return ok({ matched: false });
        }
        const candidate = r.candidate || r.late_candidate;
        await owner(
            `💰 تحويل وصل ومش متطابق مع طلب مفتوح: ${line}` + (candidate ? `\nممكن يكون للطلب ${escapeHtml(candidate)}.` : ""),
            candidate ? [[{ text: `✅ اعتبره لـ ${candidate}`, data: `ap:${candidate}:${r.event_id}` }]] : undefined
        );
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
            await owner(reportText(t.report, s.paused === true));
        }
        return ok({ fulfilled: (t.to_fulfill || []).length, expired: (t.expired || []).length, report: !!t.report });
    }

    return { handleWhatsApp, handleTelegram, handlePayment, handleCron, fulfill, processMessage };
}
