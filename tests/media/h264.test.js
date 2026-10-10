// Feature 3: the H.264 encoder and MP4 writer. The output is decoded by ffmpeg
// (an independent decoder) and must match the encoder's own reconstruction bit
// for bit, so P pictures can't drift; quality is measured against the source.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { encode as encodeJpeg } from "jpeg-js";
import { BitWriter, nalUnit } from "../../src/media/h264/bits.js";
import { TABLES, writeResidualBlock } from "../../src/media/h264/cavlc.js";
import { createH264Encoder, rgbaToYuv420 } from "../../src/media/h264/encoder.js";
import { buildMp4 } from "../../src/media/mp4.js";
import { inspectMp4 } from "../../src/media/mp4inspect.js";
import { writeAndVerifyMp4 } from "../../src/ps/video.js";
import { FakeFolder } from "../fakes/fakePhotoshop.js";

const FFMPEG = (() => {
    try {
        execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
        return true;
    } catch (e) {
        return false;
    }
})();

describe("bit writer", () => {
    it("writes Exp-Golomb codes and adds emulation prevention", () => {
        const b = new BitWriter(4);
        b.ue(0); // 1
        b.ue(3); // 00100
        b.se(-2); // ue(4) = 00101
        b.trailing();
        expect([...b.bytes()].map((x) => x.toString(2).padStart(8, "0")).join("")).toBe("1001000010110000");
        expect([...nalUnit(3, 7, Uint8Array.from([0, 0, 1, 0, 0, 0, 5]))]).toEqual([0x67, 0, 0, 3, 1, 0, 0, 3, 0, 5]);
    });
});

describe("CAVLC tables", () => {
    const prefixFree = (codes) => {
        const words = codes.filter(Boolean).map(([v, l]) => v.toString(2).padStart(l, "0"));
        return words.every((a, i) => words.every((b, j) => i === j || !b.startsWith(a)));
    };
    it("every table is a prefix-free code (a decoder can tell the words apart)", () => {
        for (const t of [TABLES.T0, TABLES.T1, TABLES.T2, TABLES.TDC]) expect(prefixFree(t)).toBe(true);
        for (const t of TABLES.TZ) expect(prefixFree(t)).toBe(true);
        for (const t of TABLES.TZDC) expect(prefixFree(t)).toBe(true);
        for (const t of TABLES.RB) expect(prefixFree(t)).toBe(true);
    });
    it("codes a block with trailing ones, levels and zeros", () => {
        // Richardson's example block 0 3 -1 0 / 0 -1 1 0 / 1 0 0 0 / 0 0 0 0, in zigzag order:
        // coeff_token 0000100, T1 signs 011, levels 1 + 0010, total_zeros 111, runs 10 1 1 01.
        const b = new BitWriter(16);
        expect(writeResidualBlock(b, [0, 3, 0, 1, -1, -1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], 16, 0)).toBe(5);
        b.trailing();
        const bits = [...b.bytes()].map((x) => x.toString(2).padStart(8, "0")).join("");
        expect(bits.startsWith("0000100" + "011" + "1" + "0010" + "111" + "10" + "1" + "1" + "01" + "1")).toBe(true);
    });
});

function synthetic(w, h, f) {
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            rgba[o] = (x * 255) / w;
            rgba[o + 1] = (y * 255) / h;
            rgba[o + 2] = (x ^ y) & 32 ? 200 : 60;
            const sx = 10 + f * 6;
            const sy = 20 + f * 3;
            if (x >= sx && x < sx + 40 && y >= sy && y < sy + 40) [rgba[o], rgba[o + 1], rgba[o + 2]] = [250, 30, 30];
            if (y % 37 === 0) rgba[o] = rgba[o + 1] = rgba[o + 2] = 0;
            rgba[o + 3] = 255;
        }
    return rgba;
}
const crop = (plane, W, w, h) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) out.set(plane.subarray(y * W, y * W + w), y * w);
    return out;
};

describe.skipIf(!FFMPEG)("H.264 + MP4, checked with ffmpeg", () => {
    it("ffmpeg decodes exactly the encoder's reconstruction (I and P pictures, cropped size), at high quality", () => {
        const [w, h, n] = [200, 120, 24]; // not a multiple of 16: tests cropping
        const enc = createH264Encoder({ width: w, height: h, fps: 30, qp: 23, gop: 10 });
        const samples = [];
        const recon = [];
        const src = [];
        for (let f = 0; f < n; f++) {
            const yuv = rgbaToYuv420(synthetic(w, h, f), w, h, enc.paddedWidth, enc.paddedHeight);
            const r = enc.encode(yuv);
            samples.push({ data: r.nal, key: r.key });
            const rec = enc.reconstruction();
            recon.push(crop(rec.y, enc.paddedWidth, w, h), crop(rec.u, enc.paddedWidth / 2, w / 2, h / 2), crop(rec.v, enc.paddedWidth / 2, w / 2, h / 2));
            src.push(crop(yuv.y, enc.paddedWidth, w, h), crop(yuv.u, enc.paddedWidth / 2, w / 2, h / 2), crop(yuv.v, enc.paddedWidth / 2, w / 2, h / 2));
        }
        expect(samples.filter((s) => s.key)).toHaveLength(3);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ez-h264-"));
        const file = path.join(dir, "t.mp4");
        const bytes = Buffer.concat(buildMp4({ width: w, height: h, fps: 30, sps: enc.sps, pps: enc.pps, samples }).map((p) => Buffer.from(p)));
        fs.writeFileSync(file, bytes);
        expect(inspectMp4(new Uint8Array(bytes))).toMatchObject({ codec: "avc1", width: 200, height: 120, frames: 24, durationMs: 800, keyFrames: 3 });
        const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_streams", "-of", "json", file]).toString()).streams[0];
        expect(probe).toMatchObject({ codec_name: "h264", profile: "Constrained Baseline", width: 200, height: 120, nb_read_frames: "24", color_primaries: "bt709" });
        const decoded = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "yuv420p", "-"], { maxBuffer: 1 << 26 });
        expect(Buffer.compare(decoded, Buffer.concat(recon.map((p) => Buffer.from(p))))).toBe(0);
        const s = Buffer.concat(src.map((p) => Buffer.from(p)));
        let mse = 0;
        for (let i = 0; i < s.length; i++) mse += (s[i] - decoded[i]) ** 2;
        const psnr = 10 * Math.log10((255 * 255) / (mse / s.length));
        expect(psnr).toBeGreaterThan(40);
    });

    it("JPEG frames → verified MP4 on disk (the plugin's path), with progress", async () => {
        const [w, h] = [160, 96];
        const folder = new FakeFolder("frames");
        const frames = [];
        for (let f = 0; f < 6; f++) {
            const jpg = encodeJpeg({ data: Buffer.from(synthetic(w, h, f)), width: w, height: h }, 90).data;
            const file = await folder.createFile(`f${f}.jpg`);
            await file.write(new Uint8Array(jpg));
            frames.push(file);
        }
        const out = new FakeFolder("out");
        const uxp = { storage: { formats: { binary: "binary" } } };
        const progress = [];
        const r = await writeAndVerifyMp4({ uxp, folder: out, name: "v.mp4", frames, width: w, height: h, fps: 25, quality: "high", onProgress: (k, n) => progress.push(`${k}/${n}`) });
        expect(r).toMatchObject({ name: "v.mp4", frameCount: 6, durationMs: 240 });
        expect(progress).toEqual(["1/6", "2/6", "3/6", "4/6", "5/6", "6/6"]);
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ez-mp4-")), "v.mp4");
        fs.writeFileSync(file, out.files.get("v.mp4").bytes);
        const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file]).toString());
        expect(probe.streams[0]).toMatchObject({ codec_name: "h264", width: 160, height: 96, nb_read_frames: "6", r_frame_rate: "25/1" });
        // moov before mdat: plays while downloading
        expect(new TextDecoder().decode(out.files.get("v.mp4").bytes.subarray(4, 8))).toBe("ftyp");
        expect(Buffer.from(out.files.get("v.mp4").bytes).indexOf("moov")).toBeLessThan(Buffer.from(out.files.get("v.mp4").bytes).indexOf("mdat"));
    });
});

describe("guards", () => {
    it("rejects odd sizes and pictures too large for the encoder; frames of the wrong size", async () => {
        expect(() => createH264Encoder({ width: 101, height: 100, fps: 30 })).toThrow(/even/);
        expect(() => createH264Encoder({ width: 8192, height: 8192, fps: 60 })).toThrow(/too large/);
        expect(createH264Encoder({ width: 1080, height: 1920, fps: 30 }).level).toBe(40);
        expect(createH264Encoder({ width: 1080, height: 1920, fps: 60 }).level).toBe(42);
        const folder = new FakeFolder("frames");
        const file = await folder.createFile("f.jpg");
        await file.write(new Uint8Array(encodeJpeg({ data: Buffer.from(synthetic(64, 64, 0)), width: 64, height: 64 }, 80).data));
        const uxp = { storage: { formats: { binary: "binary" } } };
        await expect(writeAndVerifyMp4({ uxp, folder: new FakeFolder("o"), name: "v.mp4", frames: [file], width: 80, height: 64, fps: 30 })).rejects.toThrow(/expected 80x64/);
    });
});
