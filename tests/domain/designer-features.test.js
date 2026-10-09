// Designer features: row selection, show/hide by column, subfolders, output size, text fit maths.
import { describe, expect, it } from "vitest";
import { parseRowSelection, rowSelected } from "../../src/domain/rows.js";
import { visibilityFor } from "../../src/domain/visibility.js";
import { renderName, splitOutputPath, validatePattern } from "../../src/domain/naming.js";
import { runPreflight } from "../../src/domain/preflight.js";
import { createMapping, mappedCount, setTextMapping, setTextOptions, setVisibilityMapping } from "../../src/domain/mapping.js";
import { alignShift, textFitPlan } from "../../src/ps/textFit.js";

describe("row selection", () => {
    it("parses all, lists, ranges, open ranges and Arabic digits", () => {
        expect(parseRowSelection("")).toEqual({ ok: true, all: true, ranges: [] });
        expect(parseRowSelection(" 2-4, 9 ;12-").ranges).toEqual([[2, 4], [9, 9], [12, Infinity]]);
        expect(parseRowSelection("٢-٤، ٩").ranges).toEqual([[2, 4], [9, 9]]);
        expect(parseRowSelection("3 – 5").ranges).toEqual([[3, 5]]);
    });
    it("rejects nonsense with the offending part", () => {
        expect(parseRowSelection("2-x")).toEqual({ ok: false, error: "2-x" });
        expect(parseRowSelection("5-3")).toEqual({ ok: false, error: "5-3" });
        expect(parseRowSelection("0")).toEqual({ ok: false, error: "0" });
    });
    it("selects by spreadsheet row number", () => {
        const sel = parseRowSelection("2-3, 10-");
        expect([1, 2, 3, 4, 10, 99].filter((r) => rowSelected(sel, r))).toEqual([2, 3, 10, 99]);
    });
});

describe("show/hide from a cell", () => {
    it("hides on no-like words (English and Arabic), shows on anything else", () => {
        for (const v of ["no", "NO", "false", "0", "hide", "off", "لا", "إخفاء"]) expect(visibilityFor(v), v).toBe(false);
        for (const v of ["yes", "1", "NEW", "Sale -20%", "نعم", "جديد"]) expect(visibilityFor(v), v).toBe(true);
    });
    it("empty cells follow the rule (hide by default)", () => {
        expect(visibilityFor("")).toBe(false);
        expect(visibilityFor("  ", "show")).toBe(true);
        expect(visibilityFor(null, "keep")).toBeNull();
    });
});

describe("subfolders in file names", () => {
    const row = (values, index = 0) => ({ index, sourceRow: index + 2, values });
    it("a / in the pattern makes folders; a / in data does not", () => {
        expect(renderName("{Category}/{row}_{Name}", row({ Category: "Shoes", Name: "Red/Blue" }), { total: 20 })).toBe("Shoes/01_Red_Blue");
        expect(renderName("{Category}/{Color}/{Name}", row({ Category: "Bags", Color: "", Name: "Tote" }), { total: 1 })).toBe("Bags/Tote");
        expect(renderName("a/b/c/d/{Name}", row({ Name: "x" }), { total: 1 })).toBe("a/b/c/x"); // depth capped at 3
        expect(renderName("{Category}/{Missing}", row({ Category: "C" }), { total: 1 })).toBe("C/design_1");
        expect(validatePattern("{Category}/{row}", [{ key: "Category", label: "Category" }])).toEqual([]);
        expect(splitOutputPath("A/B/name")).toEqual({ folders: ["A", "B"], name: "name" });
    });
});

describe("text fit maths", () => {
    const box = { left: 100, top: 0, right: 500, bottom: 50 };
    it("only shrinks text that got wider than its box, never below 30%", () => {
        expect(textFitPlan(box, { left: 100, right: 450 })).toBeNull();
        expect(textFitPlan(box, { left: 100, right: 900 })).toEqual({ pct: 50, align: "left" });
        expect(textFitPlan(box, { left: -300, right: 500 }).align).toBe("right");
        expect(textFitPlan(box, { left: -100, right: 700 }).align).toBe("center");
        expect(textFitPlan(box, { left: 100, right: 100 + 4000 }).pct).toBe(30);
    });
    it("re-aligns to the box edge the text was aligned to", () => {
        expect(alignShift(box, { left: 300, right: 700 }, "left")).toBe(-200);
        expect(alignShift(box, { left: 50, right: 450 }, "right")).toBe(50);
        expect(alignShift(box, { left: 150, right: 550 }, "center")).toBe(-50);
    });
});

describe("preflight with designer options", () => {
    const layers = [
        { id: 1, name: "Name", kind: "text", path: ["Name"] },
        { id: 2, name: "Badge", kind: "group", path: ["Badge"] }
    ];
    const headers = ["Name", "Badge", "Category"].map((k) => ({ key: k, label: k }));
    const values = [
        { Name: "A", Badge: "NEW", Category: "Shoes" },
        { Name: "B", Badge: "", Category: "Bags" },
        { Name: "C", Badge: "no", Category: "Shoes" },
        { Name: "D", Badge: "yes", Category: "" }
    ];
    const table = { headers, issues: [], rows: values.map((v, i) => ({ index: i, sourceRow: i + 2, values: v, isEmpty: false })) };
    let mapping = setTextMapping(createMapping(), 1, "Name");
    mapping = setVisibilityMapping(mapping, 2, "Badge");
    const plan = (extra = {}) =>
        runPreflight({ table, layers, mapping, output: { name: "o", existingFileNames: [] }, formats: ["jpg"], namePattern: "{Category}/{row}_{Name}", pricing: { unitPrice: 1 }, balance: null, templateSize: { width: 1000, height: 500 }, ...extra });

    it("resolves show/hide per row and counts the rule as mapped", () => {
        expect(mappedCount(mapping)).toBe(2);
        expect(plan().items.map((i) => i.visibility[0].visible)).toEqual([true, false, false, true]);
        expect(plan().items.map((i) => i.baseName)).toEqual(["Shoes/1_A", "Bags/2_B", "Shoes/3_C", "4_D"]);
    });
    it("generates only the selected rows and says so; charges only those", () => {
        const p = plan({ rowSelection: "3-4" });
        expect(p.items.map((i) => i.sourceRow)).toEqual([3, 4]);
        expect(p.cost).toBe(2);
        expect(p.warnings.find((w) => w.code === "rows_selected").message).toMatch(/2 of 4 rows/);
        expect(p.items.map((i) => i.baseName)).toEqual(["Bags/2_B", "Shoes/3_C"]); // numbering stays the sheet's
    });
    it("blocks a bad or empty selection", () => {
        expect(plan({ rowSelection: "2-a" }).blocking.map((b) => b.code)).toEqual(["bad_rows"]);
        expect(plan({ rowSelection: "50-60" }).blocking.map((b) => b.code)).toEqual(["no_rows_selected"]);
    });
    it("computes the output size from a width, keeps the aspect, warns on upscaling, blocks nonsense", () => {
        expect(plan({ outputWidth: 500 }).outputSize).toEqual({ width: 500, height: 250 });
        expect(plan({ outputWidth: 2000 }).warnings.map((w) => w.code)).toContain("upscale");
        expect(plan({ outputWidth: 5 }).blocking.map((b) => b.code)).toEqual(["bad_size"]);
        expect(plan().outputSize).toBeNull();
    });
    it("blocks show/hide rules whose column or layer disappeared", () => {
        const bad = setVisibilityMapping(mapping, 99, "Nope");
        const codes = runPreflight({ table, layers, mapping: bad, output: { name: "o", existingFileNames: [] }, formats: ["jpg"], namePattern: "{row}", pricing: { unitPrice: 1 } }).blocking.map((b) => b.code);
        expect(codes).toEqual(["layer_missing", "column_missing"]);
    });
    it("passes the shrink-to-fit option to the text item", () => {
        const m = setTextOptions(mapping, 1, { shrinkToFit: true });
        const p = runPreflight({ table, layers, mapping: m, output: { name: "o", existingFileNames: [] }, formats: ["jpg"], namePattern: "{row}", pricing: { unitPrice: 1 } });
        expect(p.items[0].text[0]).toEqual({ layerId: 1, value: "A", shrink: true });
        // the option survives changing the column
        expect(setTextMapping(m, 1, "Category").text[1].shrinkToFit).toBe(true);
    });
});
