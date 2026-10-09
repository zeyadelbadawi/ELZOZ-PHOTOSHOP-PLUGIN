// Designer features through the real engine on the behavioural fake host.
import { describe, expect, it } from "vitest";
import { createFakeHost, FakeFolder, readFakeJpeg } from "../fakes/fakePhotoshop.js";
import { createPhotoshopPort } from "../../src/ps/port.js";
import { runDesignJob, ITEM } from "../../src/engine/designJob.js";
import { runVideoJob } from "../../src/engine/videoJob.js";
import { runPreflight } from "../../src/domain/preflight.js";
import { runVideoPreflight } from "../../src/domain/video/preflight.js";
import { createMapping, setTextMapping, setTextOptions, setVisibilityMapping } from "../../src/domain/mapping.js";

const PATH = "/fake/templates/promo.psd";
const spec = {
    title: "promo.psd",
    width: 1000,
    height: 500,
    layers: [
        { name: "Badge", kind: "group", visible: true, layers: [{ name: "Badge text", kind: "text", text: "NEW", bounds: { left: 800, top: 20, right: 950, bottom: 60 } }] },
        { name: "Name", kind: "text", text: "Product", fontSize: 40, bounds: { left: 100, top: 100, right: 254, bottom: 150 } },
        { name: "Sale", kind: "pixel", visible: false, bounds: { left: 0, top: 400, right: 1000, bottom: 500 } },
        { name: "Background", kind: "pixel", bounds: { left: 0, top: 0, right: 1000, bottom: 500 } }
    ]
};
const billing = () => ({ startJob: async () => ({ jobId: "j" }), reportItem: async () => {}, finishJob: async () => ({}) });

async function setup({ rows, pattern = "{row}", mapper = (m) => m, extra = {}, hostCfg = {}, video = false } = {}) {
    // Video formats need a 16:9 template.
    const tpl = video ? { ...spec, width: 1920, height: 1080 } : spec;
    const host = createFakeHost({ templates: { [PATH]: tpl }, textReflow: true, ...hostCfg });
    const port = createPhotoshopPort(host);
    const template = { entry: { nativePath: PATH, name: "promo.psd" } };
    const info = await port.inspectTemplate(template);
    const id = (n) => info.layers.find((l) => l.name === n).id;
    const mapping = mapper(setTextMapping(createMapping(), id("Name"), "Name"), id);
    const headers = ["Name", "Badge", "Sale", "Category"].map((k) => ({ key: k, label: k }));
    const table = { headers, issues: [], rows: rows.map((values, index) => ({ index, sourceRow: index + 2, values, isEmpty: false })) };
    const base = { table, layers: info.layers, mapping, output: { name: "out", existingFileNames: [] }, namePattern: pattern, pricing: { unitPrice: 1 }, balance: null, ...extra };
    const plan = video
        ? runVideoPreflight({ ...base, template: { width: 1920, height: 1080 }, timelineSpec: { format: "landscape", fps: 24, durationMs: 1000, fadeOutMs: 0, tracks: [] } })
        : runPreflight({ ...base, formats: ["jpg"], templateSize: { width: 1000, height: 500 } });
    expect(plan.blocking).toEqual([]);
    const out = new FakeFolder("out");
    const source = host.photoshop.app.documents[0];
    const before = source.serialize();
    const run = video ? runVideoJob : runDesignJob;
    const result = await run({ port, billing: billing(), template, templateLayers: info.layers, plan, folders: {}, output: { entry: out } });
    return { host, port, out, result, plan, source, before, id };
}

const layersIn = (file) => {
    const d = readFakeJpeg(file.bytes);
    return Array.isArray(d) ? d : d.layers;
};
const find = (layers, name) => {
    for (const l of layers) {
        if (l.name === name) return l;
        if (l.layers) {
            const r = find(l.layers, name);
            if (r) return r;
        }
    }
    return null;
};

describe("show/hide layers from a column (SIMULATED host; visibility not undoable, like Photoshop's default)", () => {
    const rows = [
        { Name: "A", Badge: "NEW", Sale: "yes" },
        { Name: "B", Badge: "", Sale: "" },
        { Name: "C", Badge: "yes", Sale: "no" }
    ];
    const mapper = (m, id) => setVisibilityMapping(setVisibilityMapping(m, id("Badge"), "Badge"), id("Sale"), "Sale", "keep");

    it("each output has exactly the row's visibility, and the template is untouched", async () => {
        const { out, result, source, before } = await setup({ rows, mapper });
        expect(result.items.every((i) => i.status === ITEM.succeeded)).toBe(true);
        const vis = ["1.jpg", "2.jpg", "3.jpg"].map((n) => {
            const ls = layersIn(out.files.get(n));
            return [find(ls, "Badge").visible, find(ls, "Sale").visible];
        });
        // Badge: NEW -> show, empty -> hide (default), yes -> show.
        // Sale (empty = keep the template, which hides it): yes -> show, empty -> as designed (hidden), no -> hide.
        expect(vis).toEqual([[true, true], [false, false], [true, false]]);
        expect(source.serialize()).toBe(before);
    });

    it("mutation: without the explicit restore, row 2 inherits row 1's visibility", async () => {
        const { out } = await setup({
            rows,
            mapper,
            hostCfg: {},
            extra: {}
        });
        // Re-run the same scenario but break reset(): visibility must then leak, proving the test above catches it.
        const host = createFakeHost({ templates: { [PATH]: spec } });
        const port = createPhotoshopPort(host);
        const realOpen = port.openWorkingCopy.bind(port);
        port.openWorkingCopy = async (...a) => {
            const s = await realOpen(...a);
            const doc = s.doc;
            const base = doc.activeHistoryState;
            s.reset = async () => {
                doc.activeHistoryState = base; // history only, no visibility restore
            };
            return s;
        };
        const template = { entry: { nativePath: PATH, name: "promo.psd" } };
        const info = await port.inspectTemplate(template);
        const id = (n) => info.layers.find((l) => l.name === n).id;
        const mapping = mapper(setTextMapping(createMapping(), id("Name"), "Name"), id);
        const headers = ["Name", "Badge", "Sale"].map((k) => ({ key: k, label: k }));
        const table = { headers, issues: [], rows: rows.map((values, index) => ({ index, sourceRow: index + 2, values, isEmpty: false })) };
        const plan = runPreflight({ table, layers: info.layers, mapping, output: { name: "o", existingFileNames: [] }, formats: ["jpg"], namePattern: "{row}", pricing: { unitPrice: 1 } });
        const broken = new FakeFolder("o");
        await runDesignJob({ port, billing: billing(), template, templateLayers: info.layers, plan, folders: {}, output: { entry: broken } });
        const sale = (f, n) => find(layersIn(f.files.get(n)), "Sale").visible;
        expect(sale(out, "2.jpg")).toBe(false); // correct engine
        expect(sale(broken, "2.jpg")).toBe(true); // broken engine leaks row 1's "yes"
    });
});

describe("subfolders from the name pattern", () => {
    it("creates folders per column value and reuses existing ones", async () => {
        const rows = [
            { Name: "A", Category: "Shoes" },
            { Name: "B", Category: "Bags" },
            { Name: "C", Category: "Shoes" }
        ];
        const { out, result } = await setup({ rows, pattern: "{Category}/{row}_{Name}" });
        expect(result.items.map((i) => i.files.map((f) => f.name))).toEqual([["1_A.jpg"], ["2_B.jpg"], ["3_C.jpg"]]);
        expect([...out.folders.keys()].sort()).toEqual(["Bags", "Shoes"]);
        expect([...out.folders.get("Shoes").files.keys()].sort()).toEqual(["1_A.jpg", "3_C.jpg"]);
        expect(out.files.size).toBe(0);
    });
    it("works for videos too", async () => {
        const { out, result } = await setup({ rows: [{ Name: "A", Category: "Reels" }], pattern: "{Category}/{Name}", video: true });
        expect(result.items[0].status).toBe(ITEM.succeeded);
        expect([...out.folders.get("Reels").files.keys()]).toEqual(["A.mov"]);
    });
});

describe("output size", () => {
    it("exports at the chosen width, keeping the aspect ratio; the template is not resized", async () => {
        const { out, source, before } = await setup({ rows: [{ Name: "A" }, { Name: "B" }], extra: { outputWidth: 400 } });
        for (const n of ["1.jpg", "2.jpg"]) {
            const doc = readFakeJpeg(out.files.get(n).bytes);
            const bytes = out.files.get(n).bytes;
            // SOF0 in the fake JPEG carries the document size
            const i = bytes.findIndex((b, k) => b === 0xff && bytes[k + 1] === 0xc0);
            expect([(bytes[i + 7] << 8) | bytes[i + 8], (bytes[i + 5] << 8) | bytes[i + 6]]).toEqual([400, 200]);
            expect(doc).toBeTruthy();
        }
        expect(source.serialize()).toBe(before);
        expect(source.width).toBe(1000);
    });
});

describe("shrink text to fit (SIMULATED text metrics)", () => {
    const box = { left: 100, right: 254 };
    it("long names are scaled down to the template's text box, left edge kept; short names untouched", async () => {
        const rows = [{ Name: "Short" }, { Name: "A longer product name" }, { Name: "An extremely long product name, far too long" }];
        const { out } = await setup({ rows, mapper: (m, id) => setTextOptions(m, id("Name"), { shrinkToFit: true }) });
        const nameBounds = (n) => find(layersIn(out.files.get(n)), "Name").bounds;
        const short = nameBounds("1.jpg");
        const long = nameBounds("2.jpg");
        expect(short.right - short.left).toBeLessThanOrEqual(box.right - box.left + 0.5);
        expect(long.right - long.left).toBeLessThanOrEqual(box.right - box.left + 0.5);
        expect(long.left).toBeCloseTo(box.left, 5);
        // Readability floor: never below 30% of the designed size, even if it still overflows.
        const extreme = nameBounds("3.jpg");
        expect(extreme.bottom - extreme.top).toBeCloseTo(50 * 0.3, 5);
    });
    it("without the option, long names overflow (the option is what fixes it)", async () => {
        const { out } = await setup({ rows: [{ Name: "A much, much longer product name" }] });
        const b = find(layersIn(out.files.get("1.jpg")), "Name").bounds;
        expect(b.right - b.left).toBeGreaterThan(box.right - box.left);
    });
});
