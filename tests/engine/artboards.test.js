// Feature 5: several sizes per row from artboards. The template is a real PSD
// with three artboards (Post, Story, Banner), read into the SIMULATED host.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { createFakeHost, FakeFolder } from "../fakes/fakePhotoshop.js";
import { createPixelStore, templateFromPsd } from "../fakes/psdTemplate.js";
import { createPhotoshopPort } from "../../src/ps/port.js";
import { runDesignJob, ITEM } from "../../src/engine/designJob.js";
import { runProofJob } from "../../src/engine/proofJob.js";
import { runPreflight } from "../../src/domain/preflight.js";
import { autoMap, createMapping } from "../../src/domain/mapping.js";
import { artboardSize, counterpartMaps, leadLayers } from "../../src/domain/artboards.js";
import { jpegInfo } from "../../src/domain/pdf.js";

const PSD_BYTES = new Uint8Array(fs.readFileSync("test-artifacts/fixtures/templates/social-sizes-artboards.psd"));
const PATH = "/fake/templates/social.psd";
const table = (names) => ({ headers: [{ key: "Name", label: "Name" }, { key: "Price", label: "Price" }], issues: [], rows: names.map((n, i) => ({ index: i, sourceRow: i + 2, values: { Name: n, Price: `${(i + 1) * 100}` }, isEmpty: false })) });

async function setup() {
    const store = createPixelStore();
    const host = createFakeHost({ loadTemplate: async () => templateFromPsd(PSD_BYTES, store, "social.psd") });
    const port = createPhotoshopPort(host);
    const template = { entry: { nativePath: PATH, name: "social.psd" } };
    const info = await port.inspectTemplate(template);
    return { host, port, template, info };
}
const plan = (info, names, extra = {}) => {
    const lead = leadLayers(info.layers, info.artboards);
    const mapping = autoMap(createMapping(), table(names).headers, lead);
    return runPreflight({ table: table(names), layers: info.layers, mapping, output: { name: "o", existingFileNames: [] }, formats: ["jpg"], namePattern: "{Name}", pricing: { unitPrice: 1 }, artboards: info.artboards, ...extra });
};

describe("artboards in the template", () => {
    it("are found with their size, and the Map step shows only the first one", async () => {
        const { info } = await setup();
        expect(info.artboards.map((a) => [a.name, artboardSize(a)])).toEqual([
            ["Post", { width: 1080, height: 1080 }],
            ["Story", { width: 1080, height: 1920 }],
            ["Banner", { width: 1200, height: 628 }]
        ]);
        const lead = leadLayers(info.layers, info.artboards);
        expect(lead.map((l) => l.name).sort()).toEqual(["Background", "Name", "Photo", "Price", "Text"]);
        const maps = counterpartMaps(info.layers, info.artboards);
        const name = lead.find((l) => l.name === "Name");
        const ids = info.artboards.map((a) => maps.get(a.id).get(name.id));
        expect(new Set(ids).size).toBe(3); // a different "Name" layer in each artboard
    });
});

describe("preflight with artboards", () => {
    it("makes one design per row and artboard, names them and counts each as an output", async () => {
        const { info } = await setup();
        const p = plan(info, ["Aurora", "Pulse"]);
        expect(p.ok).toBe(true);
        expect(p.items.map((i) => i.baseName)).toEqual(["Aurora_Post", "Aurora_Story", "Aurora_Banner", "Pulse_Post", "Pulse_Story", "Pulse_Banner"]);
        expect(p.units).toBe(6);
        expect(p.cost).toBe(6);
        expect(p.items[2].artboard).toMatchObject({ name: "Banner", rect: { left: 2360, right: 3560 } });
        expect(p.items[2].text.map((x) => x.value)).toEqual(["Aurora"]); // Banner has no Price layer
        expect(p.warnings.find((w) => w.code === "artboard_missing_layers").message).toMatch(/"Banner" has no layer like "Price"/);
        expect(p.proofItems.map((x) => [x.baseName, x.text.length])).toEqual([["Aurora", 5], ["Pulse", 5]]);
    });
    it("{artboard} in the file name, a subset of sizes, and no output width", async () => {
        const { info } = await setup();
        expect(plan(info, ["A"], { namePattern: "{artboard}/{Name}" }).items.map((i) => i.baseName)).toEqual(["Post/A", "Story/A", "Banner/A"]);
        expect(plan(info, ["A"], { artboards: info.artboards.slice(1, 2) }).items.map((i) => i.baseName)).toEqual(["A_Story"]);
        expect(plan(info, ["A"], { outputWidth: 540 }).blocking.map((b) => b.code)).toContain("size_with_artboards");
    });
});

describe("generating with artboards (SIMULATED host)", () => {
    it("exports each design cropped to its artboard; billing per design; the template is untouched", async () => {
        const { host, port, template, info } = await setup();
        const p = plan(info, ["Aurora", "Pulse"]);
        const out = new FakeFolder("out");
        const reports = [];
        const source = host.photoshop.app.documents[0];
        const before = source.serialize();
        const r = await runDesignJob({ port, billing: { startJob: async ({ itemKeys }) => (reports.push(itemKeys.length), { jobId: "j" }), reportItem: async (x) => reports.push(x.status), finishJob: async () => ({}) }, template, templateLayers: info.layers, plan: p, folders: {}, output: { entry: out } });
        expect(r.items.every((i) => i.status === ITEM.succeeded)).toBe(true);
        expect(reports[0]).toBe(6);
        const size = (n) => {
            const j = jpegInfo(out.files.get(n).bytes);
            return [j.width, j.height];
        };
        expect([size("Aurora_Post.jpg"), size("Aurora_Story.jpg"), size("Aurora_Banner.jpg"), size("Pulse_Post.jpg")]).toEqual([[1080, 1080], [1080, 1920], [1200, 628], [1080, 1080]]);
        expect(host.env.calls.filter((c) => c.op === "crop")).toHaveLength(6);
        expect(source.serialize()).toBe(before);
        expect(source.width).toBe(3560);
    });
    it("the approval sheet shows each row once with all sizes (no crop)", async () => {
        const { host, port, template, info } = await setup();
        const p = plan(info, ["Aurora", "Pulse"]);
        const out = new FakeFolder("out");
        const r = await runProofJob({ port, template, templateLayers: info.layers, plan: p, folders: {}, output: { entry: out }, proof: { perPage: 4, saveImages: true, fileName: "A.pdf", folderName: "P", templateSize: { width: 3560, height: 1920 } } });
        expect(r.items).toHaveLength(2);
        expect(r.proof.designs).toBe(2);
        expect(host.env.calls.filter((c) => c.op === "crop")).toHaveLength(0);
    });
});
