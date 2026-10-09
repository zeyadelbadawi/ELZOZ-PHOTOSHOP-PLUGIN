// Runs the real engine on the real fixture files (PSD templates parsed from
// disk, real spreadsheets, real image bytes) inside the SIMULATED Photoshop
// host. Exported PSDs are checked with psd-tools (an independent parser).
// These results say nothing about real Photoshop; they verify Elzoz's logic.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { hasPsdTools, psdSummary } from "./psdSummary.js";
import { createFakeHost, FakeFolder } from "../fakes/fakePhotoshop.js";
import { createPixelStore, templateFromPsd } from "../fakes/psdTemplate.js";
import { writeSimulatedPsd } from "../fakes/psdWriter.js";
import { createPhotoshopPort } from "../../src/ps/port.js";
import { runDesignJob, ITEM, JOB } from "../../src/engine/designJob.js";
import { readTable, readWorkbook } from "../../src/domain/excel.js";
import { runPreflight } from "../../src/domain/preflight.js";
import { runVideoPreflight } from "../../src/domain/video/preflight.js";
import { buildTimeline, videoUnits } from "../../src/domain/video/timeline.js";
import { autoMap, createMapping, setImageMapping } from "../../src/domain/mapping.js";
import { buildFolderIndex } from "../../src/domain/imageFiles.js";
import { subsetPlan } from "../../src/app/state.js";

const FX = path.resolve("test-artifacts/fixtures");
const hasFixtures = fs.existsSync(path.join(FX, "manifest.json"));
const d = hasFixtures ? describe : describe.skip;

const folderFrom = (dir, name = path.basename(dir)) =>
    new FakeFolder(name, Object.fromEntries(fs.readdirSync(dir).map((f) => [f, { bytes: new Uint8Array(fs.readFileSync(path.join(dir, f))) }])));
const sheet = (file, opts) => readTable(readWorkbook(fs.readFileSync(path.join(FX, "spreadsheets", file))).workbook, opts);

function host() {
    const pixelStore = createPixelStore();
    const products = folderFrom(path.join(FX, "images/products"), "products");
    const logos = folderFrom(path.join(FX, "images/logos"), "logos");
    const fileBytes = (name) => (products.files.get(name) || logos.files.get(name) || {}).bytes || null;
    const h = createFakeHost({
        loadTemplate: (entry) => templateFromPsd(fs.readFileSync(entry.nativePath), pixelStore, path.basename(entry.nativePath)),
        writePsd: (doc) => writeSimulatedPsd(doc, { pixelStore, fileBytes })
    });
    return { ...h, port: createPhotoshopPort(h), products, logos, pixelStore };
}

async function prepare(file, templateFile) {
    const h = host();
    const template = { entry: { nativePath: path.join(FX, "templates", templateFile) } };
    const info = await h.port.inspectTemplate(template);
    const table = sheet(file);
    let mapping = autoMap(createMapping(), table.headers, info.layers, table.rows);
    for (const [id, rule] of Object.entries(mapping.images)) {
        const layer = info.layers.find((l) => l.id === Number(id));
        mapping = setImageMapping(mapping, Number(id), { ...rule, folderKey: layer.name === "Logo" ? "logos" : "products" });
    }
    const folders = { products: { name: "products", index: buildFolderIndex([...h.products.files.keys()]) }, logos: { name: "logos", index: buildFolderIndex([...h.logos.files.keys()]) } };
    return { h, template, info, table, mapping, folders };
}

const run = (ctx, plan, out, billing) =>
    runDesignJob({
        port: ctx.h.port,
        billing,
        template: ctx.template,
        templateLayers: ctx.info.layers,
        plan,
        folders: { products: { name: "products", entry: ctx.h.products }, logos: { name: "logos", entry: ctx.h.logos } },
        output: { entry: out }
    });

function recordingBilling() {
    const log = [];
    return {
        log,
        startJob: async (r) => (log.push({ op: "start", n: r.itemKeys.length }), { jobId: "sim" }),
        reportItem: async (r) => log.push({ op: "report", key: r.itemKey, status: r.status }),
        finishJob: async (r) => (log.push({ op: "finish", status: r.status }), { charged: log.filter((l) => l.status === "succeeded").length })
    };
}

d("SIMULATED Photoshop + real fixture files", () => {
    it("reads the real PSD template structure (top-to-bottom, nested, kinds)", async () => {
        const ctx = await prepare("products-valid.xlsx", "product-card-1080x1350.psd");
        expect(ctx.info).toMatchObject({ width: 1080, height: 1350 });
        expect(ctx.info.layers.map((l) => `${l.path.join("/")}:${l.kind}`)).toEqual([
            "Footer:group", "Footer/Name:text",
            "Card:group", "Card/Text:group", "Card/Text/Description:text", "Card/Text/Price:text", "Card/Text/Name:text", "Card/Badge:pixel",
            "Media:group", "Media/Logo:smartObject", "Media/Photo:smartObject",
            "Background:pixel"
        ]);
    });

    it("Scenario A: 8 valid rows -> 8 x (JPG + PSD), template untouched, PSD contents correct per row", async () => {
        const ctx = await prepare("products-valid.xlsx", "product-card-1080x1350.psd");
        // Auto-map: both "Name" layers, Price, Description, Photo, Logo. The "Badge" column is plain text, so the Badge pixel layer stays unmapped.
        expect(ctx.mapping.images[ctx.info.layers.find((l) => l.name === "Badge").id]).toBeUndefined();
        const plan = runPreflight({ table: ctx.table, layers: ctx.info.layers, mapping: ctx.mapping, folders: ctx.folders, output: { name: "out", existingFileNames: [] }, formats: ["jpg", "psd"], namePattern: "{row}_{Name}", pricing: { unitPrice: 1 }, balance: null });
        expect(plan.blocking).toEqual([]);
        expect(plan.units).toBe(8);
        const out = new FakeFolder("out");
        const source = ctx.h.photoshop.app.documents[0];
        const before = source.serialize();
        const billing = recordingBilling();
        const result = await run(ctx, plan, out, billing);

        expect(result.status).toBe(JOB.completed);
        expect(out.files.size).toBe(16);
        expect(source.serialize()).toBe(before);
        expect(ctx.h.env.calls.filter((c) => c.op === "save")).toEqual([]);
        expect(billing.log.filter((l) => l.status === "succeeded")).toHaveLength(8);

        // Write PSD outputs to disk and inspect them with psd-tools.
        const dir = path.resolve("test-artifacts/outputs/simulated-node/scenario-a-psd");
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        for (const [name, f] of out.files) if (name.endsWith(".psd")) fs.writeFileSync(path.join(dir, name), f.bytes);
        if (!hasPsdTools) return;
        const parsed = psdSummary(dir);
        expect(Object.keys(parsed)).toHaveLength(8);
        expect(parsed["1_Aurora Laptop 14.psd"]).toMatchObject({ "Name@Text": "Aurora Laptop 14", "Price@Text": "$1,299", "Photo@Media": "laptop.jpg", "Logo@Media": "elzoz-logo.png", "Name@Footer": "Aurora Laptop 14" });
        expect(parsed["2_Pulse Phone X.psd"]).toMatchObject({ "Photo@Media": "phone.jpg", "Logo@Media": "nova.png" });
        expect(parsed["6_Glow Desk Lamp.psd"]["Photo@Media"]).toBe("Lamp.JPG");
        expect(parsed["7_سماعة لاسلكية.psd"]).toMatchObject({ "Name@Text": "سماعة لاسلكية", "Photo@Media": "speaker.webp" });
    });

    it("places images with fit into the frame: correct centre and aspect for portrait, landscape and extreme sizes", async () => {
        const ctx = await prepare("products-valid.xlsx", "product-card-1080x1350.psd");
        const plan = runPreflight({ table: ctx.table, layers: ctx.info.layers, mapping: ctx.mapping, folders: ctx.folders, output: { name: "o", existingFileNames: [] }, formats: ["jpg"], namePattern: "{row}", pricing: { unitPrice: 1 }, balance: null });
        const out = new FakeFolder("out");
        await run(ctx, plan, out, recordingBilling());
        const photo = (name) => {
            const layers = JSON.parse(out.files.get(name).snapshot);
            const media = layers.find((l) => l.name === "Media");
            return media.layers.find((l) => l.name === "Photo").bounds;
        };
        // Frame is 800x600 at (140,300); centre (540,600).
        const laptop = photo("1.jpg"); // 1600x1000 -> 0.5 -> 800x500
        expect([laptop.right - laptop.left, laptop.bottom - laptop.top]).toEqual([800, 500]);
        const phone = photo("2.jpg"); // 800x1400 -> 600/1400 -> ~342.9x600
        expect(phone.bottom - phone.top).toBeCloseTo(600, 5);
        expect((phone.right - phone.left) / (phone.bottom - phone.top)).toBeCloseTo(800 / 1400, 5);
        for (const b of [laptop, phone]) {
            expect((b.left + b.right) / 2).toBeCloseTo(540, 5);
            expect((b.top + b.bottom) / 2).toBeCloseTo(600, 5);
        }
    });

    it("Scenario B: edge spreadsheet -> truthful preflight; corrupt image fails at render; nothing else charged", async () => {
        const ctx = await prepare("products-edge.xlsx", "product-card-1080x1350.psd");
        expect(ctx.table.headers.map((h) => h.key)).toEqual(["Name", "name (2)", "Price", "Column D", "Photo", "Logo", "Notes"]);
        expect(ctx.table.issues.map((i) => i.code).sort()).toEqual(["blank_rows", "duplicate_header", "empty_header"]);
        const plan = runPreflight({ table: ctx.table, layers: ctx.info.layers, mapping: ctx.mapping, folders: ctx.folders, output: { name: "o", existingFileNames: [] }, formats: ["jpg"], namePattern: "{row}_{Name}", pricing: { unitPrice: 1 }, balance: null });
        const codes = Object.fromEntries(plan.warnings.map((w) => [w.code, w.rows]));
        expect(codes.image_not_found).toEqual([2]);
        expect(codes.image_path_not_allowed).toEqual([3]);
        expect(codes.image_unsupported_type).toEqual([4]);
        expect(codes.image_ambiguous).toEqual([6]);
        expect(plan.skipped.map((s) => s.sourceRow)).toEqual([2, 3, 4]);

        const out = new FakeFolder("out");
        const billing = recordingBilling();
        const result = await run(ctx, plan, out, billing);
        const byRow = Object.fromEntries(result.items.map((i) => [i.sourceRow, i]));
        expect(byRow[5]).toMatchObject({ status: ITEM.failed, error: { step: "image", message: expect.stringMatching(/not compatible/) } });
        expect(result.items.filter((i) => i.status === ITEM.succeeded)).toHaveLength(plan.units - 1);
        expect(billing.log.filter((l) => l.status === "failed").map((l) => l.key)).toEqual(["row-5"]);
        expect([...out.files.keys()].some((n) => n.startsWith("04_Corrupt"))).toBe(false); // no partial output for the failed row
        expect([...out.files.keys()].find((n) => n.startsWith("09_Name_with_illegal"))).toBe("09_Name_with_illegal_chars_.jpg");
    });

    it("Scenario D (simulated billing): fixing the corrupt file and retrying only that row succeeds", async () => {
        const ctx = await prepare("products-recovery.xlsx", "product-card-1080x1350.psd");
        const plan = runPreflight({ table: ctx.table, layers: ctx.info.layers, mapping: ctx.mapping, folders: ctx.folders, output: { name: "o", existingFileNames: [] }, formats: ["jpg", "psd"], namePattern: "{row}_{Name}", pricing: { unitPrice: 1 }, balance: null });
        expect(plan.skipped.map((s) => s.sourceRow)).toEqual([4]); // speaker-missing.jpg
        const out = new FakeFolder("out");
        const first = await run(ctx, plan, out, recordingBilling());
        expect(first.items.map((i) => i.status)).toEqual([ITEM.succeeded, ITEM.succeeded, ITEM.failed]);
        // The user replaces broken.jpg with a valid image, then retries the failed row only.
        const good = ctx.h.products.files.get("mug.jpg").bytes;
        const broken = ctx.h.products.files.get("broken.jpg");
        broken.bytes = good;
        broken.size = good.length;
        broken.image = { width: 900, height: 900 };
        const retry = await run(ctx, subsetPlan(plan, first.items.filter((i) => i.status === ITEM.failed).map((i) => i.key)), out, recordingBilling());
        expect(retry.items.map((i) => [i.key, i.status])).toEqual([["row-5", ITEM.succeeded]]);
        expect(out.files.size).toBe(6);
    });

    it("rejects the invalid spreadsheet fixtures with clear errors", () => {
        expect(sheet("headers-only.xlsx").issues.map((i) => i.code)).toContain("no_rows");
        expect(sheet("too-many-rows.xlsx").issues.map((i) => i.code)).toContain("too_many_rows");
        expect(() => readWorkbook(fs.readFileSync(path.join(FX, "spreadsheets/corrupt.xlsx")))).toThrow();
        const csv = readTable(readWorkbook(fs.readFileSync(path.join(FX, "spreadsheets/products.csv"))).workbook);
        expect(csv.headers.map((h) => h.key)).toEqual(["Name", "Price", "Description", "Photo", "Logo", "Badge"]);
        expect(csv.rows).toHaveLength(3);
    });

    it("video configurations behave as documented in the fixture file", async () => {
        const configs = JSON.parse(fs.readFileSync(path.join(FX, "video/video-configs.json"), "utf8"));
        for (const cfg of configs) {
            if (cfg.pricingOnly) {
                expect(videoUnits(cfg.spec.durationMs, cfg.spec.width, cfg.spec.height), cfg.id).toBe(cfg.expect.units);
                continue;
            }
            const ctx = cfg.template ? await prepare("products-valid.xlsx", cfg.template) : null;
            const byName = (n) => ctx && ctx.info.layers.find((l) => l.name === n && l.kind !== "group");
            const tracks = Object.entries(cfg.spec.tracks).map(([name, t]) => ({ ...t, layerId: byName(name) ? byName(name).id : 1 }));
            const spec = { ...cfg.spec, tracks };
            if (!ctx) {
                const tl = buildTimeline(spec);
                expect(tl.ok, cfg.id).toBe(false);
                expect(tl.errors.map((e) => e.code), cfg.id).toContain(cfg.expectError);
                continue;
            }
            const plan = runVideoPreflight({ table: ctx.table, layers: ctx.info.layers, template: { width: ctx.info.width, height: ctx.info.height }, mapping: ctx.mapping, folders: ctx.folders, output: { name: "o", existingFileNames: [] }, namePattern: "{row}", pricing: { unitPrice: 1 }, balance: null, timelineSpec: spec });
            if (cfg.valid) {
                expect(plan.blocking, cfg.id).toEqual([]);
                expect(plan.timeline, cfg.id).toMatchObject({ width: cfg.expect.width, height: cfg.expect.height, frameCount: cfg.expect.frames, durationMs: cfg.expect.durationMs });
                expect(plan.unitsPerItem, cfg.id).toBe(cfg.expect.units);
            } else {
                expect(plan.blocking.map((b) => b.code), cfg.id).toContain(cfg.expectError);
            }
        }
    });

    it("performance: 1000-row spreadsheet parses and preflights quickly; a simulated batch runs through", async () => {
        const t0 = performance.now();
        const ctx = await prepare("products-1000.xlsx", "product-card-1080x1350.psd");
        const plan = runPreflight({ table: ctx.table, layers: ctx.info.layers, mapping: ctx.mapping, folders: ctx.folders, output: { name: "o", existingFileNames: [] }, formats: ["jpg"], namePattern: "{row}_{Name}", pricing: { unitPrice: 1 }, balance: null });
        const tPlan = performance.now() - t0;
        expect(plan.units).toBe(1000);
        expect(tPlan).toBeLessThan(5000);
        const t1 = performance.now();
        const result = await run(ctx, plan, new FakeFolder("out"), recordingBilling());
        const tRun = performance.now() - t1;
        expect(result.items.every((i) => i.status === ITEM.succeeded)).toBe(true);
        console.log(`[perf, simulated host] parse+preflight 1000 rows: ${tPlan.toFixed(0)} ms; engine loop 1000 rows: ${tRun.toFixed(0)} ms (excludes real Photoshop rendering time)`);
    }, 120000);
});
