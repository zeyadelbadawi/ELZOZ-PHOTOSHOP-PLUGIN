// Conversation routing: a pure function from (contact state, message) to the next step.
// It never touches money or accounts itself; bot.mjs executes the step it returns.
//
// States: idle | renew_confirm | choosing_package | awaiting_email | confirming_email | awaiting_payment | install

import { extractEmail, normalizeText } from "./util.mjs";

const KEYWORDS = [
    ["menu", /^(قايمه|القايمه|قائمه|القائمه|menu|start|ابدا|0|رجوع|back)$/],
    ["cancel", /^(الغاء|إلغاء|cancel|الغي)$/],
    ["human", /(مسيول|مسوول|حد يكلمني|كلمني|موظف|شكوي|اشتكي|استرجاع|استرداد|refund|human|agent|support|الدعم|خدمه العملا)/],
    ["forgot", /(نسيت|باسورد|الباسورد|كلمه السر|كلمه المرور|password|forgot)/],
    ["renew", /(جدد|تجديد|اشحن|شحن|renew|top ?up)/],
    ["buy", /(اشترك|اشتراك|اشتري|عايز اشترك|subscribe|buy|order|اطلب)/],
    ["prices", /(سعر|اسعار|الاسعار|بكام|باقات|الباقات|باقه|price|prices|cost|كام)/],
    ["install", /(تثبيت|تسطيب|انزل|نزلت|مش شغال|مش بيفتح|مشكله|install|error|ايرور|crash)/],
    ["paid", /(حولت|دفعت|اتحول|تم التحويل|paid|transferred)/],
    ["demo", /(ديمو|demo|فيديو|بيعمل ايه|بيشتغل ازاي)/],
    ["thanks", /^(شكرا|متشكر|تسلم|thanks|thank you|thx|ok|اوك|تمام)\W*$/],
    ["faq", /(اسيله|سوال|faq)/],
    ["greeting", /^(السلام عليكم|سلام|اهلا|هاي|هلو|hi|hello|hey|مساء الخير|صباح الخير)\W*$/]
];

/** Keyword intent of a free-text message, or null. */
export function keywordIntent(text) {
    const t = normalizeText(text).replace(/\[[^\]]*\]/g, "").trim();
    if (!t) return null;
    for (const [intent, re] of KEYWORDS) if (re.test(t)) return intent;
    return null;
}

/**
 * @param {object} ctx
 *   contact: {state, state_data, human_until, account, is_new, name}
 *   msg: {type: 'text'|'button'|'image'|'other', text?, id? (button/list id)}
 *   paused: boolean, now: Date, aiIntent?: {intent, email} (set on the second pass)
 * @returns {{step: string, ...}}
 */
export function decide(ctx) {
    const { contact, msg, now = new Date() } = ctx;
    const state = contact.state || "idle";
    const data = contact.state_data || {};

    if (contact.human_until && new Date(contact.human_until) > now) {
        // A person is handling this chat. The customer can go back to the bot with "القائمة".
        if (msg.type === "text" && keywordIntent(msg.text) === "menu") return { step: "menu", release: true };
        return { step: "forward_to_owner" };
    }
    if (ctx.paused) return { step: "paused" };
    if (contact.is_new && msg.type !== "button") return { step: "welcome" };

    // ---- buttons and list rows carry exact ids
    if (msg.type === "button") {
        const id = String(msg.id || "");
        if (id.startsWith("pkg:")) {
            const pkg = id.slice(4);
            if (data.renew_email) return { step: "create_order", package: pkg, email: data.renew_email };
            return { step: "ask_email", package: pkg };
        }
        if (id.startsWith("faq:")) return { step: "faq_answer", index: Number(id.slice(4)) };
        switch (id) {
            case "menu":
                return { step: "menu" };
            case "prices":
                return { step: "prices" };
            case "buy":
                return contact.account?.email ? { step: "renew_confirm" } : { step: "choose_package" };
            case "renew_yes":
                return { step: "choose_package", renewEmail: contact.account?.email || null };
            case "renew_other":
                return { step: "choose_package" };
            case "email_ok":
                return data.email && data.package ? { step: "create_order", package: data.package, email: data.email } : { step: "choose_package" };
            case "email_edit":
                return { step: "ask_email", package: data.package };
            case "faq":
                return { step: "faq" };
            case "install":
                return { step: "install" };
            case "install_ok":
                return { step: "install_ok" };
            case "install_fail":
            case "human":
                return { step: "human", reason: id };
            case "forgot":
                return { step: "forgot" };
            case "cancel_order":
                return { step: "cancel_order" };
            default:
                return { step: "menu" };
        }
    }

    // ---- images: a receipt while an order waits for payment
    if (msg.type === "image") {
        if (state === "awaiting_payment" && data.order_code) return { step: "claim_payment" };
        return { step: "image_without_order" };
    }
    if (msg.type !== "text") return { step: "unsupported" };

    const text = String(msg.text || "");
    const kw = keywordIntent(text);

    // ---- state-specific text
    if (state === "awaiting_email" || state === "confirming_email") {
        const email = extractEmail(text);
        if (email) return { step: "confirm_email", email, package: data.package };
        if (!kw) {
            const tries = Number(data.email_tries || 0) + 1;
            return tries >= 3 ? { step: "human", reason: "email_tries" } : { step: "email_again", tries };
        }
    }
    if (state === "awaiting_payment" && data.order_code) {
        if (kw === "cancel") return { step: "cancel_order" };
        if (kw === "paid" || (!kw && ctx.aiIntent?.intent === "paid")) return { step: "ask_screenshot" };
    }

    const intent = kw || ctx.aiIntent?.intent || null;
    if (!intent) return { step: "classify" }; // bot.mjs asks the AI (if configured), then calls decide again
    return routeIntent(intent, contact, ctx.aiIntent);
}

function routeIntent(intent, contact, ai) {
    switch (intent) {
        case "menu":
        case "greeting":
            return { step: "menu", greet: intent === "greeting" };
        case "prices":
            return { step: "prices" };
        case "buy":
        case "renew":
            return contact.account?.email ? { step: "renew_confirm" } : { step: "choose_package" };
        case "forgot":
        case "forgot_password":
            return { step: "forgot" };
        case "install":
        case "install_help":
            return { step: "install" };
        case "human":
            return { step: "human", reason: "asked" };
        case "faq":
            return { step: "faq" };
        case "thanks":
            return { step: "thanks" };
        case "demo":
            return { step: "demo" };
        case "paid":
            return { step: "no_open_order" };
        case "cancel":
            return { step: "no_open_order" };
        default:
            // Unclear message: show the menu, and if the AI could not place it either, tell the owner.
            return { step: "menu", unclear: true, aiTried: !!ai };
    }
}
