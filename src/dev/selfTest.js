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
import { autoMap, createMapping, setImageMapping } from "../domain/mapping.js";
import { buildFolderIndex } from "../domain/imageFiles.js";
import { runPreflight } from "../domain/preflight.js";
import { runVideoPreflight } from "../domain/video/preflight.js";
import { runDesignJob } from "../engine/designJob.js";
import { runVideoJob } from "../engine/videoJob.js";
import { createDevBilling } from "../account/devBilling.js";
import { imageInfo } from "../media/imageInfo.js";

export const SELF_TEST_MARKER = "elzoz-dev-selftest";

const CARD = "product-card-1080x1350.psd";
const REEL = "reel-1080x1920.psd";
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
            "Photoshop's History panel for the template shows no Elzoz changes, and the template file was not saved."
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
            const result = await runVideoJob({ port, billing: createDevBilling(), template: { entry: ctx.reel }, templateLayers: info.layers, plan, folders: jobFolders(), output: { entry: ctx.out } });
            const item = result.items[0];
            need(item.status === "succeeded", item.error ? `${item.error.step}: ${item.error.message}` : item.status);
            // The writer already re-read and verified the MOV (codec, size, frames, duration).
            return { status: result.status, files: item.files };
        });
        await step("integrity-video", "No documents left open after video", async () => {
            need(photoshop.app.documents.length === ctx.docCount, `open documents: ${ctx.docCount} before, ${photoshop.app.documents.length} after`);
            return { openDocuments: photoshop.app.documents.length };
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
