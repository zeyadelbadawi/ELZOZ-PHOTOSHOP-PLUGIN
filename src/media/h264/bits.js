// Bit writer for H.264 syntax (ITU-T H.264 §7.2): fixed-length, Exp-Golomb,
// RBSP trailing bits, and NAL unit packing with emulation prevention.

export class BitWriter {
    constructor(capacity = 1 << 16) {
        this.buf = new Uint8Array(capacity);
        this.pos = 0; // bytes written
        this.acc = 0; // pending bits (msb first)
        this.n = 0; // number of pending bits (< 8)
    }
    grow() {
        const next = new Uint8Array(this.buf.length * 2);
        next.set(this.buf);
        this.buf = next;
    }
    /** Write the `len` low bits of `val` (len ≤ 24). */
    u(len, val) {
        if (len <= 0) return;
        if (len > 24) {
            this.u(len - 24, Math.floor(val / 16777216));
            this.u(24, val & 0xffffff);
            return;
        }
        this.acc = (this.acc << len) | (val & ((1 << len) - 1));
        this.n += len;
        while (this.n >= 8) {
            if (this.pos >= this.buf.length) this.grow();
            this.n -= 8;
            this.buf[this.pos++] = (this.acc >>> this.n) & 0xff;
        }
        this.acc &= (1 << this.n) - 1;
    }
    /** ue(v): unsigned Exp-Golomb. */
    ue(v) {
        const x = v + 1;
        const len = 31 - Math.clz32(x);
        this.u(len, 0);
        this.u(len + 1, x);
    }
    /** se(v): signed Exp-Golomb (k > 0 → 2k − 1, k ≤ 0 → −2k). */
    se(v) {
        this.ue(v > 0 ? 2 * v - 1 : -2 * v);
    }
    /** rbsp_trailing_bits: a 1, then zeros to the byte boundary. */
    trailing() {
        this.u(1, 1);
        if (this.n) this.u(8 - this.n, 0);
    }
    bytes() {
        if (this.n) throw new Error("BitWriter: not byte aligned");
        return this.buf.subarray(0, this.pos);
    }
}

/** NAL unit: header byte + RBSP with emulation prevention (00 00 0x → 00 00 03 0x, x ≤ 3). */
export function nalUnit(refIdc, type, rbsp) {
    const out = new Uint8Array(rbsp.length + (rbsp.length >> 1) + 2);
    let o = 0;
    out[o++] = ((refIdc & 3) << 5) | (type & 31);
    let zeros = 0;
    for (let i = 0; i < rbsp.length; i++) {
        const b = rbsp[i];
        if (zeros >= 2 && b <= 3) {
            out[o++] = 3;
            zeros = 0;
        }
        out[o++] = b;
        zeros = b === 0 ? zeros + 1 : 0;
    }
    return out.slice(0, o);
}
