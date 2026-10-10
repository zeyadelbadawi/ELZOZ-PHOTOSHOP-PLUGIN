// Small helpers shared by the sales-bot modules. Plain JS: runs in Deno (Edge Function) and Node (tests).

const enc = new TextEncoder();

/** Arabic-Indic and Persian digits -> ASCII; Arabic decimal/thousands marks -> "." / ",". */
export function normalizeDigits(s) {
    return String(s ?? "")
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
        .replace(/٫/g, ".")
        .replace(/٬/g, ",");
}

/** Lower-case, digits normalised, Arabic letter variants unified, diacritics and tatweel removed. */
export function normalizeText(s) {
    return normalizeDigits(s)
        .toLowerCase()
        .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .replace(/ؤ/g, "و")
        .replace(/ئ/g, "ي")
        .replace(/\s+/g, " ")
        .trim();
}

export async function hmacSha256Hex(secret, data) {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, typeof data === "string" ? enc.encode(data) : data);
    return toHex(new Uint8Array(sig));
}

export async function sha256Hex(data) {
    const d = await crypto.subtle.digest("SHA-256", typeof data === "string" ? enc.encode(data) : data);
    return toHex(new Uint8Array(d));
}

function toHex(bytes) {
    let out = "";
    for (const b of bytes) out += b.toString(16).padStart(2, "0");
    return out;
}

/** Constant-time comparison of two strings (length leaks, content does not). */
export function safeEqual(a, b) {
    a = String(a ?? "");
    b = String(b ?? "");
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return diff === 0;
}

export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export function extractEmail(text) {
    const m = normalizeDigits(text).match(EMAIL_RE);
    return m ? m[0].toLowerCase() : null;
}

/** Readable random password, e.g. "Kq7m-Xw4p-Rt9z" (no 0/O, 1/l/I; rejection sampling, no modulo bias). */
export function generatePassword(getRandomValues = (a) => crypto.getRandomValues(a)) {
    const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const out = [];
    const limit = 256 - (256 % ALPHABET.length);
    while (out.length < 12) {
        for (const b of getRandomValues(new Uint8Array(32))) if (b < limit && out.length < 12) out.push(ALPHABET[b % ALPHABET.length]);
    }
    return `${out.slice(0, 4).join("")}-${out.slice(4, 8).join("")}-${out.slice(8).join("")}`;
}

export function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

export function clip(s, n) {
    s = String(s ?? "");
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function bytesToBase64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
}

/** Local hour in a time zone (Intl is available in Deno and Node). */
export function localHour(date, timeZone) {
    const h = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(date);
    return Number(h);
}

export function formatDate(iso, timeZone = "Africa/Cairo") {
    if (!iso) return "";
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone }).format(new Date(iso));
}

export function formatMoney(n) {
    const v = Number(n);
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
