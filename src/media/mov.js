// QuickTime MOV writer for Photo-JPEG ('jpeg') video, pure JS.
// Layout: ftyp | mdat (all frames, one chunk) | moov. Frame sizes are known
// before writing (frames are rendered to disk first), so the file is written
// strictly sequentially with File.write(..., { append: true }).
// Photo-JPEG is royalty-free and widely decodable (QuickTime, VLC, ffmpeg,
// Premiere, After Effects, DaVinci). It is an edit-ready master, not a
// social-network delivery codec.

const enc = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

class Bytes {
    constructor() {
        this.parts = [];
        this.length = 0;
    }
    push(u8) {
        this.parts.push(u8);
        this.length += u8.length;
        return this;
    }
    u8(v) {
        return this.push(Uint8Array.of(v & 0xff));
    }
    u16(v) {
        return this.push(Uint8Array.of((v >>> 8) & 0xff, v & 0xff));
    }
    u32(v) {
        return this.push(Uint8Array.of((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff));
    }
    u64(v) {
        const hi = Math.floor(v / 2 ** 32);
        return this.u32(hi).u32(v - hi * 2 ** 32);
    }
    str(s) {
        return this.push(enc(s));
    }
    zeros(n) {
        return this.push(new Uint8Array(n));
    }
    concat() {
        const out = new Uint8Array(this.length);
        let o = 0;
        for (const p of this.parts) {
            out.set(p, o);
            o += p.length;
        }
        return out;
    }
}

function box(type, ...children) {
    const body = new Bytes();
    for (const c of children) body.push(c instanceof Uint8Array ? c : c.concat());
    return new Bytes().u32(8 + body.length).str(type).push(body.concat()).concat();
}

const fullBox = (type, version, flags, build) => {
    const b = new Bytes().u8(version).u8(flags >> 16).u16(flags & 0xffff);
    build(b);
    return box(type, b);
};

const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];
const pascal = (s, size) => {
    const b = new Uint8Array(size);
    const bytes = enc(s.slice(0, size - 1));
    b[0] = bytes.length;
    b.set(bytes, 1);
    return b;
};

export const MOVIE_TIMESCALE = 1000;

/** ftyp + mdat header. Returns { bytes, dataOffset }. */
export function movHeader(sampleSizes) {
    const ftyp = box("ftyp", new Bytes().str("qt  ").u32(0x20050300).str("qt  "));
    const dataBytes = sampleSizes.reduce((a, b) => a + b, 0);
    const large = dataBytes + 8 > 0xffffffff;
    const mdatHeader = large ? new Bytes().u32(1).str("mdat").u64(dataBytes + 16).concat() : new Bytes().u32(dataBytes + 8).str("mdat").concat();
    const bytes = new Bytes().push(ftyp).push(mdatHeader).concat();
    return { bytes, dataOffset: bytes.length };
}

/** moov box describing one Photo-JPEG video track. */
export function movTrailer({ width, height, fps, sampleSizes, dataOffset }) {
    const n = sampleSizes.length;
    if (!n) throw new Error("A video needs at least one frame.");
    if (!Number.isInteger(fps) || fps <= 0) throw new Error("fps must be a positive integer.");
    const mediaDuration = n; // timescale = fps, one tick per frame
    const movieDuration = Math.round((n * MOVIE_TIMESCALE) / fps);

    const mvhd = fullBox("mvhd", 0, 0, (b) => {
        b.u32(0).u32(0).u32(MOVIE_TIMESCALE).u32(movieDuration).u32(0x00010000).u16(0x0100).zeros(10);
        MATRIX.forEach((m) => b.u32(m));
        b.u32(0).u32(0).u32(0).u32(0).u32(0).u32(0).u32(2);
    });
    const tkhd = fullBox("tkhd", 0, 0x7, (b) => {
        b.u32(0).u32(0).u32(1).u32(0).u32(movieDuration).zeros(8).u16(0).u16(0).u16(0).u16(0);
        MATRIX.forEach((m) => b.u32(m));
        b.u32(width * 65536).u32(height * 65536);
    });
    const mdhd = fullBox("mdhd", 0, 0, (b) => b.u32(0).u32(0).u32(fps).u32(mediaDuration).u16(0x55c4).u16(0));
    const hdlrMedia = fullBox("hdlr", 0, 0, (b) => b.str("mhlr").str("vide").u32(0).u32(0).u32(0).push(pascal("VideoHandler", 13)));
    const vmhd = fullBox("vmhd", 0, 1, (b) => b.u16(0x40).u16(0x8000).u16(0x8000).u16(0x8000));
    const hdlrData = fullBox("hdlr", 0, 0, (b) => b.str("dhlr").str("alis").u32(0).u32(0).u32(0).push(pascal("DataHandler", 12)));
    const dref = fullBox("dref", 0, 0, (b) => b.u32(1).push(fullBox("alis", 0, 1, () => {})));
    const sampleEntry = new Bytes()
        .zeros(6)
        .u16(1) // data reference index
        .u16(0)
        .u16(0) // version, revision
        .str("appl")
        .u32(0) // temporal quality
        .u32(0x200) // spatial quality: normal
        .u16(width)
        .u16(height)
        .u32(72 * 65536)
        .u32(72 * 65536)
        .u32(0) // data size
        .u16(1) // frames per sample
        .push(pascal("Photo - JPEG", 32))
        .u16(24) // depth
        .u16(0xffff); // no color table
    const stsd = fullBox("stsd", 0, 0, (b) => b.u32(1).push(box("jpeg", sampleEntry)));
    const stts = fullBox("stts", 0, 0, (b) => b.u32(1).u32(n).u32(1));
    const stsc = fullBox("stsc", 0, 0, (b) => b.u32(1).u32(1).u32(n).u32(1));
    const stsz = fullBox("stsz", 0, 0, (b) => {
        b.u32(0).u32(n);
        sampleSizes.forEach((s) => b.u32(s));
    });
    const chunk = dataOffset > 0xffffffff ? fullBox("co64", 0, 0, (b) => b.u32(1).u64(dataOffset)) : fullBox("stco", 0, 0, (b) => b.u32(1).u32(dataOffset));
    const stbl = box("stbl", stsd, stts, stsc, stsz, chunk);
    const minf = box("minf", vmhd, hdlrData, box("dinf", dref), stbl);
    const mdia = box("mdia", mdhd, hdlrMedia, minf);
    const trak = box("trak", tkhd, mdia);
    return box("moov", mvhd, trak);
}

/**
 * Write a MOV from frames already on disk.
 * @param {object} p
 * @param {Array<{size: number, read: () => Promise<Uint8Array>}>} p.frames
 * @param {(bytes: Uint8Array) => Promise<void>} p.append   appends to the output file
 * @param {(i: number, n: number) => void} [p.onProgress]
 * @param {(frameBytes: Uint8Array, i: number) => void} [p.checkFrame]  throw to abort
 */
export async function writeMov({ width, height, fps, frames, append, onProgress = () => {}, checkFrame = () => {} }) {
    const sizes = frames.map((f) => f.size);
    const { bytes, dataOffset } = movHeader(sizes);
    await append(bytes);
    let written = bytes.length;
    for (let i = 0; i < frames.length; i++) {
        const data = await frames[i].read();
        if (data.length !== sizes[i]) throw new Error(`Frame ${i + 1} changed size while writing the video.`);
        checkFrame(data, i);
        await append(data);
        written += data.length;
        onProgress(i + 1, frames.length);
    }
    const moov = movTrailer({ width, height, fps, sampleSizes: sizes, dataOffset });
    await append(moov);
    written += moov.length;
    return { size: written, frameCount: frames.length, durationMs: Math.round((frames.length * 1000) / fps) };
}
