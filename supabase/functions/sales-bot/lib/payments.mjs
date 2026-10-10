// Parse a payment notification forwarded from the owner's Android phone (Vodafone Cash SMS,
// InstaPay app notification, or a bank SMS about an InstaPay transfer).
//
// Only money RECEIVED is a payment. Messages about money sent, balances, OTPs, offers etc. are
// ignored (and not stored). "trusted" means the sender/app is on the owner's allow-list: an SMS
// a customer sends from a normal phone number can never be trusted.

import { normalizeDigits } from "./util.mjs";

const CURRENCY = "(?:EGP|E\\.G\\.P|LE|L\\.E|جنيه(?:ا|ات)?|جنية|ج\\.?م|جم)";
const NUMBER = "(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)";
const AMOUNT_RE = new RegExp(`${CURRENCY}\\s*${NUMBER}|${NUMBER}\\s*${CURRENCY}`, "gi");

const CREDIT_RE =
    /(تم\s*)?(استلام|استقبال|ايداع|إيداع|اضافة|إضافة|اضافه|إضافه|استلمت|وصلك|تحويل\s+وارد|received|credited|deposited|incoming\s+transfer|you\s+got)/i;
const DEBIT_RE =
    /(تم\s*)?(خصم|سحب|دفع|ارسال|إرسال|تحويل\s+مبلغ\s+[\d.,]+\s*\S*\s+(?:الى|إلى)|حولت|sent|debited|withdrawn|paid\s+to|transferred\s+to|purchase)/i;
const BALANCE_RE = /(رصيد|balance|available)/i;
const REF_RE =
    /(?:رقم\s+العمليه|رقم\s+العملية|رقم\s+المرجع|المرجع|رقم\s+الحركه|رقم\s+الحركة|transaction\s*(?:id|no\.?|number)?|trx\s*(?:id)?|txn\s*(?:id)?|ref(?:erence)?\s*(?:no\.?|number|id)?)\s*[:：#\-]?\s*([A-Za-z0-9][A-Za-z0-9\-]{3,39})/i;
const PHONE_RE = /(?:\+?2)?(01[0125]\d{8})/;
const NAME_RE = /(?:from|من)\s+([^\d\n.،,؛;:]{3,40}?)(?=\s+(?:on|في|بتاريخ|via|عن|رقم|to|الى|إلى)|[.،,؛;\n]|$)/i;

export const DEFAULT_ALLOWED_SENDERS = ["vf-cash", "vf cash", "vodafone cash", "vodafonecash", "vodafone", "instapay", "com.egyptianbanks.instapay"];

export function parseAllowedSenders(value) {
    const list = String(value || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    return list.length ? list : DEFAULT_ALLOWED_SENDERS;
}

/**
 * @param {{text: string, sender?: string, app?: string}} msg
 * @param {string[]} allowed lower-case sender/app names
 * @returns {null | {channel, amount, payer, reference, trusted, sender}}  null when it is not a received payment
 */
export function parsePayment(msg, allowed = DEFAULT_ALLOWED_SENDERS) {
    const text = normalizeDigits(String(msg.text || "")).replace(/\u200f|\u200e/g, "").trim();
    if (!text) return null;
    const credit = text.search(CREDIT_RE);
    if (credit < 0) return null;
    const debit = text.search(DEBIT_RE);
    if (debit >= 0 && debit < credit) return null; // "you sent ... ; balance received ..." style messages

    // First amount after the "received" keyword that is not a balance figure.
    let amount = null;
    AMOUNT_RE.lastIndex = 0;
    for (let m; (m = AMOUNT_RE.exec(text)); ) {
        const before = text.slice(Math.max(0, m.index - 25), m.index);
        if (BALANCE_RE.test(before)) continue;
        if (m.index + m[0].length < credit) continue;
        const raw = (m[1] || m[2]).replace(/,/g, "");
        const v = Number(raw);
        if (Number.isFinite(v) && v > 0) {
            amount = Math.round(v * 100) / 100;
            break;
        }
    }
    if (amount === null) return null;

    const source = `${msg.sender || ""} ${msg.app || ""}`.toLowerCase();
    const lower = text.toLowerCase();
    const channel = /instapay|انستا\s?باي|إنستا\s?باي|انستاباي|إنستاباي/i.test(source + " " + lower)
        ? "instapay"
        : /vf[-\s]?cash|vodafone|فودافون\s?كاش/i.test(source + " " + lower)
          ? "vodafone_cash"
          : msg.sender || msg.app
            ? "bank"
            : "unknown";
    const trusted = !!source.trim() && allowed.some((a) => a && source.includes(a));
    const ref = text.match(REF_RE);
    const phone = text.slice(credit).match(PHONE_RE);
    const name = text.slice(credit).match(NAME_RE);
    return {
        channel,
        amount,
        payer: phone ? phone[1] : name ? name[1].trim() : null,
        reference: ref ? ref[1] : null,
        trusted,
        sender: (msg.sender || msg.app || "").slice(0, 120) || null
    };
}

/**
 * A message from a trusted sender that mentions an amount (not a balance) and is not about money
 * sent, but that parsePayment could not read: the bank may have changed its wording. The owner is
 * told so a real payment is not missed silently.
 */
export function unreadMoneyMessage(msg, allowed = DEFAULT_ALLOWED_SENDERS) {
    const source = `${msg.sender || ""} ${msg.app || ""}`.toLowerCase();
    if (!source.trim() || !allowed.some((a) => a && source.includes(a))) return false;
    const text = normalizeDigits(String(msg.text || "")).replace(/\u200f|\u200e/g, "");
    if (DEBIT_RE.test(text)) return false;
    AMOUNT_RE.lastIndex = 0;
    for (let m; (m = AMOUNT_RE.exec(text)); ) {
        if (!BALANCE_RE.test(text.slice(Math.max(0, m.index - 25), m.index))) return true;
    }
    return false;
}

/**
 * Forwarder apps post very different bodies. Pick the message text, the sender and the
 * app package from common field names (JSON, form fields, or plain text).
 */
export function extractForwarded(body, contentType = "") {
    let data = null;
    const raw = typeof body === "string" ? body : "";
    if (/json/i.test(contentType) || /^\s*[{[]/.test(raw)) {
        try {
            data = JSON.parse(raw);
        } catch {
            data = null;
        }
    } else if (/x-www-form-urlencoded/i.test(contentType)) {
        data = Object.fromEntries(new URLSearchParams(raw));
    }
    if (!data || typeof data !== "object") return { text: raw.slice(0, 2000), sender: null, app: null, at: null };
    const flat = {};
    const walk = (o, depth) => {
        if (depth > 3 || !o || typeof o !== "object") return;
        for (const [k, v] of Object.entries(o)) {
            if (v && typeof v === "object") walk(v, depth + 1);
            else if (!(k.toLowerCase() in flat)) flat[k.toLowerCase()] = v;
        }
    };
    walk(data, 0);
    const pick = (...keys) => {
        for (const k of keys) if (flat[k] !== undefined && flat[k] !== null && String(flat[k]).trim()) return String(flat[k]);
        return null;
    };
    const title = pick("title", "android.title");
    const text = pick("message", "text", "body", "content", "msg", "sms", "android.text", "bigtext", "android.bigtext");
    return {
        text: [title && text && !text.includes(title) ? title : null, text].filter(Boolean).join(" - ").slice(0, 2000),
        sender: pick("from", "sender", "address", "phone", "originatingaddress", "number"),
        app: pick("package", "packagename", "app", "appname", "pkg", "source"),
        at: pick("receivedstamp", "timestamp", "time", "date", "sentstamp", "received_at")
    };
}
