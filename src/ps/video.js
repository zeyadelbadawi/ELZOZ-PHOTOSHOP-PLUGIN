// Photoshop side of video rendering.
//  * frames: apply a frame state (opacity / translate / scale, all documented
//    DOM APIs from 22.5/23.0) as one history state, export a JPEG copy, revert
//  * movie: mux the JPEG frames into a MOV and verify the file on disk
import { writeMov } from "../media/mov.js";
import { inspectJpeg, MediaError } from "../media/jpeg.js";
import { verifyMovie } from "../media/inspect.js";
import { StepError } from "./text.js";
import { decode as decodeJpeg } from "jpeg-js";
import { createH264Encoder, rgbaToYuv420 } from "../media/h264/encoder.js";
import { buildMp4 } from "../media/mp4.js";
import { inspectMp4 } from "../media/mp4inspect.js";

/** MP4 quality presets: H.264 quantiser (lower = better, bigger). */
export const MP4_QUALITY = { high: 20, standard: 23, small: 27 };

const FRAME_QUALITY = 10; // Photoshop JPEG quality 0..12

export async function applyFrameState({ photoshop, doc, layerFor, states, baseOpacity }) {
    const anchor = photoshop.constants && photoshop.constants.AnchorPosition ? photoshop.constants.AnchorPosition.MIDDLECENTER : "middleCenter";
    await doc.suspendHistory(async () => {
        for (const s of states) {
            const layer = layerFor(s.layerId);
            const base = baseOpacity.get(s.layerId) ?? 100;
            const opacity = Math.round(base * s.opacity * 100) / 100;
            if (opacity !== layer.opacity) layer.opacity = opacity;
            if (opacity > 0) {
                if (Math.abs(s.scale - 1) > 1e-4) await layer.scale(s.scale * 100, s.scale * 100, anchor);
                if (s.dx || s.dy) await layer.translate(s.dx, s.dy);
            }
        }
    }, "Elzoz: frame");
}

export async function exportFrame({ doc, folder, name }) {
    const entry = await folder.createFile(name, { overwrite: true });
    await doc.saveAs.jpg(entry, { quality: FRAME_QUALITY, embedColorProfile: true }, true);
    return entry;
}

const toU8 = (buf) => (buf instanceof Uint8Array ? buf : new Uint8Array(buf));

/**
 * Write and verify a MOV from frame entries.
 * @returns {Promise<{name, size, frameCount, durationMs}>}
 */
export async function writeAndVerifyMovie({ uxp, folder, name, frames, width, height, fps, onProgress }) {
    const binary = uxp.storage.formats.binary;
    const metas = [];
    for (const f of frames) metas.push({ entry: f, size: (await f.getMetadata()).size });

    let out;
    try {
        out = await folder.createFile(name, { overwrite: false });
    } catch (e) {
        throw new StepError("export", `Can't create "${name}" in the output folder: ${e.message}`, { format: "mov" });
    }
    let first = true;
    const append = async (bytes) => {
        await out.write(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { format: binary, append: !first });
        first = false;
    };
    try {
        await writeMov({
            width,
            height,
            fps,
            frames: metas.map((m) => ({ size: m.size, read: async () => toU8(await m.entry.read({ format: binary })) })),
            append,
            onProgress,
            checkFrame: (bytes, i) => {
                const dim = inspectJpeg(bytes);
                if (dim.width !== width || dim.height !== height) {
                    throw new MediaError("frame_size", `Frame ${i + 1} is ${dim.width}x${dim.height}, expected ${width}x${height}.`);
                }
            }
        });
    } catch (e) {
        await out.delete().catch(() => {});
        throw e.step ? e : new StepError("video", e.message);
    }

    // Verify what is actually on disk before anyone is told it worked.
    const data = toU8(await out.read({ format: binary }));
    const reader = { size: data.length, read: async (pos, len) => data.subarray(pos, pos + len) };
    const expected = { width, height, fps, frameCount: frames.length, durationMs: Math.round((frames.length * 1000) / fps) };
    try {
        await verifyMovie(reader, expected);
    } catch (e) {
        await out.delete().catch(() => {});
        throw new StepError("video", e.message);
    }
    return { name, size: data.length, frameCount: frames.length, durationMs: expected.durationMs, nativePath: out.nativePath };
}

/**
 * Encode the JPEG frames to H.264 and write an MP4 (moov first), then read it
 * back and check it before reporting success.
 * @returns {Promise<{name, size, frameCount, durationMs, nativePath}>}
 */
export async function writeAndVerifyMp4({ uxp, folder, name, frames, width, height, fps, quality = "standard", onProgress = () => {} }) {
    const binary = uxp.storage.formats.binary;
    const enc = createH264Encoder({ width, height, fps, qp: MP4_QUALITY[quality] || MP4_QUALITY.standard });
    const samples = [];
    for (let i = 0; i < frames.length; i++) {
        const bytes = toU8(await frames[i].read({ format: binary }));
        const dim = inspectJpeg(bytes);
        if (dim.width !== width || dim.height !== height) throw new StepError("video", `Frame ${i + 1} is ${dim.width}x${dim.height}, expected ${width}x${height}.`, { format: "mp4" });
        let img;
        try {
            img = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
        } catch (e) {
            throw new StepError("video", `Frame ${i + 1} couldn't be read: ${e.message}`, { format: "mp4" });
        }
        const r = enc.encode(rgbaToYuv420(img.data, width, height, enc.paddedWidth, enc.paddedHeight));
        samples.push({ data: r.nal, key: r.key });
        onProgress(i + 1, frames.length);
    }
    let out;
    try {
        out = await folder.createFile(name, { overwrite: false });
    } catch (e) {
        throw new StepError("export", `Can't create "${name}" in the output folder: ${e.message}`, { format: "mp4" });
    }
    try {
        const parts = buildMp4({ width, height, fps, sps: enc.sps, pps: enc.pps, samples });
        const total = parts.reduce((a, p) => a + p.length, 0);
        const all = new Uint8Array(total);
        let o = 0;
        for (const p of parts) {
            all.set(p, o);
            o += p.length;
        }
        await out.write(all.buffer, { format: binary });
        const data = toU8(await out.read({ format: binary }));
        const info = inspectMp4(data);
        const durationMs = Math.round((frames.length * 1000) / fps);
        if (info.codec !== "avc1" || info.width !== width || info.height !== height || info.frames !== frames.length || Math.abs(info.durationMs - durationMs) > 1) {
            throw new Error(`The MP4 on disk isn't what was written (${info.width}x${info.height}, ${info.frames} frames).`);
        }
        return { name, size: data.length, frameCount: frames.length, durationMs, nativePath: out.nativePath };
    } catch (e) {
        await out.delete().catch(() => {});
        throw e.step ? e : new StepError("video", e.message, { format: "mp4" });
    }
}
