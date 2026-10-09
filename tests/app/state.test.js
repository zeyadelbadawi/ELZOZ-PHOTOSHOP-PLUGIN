import { describe, expect, it } from "vitest";
import { computePlan, initialState, previewPlan, reducer, reportCsv, retryKeys, runProgress, stepBlocker, stepsFor, subsetPlan } from "../../src/app/state.js";
import { setTextMapping } from "../../src/domain/mapping.js";
import { buildFolderIndex } from "../../src/domain/imageFiles.js";
import { sampleLayers } from "../helpers/fixtures.js";

const table = {
    headers: [{ key: "Name", label: "Name" }],
    issues: [],
    rows: [
        { index: 0, sourceRow: 2, values: { Name: "A" }, isEmpty: false },
        { index: 1, sourceRow: 3, values: { Name: "B" }, isEmpty: false }
    ]
};

function ready(mode = "design") {
    let s = reducer(initialState(), { type: "mode", mode });
    s = reducer(s, { type: "data", data: { fileName: "x.xlsx", table } });
    s = reducer(s, { type: "template", template: { title: "t", width: 1080, height: 1920, layers: sampleLayers() } });
    s = reducer(s, { type: "mapping", mapping: setTextMapping(s.mapping, 3, "Name") });
    s = reducer(s, { type: "output", output: { name: "out", existingFileNames: [] } });
    return s;
}

describe("app state", () => {
    it("has the guided steps per mode", () => {
        expect(stepsFor("design")).toEqual(["data", "template", "map", "check", "generate"]);
        expect(stepsFor("video")).toEqual(["data", "template", "map", "animate", "check", "generate"]);
    });

    it("gates steps on real readiness", () => {
        const s0 = initialState();
        expect(stepBlocker(s0, "data")).toBe("data.empty");
        const s = ready();
        expect(stepBlocker(s, "data")).toBeNull();
        expect(stepBlocker(s, "map")).toBeNull();
        expect(stepBlocker(reducer(s, { type: "mapping", mapping: { text: {}, images: {} } }), "map")).toBe("map.needOne");
    });

    it("drops mappings to columns that disappear when the spreadsheet changes", () => {
        const s = reducer(ready(), { type: "data", data: { fileName: "y.xlsx", table: { ...table, headers: [{ key: "Other", label: "Other" }] } } });
        expect(s.mapping.text).toEqual({});
    });

    it("computes a design plan with the server price", () => {
        const plan = computePlan(ready(), { balance: 10, pricing: { design: { price: 2 } } });
        expect(plan).toMatchObject({ ok: true, units: 2, cost: 4 });
        expect(plan.items.map((i) => i.baseName)).toEqual(["elzoz_1", "elzoz_2"]);
    });

    it("computes a video plan with tracks from state", () => {
        let s = ready("video");
        s = reducer(s, { type: "video", patch: { fps: 24, durationMs: 6000 } });
        s = reducer(s, { type: "track", layerId: 3, track: { preset: "fadeIn", startMs: 0, lengthMs: 500, easing: "easeOut" } });
        const plan = computePlan(s, { pricing: { video_5s: { price: 1, hd_long_edge: 1920, hd_multiplier: 2 } } });
        expect(plan.ok).toBe(true);
        expect(plan.timeline.tracks).toHaveLength(1);
        expect(plan.cost).toBe(4); // 2 videos x ceil(6/5)
    });

    it("tracks run progress including frames", () => {
        let s = reducer(ready("video"), { type: "run-start", total: 2, plan: { items: [] } });
        s = reducer(s, { type: "run-event", event: { type: "started", jobId: "j", total: 2 } });
        s = reducer(s, { type: "run-event", event: { type: "item-start", index: 0 } });
        s = reducer(s, { type: "run-event", event: { type: "frame", index: 0, frame: 50, frames: 100 } });
        expect(runProgress(s.run)).toBeCloseTo(0.25, 5);
        s = reducer(s, { type: "run-event", event: { type: "item-done", index: 0, item: { key: "row-2", status: "succeeded" } } });
        expect(s.run.done).toBe(1);
    });

    it("preview plan has row items before an output folder is chosen (regression)", () => {
        const noOutput = { ...ready("video"), output: null };
        expect(computePlan(noOutput).items).toEqual([]);
        expect(previewPlan(noOutput).items.length).toBeGreaterThan(0);
        expect(previewPlan(noOutput).items[0].sourceRow).toBe(computePlan(ready("video")).items[0].sourceRow);
    });

    it("builds a retry plan from failed items only", () => {
        const plan = { ok: true, items: [{ key: "a" }, { key: "b" }, { key: "c" }], units: 3, cost: 6 };
        expect(subsetPlan(plan, ["b"])).toMatchObject({ items: [{ key: "b" }], units: 1, cost: 2 });
    });

    it("writes a CSV report with escaped fields", () => {
        const csv = reportCsv({ items: [{ sourceRow: 2, status: "failed", files: [], error: { step: "image", message: 'Not "found"' } }] });
        expect(csv).toBe('row,status,files,error_step,error\r\n"2","failed","","image","Not ""found"""\r\n');
    });

    it("keeps preferences but not files on a new job", () => {
        let s = reducer(ready(), { type: "settings", patch: { namePattern: "{Name}" } });
        s = reducer(s, { type: "new-job" });
        expect(s.settings.namePattern).toBe("{Name}");
        expect(s.data).toBeNull();
        expect(s.output).toMatchObject({ name: "out" });
    });
});

describe("folder-backed image mapping in state", () => {
    it("uses the folder index stored by the Map step", () => {
        let s = ready();
        s = reducer(s, { type: "folder", key: "f-5", folder: { name: "p", index: buildFolderIndex(["a.jpg"]) } });
        expect(computePlan(s).ok).toBe(true);
    });
    it("retries failed rows and rows that never started, not cancelled or succeeded ones (regression: billing outage at start)", () => {
        const items = (statuses) => ({ items: statuses.map((status, i) => ({ key: `row-${i + 2}`, status })) });
        expect(retryKeys(items(["succeeded", "failed", "not_started", "cancelled"]))).toEqual(["row-3", "row-4"]);
        expect(retryKeys(items(["not_started", "not_started"]))).toEqual(["row-2", "row-3"]);
        expect(retryKeys(items(["succeeded"]))).toEqual([]);
    });
});
