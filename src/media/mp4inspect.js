// Reads back an MP4 we wrote and checks it against what was asked for
// (feature 3): box structure, codec, size, frame count and duration.
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const type = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

function boxes(b, start, end) {
    const out = [];
    for (let o = start; o + 8 <= end; ) {
        const size = u32(b, o);
        if (size < 8 || o + size > end) throw new Error(`Damaged MP4 box at ${o}.`);
        out.push({ type: type(b, o + 4), start: o, body: o + 8, end: o + size });
        o += size;
    }
    return out;
}
const child = (b, parent, t) => boxes(b, parent.body, parent.end).find((x) => x.type === t);

/** @returns {{codec, width, height, frames, durationMs, keyFrames}} */
export function inspectMp4(b) {
    const top = boxes(b, 0, b.length);
    if (!top.length || top[0].type !== "ftyp") throw new Error("Not an MP4 file (no ftyp).");
    const moov = top.find((x) => x.type === "moov");
    const mdat = top.find((x) => x.type === "mdat");
    if (!moov || !mdat) throw new Error("The MP4 has no movie or media data.");
    const mvhd = child(b, moov, "mvhd");
    const durationMs = Math.round((u32(b, mvhd.body + 16) * 1000) / u32(b, mvhd.body + 12));
    const trak = child(b, moov, "trak");
    const stbl = child(b, child(b, child(b, trak, "mdia"), "minf"), "stbl");
    const stsd = child(b, stbl, "stsd");
    const entry = boxes(b, stsd.body + 8, stsd.end)[0];
    const width = u16(b, entry.body + 24);
    const height = u16(b, entry.body + 26);
    const stsz = child(b, stbl, "stsz");
    const frames = u32(b, stsz.body + 8);
    const stco = child(b, stbl, "stco");
    const offset = u32(b, stco.body + 8);
    let total = 0;
    for (let i = 0; i < frames; i++) total += u32(b, stsz.body + 12 + i * 4);
    if (offset !== mdat.body || offset + total > mdat.end) throw new Error("The MP4's sample table doesn't match its data.");
    // Every sample must be length-prefixed NAL units that fill it exactly.
    for (let i = 0, o = offset; i < frames; i++) {
        const size = u32(b, stsz.body + 12 + i * 4);
        let p = o;
        while (p < o + size) p += 4 + u32(b, p);
        if (p !== o + size) throw new Error(`Frame ${i + 1} of the MP4 is damaged.`);
        o += size;
    }
    const stss = child(b, stbl, "stss");
    return { codec: entry.type, width, height, frames, durationMs, keyFrames: stss ? u32(b, stss.body + 4) : frames };
}
