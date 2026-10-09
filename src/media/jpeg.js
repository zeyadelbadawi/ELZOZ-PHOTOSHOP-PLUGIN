// Minimal JPEG structure checks used before a frame goes into a video.

export class MediaError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.step = "video";
    }
}

/** @returns {{width, height}} from the first SOF marker; throws if the data is not a complete JPEG. */
export function inspectJpeg(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) throw new MediaError("bad_jpeg", "Frame is not a JPEG (missing start marker).");
    let end = b.length;
    while (end > 2 && b[end - 1] === 0x00) end--; // tolerate zero padding
    if (b[end - 2] !== 0xff || b[end - 1] !== 0xd9) throw new MediaError("truncated_jpeg", "Frame JPEG is truncated (missing end marker).");
    let i = 2;
    while (i + 4 <= b.length) {
        if (b[i] !== 0xff) {
            i++;
            continue;
        }
        const marker = b[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
            i += marker === 0xff ? 1 : 2;
            continue;
        }
        const len = (b[i + 2] << 8) | b[i + 3];
        // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
        }
        if (marker === 0xda) break; // start of scan without a frame header
        i += 2 + len;
    }
    throw new MediaError("bad_jpeg", "Frame JPEG has no frame header.");
}
