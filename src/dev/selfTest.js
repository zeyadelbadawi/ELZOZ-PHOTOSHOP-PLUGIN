// Developer-only Photoshop integration self-test (not in production builds).
//
// Runs the REAL engine inside the host it is loaded in, on the QA kit folder
// (test-artifacts/fixtures copied as-is): reads the fixture spreadsheet,
// inspects the fixture template, generates 3 designs (JPG, PNG, PSD) and one
// video, then checks the outputs, that the template file is unchanged and
// that no extra documents were left open. Credits are never charged (the
// development billing stub is used). The report is saved next to the outputs.
//
// In Photoshop this is the evidence that the integration works; in the test
// simulator it only proves the self-test itself is wired correctly.
import { readTable, readWorkbook } from "../domain/excel.js";
import { autoMap, createMapping, setColorMapping, setImageMapping, setTextOptions, setVisibilityMapping } from "../domain/mapping.js";
import { buildFolderIndex } from "../domain/imageFiles.js";
import { runPreflight } from "../domain/preflight.js";
import { runVideoPreflight } from "../domain/video/preflight.js";
import { runDesignJob } from "../engine/designJob.js";
import { runVideoJob } from "../engine/videoJob.js";
import { runProofJob } from "../engine/proofJob.js";
import { leadLayers, artboardSize } from "../domain/artboards.js";
import { DEFAULT_PRINT } from "../domain/imposition.js";
import { createDevBilling } from "../account/devBilling.js";
import { imageInfo } from "../media/imageInfo.js";

export const SELF_TEST_MARKER = "elzoz-dev-selftest";

const CARD = "product-card-1080x1350.psd";
const REEL = "reel-1080x1920.psd";
const ARTBOARDS = "social-sizes-artboards.psd";
const EXPECTED_CARD_LAYERS = [
    "Footer:group", "Footer/Name:text",
    "Card:group", "Card/Text:group", "Card/Text/Description:text", "Card/Text/Price:text", "Card/Text/Name:text", "Card/Badge:pixel",
    "Media:group", "Media/Logo:smartObject", "Media/Photo:smartObject",
    "Background:pixel"
];
// Rows 1, 2 and 7: an extension-less image name ("phone") and Arabic text.
const DESIGN_ROWS = [2, 3, 8];

const toU8 = (buf) => (buf instanceof Uint8Array ? buf : new Uint8Array(buf));
function fnv1a(bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193) >>> 0;
    return h.toString(16).padStart(8, "0");
}
async function child(folder, ...names) {
    let e = folder;
    for (const n of names) e = await e.getEntry(n);
    return e;
}

/**
 * @param {object} p
 * @param {object} p.photoshop   require("photoshop")
 * @param {object} p.uxp         require("uxp")
 * @param {object} p.port        createPhotoshopPort(...)
 * @param {object} p.kit         UXP Folder: the QA kit (templates/, spreadsheets/, images/)
 * @param {Function} [p.onStep]  (step) => void, called as each step finishes
 * @param {Function} [p.now]
 */
export async function runSelfTest({ photoshop, uxp, port, kit, onStep = () => {}, now = () => Date.now() }) {
    const binary = uxp.storage.formats.binary;
    const report = {
        marker: SELF_TEST_MARKER,
        startedAt: new Date(now()).toISOString(),
        host: { photoshop: photoshop.app.version, uxp: uxp.versions && uxp.versions.uxp, plugin: uxp.versions && uxp.versions.plugin, caps: port.caps },
        steps: [],
        manualChecks: [
            "Open the 3 JPG/PNG files: product photo and logo sit inside their frames, text is the row's text (including the Arabic row), nothing is cut off unexpectedly.",
            "Open one PSD: layers are intact and editable; the Smart Objects contain the row's images.",
            "Play the MOV in QuickTime or VLC: 2 s, text slides up, photo slowly zooms.",
            "Photoshop's History panel for the template shows no Elzoz changes, and the template file was not saved.",
            "features/: the files in NEW/ and HOT/ show the yellow badge; features/4_Orbit Watch.jpg (no badge in the sheet) has none.",
            "features/: every image is 540 px wide; long descriptions are scaled down to fit their original width.",
            "new/artboards/: Post 1080×1080, Story 1080×1920, Banner 1200×628, each showing only its own artboard.",
            "new/print/Print.pdf: opens in Acrobat, one page per design at the template's size with crop marks.",
            "new/proof/Approval sheet.pdf: every design has the diagonal PROOF watermark and a #number label under it.",
            "new/subject/: the product is inside the frame (not cut off); with background removal the original background is gone.",
            "new/colors/: the product name is red (#E63946) on row 2 and blue (#1D4ED8) on row 3.",
            "The video is an .mp4 that plays in WhatsApp, a phone and VLC."
        ]
    };
    const ctx = {};
    const step = async (id, title, fn) => {
        const t0 = now();
        const s = { id, title, status: "pass", ms: 0, detail: null };
        try {
            s.detail = (await fn()) ?? null;
        } catch (e) {
            s.status = "fail";
            s.detail = { message: e && e.message, step: e && e.step, stack: e && e.stack ? String(e.stack).split("\n").slice(0, 4).join("\n") : null };
        }
        s.ms = now() - t0;
        report.steps.push(s);
        onStep(s);
        return s.status === "pass";
    };
    const need = (cond, message) => {
        if (!cond) throw new Error(message);
    };

    await step("kit", "Find the QA kit files", async () => {
        ctx.card = await child(kit, "templates", CARD);
        ctx.reel = await child(kit, "templates", REEL);
        ctx.sheet = await child(kit, "spreadsheets", "products-valid.xlsx");
        ctx.products = await child(kit, "images", "products");
        ctx.logos = await child(kit, "images", "logos");
        const names = async (f) => (await f.getEntries()).filter((e) => e.isFile).map((e) => e.name);
        ctx.folders = {
            products: { name: "products", index: buildFolderIndex(await names(ctx.products)), entry: ctx.products },
            logos: { name: "logos", index: buildFolderIndex(await names(ctx.logos)), entry: ctx.logos }
        };
        return { products: ctx.folders.products.index.count, logos: ctx.folders.logos.index.count };
    });
    if (!ctx.card) return finish();

    await step("spreadsheet", "Read the fixture spreadsheet", async () => {
        const { workbook } = readWorkbook(toU8(await ctx.sheet.read({ format: binary })));
        ctx.table = readTable(workbook);
        need(ctx.table.rows.length === 8, `expected 8 rows, got ${ctx.table.rows.length}`);
        return { rows: ctx.table.rows.length, headers: ctx.table.headers.map((h) => h.key) };
    });

    await step("integrity-before", "Record the template file", async () => {
        ctx.hash = fnv1a(toU8(await ctx.card.read({ format: binary })));
        return { templateHash: ctx.hash };
    });

    await step("inspect", "Inspect the template's layers", async () => {
        ctx.info = await port.inspectTemplate({ entry: ctx.card });
        const got = ctx.info.layers.map((l) => `${l.path.join("/")}:${l.kind}`);
        need(ctx.info.width === 1080 && ctx.info.height === 1350, `size ${ctx.info.width}x${ctx.info.height}`);
        need(JSON.stringify(got) === JSON.stringify(EXPECTED_CARD_LAYERS), `layer tree differs: ${got.join(", ")}`);
        // Choosing a template opens it in Photoshop (by design); jobs must not leave anything else open.
        ctx.docCount = photoshop.app.documents.length;
        return { layers: got.length, openDocuments: ctx.docCount };
    });

    const mapFor = (layers) => {
        let m = autoMap(createMapping(), ctx.table.headers, layers, ctx.table.rows);
        for (const [id, rule] of Object.entries(m.images)) {
            const layer = layers.find((l) => l.id === Number(id));
            m = setImageMapping(m, Number(id), { ...rule, folderKey: layer.name === "Logo" ? "logos" : "products" });
        }
        return m;
    };
    const planFolders = () => Object.fromEntries(Object.entries(ctx.folders).map(([k, f]) => [k, { name: f.name, index: f.index }]));
    const jobFolders = () => Object.fromEntries(Object.entries(ctx.folders).map(([k, f]) => [k, { name: f.name, entry: f.entry }]));
    const onlyRows = (table, rows) => ({ ...table, rows: table.rows.filter((r) => rows.includes(r.sourceRow)) });

    if (ctx.info && ctx.table) {
        await step("design", "Generate 3 designs (JPG, PNG, PSD) with the real engine", async () => {
            ctx.out = await kit.createFolder(`selftest-${new Date(now()).toISOString().replace(/[:.]/g, "-").slice(0, 19)}`);
            const plan = runPreflight({
                table: onlyRows(ctx.table, DESIGN_ROWS),
                layers: ctx.info.layers,
                mapping: mapFor(ctx.info.layers),
                folders: planFolders(),
                output: { name: ctx.out.name, existingFileNames: [] },
                formats: ["jpg", "png", "psd"],
                namePattern: "{row}_{Name}",
                pricing: { unitPrice: 1 },
                balance: null
            });
            need(plan.ok, `preflight blocked: ${plan.blocking.map((b) => b.message).join("; ")}`);
            const result = await runDesignJob({ port, billing: createDevBilling(), template: { entry: ctx.card }, templateLayers: ctx.info.layers, plan, folders: jobFolders(), output: { entry: ctx.out } });
            ctx.designFiles = result.items.flatMap((i) => i.files || []);
            const failed = result.items.filter((i) => i.status !== "succeeded");
            need(!failed.length, failed.map((i) => `row ${i.sourceRow}: ${i.error ? `${i.error.step}: ${i.error.message}` : i.status}`).join("; "));
            return { status: result.status, files: ctx.designFiles.map((f) => f.name) };
        });

        await step("outputs", "Check every exported file", async () => {
            need(ctx.designFiles && ctx.designFiles.length === 9, `expected 9 files, got ${ctx.designFiles ? ctx.designFiles.length : 0}`);
            const checked = [];
            for (const f of ctx.designFiles) {
                const bytes = toU8(await (await ctx.out.getEntry(f.name)).read({ format: binary }));
                need(bytes.length > 0, `${f.name} is empty`);
                if (f.format === "psd") need(String.fromCharCode(...bytes.subarray(0, 4)) === "8BPS", `${f.name} is not a PSD`);
                else {
                    const info = imageInfo(bytes);
                    need(info && info.width === 1080 && info.height === 1350, `${f.name} is ${info ? `${info.width}x${info.height}` : "not a readable image"}`);
                }
                checked.push({ name: f.name, bytes: bytes.length });
            }
            return checked;
        });
    }

    if (ctx.info && ctx.table && ctx.out) {
        await step("features", "Show/hide by column, shrink-to-fit, rows, subfolders and output size", async () => {
            const byPath = (p) => ctx.info.layers.find((l) => l.path.join("/") === p);
            let mapping = mapFor(ctx.info.layers);
            mapping = setVisibilityMapping(mapping, byPath("Card/Badge").id, "Badge", "hide");
            mapping = setTextOptions(mapping, byPath("Card/Text/Description").id, { shrinkToFit: true });
            const features = await ctx.out.createFolder("features");
            const plan = runPreflight({
                table: ctx.table,
                layers: ctx.info.layers,
                mapping,
                folders: planFolders(),
                output: { name: features.name, existingFileNames: [] },
                formats: ["jpg"],
                namePattern: "{Badge}/{row}_{Name}",
                rowSelection: "2-3, 5",
                outputWidth: 540,
                templateSize: { width: ctx.info.width, height: ctx.info.height },
                pricing: { unitPrice: 1 },
                balance: null
            });
            need(plan.ok, `preflight blocked: ${plan.blocking.map((b) => b.message).join("; ")}`);
            need(plan.items.length === 3, `row selection gave ${plan.items.length} rows`);
            const result = await runDesignJob({ port, billing: createDevBilling(), template: { entry: ctx.card }, templateLayers: ctx.info.layers, plan, folders: jobFolders(), output: { entry: features } });
            const failed = result.items.filter((i) => i.status !== "succeeded");
            need(!failed.length, failed.map((i) => `row ${i.sourceRow}: ${i.error ? `${i.error.step}: ${i.error.message}` : i.status}`).join("; "));
            const checked = [];
            for (const it of plan.items) {
                const target = await port.outputTarget(features, it.baseName);
                const bytes = toU8(await (await target.folder.getEntry(`${target.name}.jpg`)).read({ format: binary }));
                const info = imageInfo(bytes);
                need(info && info.width === 540 && info.height === 675, `${it.baseName}.jpg is ${info ? `${info.width}x${info.height}` : "unreadable"}`);
                checked.push(`${it.baseName}.jpg`);
            }
            return { files: checked };
        });
    }

    if (ctx.docCount !== undefined) await step("integrity-after", "Template unchanged, no documents left open", async () => {
        const hash = fnv1a(toU8(await ctx.card.read({ format: binary })));
        need(hash === ctx.hash, "the template file changed on disk");
        need(photoshop.app.documents.length === ctx.docCount, `open documents: ${ctx.docCount} before, ${photoshop.app.documents.length} after`);
        return { templateHash: hash, openDocuments: photoshop.app.documents.length };
    });

    if (ctx.table && ctx.out) {
        await step("video", "Render one 2 s video (24 fps) with the real engine", async () => {
            const info = await port.inspectTemplate({ entry: ctx.reel });
            ctx.docCount = photoshop.app.documents.length;
            const byName = (n) => info.layers.find((l) => l.name === n && l.kind !== "group");
            const tracks = [
                byName("Name") && { layerId: byName("Name").id, preset: "slideUp", startMs: 0, lengthMs: 800, easing: "easeOut" },
                byName("Photo") && { layerId: byName("Photo").id, preset: "kenBurns", startMs: 0, lengthMs: 2000, easing: "linear" }
            ].filter(Boolean);
            const plan = runVideoPreflight({
                table: onlyRows(ctx.table, [2]),
                layers: info.layers,
                template: { width: info.width, height: info.height },
                mapping: mapFor(info.layers),
                folders: planFolders(),
                output: { name: ctx.out.name, existingFileNames: [] },
                namePattern: "video_{row}",
                pricing: { unitPrice: 1 },
                balance: null,
                timelineSpec: { format: "reel", fps: 24, durationMs: 2000, fadeOutMs: 0, tracks }
            });
            need(plan.ok, `video preflight blocked: ${plan.blocking.map((b) => b.message).join("; ")}`);
            const result = await runVideoJob({
                port,
                billing: createDevBilling(),
                template: { entry: ctx.reel },
                templateLayers: info.layers,
                plan,
                folders: jobFolders(),
                output: { entry: ctx.out },
                options: { videoFormat: "mp4", videoQuality: "standard" }
            });
            const item = result.items[0];
            need(item.status === "succeeded", item.error ? `${item.error.step}: ${item.error.message}` : item.status);
            need((item.files || []).some((f) => /\.mp4$/i.test(f.name || f)), `no .mp4 written: ${JSON.stringify(item.files)}`);
            // The writer already re-read and verified the MP4 (codec, size, frames, duration).
            return { status: result.status, files: item.files };
        });
        await step("integrity-video", "No documents left open after video", async () => {
            need(photoshop.app.documents.length === ctx.docCount, `open documents: ${ctx.docCount} before, ${photoshop.app.documents.length} after`);
            return { openDocuments: photoshop.app.documents.length };
        });
    }

    // ---------------------------------------------------------------- features 1-15 in the real host
    // Each step uses a Photoshop call the simulator can only imitate (batchPlay descriptors,
    // artboards, Select Subject / Remove Background, crop, text layers, fills).
    if (ctx.table && ctx.out && ctx.info) {
        const newDir = await ctx.out.createFolder("new");
        const designJob = async (folderName, planArgs, extra = {}) => {
            const folder = await newDir.createFolder(folderName);
            const plan = runPreflight({
                table: onlyRows(ctx.table, [2, 3]),
                folders: planFolders(),
                output: { name: folder.name, existingFileNames: [] },
                formats: ["jpg"],
                namePattern: "{row}_{Name}",
                pricing: { unitPrice: 1 },
                balance: null,
                ...planArgs
            });
            need(plan.ok, `preflight blocked: ${plan.blocking.map((b) => b.message).join("; ")}`);
            const before = photoshop.app.documents.length;
            const result = await runDesignJob({ port, billing: createDevBilling(), templateLayers: planArgs.layers, plan, folders: jobFolders(), output: { entry: folder }, ...extra });
            const failed = result.items.filter((i) => i.status !== "succeeded");
            need(!failed.length, failed.map((i) => `row ${i.sourceRow}: ${i.error ? `${i.error.step}: ${i.error.message}` : i.status}`).join("; "));
            need(photoshop.app.documents.length === before, `open documents: ${before} before, ${photoshop.app.documents.length} after`);
            return { folder, plan, result };
        };
        const jpgSize = async (folder, baseName) => {
            const target = await port.outputTarget(folder, baseName);
            const info = imageInfo(toU8(await (await target.folder.getEntry(`${target.name}.jpg`)).read({ format: binary })));
            return info ? [info.width, info.height] : null;
        };
        const fileBytes = async (folder, name) => toU8(await (await folder.getEntry(name)).read({ format: binary }));

        await step("artboards", "Feature 5: one design per artboard, cropped to its size", async () => {
            const entry = await child(kit, "templates", ARTBOARDS);
            const info = await port.inspectTemplate({ entry });
            const sizes = (info.artboards || []).map((a) => [a.name, artboardSize(a).width, artboardSize(a).height]);
            need(JSON.stringify(sizes) === JSON.stringify([["Post", 1080, 1080], ["Story", 1080, 1920], ["Banner", 1200, 628]]), `artboards read as ${JSON.stringify(sizes)}`);
            const lead = leadLayers(info.layers, info.artboards);
            const mapping = mapFor(lead);
            const { folder, plan } = await designJob("artboards", { layers: info.layers, mapping, artboards: info.artboards, namePattern: "{artboard}/{row}_{Name}" }, { template: { entry } });
            const got = [];
            for (const it of plan.items) got.push([it.baseName, ...(await jpgSize(folder, it.baseName))]);
            const want = { Post: [1080, 1080], Story: [1080, 1920], Banner: [1200, 628] };
            for (const [name, w, h] of got) {
                const ab = name.split("/")[0];
                need(want[ab] && want[ab][0] === w && want[ab][1] === h, `${name}.jpg is ${w}x${h}, expected ${want[ab]}`);
            }
            return { designs: got };
        });

        await step("print-pdf", "Feature 13: print PDF written during a job", async () => {
            const print = { options: { ...DEFAULT_PRINT, enabled: true, marks: true }, fileName: "Print.pdf" };
            const { folder, result } = await designJob("print", { layers: ctx.info.layers, mapping: mapFor(ctx.info.layers) }, { template: { entry: ctx.card }, print });
            need(result.print && result.print.pages === 2, `print result ${JSON.stringify(result.print)}`);
            const bytes = await fileBytes(folder, result.print.file);
            need(String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-", "Print.pdf is not a PDF");
            return { file: result.print.file, pages: result.print.pages, bytes: bytes.length };
        });

        await step("proof", "Feature 14: approval sheet (watermark text layer + label strip, free)", async () => {
            const folder = await newDir.createFolder("proof");
            const plan = runPreflight({
                table: onlyRows(ctx.table, [2, 3, 8]),
                layers: ctx.info.layers,
                mapping: mapFor(ctx.info.layers),
                folders: planFolders(),
                output: { name: folder.name, existingFileNames: [] },
                formats: ["jpg"],
                namePattern: "{row}_{Name}",
                pricing: { unitPrice: 1 },
                balance: null
            });
            const before = photoshop.app.documents.length;
            const result = await runProofJob({
                port,
                template: { entry: ctx.card },
                templateLayers: ctx.info.layers,
                plan,
                folders: jobFolders(),
                output: { entry: folder },
                proof: { perPage: 4, saveImages: true, fileName: "Approval sheet.pdf", folderName: "Proofs", title: "Self-test", dateText: new Date(now()).toISOString().slice(0, 10), templateSize: { width: 1080, height: 1350 } }
            });
            need(result.status === "completed", result.fatal ? result.fatal.message : result.status);
            need(result.proof && result.proof.designs === 3, `proof result ${JSON.stringify(result.proof)}`);
            need(photoshop.app.documents.length === before, `open documents: ${before} before, ${photoshop.app.documents.length} after`);
            const pdf = await fileBytes(folder, result.proof.file);
            need(String.fromCharCode(...pdf.subarray(0, 5)) === "%PDF-", "approval sheet is not a PDF");
            return result.proof;
        });

        await step("subject", "Features 7 + 12: smart crop on the subject, then remove the background", async () => {
            const photo = ctx.info.layers.find((l) => l.name === "Photo");
            let mapping = mapFor(ctx.info.layers);
            mapping = setImageMapping(mapping, photo.id, { ...mapping.images[photo.id], fit: "subject" });
            const crop = await designJob("subject", { layers: ctx.info.layers, mapping }, { template: { entry: ctx.card } });
            const notesCrop = crop.result.items.flatMap((i) => i.notes || []);
            mapping = setImageMapping(mapping, photo.id, { ...mapping.images[photo.id], fit: "subject", removeBg: true, bgFail: "keep" });
            const bg = await designJob("subject-nobg", { layers: ctx.info.layers, mapping }, { template: { entry: ctx.card } });
            const notesBg = bg.result.items.flatMap((i) => i.notes || []);
            // "No clear subject" or "used with its background" means Select Subject / Remove Background
            // didn't work in this Photoshop (the row still exported). "Top kept in view" is normal.
            const problems = [...notesCrop, ...notesBg].filter((n) => /no clear subject|with its background/.test(n));
            need(!problems.length, `Photoshop: ${problems.join(" | ")}`);
            return { cropped: crop.plan.items.length, backgroundRemoved: bg.plan.items.length, notes: [...notesCrop, ...notesBg] };
        });

        await step("colors", "Feature 11: text color from a column", async () => {
            const colors = { 2: "#E63946", 3: "#1D4ED8" };
            const table = { ...ctx.table, headers: [...ctx.table.headers, { key: "Color", label: "Color" }], rows: ctx.table.rows.map((r) => ({ ...r, values: { ...r.values, Color: colors[r.sourceRow] || "" } })) };
            const name = ctx.info.layers.find((l) => l.path.join("/") === "Card/Text/Name");
            const mapping = setColorMapping(mapFor(ctx.info.layers), name.id, "Color");
            const keep = ctx.table;
            ctx.table = table;
            try {
                const { plan } = await designJob("colors", { layers: ctx.info.layers, mapping }, { template: { entry: ctx.card } });
                need(plan.items.every((i) => (i.colors || []).length === 1), "colors missing from the plan");
                return { rows: plan.items.map((i) => [i.sourceRow, colors[i.sourceRow]]) };
            } finally {
                ctx.table = keep;
            }
        });
    }

    return finish();

    async function finish() {
        report.finishedAt = new Date(now()).toISOString();
        report.passed = report.steps.length > 0 && report.steps.every((s) => s.status === "pass");
        const target = ctx.out || kit;
        try {
            const f = await target.createFile(`elzoz-selftest-report.json`, { overwrite: true });
            await f.write(JSON.stringify(report, null, 2));
            report.savedTo = f.nativePath || `${target.name}/elzoz-selftest-report.json`;
        } catch (e) {
            report.saveError = e.message;
        }
        return report;
    }
}
