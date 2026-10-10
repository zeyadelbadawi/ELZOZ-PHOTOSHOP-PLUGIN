// Feature 11: colors from a column (domain, preflight and the real engine on the
// behavioural fake host) and brand kits.
import { describe, expect, it } from "vitest";
import { createFakeHost, FakeFolder, readFakeJpeg } from "../fakes/fakePhotoshop.js";
import { createPhotoshopPort } from "../../src/ps/port.js";
import { runDesignJob, ITEM } from "../../src/engine/designJob.js";
import { runPreflight } from "../../src/domain/preflight.js";
import { createMapping, mappedCount, pruneMapping, setColorMapping, setTextMapping } from "../../src/domain/mapping.js";
import { parseColor, toHex } from "../../src/domain/colors.js";
import { appliedKitId, applyKit, deleteKit, kitFieldsFrom, listKits, saveKit } from "../../src/domain/brandKits.js";
import { applyDerived, derivedKey, newDerived } from "../../src/domain/derived.js";
import { kindNormalizer } from "../../src/ps/layerTree.js";

describe("parseColor", () => {
    it("reads HEX, short HEX, rgb() and color names in English and Arabic", () => {
        expect(parseColor("#E30613")).toEqual({ r: 227, g: 6, b: 19 });
        expect(parseColor("e30613")).toEqual({ r: 227, g: 6, b: 19 });
        expect(parseColor(" #f00 ")).toEqual({ r: 255, g: 0, b: 0 });
        expect(parseColor("rgb(11, 95, 255)")).toEqual({ r: 11, g: 95, b: 255 });
        expect(parseColor("rgba(11 95 255 / 50%)")).toEqual({ r: 11, g: 95, b: 255 });
        expect(parseColor("Red")).toEqual(parseColor("#E30613"));
        expect(parseColor("أحمر")).toEqual(parseColor("#E30613"));
        expect(parseColor("ازرق")).toEqual(parseColor("#0B5FFF"));
        expect(toHex(parseColor("#٠٠٠٠٠٠"))).toBe("#000000");
    });
    it("rejects anything else", () => {
        for (const v of ["", "zzz", "#12345", "rgb(300,0,0)", "#GGGGGG", "blue-ish"]) expect(parseColor(v)).toBeNull();
    });
});

describe("Photoshop reports shape and color fill layers as SOLIDCOLOR", () => {
    it("normalizes them to the 'fill' kind", () => {
        expect(kindNormalizer({ LayerKind: { SOLIDCOLOR: "solidColor" } })("solidColor")).toBe("fill");
    });
});

const layers = [
    { id: 1, name: "Accent", kind: "fill", path: ["Accent"] },
    { id: 2, name: "Name", kind: "text", path: ["Name"] },
    { id: 3, name: "Photo", kind: "smartObject", path: ["Photo"] }
];
const table = (rows) => ({ headers: [{ key: "Name" }, { key: "Color" }], issues: [], rows: rows.map((values, i) => ({ index: i, sourceRow: i + 2, values, isEmpty: false })) });
const plan = (mapping, rows) => runPreflight({ table: table(rows), layers, mapping, output: { name: "o", existingFileNames: [] }, formats: ["jpg"], namePattern: "{row}", pricing: { unitPrice: 1 } });

describe("color rules in preflight", () => {
    it("parses colors per row; empty keeps the template; invalid skips the row by default", () => {
        let m = setTextMapping(createMapping(), 2, "Name");
        m = setColorMapping(m, 1, "Color");
        expect(mappedCount(m)).toBe(2);
        const p = plan(m, [{ Name: "a", Color: "#0B5FFF" }, { Name: "b", Color: "" }, { Name: "c", Color: "zzz" }]);
        expect(p.items.map((i) => i.colors)).toEqual([[{ layerId: 1, rgb: { r: 11, g: 95, b: 255 } }], []]);
        expect(p.skipped).toEqual([expect.objectContaining({ sourceRow: 4 })]);
        expect(p.warnings.find((w) => w.code === "bad_color")).toMatchObject({ rows: [4] });
    });
    it("two layers fed by the same bad cell report the row once", () => {
        let m = setColorMapping(createMapping(), 1, "Color");
        m = setColorMapping(m, 2, "Color");
        const p = plan(m, [{ Name: "a", Color: "zzz" }, { Name: "b", Color: "red" }]);
        expect(p.warnings.find((w) => w.code === "bad_color")).toMatchObject({ rows: [2] });
        expect(p.warnings.find((w) => w.code === "bad_color").message).toContain("in 1 row(s)");
    });
    it("invalidPolicy keepTemplate keeps the row with the template's color and warns", () => {
        const m = setColorMapping(setTextMapping(createMapping(), 2, "Name"), 1, "Color", "keepTemplate");
        const p = plan(m, [{ Name: "c", Color: "zzz" }]);
        expect(p.items[0].colors).toEqual([]);
        expect(p.warnings.find((w) => w.code === "bad_color_kept")).toMatchObject({ rows: [2] });
    });
    it("blocks a color rule on a layer that can't take a color", () => {
        const p = plan(setColorMapping(createMapping(), 3, "Color"), [{ Name: "a", Color: "red" }]);
        expect(p.blocking.map((b) => b.code)).toContain("not_colorable");
    });
    it("prunes color rules with the rest of the mapping", () => {
        const m = setColorMapping(createMapping(), 1, "Color");
        expect(pruneMapping(m, [{ key: "Name" }], layers).colors).toEqual({});
        expect(setColorMapping(m, 1, "").colors).toEqual({});
    });
});

// ---------------------------------------------------------------- engine on the fake host
const PATH = "/fake/templates/offer.psd";
const spec = {
    title: "offer.psd",
    width: 1000,
    height: 500,
    layers: [
        { name: "Accent", kind: "solidColor", fillColor: "rgb(253,185,38)", bounds: { left: 0, top: 400, right: 1000, bottom: 500 } },
        { name: "Name", kind: "text", text: "Product", color: "rgb(20,20,30)", bounds: { left: 100, top: 100, right: 254, bottom: 150 } },
        { name: "Background", kind: "pixel", bounds: { left: 0, top: 0, right: 1000, bottom: 500 } }
    ]
};
const billing = () => ({ startJob: async () => ({ jobId: "j" }), reportItem: async () => {}, finishJob: async () => ({}) });
const layerIn = (file, name) => readFakeJpeg(file.bytes).find((l) => l.name === name);

async function runColors(hostCfg = {}) {
    const host = createFakeHost({ templates: { [PATH]: spec }, ...hostCfg });
    const port = createPhotoshopPort(host);
    const template = { entry: { nativePath: PATH, name: "offer.psd" } };
    const info = await port.inspectTemplate(template);
    const id = (n) => info.layers.find((l) => l.name === n).id;
    expect(info.layers.find((l) => l.name === "Accent").kind).toBe("fill");
    let m = setTextMapping(createMapping(), id("Name"), "Name");
    m = setColorMapping(m, id("Accent"), "Color");
    m = setColorMapping(m, id("Name"), "Color");
    const p = runPreflight({
        table: table([{ Name: "A", Color: "#0B5FFF" }, { Name: "B", Color: "" }, { Name: "C", Color: "red" }]),
        layers: info.layers,
        mapping: m,
        output: { name: "o", existingFileNames: [] },
        formats: ["jpg"],
        namePattern: "{row}",
        pricing: { unitPrice: 1 }
    });
    const out = new FakeFolder("out");
    const source = host.photoshop.app.documents[0];
    const before = source.serialize();
    const result = await runDesignJob({ port, billing: billing(), template, templateLayers: info.layers, plan: p, folders: {}, output: { entry: out } });
    return { host, out, result, source, before };
}

describe("colors on the SIMULATED host", () => {
    it("recolors the fill and the text per row; an empty cell keeps the template's colors; the template is untouched", async () => {
        const { host, out, result, source, before } = await runColors();
        expect(result.items.map((i) => i.status)).toEqual([ITEM.succeeded, ITEM.succeeded, ITEM.succeeded]);
        const accent = ["1.jpg", "2.jpg", "3.jpg"].map((n) => layerIn(out.files.get(n), "Accent").fillColor);
        const name = ["1.jpg", "2.jpg", "3.jpg"].map((n) => layerIn(out.files.get(n), "Name").color);
        expect(accent).toEqual(["rgb(11,95,255)", "rgb(253,185,38)", "rgb(227,6,19)"]);
        expect(name).toEqual(["rgb(11,95,255)", "rgb(20,20,30)", "rgb(227,6,19)"]);
        expect(source.serialize()).toBe(before);
        // Fill layers go through batchPlay (selected first); text uses the DOM characterStyle.
        const calls = host.env.calls.filter((c) => c.op === "batchPlay").map((c) => c._obj);
        expect(calls.filter((c) => c === "set").length).toBe(2);
    });
    it("falls back to batchPlay textStyle when characterStyle isn't available (before 24.1)", async () => {
        const { out, result } = await runColors({ characterStyle: false });
        expect(result.items.every((i) => i.status === ITEM.succeeded)).toBe(true);
        expect(layerIn(out.files.get("1.jpg"), "Name").color).toBe("rgb(11,95,255)");
    });
});

// ---------------------------------------------------------------- brand kits
describe("brand kits", () => {
    const memory = () => {
        const m = new Map();
        return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
    };
    it("saves, replaces by name, lists and deletes kits", () => {
        const s = memory();
        const a = saveKit(s, { name: "Acme", fields: [{ label: "Primary", value: "#E30613" }, { label: "Phone", value: "0100" }, { label: "", value: "x" }] }, 1);
        expect(a.fields).toEqual([{ label: "Primary", value: "#E30613" }, { label: "Phone", value: "0100" }]);
        const again = saveKit(s, { name: "acme", fields: [{ label: "Primary", value: "#000" }] }, 2);
        expect(again.id).toBe(a.id);
        expect(listKits(s)).toHaveLength(1);
        expect(saveKit(s, { name: " ", fields: [] })).toBeNull();
        deleteKit(s, a.id);
        expect(listKits(s)).toEqual([]);
    });
    it("applying a kit adds fixed-value columns and replaces the previous kit's, keeping other smart columns", () => {
        const s = memory();
        const acme = saveKit(s, { name: "Acme", fields: [{ label: "Primary", value: "#E30613" }] });
        const nova = saveKit(s, { name: "Nova", fields: [{ label: "Primary", value: "#0B5FFF" }, { label: "Site", value: "nova.example" }] });
        const discount = { ...newDerived("discount"), label: "Off", oldColumn: "Old", newColumn: "New" };
        let defs = applyKit([discount], acme);
        expect(appliedKitId(defs)).toBe(acme.id);
        defs = applyKit(defs, nova);
        expect(defs.map((d) => d.label)).toEqual(["Off", "Primary", "Site"]);
        expect(kitFieldsFrom(defs)).toEqual([{ label: "Primary", value: "#0B5FFF" }, { label: "Site", value: "nova.example" }]);
        const t = applyDerived({ headers: [{ key: "Old" }, { key: "New" }], issues: [], rows: [{ index: 0, sourceRow: 2, values: { Old: "10", New: "8" }, isEmpty: false }] }, defs);
        expect(t.rows[0].values[derivedKey(defs[1])]).toBe("#0B5FFF");
        expect(applyKit(defs, null).map((d) => d.label)).toEqual(["Off"]);
    });
    it("survives broken storage", () => {
        expect(listKits({ getItem: () => "{not json" })).toEqual([]);
        expect(saveKit({ getItem: () => "[]", setItem: () => { throw new Error("full"); } }, { name: "x", fields: [] })).toBeNull();
    });
});
