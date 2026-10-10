// Feature 6: QR codes / barcodes from a column, and Google Sheets as a source.
// Generated codes are decoded by an independent reader (zxing-cpp) when installed.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { CODE_FOLDER_KEY, code128Values, codePng, codesNeeded, codeValue, ean13CheckDigit, png1bit } from "../../src/domain/codes.js";
import { exportUrl, parseSheetLink, sheetProblem, titleFromDisposition } from "../../src/domain/googleSheets.js";
import { runPreflight } from "../../src/domain/preflight.js";
import { createMapping, setImageMapping } from "../../src/domain/mapping.js";
import { createServices } from "../../src/app/services.js";
import { createFakeHost } from "../fakes/fakePhotoshop.js";
import { openProject, saveProject } from "../../src/app/projectIO.js";
import { initialState } from "../../src/app/state.js";

const have = (code) => {
    try {
        execFileSync("python3", ["-c", code], { stdio: "ignore" });
        return true;
    } catch (e) {
        return false;
    }
};
const ZXING = have("import zxingcpp, PIL");
const PIL = have("import PIL");
const row = (i, values) => ({ index: i, sourceRow: i + 2, values, isEmpty: false });
const table = (headers, rows) => ({ headers: headers.map((k) => ({ key: k, label: k })), issues: [], rows: rows.map((v, i) => row(i, v)) });

describe("code values", () => {
    it("EAN-13: adds or checks the check digit, reads Arabic digits", () => {
        expect(ean13CheckDigit("400638133393")).toBe("1");
        expect(codeValue("ean13", "400638133393")).toEqual({ value: "4006381333931" });
        expect(codeValue("ean13", "4006381333931")).toEqual({ value: "4006381333931" });
        expect(codeValue("ean13", "٤٠٠٦٣٨١٣٣٣٩٣١")).toEqual({ value: "4006381333931" });
        expect(codeValue("ean13", "4006381333932").problem).toMatch(/check digit \(should end in 1\)/);
        expect(codeValue("ean13", "12345").problem).toMatch(/12 or 13 digits/);
    });
    it("Code 128 and QR limits", () => {
        expect(codeValue("code128", "ELZ-0001")).toEqual({ value: "ELZ-0001" });
        expect(codeValue("code128", "سماعة").problem).toMatch(/English letters/);
        expect(codeValue("qr", "x".repeat(1001)).problem).toMatch(/too long/);
        expect(codeValue("qr", "سماعة")).toEqual({ value: "سماعة" });
    });
    it("Code 128 picks set C for even digit runs and adds the checksum", () => {
        expect(code128Values("12345678")).toEqual([105, 12, 34, 56, 78, 47, 106]);
        expect(code128Values("A1")).toEqual([104, 33, 17, (104 + 33 * 1 + 17 * 2) % 103, 106]); // = 68
    });
    it("lists the codes a mapping needs, deduplicated", () => {
        const t = table(["SKU"], [{ SKU: "A1" }, { SKU: "A1" }, { SKU: "B2" }, { SKU: "" }]);
        const m = setImageMapping(createMapping(), 3, { column: "SKU", source: "qr" });
        expect(codesNeeded(t.rows, m).map((c) => c.key)).toEqual(["qr:A1", "qr:B2"]);
        // Barcodes follow their frame's shape (a wide, short frame → a wide, short barcode).
        const bar = setImageMapping(createMapping(), 4, { column: "SKU", source: "code128", aspect: 0.19 });
        expect(codesNeeded(t.rows, bar)[0]).toMatchObject({ key: "code128:0.19:A1", aspect: 0.19 });
        const png = codePng("code128", "A1", 1200, 0.19);
        expect(png.height / png.width).toBeCloseTo(0.19, 2);
    });
});

describe("generated images", () => {
    it.skipIf(!PIL)("1-bit PNG is a valid image", () => {
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ez-png-")), "p.png");
        fs.writeFileSync(file, png1bit(70, 20, (x, y) => (x + y) % 2 === 0));
        const out = execFileSync("python3", ["-c", "import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]); im.load(); print(im.mode, im.size, im.getpixel((0,0)), im.getpixel((1,0)))", file]).toString().trim();
        expect(out).toBe("1 (70, 20) 0 255");
    });
    it.skipIf(!ZXING)("every code scans back to its value (zxing-cpp)", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ez-codes-"));
        const cases = [["qr", "https://elzoz.test/p/ELZ-0001"], ["qr", "سماعة لاسلكية ٢٤٩ ج.م"], ["ean13", "622300000001"], ["code128", "ELZ-0001"], ["code128", "12345678"]];
        cases.forEach(([k, v], i) => fs.writeFileSync(path.join(dir, `${i}.png`), codePng(k, codeValue(k, v).value).bytes));
        const read = JSON.parse(execFileSync("python3", ["-c", "import zxingcpp,sys,os,json\nfrom PIL import Image\nd=sys.argv[1]\nprint(json.dumps([[r.text for r in zxingcpp.read_barcodes(Image.open(os.path.join(d,f'{i}.png')).convert('L'))] for i in range(int(sys.argv[2]))], ensure_ascii=False))", dir, String(cases.length)]).toString());
        expect(read).toEqual([["https://elzoz.test/p/ELZ-0001"], ["سماعة لاسلكية ٢٤٩ ج.م"], ["6223000000014"], ["ELZ-0001"], ["12345678"]]);
    });
});

describe("preflight with codes", () => {
    const layers = [{ id: 3, name: "QR", kind: "smartObject", path: ["QR"] }];
    const t = table(["EAN"], [{ EAN: "622300000001" }, { EAN: "12" }, { EAN: "" }]);
    const m = setImageMapping(createMapping(), 3, { column: "EAN", source: "ean13" });
    const plan = (made) => runPreflight({ table: t, layers, mapping: m, folders: made ? { [CODE_FOLDER_KEY]: { name: "codes", index: {}, downloads: made } } : {}, output: { name: "o", existingFileNames: [] }, formats: ["jpg"], namePattern: "{row}", pricing: { unitPrice: 1 } });
    it("needs no folder, waits for the codes, then uses them; bad cells are skipped with the reason", () => {
        expect(plan(null).blocking.map((b) => b.code)).toEqual(["codes_pending"]);
        const p = plan({ "ean13:0.6:6223000000014": { file: "ean.png" } });
        expect(p.ok).toBe(true);
        expect(p.items.map((i) => i.images)).toEqual([[{ layerId: 3, folderKey: CODE_FOLDER_KEY, file: "ean.png", fit: "fit" }], []]);
        expect(p.warnings.find((w) => w.code === "bad_code").message).toMatch(/12 or 13 digits.* in 1 row/);
    });
});

describe("Google Sheets links", () => {
    it("recognises shared and published links", () => {
        expect(parseSheetLink("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0")).toEqual({ kind: "doc", id: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789" });
        expect(parseSheetLink("https://docs.google.com/spreadsheets/u/1/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit")).toMatchObject({ kind: "doc" });
        expect(parseSheetLink("https://docs.google.com/spreadsheets/d/e/2PACX-1vQabc/pubhtml")).toEqual({ kind: "published", id: "2PACX-1vQabc" });
        expect(parseSheetLink("https://example.com/sheet")).toBeNull();
        expect(exportUrl({ kind: "doc", id: "X" })).toBe("https://docs.google.com/spreadsheets/d/X/export?format=xlsx");
        expect(exportUrl({ kind: "published", id: "Y" })).toBe("https://docs.google.com/spreadsheets/d/e/Y/pub?output=xlsx");
    });
    it("reads the title and explains failures", () => {
        expect(titleFromDisposition(`attachment; filename="Offers.xlsx"; filename*=UTF-8''%D8%B9%D8%B1%D9%88%D8%B6.xlsx`)).toBe("عروض");
        expect(titleFromDisposition(`attachment; filename="Offers.xlsx"`)).toBe("Offers");
        expect(sheetProblem({ status: 200, bytes: new TextEncoder().encode("<html>") })).toMatch(/private/);
        expect(sheetProblem({ status: 404 })).toMatch(/No sheet/);
        expect(sheetProblem({ status: 200, bytes: new Uint8Array([0x50, 0x4b, 3, 4]) })).toBeNull();
    });

    const XLSX_BYTES = new Uint8Array(fs.readFileSync("test-artifacts/fixtures/spreadsheets/offers.xlsx"));
    const services = (fetchImpl) => {
        const host = createFakeHost({});
        return createServices({ photoshop: host.photoshop, uxp: host.uxp, fetch: fetchImpl });
    };
    const reply = (status, bytes, disposition = null) => ({ ok: status >= 200 && status < 300, status, headers: { get: (h) => (h.toLowerCase() === "content-disposition" ? disposition : null) }, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    const URL1 = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0";

    it("loads a shared sheet (all tabs), and says clearly when it's private", async () => {
        const seen = [];
        const ok = services(async (u) => (seen.push(u), reply(200, XLSX_BYTES, `attachment; filename="Weekly offers.xlsx"`)));
        const sheet = await ok.loadGoogleSheet(URL1);
        expect(seen).toEqual(["https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export?format=xlsx"]);
        expect(sheet).toMatchObject({ entry: null, fileName: "Weekly offers", sheetNames: ["Offers"], source: { kind: "gsheet", url: URL1 } });
        expect(ok.readSheet(sheet.workbook, "Offers", 1).rows.length).toBe(5);
        const priv = services(async () => reply(200, new TextEncoder().encode("<!doctype html><title>Sign in</title>")));
        await expect(priv.loadGoogleSheet(URL1)).rejects.toThrow(/private.*Anyone with the link/);
        const down = services(async () => {
            throw new Error("getaddrinfo ENOTFOUND docs.google.com");
        });
        await expect(down.loadGoogleSheet(URL1)).rejects.toThrow(/Couldn't reach Google Sheets/);
        await expect(ok.loadGoogleSheet("https://example.com/x")).rejects.toThrow(/isn't a Google Sheets link/);
    });

    it("a saved project downloads the sheet again (latest rows) instead of using a file token", async () => {
        const store = new Map();
        const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
        const svc = services(async () => reply(200, XLSX_BYTES, `attachment; filename="Weekly offers.xlsx"`));
        const sheet = await svc.loadGoogleSheet(URL1);
        const state = { ...initialState(), data: { ...sheet, sheetName: "Offers", headerRow: 1, table: svc.readSheet(sheet.workbook, "Offers", 1) } };
        const saved = await saveProject({ storage, services: svc, state, name: "From Google" });
        expect(saved.sources.data).toMatchObject({ token: null, source: { kind: "gsheet", url: URL1 } });
        const loaded = await openProject({ storage, services: svc, id: saved.id });
        expect(loaded.missing).toEqual(expect.not.arrayContaining(["data"]));
        expect(loaded.data.table.rows).toHaveLength(5);
    });
});
