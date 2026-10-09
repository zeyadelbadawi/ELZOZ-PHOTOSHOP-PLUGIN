// Tests of the SIMULATOR itself. A simulator that quietly does the wrong thing
// would make the engine tests meaningless, so this file checks it against
// independent tools (Pillow for image sizes, psd-tools for PSDs) and runs
// mutation checks: deliberately broken simulator behaviour must be caught by
// the same verification the engine tests rely on.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createFakeHost, FakeFolder } from "../fakes/fakePhotoshop.js";
import { imageInfo } from "../fakes/imageInfo.js";
import { createPixelStore, templateFromPsd } from "../fakes/psdTemplate.js";
import { writeSimulatedPsd } from "../fakes/psdWriter.js";
import { createPhotoshopPort } from "../../src/ps/port.js";
import { runDesignJob, ITEM } from "../../src/engine/designJob.js";
import { readTable, readWorkbook } from "../../src/domain/excel.js";
import { runPreflight } from "../../src/domain/preflight.js";
import { autoMap, createMapping, setImageMapping } from "../../src/domain/mapping.js";
import { buildFolderIndex } from "../../src/domain/imageFiles.js";
import { hasPsdTools, psdSummary } from "./psdSummary.js";

const FX = path.resolve("test-artifacts/fixtures");
const d = fs.existsSync(path.join(FX, "manifest.json")) ? describe : describe.skip;
const PRODUCTS = path.join(FX, "images/products");
const LOGOS = path.join(FX, "images/logos");
const CARD = path.join(FX, "templates/product-card-1080x1350.psd");

const folderFrom = (dir) => new FakeFolder(path.basename(dir), Object.fromEntries(fs.readdirSync(dir).map((f) => [f, { bytes: new Uint8Array(fs.readFileSync(path.join(dir, f))) }])));

/** One full simulated run of products-valid on the product card, PSD output written to `dir`. `mutate(host)` sabotages the simulator. */
async function runCard(dir, mutate = () => {}) {
    const pixelStore = createPixelStore();
    const products = folderFrom(PRODUCTS);
    const logos = folderFrom(LOGOS);
    const fileBytes = (n) => (products.files.get(n) || logos.files.get(n) || {}).bytes || null;
    const h = createFakeHost({
        loadTemplate: (entry) => templateFromPsd(fs.readFileSync(entry.nativePath), pixelStore),
        writePsd: (doc) => writeSimulatedPsd(doc, { pixelStore, fileBytes })
    });
    mutate(h);
    const port = createPhotoshopPort(h);
    const template = { entry: { nativePath: CARD } };
    const info = await port.inspectTemplate(template);
    const table = readTable(readWorkbook(fs.readFileSync(path.join(FX, "spreadsheets/products-valid.xlsx"))).workbook);
    let mapping = autoMap(createMapping(), table.headers, info.layers, table.rows);
    const logoId = info.layers.find((l) => l.name === "Logo").id;
    mapping = setImageMapping(mapping, logoId, { ...mapping.images[logoId], folderKey: "logos" });
    for (const id of Object.keys(mapping.images)) if (Number(id) !== logoId) mapping = setImageMapping(mapping, Number(id), { ...mapping.images[id], folderKey: "products" });
    const plan = runPreflight({
        table,
        layers: info.layers,
        mapping,
        folders: { products: { name: "products", index: buildFolderIndex([...products.files.keys()]) }, logos: { name: "logos", index: buildFolderIndex([...logos.files.keys()]) } },
        output: { name: "out", existingFileNames: [] },
        formats: ["psd"],
        namePattern: "{row}",
        pricing: { unitPrice: 1 },
        balance: null
    });
    const out = new FakeFolder("out");
    const result = await runDesignJob({
        port,
        billing: { startJob: async () => ({ jobId: "sim" }), reportItem: async () => {}, finishJob: async () => ({}) },
        template,
        templateLayers: info.layers,
        plan,
        folders: { products: { name: "products", entry: products }, logos: { name: "logos", entry: logos } },
        output: { entry: out }
    });
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, f] of out.files) fs.writeFileSync(path.join(dir, name), f.bytes);
    return { result, table };
}

/** The verification used by the engine tests: every PSD carries its row's text and image. Throws on mismatch. */
function verifyRows(dir, table) {
    const parsed = psdSummary(dir);
    expect(Object.keys(parsed)).toHaveLength(table.rows.length);
    table.rows.forEach((row, i) => {
        const doc = parsed[`${i + 1}.psd`];
        expect(doc["Name@Text"], `row ${row.sourceRow} name`).toBe(row.values.Name);
        expect(doc["Price@Text"], `row ${row.sourceRow} price`).toBe(row.values.Price);
        expect(doc["Photo@Media"].toLowerCase(), `row ${row.sourceRow} photo`).toContain(path.parse(row.values.Photo).name.toLowerCase());
        expect(doc["Logo@Media"], `row ${row.sourceRow} logo`).toBe(row.values.Logo);
    });
}

d("simulator contract (SIMULATED host, checked against independent tools)", () => {
    it("reads image sizes exactly like Pillow does, and rejects corrupt/non-image files", () => {
        const files = [...fs.readdirSync(PRODUCTS).map((f) => path.join(PRODUCTS, f)), ...fs.readdirSync(LOGOS).map((f) => path.join(LOGOS, f))];
        const pillow = JSON.parse(
            execFileSync("python3", ["-c", "import json,sys\nfrom PIL import Image\nout={}\nfor p in sys.argv[1:]:\n  try:\n    im=Image.open(p); im.load(); out[p]=list(im.size)\n  except Exception: out[p]=None\nprint(json.dumps(out))", ...files]).toString()
        );
        for (const f of files) {
            const mine = imageInfo(fs.readFileSync(f));
            expect(mine ? [mine.width, mine.height] : null, path.basename(f)).toEqual(pillow[f]);
        }
        expect(Object.values(pillow).filter((v) => v === null)).toHaveLength(2); // broken.jpg, notes.txt
    });

    it("PSD template -> simulated document -> PSD keeps structure, names, kinds and sizes", () => {
        const store = createPixelStore();
        const spec = templateFromPsd(fs.readFileSync(CARD), store);
        const h = createFakeHost({ templates: { x: spec } });
        return h.photoshop.core.executeAsModal(async () => {
            const doc = await h.photoshop.app.open({ nativePath: "x" });
            const again = templateFromPsd(writeSimulatedPsd(doc, { pixelStore: store, fileBytes: () => null }), createPixelStore());
            const shape = (layers) => layers.map((l) => [l.name, l.kind, l.kind === "group" ? shape(l.layers) : [l.bounds.left, l.bounds.top, l.kind === "text" ? l.text : l.bounds.right]]);
            expect([again.width, again.height]).toEqual([spec.width, spec.height]);
            expect(shape(again.layers)).toEqual(shape(spec.layers));
        }, { commandName: "t" });
    });

    it("an unreadable template fails with a Photoshop-style error instead of a fake document", async () => {
        const h = createFakeHost({ loadTemplate: (e) => templateFromPsd(fs.readFileSync(e.nativePath), createPixelStore()) });
        await expect(
            h.photoshop.core.executeAsModal(() => h.photoshop.app.open({ nativePath: path.join(FX, "spreadsheets/corrupt.xlsx") }), { commandName: "t" })
        ).rejects.toThrow();
        const empty = createFakeHost({});
        await expect(empty.photoshop.core.executeAsModal(() => empty.photoshop.app.open({ nativePath: "nope.psd" }), { commandName: "t" })).rejects.toThrow(/not a valid Photoshop document/);
    });

    it.runIf(hasPsdTools)("baseline: an honest simulator passes the row verification", async () => {
        const dir = path.resolve("test-artifacts/outputs/simulated-node/contract-baseline");
        const { result, table } = await runCard(dir);
        expect(result.items.every((i) => i.status === ITEM.succeeded)).toBe(true);
        verifyRows(dir, table);
    });

    describe.runIf(hasPsdTools)("mutation checks: a broken simulator must be caught", () => {
        const dir = path.resolve("test-artifacts/outputs/simulated-node/contract-mutant");
        const wrapBatchPlay = (h, fn) => {
            const real = h.photoshop.action.batchPlay;
            h.photoshop.action.batchPlay = (descs, opts) => fn(descs, opts, real);
        };

        it("M1 Replace Contents silently does nothing", async () => {
            const { result, table } = await runCard(dir, (h) =>
                wrapBatchPlay(h, (descs, opts, real) => (descs.some((x) => x._obj === "placedLayerReplaceContents") ? Promise.resolve(descs.map(() => ({}))) : real(descs, opts)))
            );
            expect(result.items.every((i) => i.status === ITEM.succeeded)).toBe(true);
            expect(() => verifyRows(dir, table)).toThrow();
        });

        it("M2 text edits are dropped", async () => {
            const { result, table } = await runCard(dir, (h) => {
                h.env.domText = false; // force the batchPlay text path, then drop it
                wrapBatchPlay(h, (descs, opts, real) => (descs.some((x) => x._obj === "set") ? Promise.resolve(descs.map(() => ({}))) : real(descs, opts)));
            });
            expect(result.items.every((i) => i.status === ITEM.succeeded)).toBe(true);
            expect(() => verifyRows(dir, table)).toThrow();
        });

        it("M3 every row receives the first row's image (stale token)", async () => {
            const logos = new Set(fs.readdirSync(LOGOS));
            const { result, table } = await runCard(dir, (h) => {
                let firstPhoto = null;
                wrapBatchPlay(h, (descs, opts, real) =>
                    real(
                        descs.map((x) => {
                            if (x._obj !== "placedLayerReplaceContents" || logos.has(h.env.tokens.get(x.null._path).name)) return x;
                            firstPhoto = firstPhoto || x.null._path;
                            return { ...x, null: { ...x.null, _path: firstPhoto } };
                        }),
                        opts
                    )
                );
            });
            expect(result.items.every((i) => i.status === ITEM.succeeded)).toBe(true); // the engine cannot see this; only output verification can
            expect(() => verifyRows(dir, table)).toThrow();
        });
    });
});
