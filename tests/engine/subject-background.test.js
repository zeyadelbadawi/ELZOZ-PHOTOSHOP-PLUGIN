// Features 7 + 12: remove background and smart crop on the subject.
// Geometry is pure; the Photoshop calls run on the behavioural fake host
// (SIMULATED: Select Subject / Remove Background results are scripted there).
import { describe, expect, it } from "vitest";
import { subjectShift, usableSubject } from "../../src/domain/subjectCrop.js";
import { createFakeHost, FakeFolder, readFakeJpeg } from "../fakes/fakePhotoshop.js";
import { createPhotoshopPort } from "../../src/ps/port.js";
import { runDesignJob, ITEM } from "../../src/engine/designJob.js";
import { runPreflight } from "../../src/domain/preflight.js";
import { createMapping, setImageMapping } from "../../src/domain/mapping.js";

describe("subject geometry", () => {
    const frame = { left: 100, top: 100, right: 500, bottom: 500 };
    it("centres the subject without uncovering the frame", () => {
        // An 800 × 400 photo filling a 400 × 400 frame: it can move 400 px sideways at most.
        const image = { left: -100, top: 100, right: 700, bottom: 500 };
        const subject = { left: 360, top: 180, right: 560, bottom: 420 }; // right of centre
        expect(subjectShift(frame, image, subject)).toEqual({ dx: -160, dy: 0, keptTop: false }); // subject centre 460 → frame centre 300
        const farRight = { left: 600, top: 200, right: 700, bottom: 300 };
        expect(subjectShift(frame, image, farRight).dx).toBe(-200); // clamped: the image's right edge stays at the frame's
    });
    it("keeps the top of a subject taller than the frame", () => {
        const image = { left: 100, top: -300, right: 500, bottom: 900 };
        const subject = { left: 200, top: -250, right: 400, bottom: 850 };
        const r = subjectShift(frame, image, subject);
        expect(r.keptTop).toBe(true);
        expect(r.dy).toBe(370); // subject top lands 5% below the frame top: -250 + 370 = 120
    });
    it("ignores empty or whole-image selections", () => {
        const image = { left: 0, top: 0, right: 100, bottom: 100 };
        expect(usableSubject(null, image)).toBe(false);
        expect(usableSubject({ left: 10, top: 10, right: 11, bottom: 50 }, image)).toBe(false);
        expect(usableSubject({ left: 0, top: 0, right: 100, bottom: 100 }, image)).toBe(false);
        expect(usableSubject({ left: 20, top: 10, right: 80, bottom: 90 }, image)).toBe(true);
    });
});

const PATH = "/fake/templates/photo.psd";
const spec = {
    title: "photo.psd",
    width: 600,
    height: 600,
    layers: [
        { name: "Photo", kind: "smartObject", content: "placeholder.png", bounds: { left: 100, top: 100, right: 500, bottom: 500 } },
        { name: "Background", kind: "pixel", bounds: { left: 0, top: 0, right: 600, bottom: 600 } }
    ]
};
const table = (files) => ({ headers: [{ key: "Photo" }], issues: [], rows: files.map((f, i) => ({ index: i, sourceRow: i + 2, values: { Photo: f }, isEmpty: false })) });
const billing = () => {
    const reports = [];
    return { reports, startJob: async () => ({ jobId: "j" }), reportItem: async (r) => reports.push(r.status), finishJob: async () => ({}) };
};

async function run(files, rule, hostCfg = {}) {
    const host = createFakeHost({ templates: { [PATH]: spec }, ...hostCfg });
    const port = createPhotoshopPort(host);
    const template = { entry: { nativePath: PATH, name: "photo.psd" } };
    const info = await port.inspectTemplate(template);
    const id = info.layers.find((l) => l.name === "Photo").id;
    const folder = new FakeFolder("imgs", { "wide.jpg": { image: { width: 800, height: 400 } }, "plain.jpg": { image: { width: 800, height: 400 } } });
    const m = setImageMapping(createMapping(), id, { column: "Photo", folderKey: "f", ...rule });
    const plan = runPreflight({ table: table(files), layers: info.layers, mapping: m, folders: { f: { name: "imgs", index: { count: 2, ...(await import("../../src/domain/imageFiles.js")).buildFolderIndex(["wide.jpg", "plain.jpg"]) } } }, output: { name: "o", existingFileNames: [] }, formats: ["jpg"], namePattern: "{row}", pricing: { unitPrice: 1 } });
    const out = new FakeFolder("out");
    const source = host.photoshop.app.documents[0];
    const before = source.serialize();
    const b = billing();
    const result = await runDesignJob({ port, billing: b, template, templateLayers: info.layers, plan, folders: { f: { name: "imgs", entry: folder } }, output: { entry: out } });
    const photo = (n) => readFakeJpeg(out.files.get(n).bytes).find((l) => l.name === "Photo");
    return { host, result, photo, b, unchanged: source.serialize() === before };
}

describe("smart crop on the subject (SIMULATED host)", () => {
    it("fills the frame, then moves the photo so the subject is in it", async () => {
        const { result, photo, unchanged } = await run(["wide.jpg"], { fit: "subject" }, { subjects: { "wide.jpg": { l: 0.7, t: 0.2, r: 0.95, b: 0.8 } } });
        expect(result.items[0].status).toBe(ITEM.succeeded);
        // 800 × 400 covers the 400 × 400 frame at x = -100..700; the subject (460..660) wants -260,
        // clamped to -200 so the frame stays covered: the subject ends at 260..460, inside the frame.
        expect(photo("1.jpg").bounds).toMatchObject({ left: -300, right: 500, top: 100, bottom: 500 });
        expect(result.items[0].notes).toBeUndefined();
        expect(unchanged).toBe(true);
    });
    it("keeps the photo centred, with a note, when there's no clear subject", async () => {
        const { result, photo } = await run(["plain.jpg"], { fit: "subject" }, { subjects: { "plain.jpg": null } });
        expect(photo("1.jpg").bounds).toMatchObject({ left: -100, right: 700 });
        expect(result.items[0].notes[0]).toMatch(/no clear subject found; the photo is centred/);
    });
});

describe("remove background (SIMULATED host)", () => {
    it("masks the background with Remove Background; the next row starts clean", async () => {
        const { host, result, photo } = await run(["wide.jpg", "plain.jpg"], { fit: "fit", removeBg: true }, { subjects: { "plain.jpg": null } });
        expect(result.items.map((i) => i.status)).toEqual([ITEM.succeeded, ITEM.succeeded]);
        expect(photo("1.jpg").mask).toBe("subject");
        expect(photo("2.jpg").mask).toBeNull(); // no subject → kept as is, with a note
        expect(result.items[1].notes[0]).toMatch(/couldn't find the subject.*used with its background/);
        expect(host.env.calls.filter((c) => c._obj === "removeBackground")).toHaveLength(2);
    });
    it("falls back to Select Subject + a layer mask when the quick action isn't available", async () => {
        const { host, photo } = await run(["wide.jpg"], { removeBg: true }, { removeBackgroundUnavailable: true });
        expect(photo("1.jpg").mask).toBe("subject");
        const ops = host.env.calls.filter((c) => c.op === "batchPlay").map((c) => c._obj);
        expect(ops).toEqual(expect.arrayContaining(["removeBackground", "autoCutout", "make"]));
    });
    it("can skip the row instead (not charged)", async () => {
        const { result, b } = await run(["plain.jpg", "wide.jpg"], { removeBg: true, bgFail: "skip" }, { subjects: { "plain.jpg": null } });
        expect(result.items.map((i) => i.status)).toEqual([ITEM.failed, ITEM.succeeded]);
        expect(result.items[0].error).toMatchObject({ step: "background" });
        expect(b.reports).toEqual(["failed", "succeeded"]);
    });
    it("smart crop and remove background together", async () => {
        const { photo } = await run(["wide.jpg"], { fit: "subject", removeBg: true }, { subjects: { "wide.jpg": { l: 0.7, t: 0.2, r: 0.95, b: 0.8 } } });
        expect(photo("1.jpg")).toMatchObject({ mask: "subject", bounds: { left: -300 } });
    });
});
