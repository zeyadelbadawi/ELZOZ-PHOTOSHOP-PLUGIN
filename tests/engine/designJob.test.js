import { beforeEach, describe, expect, it } from "vitest";
import { createFakeHost, FakeFolder } from "../fakes/fakePhotoshop.js";
import { createPhotoshopPort } from "../../src/ps/port.js";
import { runDesignJob, summarize, ITEM, JOB } from "../../src/engine/designJob.js";
import { runPreflight } from "../../src/domain/preflight.js";
import { createMapping, setImageMapping, setTextMapping } from "../../src/domain/mapping.js";
import { buildFolderIndex } from "../../src/domain/imageFiles.js";

const TEMPLATE_PATH = "/fake/templates/card.psd";
const templateSpec = {
    title: "card.psd",
    layers: [
        {
            name: "Card",
            kind: "group",
            layers: [
                { name: "Name", kind: "text", text: "Product" },
                { name: "Price", kind: "text", text: "$0" },
                { name: "Photo", kind: "smartObject", bounds: { left: 100, top: 100, right: 500, bottom: 400 } }
            ]
        },
        { name: "Banner", kind: "pixel", bounds: { left: 0, top: 600, right: 1000, bottom: 800 } },
        { name: "Background", kind: "pixel" }
    ]
};

function fakeBilling({ failStart = false, failReportAt = null } = {}) {
    const log = [];
    let reports = 0;
    return {
        log,
        async startJob({ kind, itemKeys }) {
            log.push({ op: "start", kind, itemKeys });
            if (failStart) throw new Error("Insufficient credits");
            return { jobId: "job-1" };
        },
        async reportItem(r) {
            reports++;
            if (failReportAt !== null && reports === failReportAt) throw new Error("network down");
            log.push({ op: "report", itemKey: r.itemKey, status: r.status, evidence: r.evidence });
        },
        async finishJob(r) {
            log.push({ op: "finish", status: r.status });
            return { charged: log.filter((l) => l.op === "report" && l.status === "succeeded").length };
        }
    };
}

async function setup({ rows, version, domText, imageFolder, banner = false } = {}) {
    const host = createFakeHost({ version, domText, templates: { [TEMPLATE_PATH]: templateSpec } });
    const port = createPhotoshopPort(host);
    const template = { entry: { nativePath: TEMPLATE_PATH, name: "card.psd" } };
    const inspected = await port.inspectTemplate(template);
    const layers = inspected.layers;
    const id = (name) => layers.find((l) => l.name === name).id;

    const products = imageFolder || new FakeFolder("products", { "laptop.jpg": { image: { width: 800, height: 400 } }, "mouse.png": { image: { width: 300, height: 600 } } });
    let mapping = setTextMapping(createMapping(), id("Name"), "Name");
    mapping = setTextMapping(mapping, id("Price"), "Price");
    mapping = setImageMapping(mapping, id("Photo"), { column: "Photo", folderKey: "p", fit: "fit" });
    if (banner) mapping = setImageMapping(mapping, id("Banner"), { column: "Photo", folderKey: "p", fit: "fill" });

    const headers = ["Name", "Price", "Photo"].map((k) => ({ key: k, label: k }));
    const table = { headers, issues: [], rows: rows.map((values, index) => ({ index, sourceRow: index + 2, values, isEmpty: false })) };
    const out = new FakeFolder("out");
    const plan = runPreflight({
        table,
        layers,
        mapping,
        folders: { p: { name: "products", index: buildFolderIndex([...products.files.keys()]) } },
        output: { name: "out", existingFileNames: [] },
        formats: ["jpg", "psd"],
        namePattern: "{row}_{Name}",
        pricing: { unitPrice: 1 },
        balance: null
    });
    expect(plan.ok).toBe(true);
    const sourceDoc = host.photoshop.app.documents.find((d) => d.path === TEMPLATE_PATH);
    const before = sourceDoc.serialize();
    return { host, port, template, layers, plan, out, products, sourceDoc, before, id };
}

const run = (s, billing, extra = {}) =>
    runDesignJob({
        port: s.port,
        billing,
        template: s.template,
        templateLayers: s.layers,
        plan: s.plan,
        folders: { p: { name: "products", entry: s.products } },
        output: { entry: s.out },
        ...extra
    });

const ROWS = [
    { Name: "Laptop", Price: "$999", Photo: "laptop" },
    { Name: "Mouse", Price: "$25", Photo: "mouse.png" }
];

describe("runDesignJob — non-destructive contract", () => {
    it("generates verified files per row and never touches the template", async () => {
        const s = await setup({ rows: ROWS });
        const billing = fakeBilling();
        const result = await run(s, billing);

        expect(result.status).toBe(JOB.completed);
        expect(summarize(result)).toMatchObject({ total: 2, succeeded: 2, failed: 0 });
        expect([...s.out.files.keys()].sort()).toEqual(["1_Laptop.jpg", "1_Laptop.psd", "2_Mouse.jpg", "2_Mouse.psd"]);

        // Each file captured that row's content, not a stale previous row.
        const snap = (name) => JSON.parse(s.out.files.get(name).snapshot)[0].layers;
        expect(snap("1_Laptop.jpg").map((l) => l.text ?? l.content)).toEqual(["Laptop", "$999", "laptop.jpg"]);
        expect(snap("2_Mouse.psd").map((l) => l.text ?? l.content)).toEqual(["Mouse", "$25", "mouse.png"]);

        // Template: unchanged, never saved; working copy closed; template left open (user opened via inspect).
        expect(s.sourceDoc.serialize()).toBe(s.before);
        expect(s.host.env.calls.filter((c) => c.op === "save")).toEqual([]);
        expect(s.host.env.calls.filter((c) => c.op === "saveAs").every((c) => c.asCopy === true && c.doc !== s.sourceDoc.id)).toBe(true);
        const dup = s.host.env.calls.find((c) => c.op === "duplicate");
        expect(s.host.env.calls.some((c) => c.op === "close" && c.doc === dup.to)).toBe(true);
        expect(s.host.env.calls.filter((c) => c.op === "revert")).toHaveLength(2);

        // Billing: reserved first, both reported as succeeded with file evidence, then finished.
        expect(billing.log.map((l) => l.op)).toEqual(["start", "report", "report", "finish"]);
        expect(billing.log[1]).toMatchObject({ itemKey: "row-2", status: "succeeded" });
        expect(billing.log[1].evidence.files).toHaveLength(2);
    });

    it("fits replaced Smart Object content into the original frame", async () => {
        const s = await setup({ rows: [ROWS[0]] });
        await run(s, fakeBilling());
        const photo = JSON.parse(s.out.files.get("1_Laptop.jpg").snapshot)[0].layers[2];
        // Frame 400x300 at (100,100); image 800x400 -> fit scale 0.5 -> 400x200, centered.
        expect(photo.bounds).toEqual({ left: 100, top: 150, right: 500, bottom: 350 });
    });

    it("selects the layer before Replace Contents (avoids -25920)", async () => {
        const s = await setup({ rows: [ROWS[0]] });
        await run(s, fakeBilling());
        // Read-only "get" calls (artboard detection when the template is read) don't count.
        const ops = s.host.env.calls.filter((c) => c.op === "batchPlay" && c._obj !== "get").map((c) => c._obj);
        expect(ops).toEqual(["select", "placedLayerReplaceContents"]);
    });

    it("places onto pixel layers above the original, hides it, and the revert removes it", async () => {
        const s = await setup({ rows: [ROWS[0]], banner: true });
        await run(s, fakeBilling());
        const top = JSON.parse(s.out.files.get("1_Laptop.jpg").snapshot);
        const placed = top.find((l) => l.content === "laptop.jpg");
        const banner = top.find((l) => l.name === "Banner");
        expect(banner.visible).toBe(false);
        // fill: 1000x200 frame, 800x400 image -> scale max(1.25, 0.5) = 1.25 -> 1000x500 centered on (500,700)
        expect(placed.bounds).toEqual({ left: 0, top: 450, right: 1000, bottom: 950 });
        expect(s.sourceDoc.serialize()).toBe(s.before);
    });

    it("uses the batchPlay text fallback on Photoshop before 24.2", async () => {
        const s = await setup({ rows: [ROWS[0]], version: "23.5.0", domText: false });
        expect(s.port.caps).toMatchObject({ hostSupported: true, domText: false });
        const result = await run(s, fakeBilling());
        expect(result.status).toBe(JOB.completed);
        const texts = s.host.env.calls.filter((c) => c.op === "batchPlay" && c._obj === "set");
        expect(texts).toHaveLength(2);
        expect(JSON.parse(s.out.files.get("1_Laptop.jpg").snapshot)[0].layers[0].text).toBe("Laptop");
    });
});

describe("runDesignJob — failures are isolated and never reported as success", () => {
    it("fails a row when Photoshop does not accept the text (read-back check)", async () => {
        const s = await setup({ rows: ROWS });
        s.host.env.rejectText = true;
        const billing = fakeBilling();
        const result = await run(s, billing);
        expect(result.items.map((i) => i.status)).toEqual([ITEM.failed, ITEM.failed]);
        expect(result.items[0].error.step).toBe("text");
        expect(result.status).toBe(JOB.completedWithErrors);
        expect(billing.log.filter((l) => l.op === "report").map((l) => l.status)).toEqual(["failed", "failed"]);
        expect(s.out.files.size).toBe(0);
    });

    it("continues after an image that Photoshop can't place", async () => {
        const s = await setup({ rows: ROWS });
        s.host.env.failReplace.add("laptop.jpg");
        const result = await run(s, fakeBilling());
        expect(result.items.map((i) => i.status)).toEqual([ITEM.failed, ITEM.succeeded]);
        expect(result.items[0].error).toMatchObject({ step: "image", message: expect.stringMatching(/not compatible/) });
        // Row 2 is clean: no leftover from row 1.
        expect(JSON.parse(s.out.files.get("2_Mouse.jpg").snapshot)[0].layers[0].text).toBe("Mouse");
    });

    it("fails a row whose image was deleted after preflight", async () => {
        const s = await setup({ rows: ROWS });
        s.products.files.delete("mouse.png");
        const result = await run(s, fakeBilling());
        expect(result.items[1]).toMatchObject({ status: ITEM.failed, error: { step: "image" } });
    });

    it("fails a row when an export file is empty on disk", async () => {
        const s = await setup({ rows: [ROWS[0]] });
        s.host.env.zeroByteFormats.push("psd");
        const result = await run(s, fakeBilling());
        expect(result.items[0]).toMatchObject({ status: ITEM.failed, error: { step: "export", format: "psd" } });
    });

    it("does not overwrite a file created after preflight", async () => {
        const s = await setup({ rows: [ROWS[0]] });
        await s.out.createFile("1_Laptop.jpg").then((f) => s.out.files.set(f.name, f));
        const result = await run(s, fakeBilling());
        expect(result.items[0]).toMatchObject({ status: ITEM.failed, error: { step: "export" } });
    });

    it("cancels: remaining rows are cancelled, nothing else charged", async () => {
        const s = await setup({ rows: [...ROWS, { Name: "Desk", Price: "$5", Photo: "laptop.jpg" }] });
        s.host.env.cancelAfterItems = 1; // isCancelled becomes true after the 2nd progress report
        const billing = fakeBilling();
        const result = await run(s, billing);
        expect(result.status).toBe(JOB.cancelled);
        expect(result.items.map((i) => i.status)).toEqual([ITEM.succeeded, ITEM.succeeded, ITEM.cancelled]);
        expect(billing.log.at(-1)).toEqual({ op: "finish", status: "cancelled" });
    });

    it("renders nothing when the server refuses the reservation", async () => {
        const s = await setup({ rows: ROWS });
        const result = await run(s, fakeBilling({ failStart: true }));
        expect(result).toMatchObject({ status: JOB.failed, fatal: { step: "billing" } });
        expect(s.host.env.calls.some((c) => c.op === "duplicate")).toBe(false);
        expect(s.out.files.size).toBe(0);
    });

    it("stops and still closes the working copy when billing can't record a row", async () => {
        const s = await setup({ rows: ROWS });
        const billing = fakeBilling({ failReportAt: 1 });
        const result = await run(s, billing);
        expect(result.status).toBe(JOB.failed);
        expect(result.fatal.step).toBe("billing");
        const dup = s.host.env.calls.find((c) => c.op === "duplicate");
        expect(s.host.env.calls.some((c) => c.op === "close" && c.doc === dup.to)).toBe(true);
        expect(result.items[1].status).toBe(ITEM.notStarted);
    });

    it("refuses to run a plan with blocking issues", async () => {
        await expect(runDesignJob({ plan: { ok: false } })).rejects.toThrow(/blocking/);
    });
});

describe("runDesignJob — partial exports", () => {
    it("removes the JPG of a row whose PSD export failed, so a retry can write it", async () => {
        const s = await setup({ rows: [ROWS[0]] });
        s.host.env.failFormats.push("psd");
        const result = await run(s, fakeBilling());
        expect(result.items[0]).toMatchObject({ status: ITEM.failed, error: { step: "export", format: "psd" } });
        expect(s.out.files.size).toBe(0);
    });
});
