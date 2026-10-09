// Container inspector for MOV/MP4 (ISO BMFF). Used to verify a video file
// on disk before Elzoz reports success or charges for it.

const fourcc = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const u64 = (b, o) => u32(b, o) * 2 ** 32 + u32(b, o + 4);

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "dinf", "edts"]);

/**
 * @param {{size: number, read: (pos: number, len: number) => Promise<Uint8Array>}} reader
 */
async function topLevelBoxes(reader) {
    const boxes = [];
    let pos = 0;
    while (pos + 8 <= reader.size) {
        const h = await reader.read(pos, 16);
        let size = u32(h, 0);
        const type = fourcc(h, 4);
        let header = 8;
        if (size === 1) {
            size = u64(h, 8);
            header = 16;
        } else if (size === 0) size = reader.size - pos;
        if (size < header || pos + size > reader.size) throw new Error(`Box "${type}" at ${pos} runs past the end of the file.`);
        boxes.push({ type, start: pos, size, header });
        pos += size;
    }
    if (pos !== reader.size) throw new Error("Trailing bytes after the last box.");
    return boxes;
}

function children(buf, start, end) {
    const out = [];
    let p = start;
    while (p + 8 <= end) {
        let size = u32(buf, p);
        const type = fourcc(buf, p + 4);
        let header = 8;
        if (size === 1) {
            size = u64(buf, p + 8);
            header = 16;
        }
        if (size < header || p + size > end) throw new Error(`Malformed "${type}" box.`);
        out.push({ type, start: p, end: p + size, body: p + header });
        p += size;
    }
    return out;
}

function find(buf, start, end, path) {
    let level = [{ start, end, body: start, type: "root" }];
    for (const type of path) {
        const parent = level[0];
        const kids = children(buf, parent.type === "root" ? parent.start : parent.body, parent.end);
        level = kids.filter((k) => k.type === type);
        if (!level.length) return null;
    }
    return level[0];
}

/**
 * @returns {Promise<{ codec, width, height, frameCount, durationMs, fps, samples: Array<{offset,size}> }>}
 */
export async function inspectMovie(reader) {
    const top = await topLevelBoxes(reader);
    const ftyp = top.find((b) => b.type === "ftyp");
    const moovBox = top.find((b) => b.type === "moov");
    const mdat = top.find((b) => b.type === "mdat");
    if (!ftyp || !moovBox || !mdat) throw new Error("File is missing ftyp, moov or mdat.");
    const moov = await reader.read(moovBox.start, moovBox.size);
    const end = moov.length;

    const mvhd = find(moov, 0, end, ["moov", "mvhd"]);
    const movieScale = u32(moov, mvhd.body + 12);
    const movieDuration = u32(moov, mvhd.body + 16);

    const traks = children(moov, 8, end).filter((c) => c.type === "trak");
    const video = traks.find((t) => {
        const h = find(moov, t.body, t.end, ["mdia", "hdlr"]);
        return h && fourcc(moov, h.body + 8) === "vide";
    });
    if (!video) throw new Error("No video track.");
    const at = (path) => find(moov, video.body, video.end, path);
    const mdhd = at(["mdia", "mdhd"]);
    const mediaScale = u32(moov, mdhd.body + 12);
    const stbl = ["mdia", "minf", "stbl"];
    const stsd = at([...stbl, "stsd"]);
    const entry = stsd.body + 8;
    const codec = fourcc(moov, entry + 4);
    const width = u16(moov, entry + 8 + 24);
    const height = u16(moov, entry + 8 + 26);

    const stsz = at([...stbl, "stsz"]);
    const fixedSize = u32(moov, stsz.body + 4);
    const count = u32(moov, stsz.body + 8);
    const sizes = Array.from({ length: count }, (_, i) => (fixedSize ? fixedSize : u32(moov, stsz.body + 12 + i * 4)));

    const stts = at([...stbl, "stts"]);
    let mediaDuration = 0;
    for (let i = 0, n = u32(moov, stts.body + 4); i < n; i++) mediaDuration += u32(moov, stts.body + 8 + i * 8) * u32(moov, stts.body + 12 + i * 8);

    const stco = at([...stbl, "stco"]);
    const co64 = at([...stbl, "co64"]);
    const chunkOffsets = stco
        ? Array.from({ length: u32(moov, stco.body + 4) }, (_, i) => u32(moov, stco.body + 8 + i * 4))
        : Array.from({ length: u32(moov, co64.body + 4) }, (_, i) => u64(moov, co64.body + 8 + i * 8));
    const stsc = at([...stbl, "stsc"]);
    const stscEntries = Array.from({ length: u32(moov, stsc.body + 4) }, (_, i) => ({
        firstChunk: u32(moov, stsc.body + 8 + i * 12),
        perChunk: u32(moov, stsc.body + 12 + i * 12)
    }));

    const samples = [];
    let s = 0;
    for (let c = 0; c < chunkOffsets.length && s < count; c++) {
        const rule = stscEntries.filter((e) => e.firstChunk <= c + 1).pop();
        let off = chunkOffsets[c];
        for (let k = 0; k < rule.perChunk && s < count; k++, s++) {
            samples.push({ offset: off, size: sizes[s] });
            off += sizes[s];
        }
    }
    if (samples.length !== count) throw new Error("Sample table is inconsistent.");
    const mdatEnd = mdat.start + mdat.size;
    for (const sm of samples) {
        if (sm.offset < mdat.start + mdat.header || sm.offset + sm.size > mdatEnd) throw new Error("A frame points outside the media data.");
    }

    return {
        codec,
        width,
        height,
        frameCount: count,
        durationMs: Math.round((movieDuration * 1000) / movieScale),
        mediaDurationMs: Math.round((mediaDuration * 1000) / mediaScale),
        fps: mediaDuration ? Math.round((count * mediaScale) / mediaDuration) : 0,
        samples
    };
}

/**
 * Verify a Photo-JPEG MOV matches what was requested, including each frame's
 * JPEG start/end markers. Throws with a readable message on any mismatch.
 */
export async function verifyMovie(reader, expected) {
    const info = await inspectMovie(reader);
    const problems = [];
    if (info.codec !== "jpeg") problems.push(`codec ${info.codec}`);
    if (info.width !== expected.width || info.height !== expected.height) problems.push(`size ${info.width}x${info.height}`);
    if (info.frameCount !== expected.frameCount) problems.push(`${info.frameCount} frames`);
    if (Math.abs(info.durationMs - expected.durationMs) > 1000 / expected.fps) problems.push(`duration ${info.durationMs} ms`);
    for (const [i, sm] of info.samples.entries()) {
        const head = await reader.read(sm.offset, 2);
        const tail = await reader.read(sm.offset + sm.size - 2, 2);
        if (head[0] !== 0xff || head[1] !== 0xd8 || tail[0] !== 0xff || tail[1] !== 0xd9) {
            problems.push(`frame ${i + 1} is not a complete JPEG`);
            break;
        }
    }
    if (problems.length) throw Object.assign(new Error(`Video check failed: ${problems.join(", ")}.`), { step: "video", code: "invalid_video" });
    return info;
}
