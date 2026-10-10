// Features 13 + 14: PDF writer, imposition math, print PDFs and approval sheets.
// PDFs are checked independently with pypdf (structure, boxes, images) and
// pdftoppm (they render), when those tools are installed.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createPdfWriter, jpegInfo, latinOnly, MM, PageContent } from "../../src/domain/pdf.js";
import { checkPrint, DEFAULT_PRINT, designSizeMm, layoutSheet, sheetPages } from "../../src/domain/imposition.js";
import { createPrintPdf, createProofPdf } from "../../src/domain/printPdf.js";
import { fakeJpeg } from "../fakes/fakePhotoshop.js";

const LAPTOP = new Uint8Array(fs.readFileSync("test-artifacts/fixtures/images/products/laptop.jpg"));
const have = (cmd, args) => {
    try {
        execFileSync(cmd, args, { stdio: "ignore" });
        return true;
    } catch (e) {
        return false;
    }
};
const PYPDF = have("python3", ["-c", "import pypdf"]);
const PDFTOPPM = have("pdftoppm", ["-v"]);

async function build(fn) {
    const chunks = [];
    await fn(async (b) => chunks.push(b));
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
        out.set(c, o);
        o += c.length;
    }
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "elzoz-pdf-")), "out.pdf");
    fs.writeFileSync(file, out);
    return file;
}
const inspect = (file) =>
    JSON.parse(
        execFileSync("python3", [
            "-c",
            "import json,sys\nfrom pypdf import PdfReader\nr=PdfReader(sys.argv[1])\nout=[]\nfor p in r.pages:\n  xo=p['/Resources'].get('/XObject',{})\n  out.append({'media':[float(x) for x in p.mediabox],'trim':[float(x) for x in p.trimbox],'images':len(xo),'text':p.extract_text()})\nprint(json.dumps(out))",
            file
        ]).toString()
    );

describe("jpegInfo", () => {
    it("reads size and components of real and minimal JPEGs", () => {
        expect(jpegInfo(LAPTOP)).toMatchObject({ width: 1600, height: 1000, components: 3 });
        expect(jpegInfo(fakeJpeg(1080, 1350, "x"))).toMatchObject({ width: 1080, height: 1350 });
        expect(() => jpegInfo(new Uint8Array([1, 2, 3]))).toThrow(/Not a JPEG/);
    });
});

describe("imposition", () => {
    it("computes physical size from pixels and dpi", () => {
        const d = designSizeMm(1063, 638, 300, 0); // a 90 × 54 mm business card
        expect(d.w).toBeCloseTo(90, 0);
        expect(d.h).toBeCloseTo(54, 0);
        expect(designSizeMm(1134, 709, 300, 3).trimW).toBeCloseTo(90, 0);
    });
    it("fits 10 business cards on A4 portrait (2 × 5) and picks the better orientation", () => {
        const design = designSizeMm(1063, 638, 300, 0);
        const l = layoutSheet({ design, print: { ...DEFAULT_PRINT, gapMm: 0, marginMm: 10 } });
        expect(l).toMatchObject({ ok: true, orientation: "portrait", cols: 2, rows: 5, perSheet: 10 });
        expect(l.cutsX).toHaveLength(3); // gap 0: shared cut lines
        const tall = layoutSheet({ design: designSizeMm(2480, 1240, 300, 0), print: { ...DEFAULT_PRINT, gapMm: 4 } }); // 210 × 105 mm
        expect(tall.orientation).toBe("landscape");
    });
    it("spaces designs with bleed so bleeds never overlap", () => {
        const design = designSizeMm(1134, 709, 300, 3);
        const l = layoutSheet({ design, print: { ...DEFAULT_PRINT, bleedMm: 3, gapMm: 0 } });
        expect(l.cells[1].x - l.cells[0].x).toBeCloseTo(design.trimW + 6, 3);
        expect(l.cutsX).toHaveLength(2 * l.cols);
    });
    it("reports a design that doesn't fit, and repeats copies across sheets", () => {
        const l = layoutSheet({ design: designSizeMm(4000, 4000, 300, 0), print: DEFAULT_PRINT });
        expect(l.ok).toBe(false);
        expect(l.problems[0]).toMatch(/doesn't fit on A4/);
        expect(sheetPages(3, 2, 4)).toEqual([[0, 0, 1, 1], [2, 2]]);
    });
    it("validates the print options for the Check step", () => {
        const size = { width: 1080, height: 1350 };
        expect(checkPrint({ ...DEFAULT_PRINT, enabled: true, dpi: 20 }, size).blocking[0]).toMatch(/between 72 and 1200/);
        expect(checkPrint({ ...DEFAULT_PRINT, enabled: true, dpi: 100 }, size).warnings[0]).toMatch(/low for print/);
        expect(checkPrint({ ...DEFAULT_PRINT, enabled: true, bleedMm: 60 }, size).blocking[0]).toMatch(/Bleed/);
        const ok = checkPrint({ ...DEFAULT_PRINT, enabled: true, layout: "sheet", copies: 3 }, size, 5);
        expect(ok.blocking).toEqual([]);
        expect(ok.layout.sheets).toBe(Math.ceil(15 / ok.layout.perSheet));
        expect(checkPrint({ ...DEFAULT_PRINT, enabled: true, layout: "sheet", copies: 0 }, size).blocking[0]).toMatch(/Copies/);
        expect(checkPrint(DEFAULT_PRINT, size)).toEqual({ blocking: [], warnings: [], design: null, layout: null });
    });
});

describe("PDF writer", () => {
    it("only Latin text is drawn as-is", () => {
        expect(latinOnly("Aurora Laptop – é")).toBe(false); // en dash is outside WinAnsi range used here
        expect(latinOnly("Aurora Laptop é")).toBe(true);
        expect(latinOnly("سماعة")).toBe(false);
    });
    it.skipIf(!PYPDF)("writes a valid multi-page PDF with an embedded JPEG and text", async () => {
        const file = await build(async (write) => {
            const pdf = createPdfWriter(write, { title: "Test" });
            const im = await pdf.addJpeg(LAPTOP);
            const c = new PageContent().image(im.name, 0, 0, 160, 100).text("Hello (world) \\", 10, 110, { size: 8 }).line(0, 0, 10, 10);
            pdf.addPage({ width: 200, height: 150, content: c, images: [im] });
            pdf.addPage({ width: 200, height: 150, content: new PageContent().text("second", 10, 10, { alpha: 0.3 }) });
            await pdf.finish();
        });
        const pages = inspect(file);
        expect(pages).toHaveLength(2);
        expect(pages[0].images).toBe(1);
        expect(pages[0].text).toContain("Hello (world) \\");
        expect(pages[1].text).toContain("second");
    });
});

describe("print PDF", () => {
    const size = { width: 1600, height: 1000 }; // laptop.jpg at 300 dpi = 135.5 × 84.7 mm
    it.skipIf(!PYPDF)("one design per page: page = design + mark area, TrimBox on the trim", async () => {
        const print = { ...DEFAULT_PRINT, enabled: true, bleedMm: 3, marks: true };
        const file = await build(async (write) => {
            const p = createPrintPdf({ write, print, size });
            await p.addDesign(LAPTOP);
            await p.addDesign(LAPTOP);
            await p.finish();
        });
        const pages = inspect(file);
        expect(pages).toHaveLength(2);
        const d = designSizeMm(1600, 1000, 300, 3);
        const pad = 8 * MM;
        expect(pages[0].media[2]).toBeCloseTo(d.w * MM + 2 * pad, 1);
        expect(pages[0].trim[0]).toBeCloseTo(pad + 3 * MM, 1);
        expect(pages[0].trim[2] - pages[0].trim[0]).toBeCloseTo(d.trimW * MM, 1);
        if (PDFTOPPM) {
            const out = path.join(path.dirname(file), "r");
            execFileSync("pdftoppm", ["-r", "30", "-png", file, out]);
            expect(fs.readdirSync(path.dirname(file)).filter((n) => n.endsWith(".png"))).toHaveLength(2);
        }
    });
    it.skipIf(!PYPDF)("sheets: N-up on A4 with copies, each image embedded once", async () => {
        const print = { ...DEFAULT_PRINT, enabled: true, layout: "sheet", paper: "A4", copies: 2, gapMm: 4 };
        let layout;
        const file = await build(async (write) => {
            const p = createPrintPdf({ write, print, size });
            layout = p.sheet;
            for (let i = 0; i < 3; i++) await p.addDesign(LAPTOP);
            await p.finish();
        });
        expect(layout).toMatchObject({ perSheet: 4, orientation: "landscape" }); // 135.5 × 84.7 mm: 2 × 2 on A4 landscape
        const pages = inspect(file);
        expect(pages).toHaveLength(2); // 6 slots / 4
        expect(pages[0].media.map(Math.round)).toEqual([0, 0, 842, 595]);
        expect(pages[0].images).toBe(2); // design 1 twice + design 2 once → 2 distinct images
        expect(pages[0].text).toContain("sheet 1/2");
        expect(fs.statSync(file).size).toBeLessThan(LAPTOP.length * 3 + 20000); // embedded once each
    });
    it("refuses a layout that doesn't fit", () => {
        expect(() => createPrintPdf({ write: async () => {}, print: { ...DEFAULT_PRINT, layout: "sheet", paper: "A5" }, size: { width: 4000, height: 4000 } })).toThrow(/doesn't fit/);
    });
});

describe("approval sheet PDF", () => {
    it.skipIf(!PYPDF)("numbers each design, paginates and keeps non-Latin labels out of Helvetica", async () => {
        const file = await build(async (write) => {
            const p = createProofPdf({ write, perPage: 4, title: "Weekly offers", dateText: "2026-10-10" });
            for (let i = 1; i <= 5; i++) await p.addProof(LAPTOP, { number: i, label: i === 5 ? "سماعة" : `A${i}_item` });
            await p.finish();
        });
        const pages = inspect(file);
        expect(pages).toHaveLength(2);
        expect(pages[0].text).toContain("APPROVAL SHEET");
        expect(pages[0].text).toContain("Weekly offers");
        expect(pages[0].text).toContain("#4");
        expect(pages[0].text).toContain("A1_item");
        expect(pages[1].text).toContain("#5");
        expect(pages[1].text).not.toContain("?");
        expect(pages[1].text).toContain("2 / 2");
    });
});
