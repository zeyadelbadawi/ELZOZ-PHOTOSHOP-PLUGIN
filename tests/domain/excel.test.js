import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readTable, readWorkbook } from "../../src/domain/excel.js";
import { makeXlsx } from "../helpers/fixtures.js";

const table = (aoa, opts) => readTable(readWorkbook(makeXlsx({ Sheet1: aoa })).workbook, opts);

describe("readTable", () => {
    it("reads headers and rows with spreadsheet row numbers", () => {
        const t = table([["Name", "Price"], ["Laptop", 999], ["Mouse", 25]]);
        expect(t.headers.map((h) => h.key)).toEqual(["Name", "Price"]);
        expect(t.rows).toHaveLength(2);
        expect(t.rows[0]).toMatchObject({ index: 0, sourceRow: 2, values: { Name: "Laptop", Price: "999" } });
        expect(t.issues).toEqual([]);
    });

    it("keeps columns that are empty in the first data row", () => {
        const t = table([["Name", "Note"], ["A", ""], ["B", "has note"]]);
        expect(t.headers.map((h) => h.key)).toEqual(["Name", "Note"]);
        expect(t.rows[0].values.Note).toBe("");
        expect(t.headers[1]).toMatchObject({ filled: 1, empty: 1 });
    });

    it("renames duplicate headers and warns", () => {
        const t = table([["Name", "name", "Name"], ["a", "b", "c"]]);
        expect(t.headers.map((h) => h.key)).toEqual(["Name", "name (2)", "Name (3)"]);
        expect(t.issues.filter((i) => i.code === "duplicate_header")).toHaveLength(2);
    });

    it("names data columns without a header", () => {
        const t = table([["Name", ""], ["a", "x"]]);
        expect(t.headers[1].key).toBe("Column B");
        expect(t.issues[0].code).toBe("empty_header");
    });

    it("ignores trailing blank rows and flags interior ones", () => {
        const t = table([["Name"], ["a"], [""], ["b"], [""], [""]]);
        expect(t.rows.map((r) => r.isEmpty)).toEqual([false, true, false]);
        expect(t.issues.find((i) => i.code === "blank_rows").rows).toEqual([3]);
    });

    it("reports a sheet with headers but no data", () => {
        const t = table([["Name", "Price"]]);
        expect(t.issues.some((i) => i.code === "no_rows" && i.severity === "error")).toBe(true);
    });

    it("supports Arabic text and a later header row", () => {
        const t = table([["report"], ["الاسم", "السعر"], ["حاسوب", "100"]], { headerRow: 2 });
        expect(t.headers.map((h) => h.key)).toEqual(["الاسم", "السعر"]);
        expect(t.rows[0]).toMatchObject({ sourceRow: 3, values: { "الاسم": "حاسوب" } });
    });

    it("uses formatted cell text (what the user sees), e.g. dates", () => {
        const ws = XLSX.utils.aoa_to_sheet([["When"], [new Date(Date.UTC(2026, 0, 31))]], { cellDates: true, dateNF: "yyyy-mm-dd" });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "S");
        const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
        const t = readTable(readWorkbook(bytes).workbook);
        expect(t.rows[0].values.When).toBe("2026-01-31");
    });

    it("reads a chosen sheet", () => {
        const { workbook, sheetNames } = readWorkbook(makeXlsx({ A: [["x"], ["1"]], B: [["y"], ["2"]] }));
        expect(sheetNames).toEqual(["A", "B"]);
        expect(readTable(workbook, { sheetName: "B" }).rows[0].values.y).toBe("2");
    });
});
