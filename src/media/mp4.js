// MP4 (ISO BMFF) writer for one H.264 video track (feature 3). The movie box
// comes first ("fast start"), so phones, WhatsApp and browsers can play the
// file while it downloads. Samples are length-prefixed NAL units (avcC).

const enc = new TextEncoder();
const u8 = (n) => [n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const str = (s) => [...enc.encode(s)];

function box(type, ...parts) {
    const body = parts.flat();
    return [...u32(body.length + 8), ...str(type), ...body];
}
const fullBox = (type, version, flags, ...parts) => box(type, [version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts);
const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].flatMap(u32);

/**
 * @param {object} p
 * @param {number} p.width, p.height, p.fps
 * @param {Uint8Array} p.sps, p.pps      NAL units (no start code)
 * @param {Array<{data: Uint8Array, key: boolean}>} p.samples  one slice NAL per frame
 * @returns {Uint8Array[]} file parts to write in order
 */
export function buildMp4({ width, height, fps, sps, pps, samples }) {
    const timescale = fps * 1000;
    const delta = 1000;
    const durationTs = samples.length * delta;
    const durationMs = Math.round((samples.length * 1000) / fps);
    const sizes = samples.map((s) => s.data.length + 4);
    const keys = samples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean);

    const avcC = box("avcC", u8(1), u8(sps[1]), u8(sps[2]), u8(sps[3]), u8(0xff), u8(0xe1), u16(sps.length), [...sps], u8(1), u16(pps.length), [...pps]);
    const colr = box("colr", str("nclx"), u16(1), u16(1), u16(1), u8(0)); // BT.709, limited range
    const avc1 = box(
        "avc1",
        [0, 0, 0, 0, 0, 0], u16(1), // reserved, data_reference_index
        new Array(16).fill(0), // pre_defined / reserved
        u16(width), u16(height),
        u32(0x00480000), u32(0x00480000), u32(0), u16(1), // 72 dpi, reserved, frame_count
        [11, ...str("Elzoz H.264"), ...new Array(32 - 1 - 11).fill(0)], // compressorname (pascal string, 32 bytes)
        u16(0x18), u16(0xffff), // depth, pre_defined
        avcC,
        colr
    );
    const stbl = (chunkOffset) =>
        box(
            "stbl",
            fullBox("stsd", 0, 0, u32(1), avc1),
            fullBox("stts", 0, 0, u32(1), u32(samples.length), u32(delta)),
            fullBox("stss", 0, 0, u32(keys.length), keys.flatMap(u32)),
            fullBox("stsc", 0, 0, u32(1), u32(1), u32(samples.length), u32(1)),
            fullBox("stsz", 0, 0, u32(0), u32(samples.length), sizes.flatMap(u32)),
            fullBox("stco", 0, 0, u32(1), u32(chunkOffset))
        );
    const moov = (chunkOffset) =>
        box(
            "moov",
            fullBox("mvhd", 0, 0, u32(0), u32(0), u32(1000), u32(durationMs), u32(0x00010000), u16(0x0100), new Array(10).fill(0), MATRIX, new Array(24).fill(0), u32(2)),
            box(
                "trak",
                fullBox("tkhd", 0, 3, u32(0), u32(0), u32(1), u32(0), u32(durationMs), new Array(8).fill(0), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width << 16), u32(height << 16)),
                box(
                    "mdia",
                    fullBox("mdhd", 0, 0, u32(0), u32(0), u32(timescale), u32(durationTs), u16(0x55c4), u16(0)), // language "und"
                    fullBox("hdlr", 0, 0, u32(0), str("vide"), new Array(12).fill(0), str("Elzoz video"), u8(0)),
                    box("minf", fullBox("vmhd", 0, 1, new Array(8).fill(0)), box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1))), stbl(chunkOffset))
                )
            )
        );
    const ftyp = box("ftyp", str("isom"), u32(0x200), str("isom"), str("iso2"), str("avc1"), str("mp41"));
    // The chunk offset depends on the moov size, which doesn't depend on the offset's value.
    const moovLen = moov(0).length;
    const dataStart = ftyp.length + moovLen + 8;
    const mdatSize = 8 + sizes.reduce((a, b) => a + b, 0);
    const parts = [Uint8Array.from(ftyp), Uint8Array.from(moov(dataStart)), Uint8Array.from([...u32(mdatSize), ...str("mdat")])];
    for (const s of samples) {
        parts.push(Uint8Array.from(u32(s.data.length)));
        parts.push(s.data);
    }
    return parts;
}
