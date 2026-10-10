// Text and number formatting applied to a cell before it is written into a text layer
// (feature 10). Pure and unit-tested; nothing here touches Photoshop.
//
// A text rule may carry `format`:
//   { trim, case, digits, number, date, phone, prefix, suffix }
// Order: trim → number | date | phone → case → prefix/suffix → digits, so the
// digit style applies to everything the user sees, including what was added.

export const DIGIT_STYLES = ["keep", "latin", "arabic"];
export const CASE_STYLES = ["keep", "upper", "lower", "title", "sentence"];
export const DATE_INPUTS = ["dmy", "mdy", "ymd"];
export const DATE_OUTPUTS = ["dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd", "d MMMM yyyy", "dddd d MMMM yyyy", "MMMM yyyy", "d MMM"];
export const PHONE_STYLES = ["spaced", "international", "dashed"];

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const MONTHS = {
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
};
const DAYS = {
    en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
};

/** Arabic-Indic / Persian digits and Arabic separators -> ASCII. */
export function toLatinDigits(s) {
    return String(s ?? "")
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
        .replace(/٫/g, ".")
        .replace(/٬/g, ",");
}

export function toArabicDigits(s) {
    return String(s ?? "").replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);
}

/** Collapse runs of whitespace (including non-breaking spaces) and trim. Line breaks are kept. */
export function tidySpaces(s) {
    return String(s ?? "")
        .split(/\r\n|\r|\n/)
        .map((line) => line.replace(/[\s ]+/g, " ").trim())
        .join("\n")
        .trim();
}

export function applyCase(s, style) {
    const v = String(s ?? "");
    switch (style) {
        case "upper":
            return v.toUpperCase();
        case "lower":
            return v.toLowerCase();
        case "title":
            return v.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
        case "sentence": {
            const lower = v.toLowerCase();
            return lower.replace(/(^\s*|[.!?؟]\s+)(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
        }
        default:
            return v;
    }
}

/**
 * Parse a number the way people type prices: "1,299.50", "1.299,50", "٢٥٠ ج.م", "EGP 99".
 * Returns null when the text holds no number.
 */
export function parseNumber(value) {
    let s = toLatinDigits(value).replace(/[\s ]/g, "");
    const m = s.match(/-?\d[\d.,']*/);
    if (!m) return null;
    s = m[0].replace(/'/g, "");
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastDot >= 0 && lastComma >= 0) {
        // The later separator is the decimal point.
        if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
        else s = s.replace(/,/g, "");
    } else if (lastComma >= 0) {
        // "1,299" = thousands; "12,5" = decimal (one or two digits after a single comma).
        const parts = s.split(",");
        s = parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2 ? `${parts[0]}.${parts[1]}` : parts.join("");
    } else if (lastDot >= 0) {
        // "1.299.000" = thousands; "1.5" = decimal.
        const parts = s.split(".");
        if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && /^-?\d+$/.test(parts[0]))) s = parts.join("");
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

/**
 * @param {number} n
 * @param {{decimals?: "auto"|0|1|2, thousands?: boolean}} opts
 */
export function formatNumber(n, { decimals = "auto", thousands = true } = {}) {
    if (n === null || n === undefined || !Number.isFinite(Number(n))) return "";
    const value = Number(n);
    let fixed;
    if (decimals === "auto") fixed = Number.isInteger(value) ? String(Math.abs(value)) : Math.abs(value).toFixed(2).replace(/\.?0+$/, "");
    else fixed = Math.abs(value).toFixed(Number(decimals));
    let [int, frac] = fixed.split(".");
    if (thousands) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${value < 0 ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

/** Excel serial date (days since 1899-12-30) -> Date (UTC). */
function fromExcelSerial(n) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
}

/**
 * Parse a date from what Excel displays or people type.
 * @param {string} value
 * @param {"dmy"|"mdy"|"ymd"} order  how to read 05/03/2026 (default day first, as in Egypt)
 * @returns {Date|null} a UTC date at midnight
 */
export function parseDate(value, order = "dmy") {
    const s = toLatinDigits(value).trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
    if (m) return mkDate(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T].*)?$/);
    if (m) {
        let year = +m[3];
        if (year < 100) year += year < 70 ? 2000 : 1900;
        const [a, b] = [+m[1], +m[2]];
        if (order === "mdy") return mkDate(year, a, b);
        if (order === "ymd") return null;
        // Day first, unless that is impossible and month first works ("3/25/2026").
        return mkDate(year, b, a) || mkDate(year, a, b);
    }
    if (/^\d{5}(\.\d+)?$/.test(s)) {
        const n = Number(s);
        if (n > 20000 && n < 80000) return fromExcelSerial(n);
    }
    const t = Date.parse(s);
    if (Number.isFinite(t)) {
        const d = new Date(t);
        return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    }
    return null;
}

function mkDate(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

export function formatDate(date, pattern = "dd/MM/yyyy", lang = "en") {
    if (!date) return "";
    const L = MONTHS[lang] ? lang : "en";
    const d = date.getUTCDate();
    const mo = date.getUTCMonth();
    const y = date.getUTCFullYear();
    const pad = (n) => String(n).padStart(2, "0");
    // Longest tokens first; a single pass so replaced text is never re-scanned.
    return pattern.replace(/dddd|MMMM|MMM|yyyy|dd|MM|d|M/g, (tok) => {
        switch (tok) {
            case "dddd":
                return DAYS[L][date.getUTCDay()];
            case "MMMM":
                return MONTHS[L][mo];
            case "MMM":
                return L === "ar" ? MONTHS.ar[mo] : MONTHS.en[mo].slice(0, 3);
            case "yyyy":
                return String(y);
            case "dd":
                return pad(d);
            case "MM":
                return pad(mo + 1);
            case "d":
                return String(d);
            case "M":
                return String(mo + 1);
            default:
                return tok;
        }
    });
}

/**
 * Egyptian (and generic) phone numbers.
 *  spaced:        010 1234 5678
 *  international: +20 10 1234 5678
 *  dashed:        010-1234-5678
 * Numbers that don't look like an Egyptian mobile/landline are only grouped.
 */
export function formatPhone(value, style = "spaced") {
    let digits = toLatinDigits(value).replace(/[^\d+]/g, "");
    if (!digits) return "";
    let local = null;
    if (/^\+?20\d{10}$/.test(digits)) local = `0${digits.replace(/^\+?20/, "")}`;
    else if (/^0020\d{10}$/.test(digits)) local = `0${digits.slice(4)}`;
    else if (/^01\d{9}$/.test(digits)) local = digits;
    if (local) {
        const a = local.slice(0, 3);
        const b = local.slice(3, 7);
        const c = local.slice(7);
        if (style === "international") return `+20 ${a.slice(1)} ${b} ${c}`;
        if (style === "dashed") return `${a}-${b}-${c}`;
        return `${a} ${b} ${c}`;
    }
    digits = digits.replace(/\+/g, "");
    const sep = style === "dashed" ? "-" : " ";
    // Cairo / Alexandria landlines: 02 2555 1234
    const land = digits.match(/^(0[23])(\d{4})(\d{4})$/);
    if (land) return style === "international" ? `+20 ${land[1].slice(1)} ${land[2]} ${land[3]}` : land.slice(1).join(sep);
    // Anything else: groups of three from the left, the last group up to four.
    const groups = [];
    let rest = digits;
    while (rest.length > 4) {
        groups.push(rest.slice(0, 3));
        rest = rest.slice(3);
    }
    groups.push(rest);
    return groups.join(sep);
}

export const EMPTY_FORMAT = { trim: false, case: "keep", digits: "keep", number: null, date: null, phone: null, prefix: "", suffix: "" };

export function isFormatActive(format) {
    if (!format) return false;
    return !!(format.trim || (format.case && format.case !== "keep") || (format.digits && format.digits !== "keep") || format.number || format.date || format.phone || format.prefix || format.suffix);
}

/**
 * Apply a text rule's format to one cell value.
 * @returns {{value: string, problem?: "not_a_number"|"not_a_date"}}
 *   A problem means the cell couldn't be read as asked; the value is then the
 *   original text (formatted for case/affixes/digits) so nothing is lost.
 */
export function formatValue(raw, format) {
    let value = String(raw ?? "");
    if (!isFormatActive(format)) return { value };
    let problem;
    if (format.trim) value = tidySpaces(value);
    if (value.trim() !== "") {
        if (format.number) {
            const n = parseNumber(value);
            if (n === null) problem = "not_a_number";
            else value = formatNumber(n, format.number);
        } else if (format.date) {
            const d = parseDate(value, format.date.input || "dmy");
            if (!d) problem = "not_a_date";
            else value = formatDate(d, format.date.output || "dd/MM/yyyy", format.date.lang || "en");
        } else if (format.phone) {
            value = formatPhone(value, format.phone);
        }
        value = applyCase(value, format.case);
        value = `${format.prefix || ""}${value}${format.suffix || ""}`;
    }
    if (format.digits === "latin") value = toLatinDigits(value);
    else if (format.digits === "arabic") value = toArabicDigits(value);
    return problem ? { value, problem } : { value };
}
