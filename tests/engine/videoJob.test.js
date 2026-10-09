import { describe, expect, it } from "vitest";
import { createFakeHost, FakeFolder, readFakeJpeg } from "../fakes/fakePhotoshop.js";
import { createPhotoshopPort } from "../../src/ps/port.js";
import { runVideoJob } from "../../src/engine/videoJob.js";
import { ITEM, JOB } from "../../src/engine/designJob.js";
import { runVideoPreflight } from "../../src/domain/video/preflight.js";
import { createMapping, setImageMapping, setTextMapping } from "../../src/domain/mapping.js";
import { buildFolderIndex } from "../../src/domain/imageFiles.js";
import { inspectMovie } from "../../src/media/inspect.js";

const TEMPLATE_PATH = "/fake/templates/reel.psd";
// 2160x3840 (9:16), rendered at 1080x1920.
const templateSpec = {
    title: "reel.psd",
    width: 2160,
    height: 3840,
    layers: [
        { name: "Title", kind: "text", text: "Title", bounds: { left: 200, top: 400, right: 1960, bottom: 800 } },
        { name: "Photo", kind: "smartObject", opacity: 50, bounds: { left: 400, top: 1200, right: 1760, bottom: 2560 } },
        { name: "Background", kind: "pixel", bounds: { left: 0, top: 0, right: 2160, bottom: 3840 } }
    ]
};

function billing() {
    const log = [];
    return {
        log,
        async startJob(r) {
            log.push({ op: "start", ...r });
            return { jobId: "vjob" };
        },
        async reportItem(r) {
            log.push({ op: "report", itemKey: r.itemKey, status: r.status, evidence: r.evidence });
        },
        async finishJob(r) {
            log.push({ op: "finish", status: r.status });
            return {};
        }
    };
}

async function setup({ rows = [{ Title: "Laptop", Photo: "laptop.jpg" }, { Title: "Mouse", Photo: "mouse.png" }], timeline = {}, template = templateSpec } = {}) {
    const host = createFakeHost({ templates: { [TEMPLATE_PATH]: template } });
    const port = createPhotoshopPort(host);
    const tmpl = { entry: { nativePath: TEMPLATE_PATH } };
    const inspected = await port.inspectTemplate(tmpl);
    const id = (n) => inspected.layers.find((l) => l.name === n).id;
    const products = new FakeFolder("products", { "laptop.jpg": { image: { width: 800, height: 800 } }, "mouse.png": { image: { width: 400, height: 800 } } });
    let mapping = setTextMapping(createMapping(), id("Title"), "Title");
    mapping = setImageMapping(mapping, id("Photo"), { column: "Photo", folderKey: "p", fit: "fit" });
    const headers = ["Title", "Photo"].map((k) => ({ key: k, label: k }));
    const out = new FakeFolder("out");
    const plan = runVideoPreflight({
        table: { headers, issues: [], rows: rows.map((values, index) => ({ index, sourceRow: index + 2, values, isEmpty: false })) },
        layers: inspected.layers,
        template: { width: inspected.width, height: inspected.height },
        mapping,
        folders: { p: { name: "products", index: buildFolderIndex([...products.files.keys()]) } },
        output: { name: "out", existingFileNames: [] },
        namePattern: "{Title}",
        pricing: { unitPrice: 1 },
        balance: null,
        timelineSpec: {
            format: "reel",
            fps: 24,
            durationMs: 2000,
            tracks: [
                { layerId: id("Title"), preset: "fadeIn", startMs: 0, lengthMs: 1000, easing: "linear" },
                { layerId: id("Photo"), preset: "slideUp", startMs: 500, lengthMs: 1000, easing: "linear", distance: 0.1 }
            ],
            ...timeline
        }
    });
    const source = host.photoshop.app.documents.find((d) => d.path === TEMPLATE_PATH);
    return { host, port, tmpl, inspected, plan, products, out, source, before: source.serialize(), id };
}

const run = (s, b, extra = {}) =>
    runVideoJob({ port: s.port, billing: b, template: s.tmpl, templateLayers: s.inspected.layers, plan: s.plan, folders: { p: { name: "products", entry: s.products } }, output: { entry: s.out }, ...extra });

const movieReader = (file) => ({ size: file.bytes.length, read: async (pos, len) => file.bytes.subarray(pos, pos + len) });

describe("runVideoPreflight", () => {
    it("plans one video per record and prices it server-style", () => {
        return setup().then((s) => {
            expect(s.plan.ok).toBe(true);
            expect(s.plan.timeline).toMatchObject({ width: 1080, height: 1920, fps: 24, frameCount: 48 });
            expect(s.plan.items.map((i) => i.baseName)).toEqual(["Laptop", "Mouse"]);
            expect(s.plan.cost).toBe(2); // 2 videos x ceil(2 s / 5 s) x 1
        });
    });
    it("blocks a template whose aspect ratio doesn't match the format", async () => {
        const s = await setup({ timeline: { format: "square" } });
        expect(s.plan.ok).toBe(false);
        expect(s.plan.blocking[0].code).toBe("aspect_mismatch");
    });
    it("blocks invalid timelines", async () => {
        const s = await setup({ timeline: { fps: 60 } });
        expect(s.plan.blocking.map((b) => b.code)).toContain("bad_fps");
    });
});

describe("runVideoJob", () => {
    it("renders, muxes and verifies one MOV per record without touching the template", async () => {
        const s = await setup();
        const b = billing();
        const result = await run(s, b);

        expect(result.status).toBe(JOB.completed);
        expect([...s.out.files.keys()].sort()).toEqual(["Laptop.mov", "Mouse.mov"]);
        const info = await inspectMovie(movieReader(s.out.files.get("Laptop.mov")));
        expect(info).toMatchObject({ codec: "jpeg", width: 1080, height: 1920, frameCount: 48, durationMs: 2000, fps: 24 });

        // Frame content: decode the document state each frame captured.
        const frame = async (n) => {
            const sm = info.samples[n];
            return readFakeJpeg(s.out.files.get("Laptop.mov").bytes.subarray(sm.offset, sm.offset + sm.size));
        };
        const f0 = await frame(0);
        const f12 = await frame(12); // t = 0.5 s
        const f18 = await frame(18); // t = 0.75 s: Photo slide 25% done
        const f36 = await frame(36); // t = 1.5 s: both animations finished
        expect(f0[0]).toMatchObject({ text: "Laptop", opacity: 0 });
        expect(f12[0].opacity).toBe(50);
        expect(f36[0].opacity).toBe(100);
        // Photo: designed opacity 50 is respected; slides up 10% of 1920 px = 192 px over 1 s from t = 0.5 s.
        // While fully transparent (t < 0.5 s) it is not moved at all.
        expect(f0[1].opacity).toBe(0);
        expect(f12[1].opacity).toBe(0);
        expect(f18[1].opacity).toBe(12.5);
        expect(f36[1].opacity).toBe(50);
        expect(f18[1].bounds.top - f36[1].bounds.top).toBeCloseTo(144, 5);

        // Rendering happened at the output size, on a duplicate; template untouched; temp frames removed.
        expect(s.host.env.calls.find((c) => c.op === "resizeImage")).toMatchObject({ width: 1080, height: 1920 });
        expect(s.source.serialize()).toBe(s.before);
        expect(s.host.env.calls.filter((c) => c.op === "save")).toEqual([]);
        expect([...(s.host.env.tempRoot.folders || new Map()).values()]).toEqual([]);

        // Billing: items carry the spec the server prices; evidence has verified frames/duration.
        expect(b.log[0].items[0]).toEqual({ key: "row-2", duration_ms: 2000, width: 1080, height: 1920 });
        expect(b.log[1]).toMatchObject({ status: "succeeded", evidence: { files: [{ name: "Laptop.mov", frames: 48, durationMs: 2000 }] } });
    });

    it("fails only the affected video when a frame can't be exported, and leaves no partial MOV", async () => {
        const s = await setup();
        s.host.env.failJpgAt = 10; // first video, frame 10
        const b = billing();
        const result = await run(s, b);
        expect(result.items.map((i) => i.status)).toEqual([ITEM.failed, ITEM.succeeded]);
        expect(result.items[0].error).toMatchObject({ step: "video", message: expect.stringMatching(/could not save/) });
        expect([...s.out.files.keys()]).toEqual(["Mouse.mov"]);
        expect(b.log.filter((l) => l.op === "report").map((l) => l.status)).toEqual(["failed", "succeeded"]);
    });

    it("rejects frames of the wrong size instead of producing a broken video", async () => {
        const s = await setup({ rows: [{ Title: "A", Photo: "laptop.jpg" }] });
        s.host.env.wrongFrameSize = true;
        const result = await run(s, billing());
        expect(result.items[0]).toMatchObject({ status: ITEM.failed, error: { message: expect.stringMatching(/expected 1080x1920/) } });
        expect(s.out.files.size).toBe(0);
    });

    it("cancels between frames: the video in progress and the rest are cancelled and not charged", async () => {
        const s = await setup();
        const b = billing();
        const signal = { cancelled: false };
        const result = await run(s, b, {
            signal,
            onEvent: (e) => {
                if (e.type === "frame" && e.frame === 20) signal.cancelled = true;
            }
        });
        expect(result.status).toBe(JOB.cancelled);
        expect(result.items.map((i) => i.status)).toEqual([ITEM.cancelled, ITEM.cancelled]);
        expect(b.log.filter((l) => l.op === "report")).toEqual([]);
        expect(b.log.at(-1)).toEqual({ op: "finish", status: "cancelled" });
        expect(s.out.files.size).toBe(0);
    });

    it("can keep the JPEG frame sequence next to the video", async () => {
        const s = await setup({ rows: [{ Title: "A", Photo: "laptop.jpg" }] });
        await run(s, billing(), { options: { keepFrames: true } });
        const frames = s.out.folders.get("A_frames");
        expect(frames.files.size).toBe(48);
        expect([...frames.files.keys()][0]).toBe("frame_01.jpg");
        expect(s.out.files.has("A.mov")).toBe(true);
    });
});
