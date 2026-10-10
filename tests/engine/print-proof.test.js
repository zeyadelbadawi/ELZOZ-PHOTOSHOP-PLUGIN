// Features 13 + 14 on the behavioural fake host: the print PDF written during a
// design job, and the free approval sheet (watermark + label baked in by
// "Photoshop", numbered PDF, optional proof images). SIMULATED host.
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFakeHost, FakeFolder, readFakeJpeg } from "../fakes/fakePhotoshop.js";
import { createPhotoshopPort } from "../../src/ps/port.js";
import { runDesignJob, ITEM, JOB } from "../../src/engine/designJob.js";
import { runProofJob, proofLabel, proofSize } from "../../src/engine/proofJob.js";
import { runPreflight } from "../../src/domain/preflight.js";
import { createMapping, setTextMapping } from "../../src/domain/mapping.js";
import { DEFAULT_PRINT } from "../../src/domain/imposition.js";

const PATH = "/fake/templates/card.psd";
const spec = (w = 1063, h = 638) => ({
    title: "card.psd",
    width: w,
    height: h,
    resolution: 300,
    layers: [
        { name: "Name", kind: "text", text: "Name", fontSize: 40, bounds: { left: 50, top: 50, right: 400, bottom: 100 } },
        { name: "Background", kind: "pixel", bounds: { left: 0, top: 0, right: w, bottom: h } }
    ]
});
const table = (names) => ({ headers: [{ key: "Name" }], issues: [], rows: names.map((n, i) => ({ index: i, sourceRow: i + 2, values: { Name: n }, isEmpty: false })) });
const billing = () => {
    const calls = [];
    return { calls, startJob: async () => (calls.push("start"), { jobId: "j" }), reportItem: async (r) => calls.push(r.status), finishJob: async () => ({ charged: 0 }) };
};
const PYPDF = (() => {
    try {
        execFileSync("python3", ["-c", "import pypdf"], { stdio: "ignore" });
        return true;
    } catch (e) {
        return false;
    }
})();
const pdfPages = (bytes) => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "elzoz-pp-")), "x.pdf");
    fs.writeFileSync(file, bytes);
    return JSON.parse(execFileSync("python3", ["-c", "import json,sys\nfrom pypdf import PdfReader\nr=PdfReader(sys.argv[1])\nprint(json.dumps([{'media':[float(x) for x in p.mediabox],'images':len(p['/Resources'].get('/XObject',{})),'text':p.extract_text()} for p in r.pages]))", file]).toString());
};

async function setup(names, hostCfg = {}, w, h) {
    const host = createFakeHost({ templates: { [PATH]: spec(w, h) }, ...hostCfg });
    const port = createPhotoshopPort(host);
    const template = { entry: { nativePath: PATH, name: "card.psd" } };
    const info = await port.inspectTemplate(template);
    const m = setTextMapping(createMapping(), info.layers.find((l) => l.name === "Name").id, "Name");
    const plan = runPreflight({ table: table(names), layers: info.layers, mapping: m, output: { name: "o", existingFileNames: [] }, formats: ["jpg"], namePattern: "{Name}", pricing: { unitPrice: 1 } });
    return { host, port, template, info, plan, out: new FakeFolder("out") };
}

describe("template resolution", () => {
    it("is read with the template (for print sizes)", async () => {
        const { info } = await setup(["a"]);
        expect(info.resolution).toBe(300);
    });
});

describe("print PDF during a design job (SIMULATED host)", () => {
    it.skipIf(!PYPDF)("adds one page per written design; failed rows are not in the PDF", async () => {
        const { host, port, template, info, plan, out } = await setup(["Ann", "Bob", "Cid"]);
        host.env.failJpgAt = 2; // row 1: the print render is JPEG #1, its export (#2) fails
        const b = billing();
        const print = { options: { ...DEFAULT_PRINT, enabled: true, marks: true }, fileName: "Print.pdf" };
        const result = await runDesignJob({ port, billing: b, template, templateLayers: info.layers, plan, folders: {}, output: { entry: out }, print });
        expect(result.items.map((i) => i.status)).toEqual([ITEM.failed, ITEM.succeeded, ITEM.succeeded]);
        expect(result.print).toMatchObject({ file: "Print.pdf", pages: 2, designs: 2 });
        const pages = pdfPages(out.files.get("Print.pdf").bytes);
        expect(pages).toHaveLength(2);
        // 1063 × 638 px at 300 dpi ≈ 90 × 54 mm, plus 8 mm around for marks
        expect(pages[0].media[2]).toBeCloseTo((90 + 16) * (72 / 25.4), 0);
        expect(b.calls.filter((c) => c === "succeeded")).toHaveLength(2); // credits unchanged by the PDF
        expect([...out.files.keys()].sort()).toEqual(["Bob.jpg", "Cid.jpg", "Print.pdf"]);
        expect(host.env.tempRoot.files.size).toBe(0); // temporary renders are deleted
        expect(host.photoshop.app.documents).toHaveLength(1); // working copy closed
    });
    it("doesn't overwrite an existing PDF and leaves no PDF when nothing succeeds", async () => {
        const { port, template, info, plan, out } = await setup(["Ann"]);
        await (await out.createFile("Print.pdf")).write("old");
        const print = { options: { ...DEFAULT_PRINT, enabled: true, layout: "sheet", copies: 4 }, fileName: "Print.pdf" };
        const r = await runDesignJob({ port, billing: billing(), template, templateLayers: info.layers, plan, folders: {}, output: { entry: out }, print });
        expect(r.print.file).toBe("Print (2).pdf");
        expect(new TextDecoder().decode(out.files.get("Print.pdf").bytes)).toBe("old");

        const failing = await setup(["Ann"], {});
        failing.host.env.failFormats = ["jpg"];
        const r2 = await runDesignJob({ port: failing.port, billing: billing(), template: failing.template, templateLayers: failing.info.layers, plan: failing.plan, folders: {}, output: { entry: failing.out }, print });
        expect(r2.status).toBe(JOB.completedWithErrors);
        expect(r2.print).toBeUndefined();
        expect(failing.out.files.size).toBe(0);
    });
});

describe("approval sheet (SIMULATED host)", () => {
    it("labels stay Latin-safe and big templates are rendered small", () => {
        expect(proofLabel(3, { baseName: "Shoes/A1_aurora", sourceRow: 4 })).toBe("#3  A1_aurora");
        expect(proofLabel(5, { baseName: "سماعة", sourceRow: 6 })).toBe("#5  row 6");
        expect(proofLabel(2, { baseName: "A2_phone (2)", sourceRow: 3 })).toBe("#2  A2_phone");
        expect(proofSize(2160, 2700)).toEqual({ width: 640, height: 800 });
        expect(proofSize(600, 400)).toBeNull();
    });
    it.skipIf(!PYPDF)("is free, watermarked, numbered, and saves the proof images", async () => {
        const { host, port, template, info, plan, out } = await setup(["Ann", "Bob", "Cid"], {}, 2160, 2700);
        const result = await runProofJob({
            port,
            template,
            templateLayers: info.layers,
            plan,
            folders: {},
            output: { entry: out },
            proof: { perPage: 4, saveImages: true, fileName: "Approval sheet.pdf", folderName: "Proofs today", title: "Weekly", dateText: "2026-10-10", templateSize: { width: 2160, height: 2700 } }
        });
        expect(result.status).toBe(JOB.completed);
        expect(result.billing.charged).toBe(0);
        expect(result.proof).toMatchObject({ file: "Approval sheet.pdf", pages: 1, designs: 3, folder: "Proofs today" });
        const folder = out.folders.get("Proofs today");
        expect([...folder.files.keys()]).toEqual(["01_Ann.jpg", "02_Bob.jpg", "03_Cid.jpg"]);
        // What "Photoshop" rendered for row 2: the watermark, the label and the row's text, at 640 × 800 + strip.
        const layers = readFakeJpeg(folder.files.get("02_Bob.jpg").bytes);
        expect(layers.find((l) => l.name === "PROOF")).toMatchObject({ kind: "text", opacity: 35 });
        expect(layers.find((l) => l.kind === "text" && l.text === "#2  Bob")).toBeTruthy();
        expect(layers.find((l) => l.name === "Name").text).toBe("Bob");
        expect(host.env.calls.find((c) => c.op === "resizeImage")).toMatchObject({ width: 640, height: 800 });
        expect(host.env.calls.find((c) => c.op === "resizeCanvas")).toMatchObject({ width: 640, height: 845 }) // + a 45 px label strip;
        const pages = pdfPages(out.files.get("Approval sheet.pdf").bytes);
        expect(pages[0].images).toBe(3);
        expect(pages[0].text).toContain("#3");
        expect(host.photoshop.app.documents).toHaveLength(1);
    });
    it("stops, with no files, when Photoshop can't add the watermark", async () => {
        const { host, port, template, info, plan, out } = await setup(["Ann"]);
        host.env.failMakeText = true;
        const r = await runProofJob({ port, template, templateLayers: info.layers, plan, folders: {}, output: { entry: out }, proof: { perPage: 6, saveImages: true, fileName: "A.pdf", folderName: "P" } });
        expect(r.status).toBe(JOB.failed);
        expect(r.fatal.message).toMatch(/rejected the proof change|watermark/);
        expect(out.files.size).toBe(0);
        expect(host.photoshop.app.documents).toHaveLength(1);
    });
});
