// QR codes and barcodes from a column (feature 6). Pure: values are validated,
// encoded (QR with qrcode-generator, MIT; EAN-13 and Code 128 here) and drawn
// as crisp black-on-white 1-bit PNGs, which the job places like any image.
import qrcode from "qrcode-generator";

export const CODE_FOLDER_KEY = "__codes";
export const CODE_KINDS = ["qr", "ean13", "code128"];
export const QR_MAX_CHARS = 1000;

// ------------------------------------------------------------------ validation

const latinDigits = (s) => String(s ?? "").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

export function ean13CheckDigit(twelve) {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(twelve[i]) * (i % 2 ? 3 : 1);
    return String((10 - (sum % 10)) % 10);
}

/**
 * @returns {{value: string}|{problem: string}} the value to encode, or why it can't be
 */
export function codeValue(kind, raw) {
    const s = String(raw ?? "").trim();
    if (kind === "qr") {
        if (s.length > QR_MAX_CHARS) return { problem: `too long for a QR code (${s.length} characters, max ${QR_MAX_CHARS})` };
        return { value: s };
    }
    if (kind === "ean13") {
        const d = latinDigits(s).replace(/[\s-]/g, "");
        if (!/^\d{12,13}$/.test(d)) return { problem: "EAN-13 needs 12 or 13 digits" };
        if (d.length === 12) return { value: d + ean13CheckDigit(d) };
        if (ean13CheckDigit(d) !== d[12]) return { problem: `wrong EAN-13 check digit (should end in ${ean13CheckDigit(d)})` };
        return { value: d };
    }
    if (kind === "code128") {
        const v = latinDigits(s);
        if (!/^[\x20-\x7e]+$/.test(v)) return { problem: "Code 128 takes English letters, digits and symbols only" };
        if (v.length > 80) return { problem: "too long for a barcode (max 80 characters)" };
        return { value: v };
    }
    return { problem: `unknown code type "${kind}"` };
}

/** Height / width of a layer's frame (barcodes are drawn to fill it); null if unknown. */
export function frameAspect(layer) {
    const b = layer && layer.bounds;
    if (!b || !(b.right > b.left) || !(b.bottom > b.top)) return null;
    return Math.round(((b.bottom - b.top) / (b.right - b.left)) * 100) / 100;
}
const barAspect = (kind, aspect) => Math.min(1.2, Math.max(0.15, aspect || (kind === "ean13" ? 0.6 : 0.35)));

export const codeKey = (kind, value, aspect = null) => (kind === "qr" ? `qr:${value}` : `${kind}:${barAspect(kind, aspect)}:${value}`);

// ------------------------------------------------------------------ encoders

/** QR modules (true = dark), UTF-8 so Arabic text scans correctly. */
export function qrModules(text, ecc = "M") {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const q = qrcode(0, ecc);
    q.addData(binary, "Byte");
    q.make();
    const n = q.getModuleCount();
    return { size: n, dark: (r, c) => q.isDark(r, c) };
}

const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = EAN_L.map((p) => p.split("").reverse().map((b) => (b === "1" ? "0" : "1")).join(""));
const EAN_R = EAN_L.map((p) => p.split("").map((b) => (b === "1" ? "0" : "1")).join(""));
const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** EAN-13 bars: 95 modules ("1" = bar). */
export function ean13Bars(code) {
    const d = code.split("").map(Number);
    let bits = "101";
    for (let i = 1; i <= 6; i++) bits += (EAN_PARITY[d[0]][i - 1] === "L" ? EAN_L : EAN_G)[d[i]];
    bits += "01010";
    for (let i = 7; i <= 12; i++) bits += EAN_R[d[i]];
    bits += "101";
    return bits;
}

// Code 128 symbol patterns (bar/space widths), values 0-106 (103-105 starts, 106 stop).
const C128 = (
    "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 " +
    "221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 " +
    "231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 " +
    "314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
    "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 " +
    "114131 311141 411131 211412 211214 211232 2331112"
).split(" ");
export const CODE128_PATTERNS = C128;

/** Code 128 values for a text: Code C for an all-digit even-length value, otherwise Code B. */
export function code128Values(text) {
    const values = [];
    if (/^\d+$/.test(text) && text.length % 2 === 0 && text.length >= 2) {
        values.push(105);
        for (let i = 0; i < text.length; i += 2) values.push(Number(text.slice(i, i + 2)));
    } else {
        values.push(104);
        for (const ch of text) values.push(ch.charCodeAt(0) - 32);
    }
    let sum = values[0];
    for (let i = 1; i < values.length; i++) sum += values[i] * i;
    values.push(sum % 103, 106);
    return values;
}

export function code128Bars(text) {
    let bits = "";
    for (const v of code128Values(text)) {
        const widths = C128[v];
        for (let i = 0; i < widths.length; i++) bits += (i % 2 ? "0" : "1").repeat(Number(widths[i]));
    }
    return bits;
}

// ------------------------------------------------------------------ PNG (1-bit, no compression library)

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
function adler32(bytes) {
    let a = 1;
    let b = 0;
    for (let i = 0; i < bytes.length; i++) {
        a = (a + bytes[i]) % 65521;
        b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
}
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

/** zlib stream with stored (uncompressed) blocks: 1-bit images are small anyway. */
function zlibStored(data) {
    const out = [0x78, 0x01];
    for (let i = 0; i < data.length || i === 0; i += 65535) {
        const block = data.subarray(i, i + 65535);
        const last = i + 65535 >= data.length ? 1 : 0;
        out.push(last, block.length & 255, block.length >> 8, ~block.length & 255, (~block.length >> 8) & 255);
        for (const b of block) out.push(b);
        if (!data.length) break;
    }
    out.push(...u32(adler32(data)));
    return Uint8Array.from(out);
}

function chunk(type, data) {
    const t = new TextEncoder().encode(type);
    const body = new Uint8Array(t.length + data.length);
    body.set(t);
    body.set(data, t.length);
    return [...u32(data.length), ...body, ...u32(crc32(body))];
}

/** Black-and-white PNG; isBlack(x, y). */
export function png1bit(width, height, isBlack) {
    const stride = Math.ceil(width / 8);
    const raw = new Uint8Array((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        const row = y * (stride + 1);
        raw[row] = 0; // filter: none
        for (let x = 0; x < width; x++) if (!isBlack(x, y)) raw[row + 1 + (x >> 3)] |= 0x80 >> (x & 7); // 1 = white
    }
    const ihdr = Uint8Array.from([...u32(width), ...u32(height), 1, 0, 0, 0, 0]);
    return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", ihdr), ...chunk("IDAT", zlibStored(raw)), ...chunk("IEND", new Uint8Array(0))]);
}

/**
 * The PNG for one code. QR: square, about `size` px; barcodes: `size` px wide.
 * Quiet zones are included (4 modules for QR, 10 for barcodes) so codes scan.
 */
export function codePng(kind, value, size = 1200, aspect = null) {
    if (kind === "qr") {
        const m = qrModules(value);
        const total = m.size + 8;
        const scale = Math.max(4, Math.floor(size / total));
        const px = total * scale;
        return { width: px, height: px, bytes: png1bit(px, px, (x, y) => {
            const r = Math.floor(y / scale) - 4;
            const c = Math.floor(x / scale) - 4;
            return r >= 0 && c >= 0 && r < m.size && c < m.size && m.dark(r, c);
        }) };
    }
    const bars = kind === "ean13" ? ean13Bars(value) : code128Bars(value);
    const total = bars.length + 20;
    const scale = Math.max(2, Math.floor(size / total));
    const w = total * scale;
    const h = Math.round(w * barAspect(kind, aspect));
    return { width: w, height: h, bytes: png1bit(w, h, (x) => {
        const i = Math.floor(x / scale) - 10;
        return i >= 0 && i < bars.length && bars[i] === "1";
    }) };
}

/** The codes a mapping needs from these rows: [{kind, value, key}] (deduplicated). */
export function codesNeeded(rows, mapping) {
    const rules = Object.values(mapping.images || {}).filter((r) => CODE_KINDS.includes(r.source));
    const out = [];
    const seen = new Set();
    for (const r of rows) {
        if (r.isEmpty) continue;
        for (const rule of rules) {
            const v = codeValue(rule.source, (r.values || {})[rule.column]);
            if (!v.value) continue;
            const key = codeKey(rule.source, v.value, rule.aspect);
            if (!seen.has(key)) {
                seen.add(key);
                out.push({ kind: rule.source, value: v.value, aspect: rule.aspect || null, key });
            }
        }
    }
    return out;
}
