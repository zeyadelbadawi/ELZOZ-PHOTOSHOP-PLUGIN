// Verifies the MOV writer against real decoders (ffprobe/ffmpeg), not just our parser.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeMov } from "../../src/media/mov.js";
import { inspectMovie, verifyMovie } from "../../src/media/inspect.js";
import { inspectJpeg } from "../../src/media/jpeg.js";

const hasFfmpeg = (() => {
    try {
        execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
        return true;
    } catch (e) {
        return false;
    }
})();
const d = hasFfmpeg ? describe : describe.skip;

const fileReader = (file) => {
    const fd = fs.openSync(file, "r");
    return {
        size: fs.fstatSync(fd).size,
        async read(pos, len) {
            const buf = Buffer.alloc(len);
            const n = fs.readSync(fd, buf, 0, len, pos);
            return new Uint8Array(buf.buffer, buf.byteOffset, n);
        },
        close: () => fs.closeSync(fd)
    };
};

async function mux(frameFiles, out, { width, height, fps }) {
    fs.writeFileSync(out, Buffer.alloc(0));
    const frames = frameFiles.map((f) => ({ size: fs.statSync(f).size, read: async () => new Uint8Array(fs.readFileSync(f)) }));
    return writeMov({
        width,
        height,
        fps,
        frames,
        append: async (bytes) => fs.appendFileSync(out, bytes),
        checkFrame: (bytes) => {
            const dim = inspectJpeg(bytes);
            if (dim.width !== width || dim.height !== height) throw new Error("frame size mismatch");
        }
    });
}

const probe = (file) =>
    JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,nb_read_frames,r_frame_rate:format=duration,format_name", "-of", "json", file]).toString());

d("MOV (Photo-JPEG) writer", () => {
    let dir;
    const frames = {};
    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "elzoz-mov-"));
        // Real JPEG frames, as Photoshop's saveAs.jpg would produce, at two aspect ratios.
        for (const [name, size, count] of [["reel", "216x384", 36], ["landscape", "384x216", 24]]) {
            const fdir = path.join(dir, name);
            fs.mkdirSync(fdir);
            execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=30`, "-frames:v", String(count), "-q:v", "3", path.join(fdir, "f%05d.jpg")]);
            frames[name] = fs.readdirSync(fdir).sort().map((f) => path.join(fdir, f));
        }
    });
    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    it.each([
        ["reel", 216, 384, 30, 36, 1200],
        ["landscape", 384, 216, 24, 24, 1000]
    ])("%s: ffprobe sees the exact codec, size, frame count and duration", async (name, width, height, fps, count, ms) => {
        const out = path.join(dir, `${name}.mov`);
        const res = await mux(frames[name], out, { width, height, fps });
        expect(res).toMatchObject({ frameCount: count, durationMs: ms, size: fs.statSync(out).size });

        const p = probe(out);
        expect(p.format.format_name).toContain("mov");
        expect(p.streams[0]).toMatchObject({ codec_name: "mjpeg", width, height, nb_read_frames: String(count), r_frame_rate: `${fps}/1` });
        expect(Number(p.format.duration)).toBeCloseTo(ms / 1000, 2);

        // Full decode of every frame must produce no errors (stands in for "plays").
        const errors = execFileSync("ffmpeg", ["-v", "error", "-i", out, "-f", "null", "-"], { stdio: ["ignore", "pipe", "pipe"] }).toString();
        expect(errors).toBe("");

        // Our own verifier agrees.
        const r = fileReader(out);
        try {
            const info = await verifyMovie(r, { width, height, frameCount: count, durationMs: ms, fps });
            expect(info).toMatchObject({ codec: "jpeg", fps });
        } finally {
            r.close();
        }
    });

    it("decoded frames match the source frames exactly (no re-encoding)", async () => {
        const out = path.join(dir, "exact.mov");
        await mux(frames.reel.slice(0, 3), out, { width: 216, height: 384, fps: 30 });
        const extracted = path.join(dir, "x%02d.jpg");
        execFileSync("ffmpeg", ["-v", "error", "-i", out, "-c:v", "copy", extracted]);
        expect(fs.readFileSync(path.join(dir, "x01.jpg")).equals(fs.readFileSync(frames.reel[0]))).toBe(true);
    });

    it("rejects frames with the wrong size or a truncated JPEG before writing them", async () => {
        const out = path.join(dir, "bad.mov");
        await expect(mux([frames.reel[0], frames.landscape[0]], out, { width: 216, height: 384, fps: 30 })).rejects.toThrow(/size mismatch/);
        const cut = path.join(dir, "cut.jpg");
        fs.writeFileSync(cut, fs.readFileSync(frames.reel[0]).subarray(0, 500));
        await expect(mux([cut], out, { width: 216, height: 384, fps: 30 })).rejects.toThrow(/truncated/);
    });

    it("the verifier rejects a truncated file and a wrong expectation", async () => {
        const out = path.join(dir, "trunc.mov");
        await mux(frames.reel.slice(0, 5), out, { width: 216, height: 384, fps: 30 });
        const full = fs.readFileSync(out);
        fs.writeFileSync(out, full.subarray(0, full.length - 40));
        const r1 = fileReader(out);
        await expect(inspectMovie(r1)).rejects.toThrow();
        r1.close();

        fs.writeFileSync(out, full);
        const r2 = fileReader(out);
        await expect(verifyMovie(r2, { width: 216, height: 384, frameCount: 6, durationMs: 200, fps: 30 })).rejects.toThrow(/5 frames/);
        r2.close();
    });
});
