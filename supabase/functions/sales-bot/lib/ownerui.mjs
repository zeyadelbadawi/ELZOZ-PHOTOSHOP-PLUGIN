// Everything the owner sees in the Telegram control bot: cards, menus, buttons, bot profile.
//
// Layout rules (Telegram picks each line's direction from its first letter):
//   * every line starts with an emoji or Arabic word and an RLM mark, so mixed Arabic/English
//     lines stay right-to-left;
//   * codes, emails, phones and commands are wrapped in <code> (tap to copy, kept LTR);
//   * one title, one divider, short labelled rows, then buttons.

import { clip, escapeHtml, formatMoney } from "./util.mjs";

const RLM = "\u200f";
const LINE = "━━━━━━━━━━━━━━";

/** Joins lines and makes each one right-to-left. Empty strings become blank lines; null/false are dropped. */
export function lines(...rows) {
    return rows
        .flat()
        .filter((r) => r !== null && r !== undefined && r !== false)
        .map((r) => (r === "" ? "" : RLM + r))
        .join("\n");
}

export function card(icon, title, rows, footer) {
    return lines(`${icon} <b>${title}</b>`, LINE, rows, footer ? ["", footer] : null);
}

const code = (s) => `<code>${escapeHtml(s)}</code>`;
const b = (s) => `<b>${escapeHtml(s)}</b>`;
export const contactLine = (c) => [
    `👤 ${b(c.name || "بدون اسم")}  ·  ${code("#C" + c.id)}`,
    `📱 ${code("+" + c.wa_id)}`
];

export function ago(iso, now = new Date()) {
    if (!iso) return "";
    const m = Math.max(0, Math.round((now - new Date(iso)) / 60000));
    if (m < 1) return "دلوقتي";
    if (m < 60) return `من ${m} دقيقة`;
    const h = Math.round(m / 60);
    if (h < 24) return `من ${h} ساعة`;
    return `من ${Math.round(h / 24)} يوم`;
}

// ---------------------------------------------------------------- keyboards

export const KB = {
    status: "📊 الحالة",
    orders: "🧾 الطلبات",
    contacts: "👥 العملاء",
    pause: "⏸️ إيقاف البوت",
    resume: "▶️ تشغيل البوت",
    help: "❓ مساعدة"
};

/** Persistent keyboard under the message box. */
export function mainKeyboard(paused) {
    return [[KB.status, KB.orders], [KB.contacts, paused ? KB.resume : KB.pause], [KB.help]];
}

/** Maps a tapped keyboard label to its command. */
export function keyboardCommand(text) {
    const t = String(text || "").trim();
    for (const [cmd, label] of Object.entries(KB)) if (t === label) return `/${cmd}`;
    return null;
}

const navRow = (paused) => [
    { text: "🧾 الطلبات", data: "m:orders" },
    { text: "👥 العملاء", data: "m:contacts" },
    { text: paused ? "▶️ تشغيل" : "⏸️ إيقاف", data: paused ? "m:resume" : "m:pause" }
];

// ---------------------------------------------------------------- bot profile (set by /start)

export const PROFILE = {
    shortDescription: "لوحة تحكم مبيعات Elzoz 🚀 تنبيهات، موافقات، ورد على العملاء.",
    description:
        "🤖 لوحة تحكم Elzoz الخاصة\n\n" +
        "• تنبيه فوري لكل عميل جديد وكل طلب وكل تحويل\n" +
        "• قبول أو رفض التحويلات بزرار\n" +
        "• الرد على عملاء واتساب من هنا\n" +
        "• تقرير يومي بالمبيعات\n\n" +
        "🔒 البوت ده خاص بإدارة Elzoz بس.",
    commands: [
        { command: "status", description: "📊 ملخص آخر 24 ساعة" },
        { command: "orders", description: "🧾 الطلبات المفتوحة" },
        { command: "contacts", description: "👥 آخر العملاء" },
        { command: "pause", description: "⏸️ إيقاف البوت" },
        { command: "resume", description: "▶️ تشغيل البوت" },
        { command: "help", description: "❓ كل الأوامر" }
    ]
};

// ---------------------------------------------------------------- screens

export function welcomeScreen(paused) {
    return {
        text: card(
            "👋",
            "أهلاً بيك في لوحة تحكم Elzoz",
            [
                `الحالة: ${paused ? "⏸️ البوت واقف" : "🟢 البوت شغال"}`,
                "",
                "📌 هيجيلك هنا:",
                "• تنبيه لكل عميل جديد وطلب وتحويل",
                "• زراير ✅ قبول و ❌ رفض للتحويلات",
                "• رسايل العملاء اللي محتاجين حد يرد عليهم",
                "• تقرير يومي الساعة 10 بالليل"
            ],
            "💡 استخدم الزراير اللي تحت، أو اعمل Reply على أي تنبيه عشان ترد على العميل."
        ),
        keyboard: mainKeyboard(paused)
    };
}

export function helpScreen() {
    return card(
        "❓",
        "كل الأوامر",
        [
            "📊 <b>المتابعة</b>",
            `• الحالة: /status`,
            `• الطلبات المفتوحة: /orders`,
            `• آخر العملاء: /contacts`,
            "",
            "🧾 <b>الطلبات</b>",
            `• قبول: ${code("/approve EZ-123456")}`,
            `• رفض: ${code("/reject EZ-123456 السبب")}`,
            "",
            "💬 <b>العملاء</b>",
            `• رسالة لعميل: ${code("/msg 12 النص")}`,
            `• رجّعه للبوت: ${code("/bot 12")}`,
            `• حظر / فك حظر: ${code("/block 12")}  ·  ${code("/unblock 12")}`,
            "",
            "⚙️ <b>البوت</b>",
            "• إيقاف: /pause  ·  تشغيل: /resume"
        ],
        "💡 رقم العميل هو اللي بعد #C في التنبيهات. وللرد على عميل: Reply على التنبيه بتاعه."
    );
}

export function statusScreen(r, paused) {
    const waiting = r.waiting_owner || [];
    const rows = [
        paused ? "⏸️ البوت <b>واقف</b>: كل الرسايل بتجيلك هنا" : "🟢 البوت <b>شغال</b>",
        "",
        `👥 عملاء جدد: <b>${r.new_contacts}</b>`,
        `🧾 طلبات: <b>${r.orders_created}</b>`,
        `💰 مبيعات: <b>${r.sales}</b>  ·  إيراد: <b>${formatMoney(r.revenue)}</b> جنيه`,
        `🤖 اتأكدت تلقائي: <b>${r.auto_approved}</b>`,
        `⏳ مستني موافقتك: ${waiting.length ? waiting.map(code).join("  ") : "<b>لا</b>"}`,
        `⚠️ تحويلات مش متطابقة: <b>${r.unmatched_payments}</b>`
    ];
    if ((r.expiring_3d || []).length) rows.push("", "⌛ <b>اشتراكات بتخلص خلال 3 أيام:</b>", ...r.expiring_3d.map((x) => `• ${code(x.email)}`));
    if ((r.inactive_new || []).length) rows.push("", "😴 <b>اشتركوا وما استخدموش البلجن لسه:</b>", ...r.inactive_new.map((e) => `• ${code(e)}`));
    return { text: card("📊", "تقرير آخر 24 ساعة", rows), buttons: [navRow(paused)] };
}

export function ordersScreen(rows, now = new Date()) {
    if (!rows.length) return { text: card("🧾", "الطلبات المفتوحة", ["✨ مفيش طلبات مفتوحة دلوقتي."]), buttons: [[{ text: "📊 الحالة", data: "m:status" }]] };
    const text = card(
        "🧾",
        `الطلبات المفتوحة (${rows.length})`,
        rows.flatMap((o, i) => [
            i ? "" : null,
            `${o.claimed_at ? "📸" : "🕐"} ${code(o.code)}  ·  <b>${formatMoney(o.amount_due)}</b> جنيه`,
            `✉️ ${code(o.email)}  ·  ${ago(o.created_at, now)}`
        ]),
        "📸 = العميل بعت إيصال ومستني موافقتك"
    );
    const buttons = rows.slice(0, 6).map((o) => [
        { text: `✅ قبول ${o.code}`, data: `ap:${o.code}` },
        { text: "❌ رفض", data: `rj:${o.code}` }
    ]);
    return { text, buttons };
}

export function contactsScreen(rows, now = new Date()) {
    if (!rows.length) return { text: card("👥", "آخر العملاء", ["✨ لسه محدش كلم البوت."]), buttons: [] };
    const text = card(
        "👥",
        `آخر العملاء (${rows.length})`,
        rows.flatMap((c, i) => [
            i ? "" : null,
            `${c.blocked ? "🚫" : c.human ? "🙋" : c.user_id ? "⭐" : "🆕"} ${b(c.name || "بدون اسم")}  ·  ${code("#C" + c.id)}  ·  ${ago(c.last_inbound_at, now)}`,
            c.last ? `💬 ${escapeHtml(clip(c.last, 70))}` : null
        ]),
        "⭐ عميل مشترك  ·  🆕 جديد  ·  🙋 مع الدعم  ·  🚫 محظور"
    );
    const buttons = rows.filter((c) => c.human).slice(0, 5).map((c) => [{ text: `↩️ رجّع #C${c.id} للبوت`, data: `rl:${c.id}` }]);
    return { text, buttons };
}

// ---------------------------------------------------------------- alerts

export function newContactAlert(c, firstText) {
    return {
        text: card("🆕", "عميل جديد", [...contactLine(c), `🏷️ المصدر: ${code(c.source || "direct")}`, firstText ? `💬 ${escapeHtml(clip(firstText, 300))}` : null]),
        buttons: [[{ text: "🙋 أنا هرد عليه", data: `hm:${c.id}` }, { text: "🚫 حظر", data: `bk:${c.id}` }]]
    };
}

export function supportAlert(c, reason, text) {
    return {
        text: card(
            "🙋",
            "طلب دعم",
            [...contactLine(c), `📝 السبب: ${escapeHtml(REASONS[reason] || reason)}`, text ? `💬 ${escapeHtml(clip(text, 500))}` : null],
            "↩️ اعمل Reply على الرسالة دي وردك هيوصل للعميل على واتساب."
        ),
        buttons: [[{ text: "↩️ رجّعه للبوت", data: `rl:${c.id}` }]]
    };
}

const REASONS = {
    asked: "طلب يكلم حد",
    human: "طلب يكلم حد",
    install_fail: "مشكلة في التثبيت ما اتحلتش",
    email_tries: "مقدرش يكتب إيميل صحيح",
    "forgot password, phone not linked": "نسي الباسورد ورقمه مش مربوط بحساب",
    "no unique amount slot left": "ضغط طلبات (مفيش مبلغ مميز متاح)"
};

export function messageAlert(c, text, kind = "text") {
    return card("💬", "رسالة من عميل", [...contactLine(c), `${kind === "image" ? "🖼️" : "✉️"} ${escapeHtml(clip(text || `[${kind}]`, 1500))}`], "↩️ Reply للرد عليه.");
}

export function unclearAlert(c, text) {
    return card("❓", "رسالة مش مفهومة", [...contactLine(c), `✉️ ${escapeHtml(clip(text, 400))}`], "↩️ Reply لو حابب ترد بنفسك.");
}

export function orderAlert(c, o) {
    return card("🧾", "طلب جديد", [
        `🔖 ${code(o.code)}  ·  ${o.kind === "new" ? "حساب جديد" : "تجديد"}`,
        `📦 ${escapeHtml(o.package_name)}`,
        `💵 المطلوب: <b>${formatMoney(o.amount_due)}</b> جنيه`,
        `✉️ ${code(o.email)}`,
        ...contactLine(c)
    ]);
}

export function receiptAlert(c, o, read) {
    return {
        text: card(
            "📸",
            "إيصال تحويل",
            [
                `🔖 ${code(o.code)}`,
                `💵 المطلوب: <b>${formatMoney(o.amount_due)}</b> جنيه`,
                read
                    ? `🤖 قراءة الصورة: ${read.is_receipt ? "إيصال" : "مش واضح إنه إيصال"}  ·  ${read.amount ?? "?"} جنيه${read.reference ? "  ·  " + code(read.reference) : ""}`
                    : null,
                ...contactLine(c)
            ],
            "⏳ لو إشعار الدفع وصل للموبايل هيتأكد لوحده، أو قرر إنت:"
        ),
        buttons: [[{ text: "✅ قبول", data: `ap:${o.code}` }, { text: "❌ رفض", data: `rj:${o.code}` }]]
    };
}

export function lateReceiptAlert(c, codeStr, status) {
    return {
        text: card("📸", "إيصال لطلب مش مفتوح", [`🔖 ${code(codeStr)}  ·  الحالة: ${escapeHtml(status || "?")}`, ...contactLine(c)], "راجعه وقرر:"),
        buttons: [[{ text: "✅ قبول", data: `ap:${codeStr}` }, { text: "❌ رفض", data: `rj:${codeStr}` }]]
    };
}

export function saleAlert(o, delivered, hadPassword) {
    return card(
        "✅",
        "بيع جديد",
        [
            `🔖 ${code(o.code)}  ·  ${o.kind === "new" ? "حساب جديد" : "تجديد"}`,
            `💰 <b>${formatMoney(o.amount_due)}</b> جنيه`,
            `✉️ ${code(o.email)}`,
            `🧾 الموافقة: ${o.approved_by === "auto" ? "🤖 تلقائي" : escapeHtml(o.approved_by || "")}`,
            delivered ? "📩 اتبعت للعميل على واتساب" : `⚠️ رسالة واتساب للعميل فشلت. ${hadPassword ? "اعمل له Reset Password من الداشبورد وابعتهوله." : "بلغه بنفسك."}`
        ]
    );
}

export function paymentAlert(kind, p, extra = {}) {
    const rows = [
        `💵 <b>${formatMoney(p.amount)}</b> جنيه  ·  ${CHANNELS[p.channel] || p.channel}`,
        p.payer ? `👤 من: ${code(p.payer)}` : null,
        p.reference ? `🔖 مرجع: ${code(p.reference)}` : null
    ];
    if (kind === "matched") return { text: card("💰", `تحويل وصل واتطابق مع ${escapeHtml(extra.order)}`, rows, "⚙️ جاري تجهيز الحساب...") };
    if (kind === "untrusted")
        return {
            text: card("⚠️", "رسالة دفع من مصدر مش موثوق", [...rows, `📮 المرسل: ${code(p.sender || "?")}`], "لو المصدر ده سليم، ضيفه في PAY_ALLOWED_SENDERS.")
        };
    return {
        text: card("💰", "تحويل وصل ومش متطابق مع طلب مفتوح", rows, extra.candidate ? `🔎 ممكن يكون للطلب ${code(extra.candidate)}.` : "راجع الطلبات وقرر."),
        buttons: extra.candidate ? [[{ text: `✅ اعتبره لـ ${extra.candidate}`, data: `ap:${extra.candidate}:${extra.eventId}` }]] : undefined
    };
}

const NOTICE_AR = {
    credits_added: "إضافة كريدت",
    credits_removed: "خصم كريدت",
    refund: "استرجاع كريدت",
    disabled: "إيقاف الحساب",
    enabled: "تفعيل الحساب",
    password_reset: "تغيير الباسورد",
    order_rejected: "رفض طلب",
    expiry_reminder: "تذكير بانتهاء الكريدت"
};

/** Result of telling a client about a dashboard change. */
export function noticeResult(n, status, error) {
    const amount = n.data?.amount ?? n.data?.credits;
    const what = `${NOTICE_AR[n.kind] || n.kind}${amount ? ` (${amount} كريدت)` : ""}`;
    const who = [n.account?.email ? code(n.account.email) : null, n.contact ? code("#C" + n.contact.id) : null].filter(Boolean).join("  ·  ");
    const rows = [`📝 ${escapeHtml(what)}`, who ? `👤 ${who}` : null];
    if (status === "sent") return card("📩", "اتبعت للعميل على واتساب", rows);
    if (status === "sent_template") return card("📩", "اتبعت للعميل على واتساب (رسالة قالب)", rows);
    if (status === "waiting")
        return card("⏳", "إشعار مستني العميل", rows, "عدّى 24 ساعة من آخر رسالة منه، وواتساب مش بيسمح نبعتله دلوقتي. هيوصله أول ما يكلم البوت.");
    if (status === "no_contact") return card("📵", "العميل ماوصلوش إشعار", rows, "الحساب ده مش مربوط برقم واتساب (اتعمل من الداشبورد، مش من البوت). بلغه بنفسك.");
    return card("⛔", "الإشعار ما اتبعتش", [...rows, error ? `⚠️ ${escapeHtml(clip(error, 200))}` : null]);
}

const CHANNELS = { vodafone_cash: "📱 فودافون كاش", instapay: "🏦 InstaPay", bank: "🏦 بنك", unknown: "❔" };

export const say = {
    ok: (t) => lines(`✅ ${t}`),
    info: (t) => lines(`ℹ️ ${t}`),
    error: (t) => lines(`⛔ ${t}`)
};
