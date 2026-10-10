// A small H.264 encoder in plain JavaScript (feature 3: MP4 export).
//
// Constrained Baseline profile, CAVLC, one slice per picture, deblocking off.
//  * I pictures (IDR): every macroblock Intra 16×16 (vertical / horizontal /
//    DC prediction, the cheapest wins) with chroma vertical / horizontal / DC.
//  * P pictures: an unchanged macroblock is skipped (P_Skip); a changed one is
//    coded against the previous picture without motion (P_L0_16x16, mv 0) or
//    as Intra 16×16, whichever is closer. Our animations are mostly a still
//    design with moving layers, which this suits well.
// The encoder reconstructs every picture exactly as a decoder will (§8.5), so
// P pictures don't drift. Output is verified with ffmpeg in the tests.
import { BitWriter, nalUnit } from "./bits.js";
import { writeResidualBlock } from "./cavlc.js";

const ZIGZAG = [0, 1, 4, 8, 5, 2, 3, 6, 9, 12, 13, 10, 7, 11, 14, 15];
// luma4x4BlkIdx → (x, y) of the 4×4 block inside the macroblock, in 4×4 units.
const BLK_X = [0, 1, 0, 1, 2, 3, 2, 3, 0, 1, 0, 1, 2, 3, 2, 3];
const BLK_Y = [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3];
// Quantisation (MF) and dequantisation (V) factors by QP % 6, position class
// 0: (even, even), 1: (odd, odd), 2: otherwise.
const MF = [[13107, 5243, 8066], [11916, 4660, 7490], [10082, 4194, 6554], [9362, 3647, 5825], [8192, 3355, 5243], [7282, 2893, 4559]];
const V = [[10, 16, 13], [11, 18, 14], [13, 20, 16], [14, 23, 18], [16, 25, 20], [18, 29, 23]];
const POS_CLASS = Array.from({ length: 16 }, (_, k) => {
    const i = k >> 2;
    const j = k & 3;
    return i % 2 === 0 && j % 2 === 0 ? 0 : i % 2 === 1 && j % 2 === 1 ? 1 : 2;
});
const QPC = [29, 30, 31, 32, 32, 33, 34, 34, 35, 35, 36, 36, 37, 37, 37, 38, 38, 38, 39, 39, 39, 39];
const chromaQp = (qp) => (qp < 30 ? qp : QPC[qp - 30]);
// coded_block_pattern → codeNum for inter macroblocks (Table 9-4, 4:2:0).
const CBP_INTER = [0, 2, 3, 7, 4, 8, 17, 13, 5, 18, 9, 14, 10, 15, 16, 11, 1, 32, 33, 36, 34, 37, 44, 40, 35, 45, 38, 41, 39, 42, 43, 19, 6, 24, 25, 20, 26, 21, 46, 28, 27, 47, 22, 29, 23, 30, 31, 12];
const LEVELS = [
    [30, 1620, 40500],
    [31, 3600, 108000],
    [32, 5120, 216000],
    [40, 8192, 245760],
    [42, 8704, 522240],
    [50, 22080, 589824],
    [51, 36864, 983040]
];
const clip = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

// ---------------------------------------------------------------- transforms

/** Forward 4×4 integer core transform (in place, raster order). */
function fdct4(b) {
    for (let i = 0; i < 16; i += 4) {
        const s0 = b[i] + b[i + 3];
        const s1 = b[i + 1] + b[i + 2];
        const d0 = b[i] - b[i + 3];
        const d1 = b[i + 1] - b[i + 2];
        b[i] = s0 + s1;
        b[i + 2] = s0 - s1;
        b[i + 1] = 2 * d0 + d1;
        b[i + 3] = d0 - 2 * d1;
    }
    for (let j = 0; j < 4; j++) {
        const s0 = b[j] + b[12 + j];
        const s1 = b[4 + j] + b[8 + j];
        const d0 = b[j] - b[12 + j];
        const d1 = b[4 + j] - b[8 + j];
        b[j] = s0 + s1;
        b[8 + j] = s0 - s1;
        b[4 + j] = 2 * d0 + d1;
        b[12 + j] = d0 - 2 * d1;
    }
}

/** Inverse 4×4 transform of scaled coefficients d (§8.5.12.2), result (x + 32) >> 6. */
function idct4(d, out) {
    const t = new Int32Array(16);
    for (let i = 0; i < 16; i += 4) {
        const e0 = d[i] + d[i + 2];
        const e1 = d[i] - d[i + 2];
        const e2 = (d[i + 1] >> 1) - d[i + 3];
        const e3 = d[i + 1] + (d[i + 3] >> 1);
        t[i] = e0 + e3;
        t[i + 1] = e1 + e2;
        t[i + 2] = e1 - e2;
        t[i + 3] = e0 - e3;
    }
    for (let j = 0; j < 4; j++) {
        const g0 = t[j] + t[8 + j];
        const g1 = t[j] - t[8 + j];
        const g2 = (t[4 + j] >> 1) - t[12 + j];
        const g3 = t[4 + j] + (t[12 + j] >> 1);
        out[j] = (g0 + g3 + 32) >> 6;
        out[4 + j] = (g1 + g2 + 32) >> 6;
        out[8 + j] = (g1 - g2 + 32) >> 6;
        out[12 + j] = (g0 - g3 + 32) >> 6;
    }
}

/** 4×4 Hadamard (luma DC), in place. */
function hadamard4(b) {
    for (let i = 0; i < 16; i += 4) {
        const s0 = b[i] + b[i + 1];
        const s1 = b[i + 2] + b[i + 3];
        const d0 = b[i] - b[i + 1];
        const d1 = b[i + 2] - b[i + 3];
        b[i] = s0 + s1;
        b[i + 1] = s0 - s1;
        b[i + 2] = d0 - d1;
        b[i + 3] = d0 + d1;
    }
    for (let j = 0; j < 4; j++) {
        const s0 = b[j] + b[4 + j];
        const s1 = b[8 + j] + b[12 + j];
        const d0 = b[j] - b[4 + j];
        const d1 = b[8 + j] - b[12 + j];
        b[j] = s0 + s1;
        b[4 + j] = s0 - s1;
        b[8 + j] = d0 - d1;
        b[12 + j] = d0 + d1;
    }
}

function quant(w, qp, cls, intra, extraShift = 0) {
    const qbits = 15 + Math.floor(qp / 6) + extraShift;
    const f = Math.floor((1 << qbits) / (intra ? 3 : 6));
    const a = Math.abs(w);
    const l = Math.floor((a * MF[qp % 6][cls] + f) / 2 ** qbits);
    return w < 0 ? -l : l;
}

/** AC dequantisation (flat scaling lists): c × LevelScale << qP/6 >> 4. */
const dequantAc = (c, qp, cls) => c * V[qp % 6][cls] * (1 << Math.floor(qp / 6));

// ---------------------------------------------------------------- encoder

/**
 * @param {object} o
 * @param {number} o.width, o.height   picture size (even numbers)
 * @param {number} o.fps               frames per second (integer)
 * @param {number} [o.qp=24]           quantiser (lower = better quality, bigger files)
 * @param {number} [o.gop]             frames between key frames (default 2 s)
 * @param {number} [o.skipThreshold=2] max per-pixel change for a skipped macroblock
 */
export function createH264Encoder({ width, height, fps, qp = 24, gop = null, skipThreshold = 2 }) {
    if (width % 2 || height % 2) throw new Error("H.264 4:2:0 needs an even width and height.");
    const mbW = Math.ceil(width / 16);
    const mbH = Math.ceil(height / 16);
    const W = mbW * 16;
    const H = mbH * 16;
    const CW = W / 2;
    const frameSize = mbW * mbH;
    const level = LEVELS.find(([, fs, mbps]) => frameSize <= fs && frameSize * fps <= mbps && mbW <= Math.sqrt(fs * 8) && mbH <= Math.sqrt(fs * 8));
    if (!level) throw new Error(`${width} × ${height} at ${fps} fps is too large for this encoder.`);
    const keyEvery = gop || Math.max(1, Math.round(fps * 2));
    const qpc = chromaQp(qp);

    // Reconstructed pictures (current and reference), padded to whole macroblocks.
    let recY = new Uint8Array(W * H);
    let recU = new Uint8Array(CW * (H / 2));
    let recV = new Uint8Array(CW * (H / 2));
    let refY = new Uint8Array(W * H);
    let refU = new Uint8Array(CW * (H / 2));
    let refV = new Uint8Array(CW * (H / 2));
    // Non-zero coefficient counts per 4×4 block (luma) and per chroma 4×4 block, for nC.
    const nzY = new Uint8Array(mbW * 4 * mbH * 4);
    const nzU = new Uint8Array(mbW * 2 * mbH * 2);
    const nzV = new Uint8Array(mbW * 2 * mbH * 2);
    // The previous source picture: a block that hasn't changed since then is skipped (P_Skip),
    // so still areas cost nothing and keep the quality they had.
    let prevSrc = null;
    let frameIndex = 0;
    let frameNum = 0;
    let idrId = 0;

    // ---------------- parameter sets
    function sps() {
        const b = new BitWriter(64);
        b.u(8, 66); // profile_idc: Baseline
        b.u(8, 0xc0); // constraint_set0 + set1 (Constrained Baseline)
        b.u(8, level[0]);
        b.ue(0); // seq_parameter_set_id
        b.ue(0); // log2_max_frame_num_minus4 → 16 frame numbers
        b.ue(2); // pic_order_cnt_type 2: output order = decoding order
        b.ue(1); // max_num_ref_frames
        b.u(1, 0); // gaps_in_frame_num_value_allowed_flag
        b.ue(mbW - 1);
        b.ue(mbH - 1);
        b.u(1, 1); // frame_mbs_only_flag
        b.u(1, 1); // direct_8x8_inference_flag
        const cropR = (W - width) / 2;
        const cropB = (H - height) / 2;
        if (cropR || cropB) {
            b.u(1, 1);
            b.ue(0);
            b.ue(cropR);
            b.ue(0);
            b.ue(cropB);
        } else b.u(1, 0);
        b.u(1, 1); // vui_parameters_present_flag
        b.u(1, 0); // aspect_ratio_info_present_flag
        b.u(1, 0); // overscan_info_present_flag
        b.u(1, 1); // video_signal_type_present_flag
        b.u(3, 5); // video_format: unspecified
        b.u(1, 0); // video_full_range_flag: limited (16-235)
        b.u(1, 1); // colour_description_present_flag
        b.u(8, 1); // colour_primaries: BT.709
        b.u(8, 1); // transfer_characteristics: BT.709
        b.u(8, 1); // matrix_coefficients: BT.709
        b.u(1, 0); // chroma_loc_info_present_flag
        b.u(1, 1); // timing_info_present_flag
        b.u(32, 1); // num_units_in_tick
        b.u(32, 2 * fps); // time_scale
        b.u(1, 1); // fixed_frame_rate_flag
        b.u(1, 0); // nal_hrd_parameters_present_flag
        b.u(1, 0); // vcl_hrd_parameters_present_flag
        b.u(1, 0); // pic_struct_present_flag
        b.u(1, 1); // bitstream_restriction_flag
        b.u(1, 1); // motion_vectors_over_pic_boundaries_flag
        b.ue(0); // max_bytes_per_pic_denom
        b.ue(0); // max_bits_per_mb_denom
        b.ue(16); // log2_max_mv_length_horizontal
        b.ue(16); // log2_max_mv_length_vertical
        b.ue(0); // max_num_reorder_frames
        b.ue(1); // max_dec_frame_buffering
        b.trailing();
        return nalUnit(3, 7, b.bytes());
    }
    function pps() {
        const b = new BitWriter(16);
        b.ue(0); // pic_parameter_set_id
        b.ue(0); // seq_parameter_set_id
        b.u(1, 0); // entropy_coding_mode_flag: CAVLC
        b.u(1, 0); // bottom_field_pic_order_in_frame_present_flag
        b.ue(0); // num_slice_groups_minus1
        b.ue(0); // num_ref_idx_l0_default_active_minus1
        b.ue(0); // num_ref_idx_l1_default_active_minus1
        b.u(1, 0); // weighted_pred_flag
        b.u(2, 0); // weighted_bipred_idc
        b.se(qp - 26); // pic_init_qp_minus26
        b.se(0); // pic_init_qs_minus26
        b.se(0); // chroma_qp_index_offset
        b.u(1, 1); // deblocking_filter_control_present_flag
        b.u(1, 0); // constrained_intra_pred_flag
        b.u(1, 0); // redundant_pic_cnt_present_flag
        b.trailing();
        return nalUnit(3, 8, b.bytes());
    }
    const spsNal = sps();
    const ppsNal = pps();

    // ---------------- helpers
    const nC = (arr, stride, x, y) => {
        const a = x > 0 ? arr[y * stride + x - 1] : -1;
        const b = y > 0 ? arr[(y - 1) * stride + x] : -1;
        if (a >= 0 && b >= 0) return (a + b + 1) >> 1;
        if (a >= 0) return a;
        if (b >= 0) return b;
        return 0;
    };

    /** 16×16 intra prediction from the current reconstruction; returns {mode, pred} or null. */
    function lumaPredictions(mx, my) {
        const x0 = mx * 16;
        const y0 = my * 16;
        const hasTop = my > 0;
        const hasLeft = mx > 0;
        const out = [];
        if (hasTop) {
            const p = new Uint8Array(256);
            for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p[y * 16 + x] = recY[(y0 - 1) * W + x0 + x];
            out.push({ mode: 0, pred: p });
        }
        if (hasLeft) {
            const p = new Uint8Array(256);
            for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p[y * 16 + x] = recY[(y0 + y) * W + x0 - 1];
            out.push({ mode: 1, pred: p });
        }
        let dc = 128;
        if (hasTop && hasLeft) {
            let s = 0;
            for (let i = 0; i < 16; i++) s += recY[(y0 - 1) * W + x0 + i] + recY[(y0 + i) * W + x0 - 1];
            dc = (s + 16) >> 5;
        } else if (hasLeft) {
            let s = 0;
            for (let i = 0; i < 16; i++) s += recY[(y0 + i) * W + x0 - 1];
            dc = (s + 8) >> 4;
        } else if (hasTop) {
            let s = 0;
            for (let i = 0; i < 16; i++) s += recY[(y0 - 1) * W + x0 + i];
            dc = (s + 8) >> 4;
        }
        out.push({ mode: 2, pred: new Uint8Array(256).fill(dc) });
        return out;
    }

    /** Chroma intra prediction: vertical (2) or horizontal (1); DC (0) only for the first macroblock (all 128). */
    function chromaPrediction(mx, my, srcU, srcV) {
        const x0 = mx * 8;
        const y0 = my * 8;
        const make = (rec, mode) => {
            const p = new Uint8Array(64);
            for (let y = 0; y < 8; y++)
                for (let x = 0; x < 8; x++) p[y * 8 + x] = mode === 2 ? rec[(y0 - 1) * CW + x0 + x] : mode === 1 ? rec[(y0 + y) * CW + x0 - 1] : 128;
            return p;
        };
        const modes = [];
        if (my > 0) modes.push(2);
        if (mx > 0) modes.push(1);
        if (!modes.length) return { mode: 0, u: make(recU, 0), v: make(recV, 0) };
        let best = null;
        for (const m of modes) {
            const u = make(recU, m);
            const v = make(recV, m);
            const cost = sad(srcU, u, 64) + sad(srcV, v, 64);
            if (!best || cost < best.cost) best = { mode: m, u, v, cost };
        }
        return best;
    }

    function sad(a, b, n) {
        let s = 0;
        for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
        return s;
    }

    /**
     * Transform, quantise and reconstruct a 16×16 luma residual.
     * intra16: DC through the Hadamard (Intra 16×16), else plain 4×4 blocks (inter).
     * Returns { dc (scan order), ac[16] (scan order, 15 or 16 long), cbpLuma, recon }.
     */
    function codeLuma(src, pred, intra16) {
        const blocks = [];
        const dcIn = new Int32Array(16);
        for (let k = 0; k < 16; k++) {
            const bx = BLK_X[k] * 4;
            const by = BLK_Y[k] * 4;
            const b = new Int32Array(16);
            for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) b[y * 4 + x] = src[(by + y) * 16 + bx + x] - pred[(by + y) * 16 + bx + x];
            fdct4(b);
            blocks.push(b);
            dcIn[BLK_Y[k] * 4 + BLK_X[k]] = b[0];
        }
        const qp6 = Math.floor(qp / 6);
        const ac = [];
        let anyAc = false;
        const levels = blocks.map((b) => {
            const l = new Int32Array(16);
            for (let i = intra16 ? 1 : 0; i < 16; i++) l[i] = quant(b[i], qp, POS_CLASS[i], intra16 || false);
            return l;
        });
        let dcScan = null;
        let dcRec = null;
        if (intra16) {
            hadamard4(dcIn);
            const dcl = new Int32Array(16);
            for (let i = 0; i < 16; i++) dcl[i] = quant(dcIn[i] >> 1, qp, 0, true, 1);
            dcScan = ZIGZAG.map((p) => dcl[p]);
            // Decoder side: inverse Hadamard, then scale (§8.5.10).
            const f = Int32Array.from(dcl);
            hadamard4(f);
            const ls = 16 * V[qp % 6][0];
            dcRec = f.map((v) => (qp >= 36 ? (v * ls) << (qp6 - 6) : (v * ls + (1 << (5 - qp6))) >> (6 - qp6)));
        }
        const recon = new Uint8Array(256);
        const outB = new Int32Array(16);
        for (let k = 0; k < 16; k++) {
            const l = levels[k];
            const scan = ZIGZAG.map((p) => l[p]);
            const coeffs = intra16 ? scan.slice(1) : scan;
            if (coeffs.some((v) => v)) anyAc = true;
            ac.push(coeffs);
            const d = new Int32Array(16);
            for (let i = 0; i < 16; i++) d[i] = l[i] ? dequantAc(l[i], qp, POS_CLASS[i]) : 0;
            if (intra16) d[0] = dcRec[BLK_Y[k] * 4 + BLK_X[k]];
            idct4(d, outB);
            const bx = BLK_X[k] * 4;
            const by = BLK_Y[k] * 4;
            for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) recon[(by + y) * 16 + bx + x] = clip(pred[(by + y) * 16 + bx + x] + outB[y * 4 + x]);
        }
        return { dc: dcScan, ac, anyAc, recon };
    }

    /** Chroma residual of one component (8×8): DC 2×2 + 4 AC blocks. */
    function codeChroma(src, pred, intra) {
        const blocks = [];
        for (let k = 0; k < 4; k++) {
            const bx = (k & 1) * 4;
            const by = (k >> 1) * 4;
            const b = new Int32Array(16);
            for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) b[y * 4 + x] = src[(by + y) * 8 + bx + x] - pred[(by + y) * 8 + bx + x];
            fdct4(b);
            blocks.push(b);
        }
        const c = blocks.map((b) => b[0]);
        const f = [c[0] + c[1] + c[2] + c[3], c[0] - c[1] + c[2] - c[3], c[0] + c[1] - c[2] - c[3], c[0] - c[1] - c[2] + c[3]];
        const dcl = f.map((v) => quant(v, qpc, 0, intra, 1));
        const g = [dcl[0] + dcl[1] + dcl[2] + dcl[3], dcl[0] - dcl[1] + dcl[2] - dcl[3], dcl[0] + dcl[1] - dcl[2] - dcl[3], dcl[0] - dcl[1] - dcl[2] + dcl[3]];
        const ls = 16 * V[qpc % 6][0];
        const dcRec = g.map((v) => ((v * ls) << Math.floor(qpc / 6)) >> 5);
        const ac = [];
        const recon = new Uint8Array(64);
        const outB = new Int32Array(16);
        for (let k = 0; k < 4; k++) {
            const l = new Int32Array(16);
            for (let i = 1; i < 16; i++) l[i] = quant(blocks[k][i], qpc, POS_CLASS[i], intra);
            ac.push(ZIGZAG.map((p) => l[p]).slice(1));
            const d = new Int32Array(16);
            for (let i = 1; i < 16; i++) d[i] = l[i] ? dequantAc(l[i], qpc, POS_CLASS[i]) : 0;
            d[0] = dcRec[k];
            idct4(d, outB);
            const bx = (k & 1) * 4;
            const by = (k >> 1) * 4;
            for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) recon[(by + y) * 8 + bx + x] = clip(pred[(by + y) * 8 + bx + x] + outB[y * 4 + x]);
        }
        return { dc: dcl, ac, recon, anyDc: dcl.some((v) => v), anyAc: ac.some((a) => a.some((v) => v)) };
    }

    function writeChromaResidual(b, mx, my, cu, cv, cbpChroma) {
        if (cbpChroma > 0) {
            writeResidualBlock(b, cu.dc, 4, -1);
            writeResidualBlock(b, cv.dc, 4, -1);
        }
        const stride = mbW * 2;
        for (const [comp, nz] of [[cu, nzU], [cv, nzV]]) {
            for (let k = 0; k < 4; k++) {
                const x = mx * 2 + (k & 1);
                const y = my * 2 + (k >> 1);
                if (cbpChroma === 2) nz[y * stride + x] = writeResidualBlock(b, comp.ac[k], 15, nC(nz, stride, x, y));
                else nz[y * stride + x] = 0;
            }
        }
    }

    const getBlock = (plane, stride, x0, y0, size) => {
        const out = new Uint8Array(size * size);
        for (let y = 0; y < size; y++) out.set(plane.subarray((y0 + y) * stride + x0, (y0 + y) * stride + x0 + size), y * size);
        return out;
    };
    const putBlock = (plane, stride, x0, y0, size, data) => {
        for (let y = 0; y < size; y++) plane.set(data.subarray(y * size, y * size + size), (y0 + y) * stride + x0);
    };

    /** Intra 16×16 macroblock: writes mb_type…residual and the reconstruction. */
    function writeIntraMb(b, mx, my, sY, sU, sV, typeOffset) {
        let best = null;
        for (const p of lumaPredictions(mx, my)) {
            const cost = sad(sY, p.pred, 256);
            if (!best || cost < best.cost) best = { ...p, cost };
        }
        const luma = codeLuma(sY, best.pred, true);
        const ch = chromaPrediction(mx, my, sU, sV);
        const cu = codeChroma(sU, ch.u, true);
        const cv = codeChroma(sV, ch.v, true);
        const cbpChroma = cu.anyAc || cv.anyAc ? 2 : cu.anyDc || cv.anyDc ? 1 : 0;
        const cbpLuma = luma.anyAc ? 15 : 0;
        b.ue(typeOffset + 1 + best.mode + 4 * cbpChroma + (cbpLuma ? 12 : 0));
        b.ue(ch.mode); // intra_chroma_pred_mode
        b.se(0); // mb_qp_delta
        const stride = mbW * 4;
        writeResidualBlock(b, luma.dc, 16, nC(nzY, stride, mx * 4, my * 4));
        for (let k = 0; k < 16; k++) {
            const x = mx * 4 + BLK_X[k];
            const y = my * 4 + BLK_Y[k];
            nzY[y * stride + x] = cbpLuma ? writeResidualBlock(b, luma.ac[k], 15, nC(nzY, stride, x, y)) : 0;
        }
        writeChromaResidual(b, mx, my, cu, cv, cbpChroma);
        putBlock(recY, W, mx * 16, my * 16, 16, luma.recon);
        putBlock(recU, CW, mx * 8, my * 8, 8, cu.recon);
        putBlock(recV, CW, mx * 8, my * 8, 8, cv.recon);
    }

    /** P_L0_16x16 with a zero motion vector. */
    function writeInterMb(b, mx, my, sY, sU, sV, pY, pU, pV) {
        const luma = codeLuma(sY, pY, false);
        const cu = codeChroma(sU, pU, false);
        const cv = codeChroma(sV, pV, false);
        let cbpLuma = 0;
        for (let q = 0; q < 4; q++) if ([0, 1, 2, 3].some((i) => luma.ac[q * 4 + i].some((v) => v))) cbpLuma |= 1 << q;
        const cbpChroma = cu.anyAc || cv.anyAc ? 2 : cu.anyDc || cv.anyDc ? 1 : 0;
        b.ue(0); // mb_type P_L0_16x16
        b.se(0); // mvd_l0 x
        b.se(0); // mvd_l0 y
        const cbp = cbpLuma | (cbpChroma << 4);
        b.ue(CBP_INTER[cbp]);
        const stride = mbW * 4;
        if (cbp) b.se(0); // mb_qp_delta
        for (let k = 0; k < 16; k++) {
            const x = mx * 4 + BLK_X[k];
            const y = my * 4 + BLK_Y[k];
            if (cbpLuma & (1 << (k >> 2))) nzY[y * stride + x] = writeResidualBlock(b, luma.ac[k], 16, nC(nzY, stride, x, y));
            else nzY[y * stride + x] = 0;
        }
        writeChromaResidual(b, mx, my, cu, cv, cbpChroma);
        // Reconstruction: what the decoder rebuilds (blocks without coded coefficients are the prediction).
        const recon = new Uint8Array(256);
        recon.set(pY);
        for (let k = 0; k < 16; k++) {
            if (!(cbpLuma & (1 << (k >> 2)))) continue;
            const bx = BLK_X[k] * 4;
            const by = BLK_Y[k] * 4;
            for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) recon[(by + y) * 16 + bx + x] = luma.recon[(by + y) * 16 + bx + x];
        }
        putBlock(recY, W, mx * 16, my * 16, 16, recon);
        putBlock(recU, CW, mx * 8, my * 8, 8, cbpChroma ? cu.recon : pU);
        putBlock(recV, CW, mx * 8, my * 8, 8, cbpChroma ? cv.recon : pV);
    }

    const copyBlock = (from, to, stride, x0, y0, size) => {
        for (let y = 0; y < size; y++) {
            const o = (y0 + y) * stride + x0;
            to.set(from.subarray(o, o + size), o);
        }
    };
    /** Is the source block within `t` of the reference everywhere? (no allocation: runs for every macroblock) */
    const sameBlock = (src, ref, stride, x0, y0, size, t) => {
        for (let y = 0; y < size; y++) {
            const o = (y0 + y) * stride + x0;
            for (let x = 0; x < size; x++) {
                const d = src[o + x] - ref[o + x];
                if (d > t || d < -t) return false;
            }
        }
        return true;
    };

    function skipMb(mx, my) {
        copyBlock(refY, recY, W, mx * 16, my * 16, 16);
        copyBlock(refU, recU, CW, mx * 8, my * 8, 8);
        copyBlock(refV, recV, CW, mx * 8, my * 8, 8);
        for (let k = 0; k < 16; k++) nzY[(my * 4 + BLK_Y[k]) * mbW * 4 + mx * 4 + BLK_X[k]] = 0;
        for (let k = 0; k < 4; k++) {
            nzU[(my * 2 + (k >> 1)) * mbW * 2 + mx * 2 + (k & 1)] = 0;
            nzV[(my * 2 + (k >> 1)) * mbW * 2 + mx * 2 + (k & 1)] = 0;
        }
    }

    /**
     * Encode one picture.
     * @param {{y: Uint8Array, u: Uint8Array, v: Uint8Array}} frame  4:2:0 planes padded to W × H (see padFrame)
     * @returns {{nal: Uint8Array, key: boolean}} one slice NAL (no start code)
     */
    function encode(frame) {
        const key = frameIndex % keyEvery === 0;
        if (key) frameNum = 0;
        const b = new BitWriter(1 << 18);
        // slice_header
        b.ue(0); // first_mb_in_slice
        b.ue(key ? 7 : 5); // slice_type: I / P (all slices of the picture)
        b.ue(0); // pic_parameter_set_id
        b.u(4, frameNum); // frame_num
        if (key) b.ue(idrId++ & 1); // idr_pic_id
        if (!key) {
            b.u(1, 0); // num_ref_idx_active_override_flag
            b.u(1, 0); // ref_pic_list_modification_flag_l0
        }
        if (key) {
            b.u(1, 0); // no_output_of_prior_pics_flag
            b.u(1, 0); // long_term_reference_flag
        } else b.u(1, 0); // adaptive_ref_pic_marking_mode_flag
        b.se(0); // slice_qp_delta
        b.ue(1); // disable_deblocking_filter_idc: off
        // slice_data
        let skipRun = 0;
        for (let my = 0; my < mbH; my++) {
            for (let mx = 0; mx < mbW; mx++) {
                const unchanged = () => prevSrc && sameBlock(frame.y, prevSrc.y, W, mx * 16, my * 16, 16, 1) && sameBlock(frame.u, prevSrc.u, CW, mx * 8, my * 8, 8, 1) && sameBlock(frame.v, prevSrc.v, CW, mx * 8, my * 8, 8, 1);
                const closeToRef = () => sameBlock(frame.y, refY, W, mx * 16, my * 16, 16, skipThreshold) && sameBlock(frame.u, refU, CW, mx * 8, my * 8, 8, skipThreshold) && sameBlock(frame.v, refV, CW, mx * 8, my * 8, 8, skipThreshold);
                if (!key && (unchanged() || closeToRef())) {
                    skipMb(mx, my);
                    skipRun++;
                    continue;
                }
                const sY = getBlock(frame.y, W, mx * 16, my * 16, 16);
                const sU = getBlock(frame.u, CW, mx * 8, my * 8, 8);
                const sV = getBlock(frame.v, CW, mx * 8, my * 8, 8);
                if (key) {
                    writeIntraMb(b, mx, my, sY, sU, sV, 0);
                    continue;
                }
                const pY = getBlock(refY, W, mx * 16, my * 16, 16);
                const pU = getBlock(refU, CW, mx * 8, my * 8, 8);
                const pV = getBlock(refV, CW, mx * 8, my * 8, 8);
                b.ue(skipRun);
                skipRun = 0;
                const interCost = sad(sY, pY, 256);
                let intraCost = Infinity;
                for (const p of lumaPredictions(mx, my)) intraCost = Math.min(intraCost, sad(sY, p.pred, 256));
                if (intraCost * 1.25 < interCost) writeIntraMb(b, mx, my, sY, sU, sV, 5);
                else writeInterMb(b, mx, my, sY, sU, sV, pY, pU, pV);
            }
        }
        if (skipRun) b.ue(skipRun);
        b.trailing();
        const nal = nalUnit(key ? 3 : 2, key ? 5 : 1, b.bytes());
        // The reconstruction becomes the next reference.
        [refY, recY] = [recY, refY];
        [refU, recU] = [recU, refU];
        [refV, recV] = [recV, refV];
        prevSrc = { y: frame.y, u: frame.u, v: frame.v };
        frameIndex++;
        frameNum = (frameNum + 1) & 15;
        return { nal, key };
    }

    return {
        width,
        height,
        paddedWidth: W,
        paddedHeight: H,
        sps: spsNal,
        pps: ppsNal,
        profile: 66,
        level: level[0],
        encode,
        /** The last reconstructed picture (for tests). */
        reconstruction: () => ({ y: refY, u: refU, v: refV })
    };
}

/**
 * RGBA (8-bit) → 4:2:0 limited-range BT.709 planes, padded to the encoder's
 * macroblock grid by repeating the last column / row.
 */
export function rgbaToYuv420(rgba, width, height, paddedWidth, paddedHeight) {
    const W = paddedWidth;
    const H = paddedHeight;
    const y = new Uint8Array(W * H);
    const u = new Uint8Array((W / 2) * (H / 2));
    const v = new Uint8Array((W / 2) * (H / 2));
    for (let j = 0; j < H; j++) {
        const sj = Math.min(j, height - 1);
        for (let i = 0; i < W; i++) {
            const si = Math.min(i, width - 1);
            const o = (sj * width + si) * 4;
            const r = rgba[o];
            const g = rgba[o + 1];
            const bl = rgba[o + 2];
            y[j * W + i] = clip(Math.round(16 + 0.1826 * r + 0.6142 * g + 0.062 * bl));
        }
    }
    for (let j = 0; j < H / 2; j++) {
        for (let i = 0; i < W / 2; i++) {
            let r = 0;
            let g = 0;
            let bl = 0;
            for (let dy = 0; dy < 2; dy++)
                for (let dx = 0; dx < 2; dx++) {
                    const sj = Math.min(j * 2 + dy, height - 1);
                    const si = Math.min(i * 2 + dx, width - 1);
                    const o = (sj * width + si) * 4;
                    r += rgba[o];
                    g += rgba[o + 1];
                    bl += rgba[o + 2];
                }
            r /= 4;
            g /= 4;
            bl /= 4;
            u[j * (W / 2) + i] = clip(Math.round(128 - 0.1006 * r - 0.3386 * g + 0.4392 * bl));
            v[j * (W / 2) + i] = clip(Math.round(128 + 0.4392 * r - 0.3989 * g - 0.0403 * bl));
        }
    }
    return { y, u, v };
}
