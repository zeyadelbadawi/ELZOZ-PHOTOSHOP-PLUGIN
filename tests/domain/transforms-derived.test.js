// Features 9 and 10: text/number formatting and smart columns (prices and offers).
import { describe, expect, it } from "vitest";
import {
    applyCase,
    formatDate,
    formatNumber,
    formatPhone,
    formatValue,
    isFormatActive,
    parseDate,
    parseNumber,
    tidySpaces,
    toArabicDigits,
    toLatinDigits
} from "../../src/domain/transforms.js";
import { applyDerived, derivedKey, derivedValue, newDerived, validateDerived } from "../../src/domain/derived.js";
import { createMapping, setTextMapping, setTextOptions, setVisibilityMapping } from "../../src/domain/mapping.js";
import { runPreflight } from "../../src/domain/preflight.js";
import { effectiveTable, initialState, reducer, recallMemory, rememberMapping } from "../../src/app/state.js";

const row = (values, sourceRow = 2) => ({ index: sourceRow - 2, sourceRow, values, isEmpty: false });

describe("digits, spaces and letter case", () => {
    it("converts digits both ways and keeps everything else", () => {
        expect(toLatinDigits("السعر ١٬٢٩٩٫٥٠ ج.م")).toBe("السعر 1,299.50 ج.م");
        expect(toLatinDigits("۱۲۳")).toBe("123");
        expect(toArabicDigits("Size 42 - 2026")).toBe("Size ٤٢ - ٢٠٢٦");
    });
    it("tidies spaces but keeps line breaks", () => {
        expect(tidySpaces("  Red   Shoes  \n  size   42 ")).toBe("Red Shoes\nsize 42");
    });
    it("changes letter case, leaving Arabic alone", () => {
        expect(applyCase("red SHOES for men", "title")).toBe("Red Shoes For Men");
        expect(applyCase("hello. new day! ok", "sentence")).toBe("Hello. New day! Ok");
        expect(applyCase("Nike Air", "upper")).toBe("NIKE AIR");
        expect(applyCase("حذاء أحمر", "upper")).toBe("حذاء أحمر");
    });
});

describe("numbers and prices", () => {
    it("reads prices as people write them", () => {
        expect(parseNumber("1,299")).toBe(1299);
        expect(parseNumber("1,299.50 EGP")).toBe(1299.5);
        expect(parseNumber("1.299,50")).toBe(1299.5);
        expect(parseNumber("12,5")).toBe(12.5);
        expect(parseNumber("1.299.000")).toBe(1299000);
        expect(parseNumber("٢٥٠ ج.م")).toBe(250);
        expect(parseNumber("EGP 99")).toBe(99);
        expect(parseNumber("-15")).toBe(-15);
        expect(parseNumber("free")).toBeNull();
        expect(parseNumber("")).toBeNull();
    });
    it("formats with thousands and decimals", () => {
        expect(formatNumber(1299)).toBe("1,299");
        expect(formatNumber(1299.5)).toBe("1,299.5");
        expect(formatNumber(1299.5, { decimals: 2 })).toBe("1,299.50");
        expect(formatNumber(1299.567, { decimals: 0, thousands: false })).toBe("1300");
        expect(formatNumber(-2500)).toBe("-2,500");
        expect(formatNumber(null)).toBe("");
    });
});

describe("dates and phones", () => {
    it("reads day-first dates (Egypt), ISO, Excel serials and impossible-day fallbacks", () => {
        expect(formatDate(parseDate("05/03/2026"), "yyyy-MM-dd")).toBe("2026-03-05");
        expect(formatDate(parseDate("05/03/2026", "mdy"), "yyyy-MM-dd")).toBe("2026-05-03");
        expect(formatDate(parseDate("3/25/26"), "yyyy-MM-dd")).toBe("2026-03-25");
        expect(formatDate(parseDate("2026-12-01"), "d/M/yyyy")).toBe("1/12/2026");
        expect(formatDate(parseDate("46000"), "yyyy-MM-dd")).toBe("2025-12-09");
        expect(parseDate("31/02/2026")).toBeNull();
        expect(parseDate("soon")).toBeNull();
    });
    it("writes month and day names in Arabic or English", () => {
        const d = parseDate("2026-10-10");
        expect(formatDate(d, "dddd d MMMM yyyy", "ar")).toBe("السبت 10 أكتوبر 2026");
        expect(formatDate(d, "d MMM", "en")).toBe("10 Oct");
        expect(formatDate(d, "MMMM yyyy", "en")).toBe("October 2026");
    });
    it("formats Egyptian numbers in any input shape", () => {
        expect(formatPhone("01012345678")).toBe("010 1234 5678");
        expect(formatPhone("+201012345678", "international")).toBe("+20 10 1234 5678");
        expect(formatPhone("00201012345678", "dashed")).toBe("010-1234-5678");
        expect(formatPhone("٠١٠١٢٣٤٥٦٧٨")).toBe("010 1234 5678");
        expect(formatPhone("0225551234")).toBe("02 2555 1234");
        expect(formatPhone("0225551234", "international")).toBe("+20 2 2555 1234");
        expect(formatPhone("16789")).toBe("167 89");
    });
});

describe("formatValue (a text rule's format)", () => {
    it("is a no-op without options", () => {
        expect(isFormatActive(null)).toBe(false);
        expect(formatValue(" x ", null)).toEqual({ value: " x " });
    });
    it("applies number, affixes and Arabic digits in order", () => {
        const f = { number: { decimals: "auto", thousands: true }, prefix: "", suffix: " ج.م", digits: "arabic" };
        expect(formatValue("1299", f)).toEqual({ value: "١,٢٩٩ ج.م" });
    });
    it("reports cells it can't read and keeps their text", () => {
        expect(formatValue("call us", { number: { decimals: 0 } })).toEqual({ value: "call us", problem: "not_a_number" });
        expect(formatValue("tbd", { date: { input: "dmy", output: "d MMMM", lang: "en" } })).toEqual({ value: "tbd", problem: "not_a_date" });
    });
    it("leaves empty cells empty (no lonely prefix)", () => {
        expect(formatValue("", { prefix: "EGP " })).toEqual({ value: "" });
    });
});

describe("smart columns", () => {
    const r = row({ Old: "1,500", New: "1,125", Name: "Air Max", Size: "42" });
    it("computes discount, saving and has-discount", () => {
        const base = { oldColumn: "Old", newColumn: "New" };
        expect(derivedValue({ type: "discount", ...base, style: "percent" }, r).value).toBe("25%");
        expect(derivedValue({ type: "discount", ...base, style: "minus" }, r).value).toBe("-25%");
        expect(derivedValue({ type: "discount", ...base, style: "save" }, r).value).toBe("وفّر 25%");
        expect(derivedValue({ type: "saving", ...base, number: { decimals: "auto", thousands: true }, prefix: "", suffix: " EGP" }, r).value).toBe("375 EGP");
        expect(derivedValue({ type: "hasDiscount", ...base, minPercent: 1 }, r).value).toBe("yes");
    });
    it("no discount: empty values, so the badge hides", () => {
        const same = row({ Old: "100", New: "100" });
        const base = { oldColumn: "Old", newColumn: "New" };
        expect(derivedValue({ type: "discount", ...base }, same).value).toBe("");
        expect(derivedValue({ type: "hasDiscount", ...base, minPercent: 1 }, same).value).toBe("");
        expect(derivedValue({ type: "hasDiscount", ...base }, row({ Old: "", New: "90" })).value).toBe("");
    });
    it("bad prices are reported, empty prices are not", () => {
        expect(derivedValue({ type: "discount", oldColumn: "Old", newColumn: "New" }, row({ Old: "call", New: "90" })).problem).toBe("bad_price");
        expect(derivedValue({ type: "discount", oldColumn: "Old", newColumn: "New" }, row({ Old: "", New: "90" })).problem).toBeUndefined();
    });
    it("formats prices, combines columns and repeats constants", () => {
        expect(derivedValue({ type: "price", column: "Old", number: { decimals: 2, thousands: true }, prefix: "EGP ", suffix: "" }, r).value).toBe("EGP 1,500.00");
        expect(derivedValue({ type: "combine", template: "{Name}  - size {Size} {Missing}" }, r).value).toBe("Air Max - size 42");
        expect(derivedValue({ type: "constant", value: "#E30613" }, r).value).toBe("#E30613");
    });
    it("validates definitions against the spreadsheet", () => {
        const headers = [{ key: "Old" }, { key: "New" }];
        expect(validateDerived({ type: "discount", label: "D", oldColumn: "Old", newColumn: "" }, headers)).toEqual(["pick_columns"]);
        expect(validateDerived({ type: "discount", label: "D", oldColumn: "Old", newColumn: "Gone" }, headers)).toEqual(["missing_columns"]);
        expect(validateDerived({ type: "combine", label: "", template: "{Old}" }, headers)).toEqual(["no_label"]);
        expect(validateDerived({ type: "constant", label: "Brand", value: "" }, headers)).toEqual([]);
    });
    it("adds columns to the table without touching the original, and reports unreadable prices once", () => {
        const table = {
            headers: [{ key: "Old" }, { key: "New" }],
            rows: [row({ Old: "200", New: "150" }, 2), row({ Old: "?", New: "10" }, 3), { index: 2, sourceRow: 4, values: {}, isEmpty: true }],
            issues: []
        };
        const d = { ...newDerived("discount"), label: "Off", oldColumn: "Old", newColumn: "New" };
        const t = applyDerived(table, [d]);
        expect(t.headers.map((h) => h.key)).toEqual(["Old", "New", derivedKey(d)]);
        expect(t.rows[0].values[derivedKey(d)]).toBe("25%");
        expect(t.rows[1].values[derivedKey(d)]).toBe("");
        expect(t.issues).toEqual([expect.objectContaining({ code: "bad_price", rows: [3] })]);
        expect(table.headers).toHaveLength(2);
        expect(table.rows[0].values[derivedKey(d)]).toBeUndefined();
    });
});

describe("end to end in preflight and app state", () => {
    const table = {
        headers: [{ key: "Name" }, { key: "Old" }, { key: "New" }, { key: "Date" }],
        rows: [row({ Name: "  air   max ", Old: "1500", New: "1125", Date: "10/10/2026" }, 2), row({ Name: "boot", Old: "900", New: "900", Date: "soon" }, 3)],
        issues: []
    };
    const layers = [
        { id: 1, name: "Name", kind: "text", path: ["Name"] },
        { id: 2, name: "Badge", kind: "text", path: ["Badge"] },
        { id: 3, name: "Price", kind: "text", path: ["Price"] },
        { id: 4, name: "Date", kind: "text", path: ["Date"] }
    ];
    const discount = { ...newDerived("discount"), label: "Discount", oldColumn: "Old", newColumn: "New", style: "minus" };
    const has = { ...newDerived("hasDiscount"), label: "Has discount", oldColumn: "Old", newColumn: "New" };
    const output = { name: "out", existingFileNames: [] };

    it("writes formatted text and hides the badge on rows without a discount", () => {
        const t = applyDerived(table, [discount, has]);
        let m = setTextMapping(createMapping(), 1, "Name");
        m = setTextOptions(m, 1, { format: { trim: true, case: "title" } });
        m = setTextMapping(m, 2, derivedKey(discount));
        m = setTextMapping(m, 3, "New");
        m = setTextOptions(m, 3, { format: { number: { decimals: "auto", thousands: true }, suffix: " ج.م" } });
        m = setTextMapping(m, 4, "Date");
        m = setTextOptions(m, 4, { format: { date: { input: "dmy", output: "d MMMM", lang: "ar" } } });
        m = setVisibilityMapping(m, 2, derivedKey(has), "hide");
        const plan = runPreflight({ table: t, layers, mapping: m, output, formats: ["jpg"], namePattern: "{row}", pricing: { unitPrice: 1 } });
        expect(plan.ok).toBe(true);
        const [a, b] = plan.items;
        expect(a.text).toEqual([
            { layerId: 1, value: "Air Max" },
            { layerId: 2, value: "-25%" },
            { layerId: 3, value: "1,125 ج.م" },
            { layerId: 4, value: "10 أكتوبر" }
        ]);
        expect(a.visibility).toEqual([{ layerId: 2, visible: true }]);
        expect(b.visibility).toEqual([{ layerId: 2, visible: false }]);
        expect(plan.warnings).toEqual([expect.objectContaining({ code: "not_a_date", rows: [3] })]);
    });

    it("state: smart columns feed Map and Check; removing one drops its mappings", () => {
        let s = { ...initialState(), data: { table }, template: { layers, width: 10, height: 10, title: "t" } };
        s = reducer(s, { type: "derived", derived: [discount] });
        expect(effectiveTable(s).headers.map((h) => h.key)).toContain(derivedKey(discount));
        expect(effectiveTable(s)).toBe(effectiveTable(s)); // cached
        s = reducer(s, { type: "mapping", mapping: setTextMapping(createMapping(), 2, derivedKey(discount)) });
        s = reducer(s, { type: "derived", derived: [] });
        expect(s.mapping.text).toEqual({});
    });

    it("remembers smart columns with the template mapping", () => {
        const store = new Map();
        const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
        const template = { title: "card.psd", width: 10, height: 10, layers };
        rememberMapping(storage, template, setTextMapping(createMapping(), 2, derivedKey(discount)), 1, [discount]);
        const back = recallMemory(storage, template, table);
        expect(back.derived).toEqual([discount]);
        expect(back.mapping.text[2].column).toBe(derivedKey(discount));
        // A spreadsheet without the price columns: the smart column and its mapping are dropped.
        expect(recallMemory(storage, template, { headers: [{ key: "Name" }], rows: [], issues: [] })).toBeNull();
    });
});

describe("a new spreadsheet and existing smart columns", () => {
    it("removes smart columns whose columns are gone (and names them), keeps fixed values and unfinished ones", () => {
        const data = (headers) => ({ fileName: "x.xlsx", table: { headers: headers.map((k) => ({ key: k, label: k })), issues: [], rows: [] } });
        const discount = { ...newDerived("discount"), label: "Off", oldColumn: "Old", newColumn: "New" };
        const fixed = { ...newDerived("constant"), label: "Primary", value: "#000" };
        const unfinished = { ...newDerived("discount"), label: "Draft" };
        let s = reducer(initialState(), { type: "data", data: data(["Old", "New"]) });
        s = reducer(s, { type: "derived", derived: [discount, fixed, unfinished] });
        s = reducer(s, { type: "data", data: data(["Title", "Price"]) });
        expect(s.derived.map((d) => d.label)).toEqual(["Primary", "Draft"]);
        expect(s.derivedDropped).toEqual(["Off"]);
        expect(reducer(s, { type: "derived-dropped-seen" }).derivedDropped).toBeNull();
    });
});

