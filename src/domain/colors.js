// Colors from a spreadsheet cell (feature 11). Pure and unit-tested.
// Accepted: #E30613, E30613, #F00, rgb(227, 6, 19), and common color names in
// English and Arabic ("red", "أحمر"). Anything else is "not a color".
import { toLatinDigits } from "./transforms.js";

const NAMED = {
    black: "000000", white: "ffffff", red: "e30613", green: "1a9b3c", blue: "0b5fff", yellow: "ffd400", orange: "ff8800",
    purple: "7b2cbf", pink: "ff4f9a", gray: "808080", grey: "808080", brown: "8b5a2b", gold: "d4af37", silver: "c0c0c0",
    navy: "0b1f4b", teal: "008080", beige: "f5f0e1", cyan: "00b7eb", maroon: "800000",
    "أسود": "000000", "اسود": "000000", "أبيض": "ffffff", "ابيض": "ffffff", "أحمر": "e30613", "احمر": "e30613",
    "أخضر": "1a9b3c", "اخضر": "1a9b3c", "أزرق": "0b5fff", "ازرق": "0b5fff", "أصفر": "ffd400", "اصفر": "ffd400",
    "برتقالي": "ff8800", "بنفسجي": "7b2cbf", "موف": "7b2cbf", "وردي": "ff4f9a", "بمبي": "ff4f9a", "رمادي": "808080",
    "رصاصي": "808080", "بني": "8b5a2b", "ذهبي": "d4af37", "فضي": "c0c0c0", "كحلي": "0b1f4b", "بيج": "f5f0e1", "لبني": "00b7eb"
};

/** @returns {{r, g, b}|null} */
export function parseColor(value) {
    const s = toLatinDigits(value).trim().toLowerCase();
    if (!s) return null;
    if (NAMED[s]) return fromHex(NAMED[s]);
    let m = s.match(/^#?([0-9a-f]{6})$/);
    if (m) return fromHex(m[1]);
    m = s.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/);
    if (m) return fromHex(m[1] + m[1] + m[2] + m[2] + m[3] + m[3]);
    m = s.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/);
    if (m) {
        const [r, g, b] = [m[1], m[2], m[3]].map(Number);
        return r <= 255 && g <= 255 && b <= 255 ? { r, g, b } : null;
    }
    return null;
}

function fromHex(hex) {
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
}

export const toHex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

export const INVALID_COLOR_POLICIES = ["skipRow", "keepTemplate"];
