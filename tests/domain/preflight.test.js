import { describe, expect, it } from "vitest";
import { runPreflight } from "../../src/domain/preflight.js";
import { createMapping, setImageMapping, setTextMapping } from "../../src/domain/mapping.js";
import { buildFolderIndex } from "../../src/domain/imageFiles.js";
import { sampleLayers } from "../helpers/fixtures.js";

const headers = ["Name", "Price", "Photo"].map((k) => ({ key: k, label: k }));
const mkTable = (rows) => ({
    headers,
    issues: [],
    rows: rows.map((values, index) => ({ index, sourceRow: index + 2, values, isEmpty: Object.values(values).every((v) => !v) }))
});

function base(overrides = {}) {
    let mapping = setTextMapping(createMapping(), 3, "Name");
    mapping = setTextMapping(mapping, 4, "Price");
    mapping = setImageMapping(mapping, 5, { column: "Photo", folderKey: "f1" });
    return {
        table: mkTable([
            { Name: "Laptop", Price: "999", Photo: "laptop" },
            { Name: "Mouse", Price: "25", Photo: "mouse.png" }
        ]),
        layers: sampleLayers(),
        mapping,
        folders: { f1: { name: "products", index: buildFolderIndex(["laptop.jpg", "mouse.png"]) } },
        output: { name: "out", existingFileNames: [] },
        formats: ["jpg", "psd"],
        namePattern: "{row}_{Name}",
        pricing: { unitPrice: 1 },
        balance: 10,
        ...overrides
    };
}

describe("runPreflight", () => {
    it("produces a plan with resolved text, images, names and cost", () => {
        const r = runPreflight(base());
        expect(r.ok).toBe(true);
        expect(r.blocking).toEqual([]);
        expect(r.units).toBe(2);
        expect(r.cost).toBe(2);
        expect(r.items[0]).toMatchObject({
            key: "row-2",
            baseName: "1_Laptop",
            text: [{ layerId: 3, value: "Laptop" }, { layerId: 4, value: "999" }],
            images: [{ layerId: 5, folderKey: "f1", file: "laptop.jpg", fit: "fit" }]
        });
    });

    it("blocks on missing inputs with fix pointers", () => {
        const r = runPreflight(base({ output: null, formats: [] }));
        expect(r.ok).toBe(false);
        expect(r.blocking.map((b) => [b.code, b.fix.step])).toEqual([["no_output", "generate"], ["no_format", "generate"]]);
    });

    it("blocks text mapped to a non-text layer and image mapped to a text layer", () => {
        let m = setTextMapping(createMapping(), 5, "Name");
        m = setImageMapping(m, 3, { column: "Photo", folderKey: "f1" });
        const r = runPreflight(base({ mapping: m }));
        expect(r.blocking.map((b) => b.code)).toEqual(["not_text", "not_image"]);
    });

    it("skips rows with missing images and reports which rows", () => {
        const r = runPreflight(base({ table: mkTable([{ Name: "A", Price: "1", Photo: "nope.jpg" }, { Name: "B", Price: "2", Photo: "mouse.png" }]) }));
        expect(r.ok).toBe(true);
        expect(r.units).toBe(1);
        expect(r.skipped).toEqual([{ index: 0, sourceRow: 2, problems: [expect.objectContaining({ code: "image_not_found" })] }]);
        expect(r.warnings.find((w) => w.code === "image_not_found").rows).toEqual([2]);
    });

    it("applies empty-cell policies", () => {
        let m = setTextMapping(createMapping(), 3, "Name", "skipRow");
        m = setTextMapping(m, 4, "Price", "keepTemplate");
        const r = runPreflight(base({ mapping: m, table: mkTable([{ Name: "", Price: "1" }, { Name: "B", Price: "" }]) }));
        expect(r.units).toBe(1);
        expect(r.items[0].text).toEqual([{ layerId: 3, value: "B" }]);
    });

    it("blocks when every row fails", () => {
        const r = runPreflight(base({ table: mkTable([{ Name: "A", Price: "1", Photo: "x.jpg" }]) }));
        expect(r.blocking.map((b) => b.code)).toEqual(["nothing_to_generate"]);
    });

    it("blocks when credits are insufficient, and is neutral when balance is unknown", () => {
        expect(runPreflight(base({ balance: 1 })).blocking[0].code).toBe("insufficient_credits");
        expect(runPreflight(base({ balance: null })).ok).toBe(true);
    });

    it("never plans to overwrite existing output files", () => {
        const r = runPreflight(base({ output: { name: "out", existingFileNames: ["1_Laptop.psd"] } }));
        expect(r.items[0].baseName).toBe("1_Laptop (2)");
        expect(r.warnings.some((w) => w.code === "names_deduplicated")).toBe(true);
    });

    it("warns when a mapped layer shares its name with another layer", () => {
        const r = runPreflight(base());
        expect(r.warnings.some((w) => w.code === "duplicate_layer_name")).toBe(true);
    });
});
