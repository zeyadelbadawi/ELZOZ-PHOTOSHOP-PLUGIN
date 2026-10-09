// Reads image dimensions from file bytes (JPEG, PNG, WebP). Corrupt or
// unknown data returns null. Used by the developer self-test to check exported
// files, and by the test simulator to decide whether a file can be placed.
export function imageInfo(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
        const w = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
        const h = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
        return w > 0 && h > 0 ? { type: "png", width: w, height: h } : null;
    }
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
        let i = 2;
        while (i + 9 < b.length) {
            if (b[i] !== 0xff) return null;
            const m = b[i + 1];
            if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7)) {
                i += 2;
                continue;
            }
            const len = (b[i + 2] << 8) | b[i + 3];
            if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
                const h = (b[i + 5] << 8) | b[i + 6];
                const w = (b[i + 7] << 8) | b[i + 8];
                return w > 0 && h > 0 ? { type: "jpeg", width: w, height: h } : null;
            }
            if (len < 2) return null;
            i += 2 + len;
        }
        return null;
    }
    if (b.length > 30 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") {
        const chunk = String.fromCharCode(...b.subarray(12, 16));
        if (chunk === "VP8 ") return { type: "webp", width: ((b[27] << 8) | b[26]) & 0x3fff, height: ((b[29] << 8) | b[28]) & 0x3fff };
        if (chunk === "VP8L") {
            const n = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
            return { type: "webp", width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 };
        }
        if (chunk === "VP8X") return { type: "webp", width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    }
    return null;
}
