import { describe, expect, it } from "vitest";
import { dedupeNames, renderName, sanitizeFileName, validatePattern } from "../../src/domain/naming.js";
import { buildFolderIndex, resolveImage } from "../../src/domain/imageFiles.js";
import { autoMap, createMapping, pruneMapping, setImageMapping, setTextMapping } from "../../src/domain/mapping.js";
import { sampleLayers } from "../helpers/fixtures.js";

const row = (index, values) => ({ index, sourceRow: index + 2, values });

describe("naming", () => {
    it("pads row numbers to the job size", () => {
        expect(renderName("{row}", row(4, {}), { total: 120 })).toBe("005");
    });
    it("substitutes columns and sanitizes illegal characters", () => {
        expect(renderName("{row}_{Name}", row(0, { Name: 'A/B: "C"?' }), { total: 9 })).toBe("1_A_B_ _C__");
    });
    it("keeps Arabic and strips trailing dots", () => {
        expect(sanitizeFileName("من نحن...")).toBe("من نحن");
    });
    it("avoids Windows reserved names and empty names", () => {
        expect(sanitizeFileName("CON")).toBe("_CON");
        expect(renderName("{Name}", row(2, { Name: "" }), { total: 5 })).toBe("design_3");
    });
    it("flags unknown tokens", () => {
        expect(validatePattern("{row}-{Nmae}", [{ key: "Name", label: "Name" }])).toEqual(["Nmae"]);
    });
    it("dedupes case-insensitively against each other and existing files", () => {
        const out = dedupeNames(["Laptop", "laptop", "Mouse"], ["Mouse.jpg"], ["jpg", "png"]);
        expect(out).toEqual(["Laptop", "laptop (2)", "Mouse (2)"]);
    });
    it("reproduces the legacy collision case: 16 rows, 2 values -> 16 unique names", () => {
        const bases = Array.from({ length: 16 }, (_, i) => (i < 10 ? "design_الرئيسية" : "design_من نحن"));
        expect(new Set(dedupeNames(bases, [], ["jpg"])).size).toBe(16);
    });
});

describe("image resolution", () => {
    const index = buildFolderIndex(["Laptop.JPG", "mouse.png", "mouse.jpg", "notes.txt", "Desk Lamp.webp"]);
    it("matches exactly, then case-insensitively", () => {
        expect(resolveImage(index, "Laptop.JPG").file).toBe("Laptop.JPG");
        expect(resolveImage(index, "laptop.jpg").file).toBe("Laptop.JPG");
        expect(resolveImage(index, "laptop.jpg", { ignoreCase: false }).reason).toBe("not_found");
    });
    it("adds an extension and reports ambiguity", () => {
        const r = resolveImage(index, "mouse");
        expect(r.file).toBe("mouse.jpg");
        expect(r.ambiguous).toEqual(["mouse.jpg", "mouse.png"]);
        expect(resolveImage(index, "Desk Lamp").file).toBe("Desk Lamp.webp");
    });
    it("rejects paths and non-images", () => {
        expect(resolveImage(index, "../secret.jpg").reason).toBe("path_not_allowed");
        expect(resolveImage(index, "notes.txt").reason).toBe("unsupported_type");
        expect(resolveImage(index, "  ").reason).toBe("empty");
    });
});

describe("mapping", () => {
    const layers = sampleLayers();
    const headers = [{ key: "Name", label: "Name" }, { key: "Price", label: "price" }, { key: "Photo", label: "Photo" }];
    it("auto-maps by normalized name, including duplicate-named layers", () => {
        const m = autoMap(createMapping(), headers, layers);
        expect(Object.keys(m.text).sort()).toEqual(["3", "4", "6"]);
        expect(m.images[5]).toMatchObject({ column: "Photo", fit: "fit", ignoreCase: true });
    });
    it("lets one column feed several layers and removes immutably", () => {
        let m = setTextMapping(createMapping(), 3, "Name");
        m = setTextMapping(m, 6, "Name");
        const removed = setTextMapping(m, 3, null);
        expect(Object.keys(m.text)).toEqual(["3", "6"]);
        expect(Object.keys(removed.text)).toEqual(["6"]);
    });
    it("prunes rules whose column or layer disappeared", () => {
        let m = setTextMapping(createMapping(), 3, "Name");
        m = setImageMapping(m, 99, { column: "Photo" });
        m = setTextMapping(m, 4, "Gone");
        expect(pruneMapping(m, headers, layers)).toEqual({ text: { 3: m.text[3] }, images: {} });
    });
});
