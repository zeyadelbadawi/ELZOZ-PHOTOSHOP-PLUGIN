// The developer self-test (src/dev/selfTest.js) run on the SIMULATED host with
// the real QA kit (test-artifacts/fixtures). This proves the self-test is wired
// correctly and that it reports failures; it does not prove Photoshop works.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createFakeHost, fakeJpeg, FakeFolder } from "../fakes/fakePhotoshop.js";
import { createPixelStore, templateFromPsd } from "../fakes/psdTemplate.js";
import { writeSimulatedPsd } from "../fakes/psdWriter.js";
import { createPhotoshopPort } from "../../src/ps/port.js";
import { runSelfTest, SELF_TEST_MARKER } from "../../src/dev/selfTest.js";

const FX = path.resolve("test-artifacts/fixtures");
const d = fs.existsSync(path.join(FX, "manifest.json")) ? describe : describe.skip;

function folderTree(dir, name = path.basename(dir)) {
    const folder = new FakeFolder(name);
    folder.folders = new Map();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
            const sub = folderTree(path.join(dir, e.name), `${name}/${e.name}`);
            sub.parent = folder;
            sub.shortName = e.name;
            folder.folders.set(e.name, sub);
        } else {
            const bytes = new Uint8Array(fs.readFileSync(path.join(dir, e.name)));
            const f = new FakeFolder("tmp", { [e.name]: { bytes } }).files.get(e.name);
            f.folder = folder;
            f.nativePath = `${folder.nativePath}/${e.name}`;
            folder.files.set(e.name, f);
        }
    }
    return folder;
}

function setup(mutate = () => {}) {
    const pixelStore = createPixelStore();
    // Header-only "renders": the Node simulator has no canvas; dimensions are what the self-test checks.
    const png = (w, h) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, w >> 24, (w >> 16) & 255, (w >> 8) & 255, w & 255, h >> 24, (h >> 16) & 255, (h >> 8) & 255, h & 255, 8, 6, 0, 0, 0]);
    const host = createFakeHost({
        loadTemplate: (entry) => templateFromPsd(entry.bytes, pixelStore, entry.name),
        render: async (doc, fmt) => (fmt === "png" ? png(doc.width, doc.height) : fakeJpeg(doc.width, doc.height)),
        writePsd: (doc) => writeSimulatedPsd(doc, { pixelStore, fileBytes: () => null })
    });
    host.uxp.versions.plugin = "selftest";
    mutate(host);
    const kit = folderTree(FX, "qa-kit");
    return { host, kit, port: createPhotoshopPort(host) };
}

d("developer self-test (on the SIMULATED host)", () => {
    it("passes every step on an honest host and saves a report next to the outputs", async () => {
        const { host, kit, port } = setup();
        const seen = [];
        const report = await runSelfTest({ photoshop: host.photoshop, uxp: host.uxp, port, kit, onStep: (s) => seen.push(s.id) });
        const failed = report.steps.filter((s) => s.status !== "pass");
        expect(failed).toEqual([]);
        expect(report.passed).toBe(true);
        expect(report.marker).toBe(SELF_TEST_MARKER);
        expect(seen).toEqual(["kit", "spreadsheet", "integrity-before", "inspect", "design", "outputs", "integrity-after", "video", "integrity-video"]);
        const out = [...kit.folders.values()].find((f) => f.shortName.startsWith("selftest-"));
        expect([...out.files.keys()].sort()).toEqual(
            ["1_Aurora Laptop 14", "2_Pulse Phone X", "7_سماعة لاسلكية"].flatMap((b) => ["jpg", "png", "psd"].map((x) => `${b}.${x}`)).concat(["elzoz-selftest-report.json", "video_1.mov"]).sort()
        );
        expect(JSON.parse(new TextDecoder().decode(out.files.get("elzoz-selftest-report.json").bytes)).passed).toBe(true);
    }, 60000);

    it("fails 'integrity' when a document is left open", async () => {
        const { host, kit, port } = setup((h) => {
            const open = h.photoshop.app.open.bind(h.photoshop.app);
            h.photoshop.app.open = async (e) => {
                const doc = await open(e);
                const duplicate = doc.duplicate.bind(doc);
                doc.duplicate = async (...args) => {
                    const copy = await duplicate(...args);
                    copy.closeWithoutSaving = async () => {}; // leak: the working copy is never closed
                    return copy;
                };
                return doc;
            };
        });
        const report = await runSelfTest({ photoshop: host.photoshop, uxp: host.uxp, port, kit });
        expect(report.passed).toBe(false);
        expect(report.steps.find((s) => s.id === "integrity-after").status).toBe("fail");
    }, 60000);

    it("fails 'design' with the row and step when Photoshop can't place an image", async () => {
        const { host, kit, port } = setup((h) => h.env.failReplace.add("phone.jpg"));
        const report = await runSelfTest({ photoshop: host.photoshop, uxp: host.uxp, port, kit });
        const design = report.steps.find((s) => s.id === "design");
        expect(design.status).toBe("fail");
        expect(design.detail.message).toMatch(/row 3: image: .*not compatible/);
        expect(report.passed).toBe(false);
    }, 60000);

    it("reports a missing kit instead of crashing", async () => {
        const { host, port } = setup();
        const report = await runSelfTest({ photoshop: host.photoshop, uxp: host.uxp, port, kit: new FakeFolder("empty") });
        expect(report.steps).toHaveLength(1);
        expect(report.steps[0]).toMatchObject({ id: "kit", status: "fail" });
    });
});
