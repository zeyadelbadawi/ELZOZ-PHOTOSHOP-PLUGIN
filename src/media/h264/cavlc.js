// CAVLC residual coding (ITU-T H.264 §9.2). The code tables are the standard's
// Tables 9-5, 9-7/9-8, 9-9 and 9-10, in the compact form used by the public-domain
// minih264 encoder (lieff/minih264, CC0): CODE(val, len) packs a code word.

const CODE = (val, len) => [val, len];
const NONE = null;

// coeff_token, indexed by TrailingOnes + 4 × (TotalCoeff − TrailingOnes).
const T0 = [ // 0 ≤ nC < 2
    CODE(1, 1), CODE(1, 2), CODE(1, 3), CODE(3, 5), CODE(5, 6), CODE(4, 6), CODE(5, 7), CODE(3, 6),
    CODE(7, 8), CODE(6, 8), CODE(5, 8), CODE(4, 7), CODE(7, 9), CODE(6, 9), CODE(5, 9), CODE(4, 8),
    CODE(7, 10), CODE(6, 10), CODE(5, 10), CODE(4, 9), CODE(7, 11), CODE(6, 11), CODE(5, 11), CODE(4, 10),
    CODE(15, 13), CODE(14, 13), CODE(13, 13), CODE(4, 11), CODE(11, 13), CODE(10, 13), CODE(9, 13), CODE(12, 13),
    CODE(8, 13), CODE(14, 14), CODE(13, 14), CODE(12, 14), CODE(15, 14), CODE(10, 14), CODE(9, 14), CODE(8, 14),
    CODE(11, 14), CODE(14, 15), CODE(13, 15), CODE(12, 15), CODE(15, 15), CODE(10, 15), CODE(9, 15), CODE(8, 15),
    CODE(11, 15), CODE(1, 15), CODE(13, 16), CODE(12, 16), CODE(15, 16), CODE(14, 16), CODE(9, 16), CODE(8, 16),
    CODE(11, 16), CODE(10, 16), CODE(5, 16), NONE, CODE(7, 16), CODE(6, 16), NONE, NONE, CODE(4, 16)
];
const T1 = [ // 2 ≤ nC < 4
    CODE(3, 2), CODE(2, 2), CODE(3, 3), CODE(5, 4), CODE(11, 6), CODE(7, 5), CODE(9, 6), CODE(4, 4),
    CODE(7, 6), CODE(10, 6), CODE(5, 6), CODE(6, 5), CODE(7, 7), CODE(6, 6), CODE(5, 7), CODE(8, 6),
    CODE(7, 8), CODE(6, 7), CODE(5, 8), CODE(4, 6), CODE(4, 8), CODE(6, 8), CODE(5, 9), CODE(4, 7),
    CODE(7, 9), CODE(6, 9), CODE(13, 11), CODE(4, 9), CODE(15, 11), CODE(14, 11), CODE(9, 11), CODE(12, 11),
    CODE(11, 11), CODE(10, 11), CODE(13, 12), CODE(8, 11), CODE(15, 12), CODE(14, 12), CODE(9, 12), CODE(12, 12),
    CODE(11, 12), CODE(10, 12), CODE(13, 13), CODE(12, 13), CODE(8, 12), CODE(14, 13), CODE(9, 13), CODE(8, 13),
    CODE(15, 13), CODE(10, 13), CODE(6, 13), CODE(1, 13), CODE(11, 13), CODE(11, 14), CODE(10, 14), CODE(4, 14),
    CODE(7, 13), CODE(8, 14), CODE(5, 14), NONE, CODE(9, 14), CODE(6, 14), NONE, NONE, CODE(7, 14)
];
const T2 = [ // 4 ≤ nC < 8
    CODE(15, 4), CODE(14, 4), CODE(13, 4), CODE(12, 4), CODE(15, 6), CODE(15, 5), CODE(14, 5), CODE(11, 4),
    CODE(11, 6), CODE(12, 5), CODE(11, 5), CODE(10, 4), CODE(8, 6), CODE(10, 5), CODE(9, 5), CODE(9, 4),
    CODE(15, 7), CODE(8, 5), CODE(13, 6), CODE(8, 4), CODE(11, 7), CODE(14, 6), CODE(9, 6), CODE(13, 5),
    CODE(9, 7), CODE(10, 6), CODE(13, 7), CODE(12, 6), CODE(8, 7), CODE(14, 7), CODE(10, 7), CODE(12, 7),
    CODE(15, 8), CODE(14, 8), CODE(13, 8), CODE(12, 8), CODE(11, 8), CODE(10, 8), CODE(9, 8), CODE(8, 8),
    CODE(15, 9), CODE(14, 9), CODE(13, 9), CODE(12, 9), CODE(11, 9), CODE(10, 9), CODE(9, 9), CODE(10, 10),
    CODE(8, 9), CODE(7, 9), CODE(11, 10), CODE(6, 10), CODE(13, 10), CODE(12, 10), CODE(7, 10), CODE(2, 10),
    CODE(9, 10), CODE(8, 10), CODE(3, 10), NONE, CODE(5, 10), CODE(4, 10), NONE, NONE, CODE(1, 10)
];
const T3 = [ // nC ≥ 8: 6-bit fixed-length codes
    3, 1, 6, 11, 0, 5, 10, 15, 4, 9, 14, 19, 8, 13, 18, 23, 12, 17, 22, 27, 16, 21, 26, 31, 20, 25, 30, 35,
    24, 29, 34, 39, 28, 33, 38, 43, 32, 37, 42, 47, 36, 41, 46, 51, 40, 45, 50, 55, 44, 49, 54, 59, 48, 53, 58, 63,
    52, 57, 62, 0, 56, 61, 0, 0, 60
].map((v) => [v, 6]);
const TDC = [ // nC = −1: chroma DC (4:2:0)
    CODE(1, 2), CODE(1, 1), CODE(1, 3), CODE(5, 6), CODE(7, 6), CODE(6, 6), CODE(2, 7), CODE(0, 7), CODE(4, 6),
    CODE(3, 7), CODE(2, 8), NONE, CODE(3, 6), CODE(3, 8), NONE, NONE, CODE(2, 6)
];

// total_zeros for 4×4 blocks, by TotalCoeff − 1, indexed by total_zeros.
const TZ = [
    [[1, 1], [3, 3], [2, 3], [3, 4], [2, 4], [3, 5], [2, 5], [3, 6], [2, 6], [3, 7], [2, 7], [3, 8], [2, 8], [3, 9], [2, 9], [1, 9]],
    [[7, 3], [6, 3], [5, 3], [4, 3], [3, 3], [5, 4], [4, 4], [3, 4], [2, 4], [3, 5], [2, 5], [3, 6], [2, 6], [1, 6], [0, 6]],
    [[5, 4], [7, 3], [6, 3], [5, 3], [4, 4], [3, 4], [4, 3], [3, 3], [2, 4], [3, 5], [2, 5], [1, 6], [1, 5], [0, 6]],
    [[3, 5], [7, 3], [5, 4], [4, 4], [6, 3], [5, 3], [4, 3], [3, 4], [3, 3], [2, 4], [2, 5], [1, 5], [0, 5]],
    [[5, 4], [4, 4], [3, 4], [7, 3], [6, 3], [5, 3], [4, 3], [3, 3], [2, 4], [1, 5], [1, 4], [0, 5]],
    [[1, 6], [1, 5], [7, 3], [6, 3], [5, 3], [4, 3], [3, 3], [2, 3], [1, 4], [1, 3], [0, 6]],
    [[1, 6], [1, 5], [5, 3], [4, 3], [3, 3], [3, 2], [2, 3], [1, 4], [1, 3], [0, 6]],
    [[1, 6], [1, 4], [1, 5], [3, 3], [3, 2], [2, 2], [2, 3], [1, 3], [0, 6]],
    [[1, 6], [0, 6], [1, 4], [3, 2], [2, 2], [1, 3], [1, 2], [1, 5]],
    [[1, 5], [0, 5], [1, 3], [3, 2], [2, 2], [1, 2], [1, 4]],
    [[0, 4], [1, 4], [1, 3], [2, 3], [1, 1], [3, 3]],
    [[0, 4], [1, 4], [1, 2], [1, 1], [1, 3]],
    [[0, 3], [1, 3], [1, 1], [1, 2]],
    [[0, 2], [1, 2], [1, 1]],
    [[0, 1], [1, 1]]
];
// total_zeros for chroma DC 2×2, by TotalCoeff − 1.
const TZDC = [
    [[1, 1], [1, 2], [1, 3], [0, 3]],
    [[1, 1], [1, 2], [0, 2]],
    [[1, 1], [0, 1]]
];
// run_before, by min(zerosLeft, 7) − 1, indexed by run_before.
const RB = [
    [[1, 1], [0, 1]],
    [[1, 1], [1, 2], [0, 2]],
    [[3, 2], [2, 2], [1, 2], [0, 2]],
    [[3, 2], [2, 2], [1, 2], [1, 3], [0, 3]],
    [[3, 2], [2, 2], [3, 3], [2, 3], [1, 3], [0, 3]],
    [[3, 2], [0, 3], [1, 3], [3, 3], [2, 3], [5, 3], [4, 3]],
    [[7, 3], [6, 3], [5, 3], [4, 3], [3, 3], [2, 3], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], [1, 9], [1, 10], [1, 11]]
];

export const TABLES = { T0, T1, T2, T3, TDC, TZ, TZDC, RB };

function put(bw, code) {
    if (!code) throw new Error("CAVLC: no code for this combination");
    bw.u(code[1], code[0]);
}

/**
 * Write one residual block (§7.3.5.3.2 residual_block_cavlc).
 * @param {BitWriter} bw
 * @param {Int32Array|number[]} coeffs  levels in scan order (length maxNumCoeff)
 * @param {number} maxNumCoeff          16, 15 (AC) or 4 (chroma DC)
 * @param {number} nC                   −1 for chroma DC, else from neighbours
 * @returns {number} TotalCoeff
 */
export function writeResidualBlock(bw, coeffs, maxNumCoeff, nC) {
    const nz = [];
    for (let i = 0; i < maxNumCoeff; i++) if (coeffs[i]) nz.push(i);
    const total = nz.length;
    let t1 = 0;
    for (let k = total - 1; k >= 0 && t1 < 3; k--) {
        if (Math.abs(coeffs[nz[k]]) === 1) t1++;
        else break;
    }
    const table = nC === -1 ? TDC : nC < 2 ? T0 : nC < 4 ? T1 : nC < 8 ? T2 : T3;
    put(bw, table[t1 + 4 * (total - t1)]);
    if (!total) return 0;

    // Trailing ones' signs, highest frequency first.
    for (let k = 0; k < t1; k++) bw.u(1, coeffs[nz[total - 1 - k]] < 0 ? 1 : 0);

    // Remaining levels (§9.2.2), highest frequency first.
    let suffixLength = total > 10 && t1 < 3 ? 1 : 0;
    for (let k = t1; k < total; k++) {
        const level = coeffs[nz[total - 1 - k]];
        let levelCode = level > 0 ? 2 * level - 2 : -2 * level - 1;
        if (k === t1 && t1 < 3) levelCode -= 2;
        let prefix;
        let suffix = 0;
        let suffixSize = 0;
        if (suffixLength === 0) {
            if (levelCode < 14) prefix = levelCode;
            else if (levelCode < 30) {
                prefix = 14;
                suffix = levelCode - 14;
                suffixSize = 4;
            } else {
                prefix = 15;
                suffix = levelCode - 30;
                suffixSize = 12;
            }
        } else if (levelCode < 15 << suffixLength) {
            prefix = levelCode >> suffixLength;
            suffix = levelCode & ((1 << suffixLength) - 1);
            suffixSize = suffixLength;
        } else {
            prefix = 15;
            suffix = levelCode - (15 << suffixLength);
            suffixSize = 12;
        }
        if (suffixSize === 12 && suffix >= 4096) throw new Error("CAVLC: level too large for Baseline");
        bw.u(prefix, 0);
        bw.u(1, 1);
        if (suffixSize) bw.u(suffixSize, suffix);
        if (suffixLength === 0) suffixLength = 1;
        if (Math.abs(level) > 3 << (suffixLength - 1) && suffixLength < 6) suffixLength++;
    }

    // total_zeros and run_before.
    const last = nz[total - 1];
    const totalZeros = last + 1 - total;
    if (total < maxNumCoeff) put(bw, (maxNumCoeff === 4 ? TZDC : TZ)[total - 1][totalZeros]);
    let zerosLeft = totalZeros;
    for (let k = total - 1; k > 0 && zerosLeft > 0; k--) {
        const run = nz[k] - nz[k - 1] - 1;
        put(bw, RB[Math.min(zerosLeft, 7) - 1][run]);
        zerosLeft -= run;
    }
    return total;
}
