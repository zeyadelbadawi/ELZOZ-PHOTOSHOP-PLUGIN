// Job state for the guided flow. Pure reducer + selectors (unit-tested).
import { createMapping, mappedCount, pruneMapping } from "../domain/mapping.js";
import { runPreflight } from "../domain/preflight.js";
import { runVideoPreflight } from "../domain/video/preflight.js";
import { buildTimeline } from "../domain/video/timeline.js";

export const DESIGN_STEPS = ["data", "template", "map", "check", "generate"];
export const VIDEO_STEPS = ["data", "template", "map", "animate", "check", "generate"];
export const stepsFor = (mode) => (mode === "video" ? VIDEO_STEPS : DESIGN_STEPS);

export const initialSettings = { formats: ["jpg"], jpgQuality: 10, namePattern: "elzoz_{row}", keepFrames: false };
export const initialVideo = { format: "reel", fps: 30, durationMs: 6000, fadeOutMs: 500, tracks: {} };

export function initialState(saved = {}) {
    return {
        mode: saved.mode || "design",
        step: "data",
        data: null, // { fileName, sheetNames, sheetName, headerRow, table, workbook }
        template: null, // { entry, documentId, title, width, height, layers }
        mapping: createMapping(),
        folders: {}, // key -> { name, entry, index }
        output: null, // { entry, name, path, existingFileNames }
        settings: { ...initialSettings, ...(saved.settings || {}) },
        video: { ...initialVideo, ...(saved.video || {}), tracks: {} },
        run: idleRun()
    };
}

export const idleRun = () => ({ status: "idle", jobId: null, total: 0, done: 0, label: "", items: [], result: null, cancelling: false, plan: null });

export function reducer(state, action) {
    switch (action.type) {
        case "mode":
            return { ...state, mode: action.mode, step: stepsFor(action.mode).includes(state.step) ? state.step : "check", run: idleRun() };
        case "go":
            return { ...state, step: action.step };
        case "data": {
            const mapping = state.template && action.data ? pruneMapping(state.mapping, action.data.table.headers, state.template.layers) : state.mapping;
            return { ...state, data: action.data, mapping, run: idleRun() };
        }
        case "template": {
            const mapping = state.data && action.template ? pruneMapping(state.mapping, state.data.table.headers, action.template.layers) : createMapping();
            return { ...state, template: action.template, mapping, video: { ...state.video, tracks: {} }, run: idleRun() };
        }
        case "mapping":
            return { ...state, mapping: action.mapping };
        case "folder":
            return { ...state, folders: { ...state.folders, [action.key]: action.folder } };
        case "output":
            return { ...state, output: action.output };
        case "settings":
            return { ...state, settings: { ...state.settings, ...action.patch } };
        case "video":
            return { ...state, video: { ...state.video, ...action.patch } };
        case "track": {
            const tracks = { ...state.video.tracks };
            if (action.track) tracks[action.layerId] = action.track;
            else delete tracks[action.layerId];
            return { ...state, video: { ...state.video, tracks } };
        }
        case "run-start":
            return { ...state, step: "generate", run: { ...idleRun(), status: "running", total: action.total, plan: action.plan } };
        case "run-event":
            return { ...state, run: applyRunEvent(state.run, action.event) };
        case "run-cancel":
            return { ...state, run: { ...state.run, cancelling: true } };
        case "run-done":
            return { ...state, run: { ...state.run, status: "done", result: action.result, items: action.result.items } };
        case "run-reset":
            return { ...state, run: idleRun() };
        case "new-job":
            return { ...initialState({ mode: state.mode, settings: state.settings, video: state.video }), output: state.output };
        default:
            return state;
    }
}

function applyRunEvent(run, e) {
    switch (e.type) {
        case "started":
            return { ...run, jobId: e.jobId, total: e.total };
        case "item-start":
            return { ...run, label: `${e.index + 1} / ${run.total}`, current: e.index, frame: 0 };
        case "frame":
            return { ...run, frame: e.frame, frames: e.frames };
        case "item-done":
            return { ...run, done: run.done + 1, items: [...run.items, e.item] };
        default:
            return run;
    }
}

/** Overall progress 0..1 including frames of the video in progress. */
export function runProgress(run) {
    if (!run.total) return 0;
    const partial = run.frames ? (run.frame || 0) / run.frames : 0;
    return Math.min(1, (run.done + (run.status === "running" && run.current !== undefined && run.current >= run.done ? partial : 0)) / run.total);
}

export function timelineSpec(state) {
    return {
        format: state.video.format,
        fps: state.video.fps,
        durationMs: state.video.durationMs,
        fadeOutMs: state.video.fadeOutMs,
        tracks: Object.entries(state.video.tracks).map(([layerId, t]) => ({ ...t, layerId: Number(layerId) }))
    };
}

/** Preflight for the current state (design or video). */
export function computePlan(state, { balance = null, pricing = {} } = {}) {
    const input = {
        table: state.data ? state.data.table : null,
        layers: state.template ? state.template.layers : [],
        mapping: state.mapping,
        folders: Object.fromEntries(Object.entries(state.folders).map(([k, f]) => [k, { name: f.name, index: f.index }])),
        output: state.output ? { name: state.output.name, existingFileNames: state.output.existingFileNames } : null,
        formats: state.settings.formats,
        namePattern: state.settings.namePattern,
        balance
    };
    if (state.mode === "video") {
        const video = pricing.video_5s || {};
        return runVideoPreflight({
            ...input,
            template: state.template ? { width: state.template.width, height: state.template.height } : null,
            timelineSpec: timelineSpec(state),
            pricing: { unitPrice: video.price ?? 1, hdLongEdge: video.hd_long_edge, hdMultiplier: video.hd_multiplier }
        });
    }
    return runPreflight({ ...input, pricing: { unitPrice: (pricing.design && pricing.design.price) ?? 1 } });
}

/** Can the user move past this step? Returns null or a reason key. */
export function stepBlocker(state, step) {
    switch (step) {
        case "data":
            if (!state.data) return "data.empty";
            if (state.data.table.issues.some((i) => i.severity === "error")) return "check.blocking";
            return null;
        case "template":
            return state.template ? null : "template.empty";
        case "map":
            return mappedCount(state.mapping) > 0 ? null : "map.none";
        case "animate":
            return buildTimeline(timelineSpec(state)).ok ? null : "check.blocking";
        default:
            return null;
    }
}

/** A plan containing only the given item keys (used by "Retry failed rows"). */
export function subsetPlan(plan, keys) {
    const set = new Set(keys);
    const items = plan.items.filter((i) => set.has(i.key));
    const perItem = plan.units ? plan.cost / plan.units : 0;
    return { ...plan, items, units: items.length, cost: items.length * perItem };
}

export function reportCsv(result) {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["row", "status", "files", "error_step", "error"].join(",")];
    for (const it of result.items) {
        lines.push([it.sourceRow, it.status, (it.files || []).map((f) => f.name).join(" | "), it.error ? it.error.step : "", it.error ? it.error.message : ""].map(esc).join(","));
    }
    return lines.join("\r\n") + "\r\n";
}
