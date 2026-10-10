// Saving and reopening projects (feature 15). Talks to the services (file access)
// and the pure project store; the screens only call these two functions.
import { getProject, markDone, newProjectId, putProject, rowKey } from "../domain/projects.js";
import { JOB_ONLY_SETTINGS } from "./state.js";
import { LINK_FOLDER_KEY } from "../domain/linkImages.js";
import { CODE_FOLDER_KEY } from "../domain/codes.js";
import { detectStore, prepareStoreTable } from "../domain/stores.js";

const stripSettings = (settings) => Object.fromEntries(Object.entries(settings).filter(([k]) => !JOB_ONLY_SETTINGS.includes(k)));

/**
 * Save the current job as a project (new, or update the open one).
 * File access is stored as persistent tokens; anything that can't be stored is
 * simply picked again when the project is opened.
 * @returns {Promise<object|null>} the stored project
 */
export async function saveProject({ storage, services, state, name, keyColumn, onlyNew, justGenerated = null, now = Date.now() }) {
    const tokenFor = async (entry) => (entry ? services.persistEntry(entry) : null);
    const data = state.data;
    const tpl = state.template;
    const folders = {};
    // Downloaded link images live in a temporary folder: they are downloaded again next time.
    for (const [key, f] of Object.entries(state.folders || {})) if (key !== LINK_FOLDER_KEY && key !== CODE_FOLDER_KEY) folders[key] = { name: f.name, token: await tokenFor(f.entry) };
    const prev = state.project ? getProject(storage, state.project.id) : null;
    const project = {
        id: (state.project && state.project.id) || newProjectId(now),
        name: String(name || "").trim() || (state.project && state.project.name) || (prev && prev.name) || (tpl && tpl.title) || "Project",
        mode: state.mode,
        keyColumn: keyColumn ?? (state.project && state.project.keyColumn) ?? "",
        onlyNew: onlyNew ?? (state.project ? state.project.onlyNew : true),
        done: markDone((state.project && state.project.done) || (prev && prev.done) || {}, justGenerated || []),
        sources: {
            data: data ? { token: await tokenFor(data.entry), fileName: data.fileName, sheetName: data.sheetName, headerRow: data.headerRow, store: data.store || null, source: data.source || null } : null,
            template: tpl ? { token: await tokenFor(tpl.entry), title: tpl.title, fromOpenDocument: !tpl.entry } : null,
            folders,
            output: state.output ? { token: await tokenFor(state.output.entry), name: state.output.name } : null
        },
        mapping: state.mapping,
        derived: state.derived || [],
        settings: stripSettings(state.settings),
        video: { ...state.video, tracks: state.video.tracks || {} }
    };
    return putProject(storage, project, now);
}

/**
 * Keys of the rows the last finished run generated, so a project saved right
 * after a run doesn't generate them again.
 */
export function lastRunKeys(state, table, keyColumn) {
    const run = state.run;
    if (!keyColumn || !table || !run || run.status !== "done" || !run.result) return [];
    const bySource = new Map(table.rows.map((r) => [r.sourceRow, r]));
    return run.result.items.filter((i) => i.status === "succeeded").map((i) => rowKey(bySource.get(i.sourceRow), keyColumn)).filter(Boolean);
}

/**
 * Reopen a project: re-read the spreadsheet (new rows appear), reopen the
 * template and folders. Returns the pieces for the "project-loaded" action and
 * a list of what has to be picked again.
 */
export async function openProject({ storage, services, id }) {
    const project = getProject(storage, id);
    if (!project) throw new Error("This project no longer exists.");
    const missing = [];
    const src = project.sources || {};
    const reopen = async (what, token, load) => {
        const entry = await services.entryFromToken(token);
        if (!entry) {
            missing.push(what);
            return null;
        }
        try {
            return await load(entry);
        } catch (e) {
            missing.push(what);
            return null;
        }
    };

    let data = null;
    if (src.data) {
        let picked = null;
        if (src.data.source && src.data.source.kind === "gsheet") {
            // Google Sheets: downloaded again (always the latest rows).
            try {
                picked = await services.loadGoogleSheet(src.data.source.url);
            } catch (e) {
                missing.push("data");
            }
        } else picked = await reopen("data", src.data.token, services.loadSpreadsheet);
        if (picked) {
            const sheetName = picked.sheetNames.includes(src.data.sheetName) ? src.data.sheetName : picked.sheetNames[0];
            const headerRow = src.data.headerRow || 1;
            data = { ...picked, sheetName, headerRow, table: services.readSheet(picked.workbook, sheetName, headerRow) };
            // A store export prepared last time is prepared again (new products included).
            const store = src.data.store ? detectStore(data.table.headers) : null;
            if (store && store.id === src.data.store) {
                const prepared = prepareStoreTable(data.table, store);
                data = { ...data, rawTable: data.table, table: prepared.table, store: store.id, storeNote: prepared.note };
            }
        }
    }
    let template = null;
    if (src.template) {
        if (src.template.fromOpenDocument) missing.push("template");
        else template = await reopen("template", src.template.token, services.loadTemplate);
    }
    const folders = {};
    for (const [key, f] of Object.entries(src.folders || {})) {
        const folder = await reopen(`folder:${f.name}`, f.token, services.loadImageFolder);
        if (folder) folders[key] = folder;
    }
    const output = src.output ? await reopen("output", src.output.token, services.loadOutputFolder) : null;

    return {
        project: { id: project.id, name: project.name, keyColumn: project.keyColumn || "", onlyNew: project.onlyNew !== false, done: project.done || {} },
        mode: project.mode || "design",
        data,
        template,
        folders,
        output,
        mapping: project.mapping,
        derived: project.derived || [],
        settings: project.settings || {},
        video: project.video || null,
        missing
    };
}
