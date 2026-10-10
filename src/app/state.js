// Job state for the guided flow. Pure reducer + selectors (unit-tested).
import { checkPrint, DEFAULT_PRINT } from "../domain/imposition.js";
import { createMapping, mappedCount, pruneMapping } from "../domain/mapping.js";
import { runPreflight } from "../domain/preflight.js";
import { runVideoPreflight } from "../domain/video/preflight.js";
import { buildTimeline } from "../domain/video/timeline.js";
import { applyDerived, validateDerived } from "../domain/derived.js";
import { linkShare } from "../domain/linkImages.js";

export const DESIGN_STEPS = ["data", "template", "map", "check", "generate"];
export const VIDEO_STEPS = ["data", "template", "map", "animate", "check", "generate"];
export const stepsFor = (mode) => (mode === "video" ? VIDEO_STEPS : DESIGN_STEPS);

export const initialSettings = { formats: ["jpg"], jpgQuality: 10, namePattern: "elzoz_{row}", keepFrames: false, rowSelection: "", outputWidth: null, print: DEFAULT_PRINT, proof: { perPage: 6, saveImages: true } };
/** Settings that belong to one job and are not remembered between sessions. */
export const JOB_ONLY_SETTINGS = ["rowSelection"];
export const initialVideo = { format: "reel", fps: 30, durationMs: 6000, fadeOutMs: 500, tracks: {} };

export function initialState(saved = {}) {
    return {
        mode: saved.mode || "design",
        step: "data",
        data: null, // { fileName, sheetNames, sheetName, headerRow, table, workbook }
        template: null, // { entry, documentId, title, width, height, layers }
        mapping: createMapping(),
        derived: [], // smart columns (src/domain/derived.js)
        project: null, // open saved project: { id, name, keyColumn, onlyNew, done } (src/domain/projects.js)
        folders: {}, // key -> { name, entry, index }
        output: null, // { entry, name, path, existingFileNames }
        settings: mergeSettings(saved.settings),
        restoredMapping: false,
        video: { ...initialVideo, ...(saved.video || {}), tracks: {} },
        run: idleRun()
    };
}

/** Saved settings over the defaults; nested option groups are merged too (older saves lack new keys). */
export function mergeSettings(saved = {}) {
    const s = saved || {};
    return { ...initialSettings, ...s, print: { ...DEFAULT_PRINT, ...(s.print || {}) }, proof: { ...initialSettings.proof, ...(s.proof || {}) }, rowSelection: "" };
}

export const idleRun = () => ({ status: "idle", jobId: null, total: 0, done: 0, label: "", items: [], result: null, cancelling: false, plan: null });

export function reducer(state, action) {
    switch (action.type) {
        case "mode":
            return { ...state, mode: action.mode, step: stepsFor(action.mode).includes(state.step) ? state.step : "check", run: idleRun() };
        case "go":
            return { ...state, step: action.step };
        case "data": {
            // Smart columns that read columns this spreadsheet doesn't have are removed (and named once),
            // instead of blocking the job; ones still being filled in are kept.
            let derived = state.derived || [];
            let derivedDropped = null;
            if (action.data && derived.length) {
                const gone = derived.filter((d) => validateDerived(d, action.data.table.headers).includes("missing_columns"));
                if (gone.length) {
                    derived = derived.filter((d) => !gone.includes(d));
                    derivedDropped = gone.map((d) => d.label);
                }
            }
            const next = { ...state, data: action.data, derived, derivedDropped };
            const mapping = state.template && action.data ? pruneMapping(state.mapping, effectiveTable(next).headers, state.template.layers) : state.mapping;
            return { ...next, mapping, settings: { ...state.settings, rowSelection: "" }, run: idleRun() };
        }
        case "derived-dropped-seen":
            return { ...state, derivedDropped: null };
        case "project":
            return { ...state, project: action.project ? { ...(state.project || {}), ...action.project } : null };
        case "project-loaded": {
            // Everything at once, so the mapping is pruned against the final table and template.
            const p = action.loaded;
            const next = {
                ...initialState({ mode: p.mode, settings: { ...state.settings, ...p.settings }, video: p.video ? { ...state.video, ...p.video } : state.video }),
                data: p.data,
                template: p.template,
                derived: p.derived || [],
                folders: p.folders || {},
                output: p.output || state.output,
                project: p.project
            };
            next.video = { ...next.video, tracks: (p.video && p.video.tracks) || {} };
            const table = effectiveTable(next);
            next.mapping = p.mapping && table && p.template ? pruneMapping(p.mapping, table.headers, p.template.layers) : p.mapping || createMapping();
            next.restoredMapping = false;
            const steps = stepsFor(next.mode);
            const firstMissing = !next.data ? "data" : !next.template ? "template" : (p.missing || []).some((m) => m.startsWith("folder:")) ? "map" : "check";
            next.step = steps.includes(firstMissing) ? firstMissing : "check";
            return next;
        }
        case "derived": {
            // Removing a smart column also removes the mappings that used it.
            const next = { ...state, derived: action.derived };
            const mapping = state.data && state.template ? pruneMapping(state.mapping, effectiveTable(next).headers, state.template.layers) : state.mapping;
            return { ...next, mapping, run: idleRun() };
        }
        case "template": {
            const mapping = state.data && action.template ? pruneMapping(state.mapping, effectiveTable(state).headers, action.template.layers) : createMapping();
            return { ...state, template: action.template, mapping, restoredMapping: false, video: { ...state.video, tracks: {} }, run: idleRun() };
        }
        case "mapping":
            return { ...state, mapping: action.mapping, restoredMapping: action.restored ? true : state.restoredMapping && !action.clearRestored };
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
            return { ...state, step: "generate", run: { ...idleRun(), status: "running", kind: action.kind || "job", total: action.total, plan: action.plan } };
        case "run-event":
            return { ...state, run: applyRunEvent(state.run, action.event) };
        case "run-cancel":
            return { ...state, run: { ...state.run, cancelling: true } };
        case "run-done":
            return { ...state, run: { ...state.run, status: "done", result: action.result, items: action.result.items } };
        case "run-reset":
            return { ...state, run: idleRun() };
        case "new-job":
            // A new job leaves the open project (its rows and settings stay saved).
            return { ...initialState({ mode: state.mode, settings: state.settings, video: state.video }), output: state.output, derived: state.derived };
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

// Smart columns are computed once per (table, definitions) pair.
const derivedCache = new WeakMap();
/** The spreadsheet table plus smart columns: what Map, Check and the engine see. */
export function effectiveTable(state) {
    const table = state.data ? state.data.table : null;
    if (!table || !state.derived || !state.derived.length) return table;
    let byDefs = derivedCache.get(table);
    if (!byDefs) derivedCache.set(table, (byDefs = new WeakMap()));
    let t = byDefs.get(state.derived);
    if (!t) byDefs.set(state.derived, (t = applyDerived(table, state.derived)));
    return t;
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
        rowSelection: state.settings.rowSelection,
        keyColumn: state.project ? state.project.keyColumn : "",
        doneKeys: state.project ? state.project.done : {},
        onlyNew: !!(state.project && state.project.onlyNew),
        table: effectiveTable(state),
        layers: state.template ? state.template.layers : [],
        mapping: state.mapping,
        folders: Object.fromEntries(Object.entries(state.folders).map(([k, f]) => [k, { name: f.name, index: f.index, downloads: f.downloads }])),
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
    const plan = runPreflight({
        ...input,
        outputWidth: state.settings.outputWidth,
        templateSize: state.template ? { width: state.template.width, height: state.template.height } : null,
        pricing: { unitPrice: (pricing.design && pricing.design.price) ?? 1 }
    });
    // Print PDF (feature 13): validated against the size the designs will have.
    const size = plan.outputSize || (state.template ? { width: state.template.width, height: state.template.height } : null);
    const print = checkPrint(state.settings.print, size, plan.items.length);
    for (const message of print.blocking) plan.blocking.push({ severity: "error", code: "print", message, fix: { step: "check" } });
    for (const message of print.warnings) plan.warnings.push({ severity: "warning", code: "print_warning", message, fix: { step: "check" } });
    plan.print = print;
    plan.ok = plan.blocking.length === 0;
    return plan;
}

/** Blocking issues that don't stop a free approval sheet (it needs no credits). */
export const proofBlocking = (plan) => plan.blocking.filter((b) => !["insufficient_credits", "print"].includes(b.code));

/**
 * Plan used by the Animate preview. Output settings do not affect how row 1
 * looks, so a missing output folder must not empty the plan (it did: the
 * preview then showed the bare template while claiming to show row 1).
 */
export function previewPlan(state) {
    const output = state.output || { name: "preview", existingFileNames: [] };
    return computePlan({ ...state, output });
}

/** Can the user move past this step? Returns null or a reason key. */
export function stepBlocker(state, step) {
    switch (step) {
        case "data":
            if (!state.data) return "data.empty";
            if (state.data.table.issues.some((i) => i.severity === "error")) return "check.blocking";
            if ((state.derived || []).some((d) => validateDerived(d, state.data.table.headers).length)) return "derived.invalid";
            return null;
        case "template":
            return state.template ? null : "template.empty";
        case "map":
            return mappedCount(state.mapping) > 0 ? null : "map.needOne";
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

/**
 * Items a retry should run: rows that failed, plus rows that never started
 * because the job stopped (e.g. the server could not reserve credits).
 * Rows the user cancelled are not retried automatically.
 */
export function retryKeys(result) {
    return result.items.filter((i) => i.status === "failed" || i.status === "not_started").map((i) => i.key);
}

export function reportCsv(result) {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["row", "status", "files", "error_step", "error"].join(",")];
    for (const it of result.items) {
        lines.push([it.sourceRow, it.status, (it.files || []).map((f) => f.name).join(" | "), it.error ? it.error.step : "", it.error ? it.error.message : ""].map(esc).join(","));
    }
    return lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------- mapping memory
// The last mapping used with a template is remembered (per template name + layer
// structure) and offered again next time. Folders are not stored: UXP folder
// access is granted per session, so the user picks them again.
const MEMORY_KEY = "elzoz.mappings.v1";
const MEMORY_MAX = 30;

export function templateSignature(template) {
    const text = `${template.title}|${template.width}x${template.height}|${template.layers.map((l) => `${l.path.join("/")}:${l.kind}`).join(",")}`;
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return `${template.title}#${h.toString(36)}`;
}

function readMemory(storage) {
    try {
        return JSON.parse(storage.getItem(MEMORY_KEY) || "{}") || {};
    } catch (e) {
        return {};
    }
}

export function rememberMapping(storage, template, mapping, now = Date.now(), derived = []) {
    if (!storage || !template || mappedCount(mapping) === 0) return;
    const all = readMemory(storage);
    const images = Object.fromEntries(Object.entries(mapping.images).map(([id, r]) => [id, { ...r, folderKey: null }]));
    all[templateSignature(template)] = { text: mapping.text, images, visibility: mapping.visibility || {}, colors: mapping.colors || {}, derived: derived || [], savedAt: now };
    const keep = Object.entries(all).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, MEMORY_MAX);
    try {
        storage.setItem(MEMORY_KEY, JSON.stringify(Object.fromEntries(keep)));
    } catch (e) {
        /* storage full or unavailable: memory is a convenience only */
    }
}

/** The remembered mapping for this template, limited to columns that exist now; null if none. */
export function recallMapping(storage, template, headers) {
    const r = recallMemory(storage, template, { headers, issues: [], rows: [] });
    return r ? r.mapping : null;
}

/**
 * The remembered mapping and smart columns for this template. Smart columns are
 * restored only if the columns they read still exist. null if nothing usable.
 */
export function recallMemory(storage, template, table) {
    if (!storage || !template || !table) return null;
    const saved = readMemory(storage)[templateSignature(template)];
    if (!saved) return null;
    const derived = (saved.derived || []).filter((d) => validateDerived(d, table.headers).length === 0);
    const headers = derived.length ? applyDerived({ ...table, rows: [] }, derived).headers : table.headers;
    const pruned = pruneMapping({ text: saved.text || {}, images: saved.images || {}, visibility: saved.visibility || {}, colors: saved.colors || {} }, headers, template.layers);
    // Folder or links follows what this spreadsheet's column holds now.
    const images = Object.fromEntries(
        Object.entries(pruned.images).map(([id, r]) => {
            const links = linkShare(table.rows || [], r.column) >= 0.6;
            const { source, ...rest } = r;
            return [id, links ? { ...rest, source: "link" } : rest];
        })
    );
    const mapping = { ...pruned, images };
    return mappedCount(mapping) > 0 ? { mapping, derived } : null;
}
