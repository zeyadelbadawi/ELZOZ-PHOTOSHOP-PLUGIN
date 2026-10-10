// Saved projects and "only new rows" (feature 15). Pure: storage is passed in.
//
// A project remembers everything needed to run the same job again next month:
// where the spreadsheet, template and folders are (UXP persistent tokens, so
// no file picker is needed when they haven't moved), the mapping, smart
// columns and settings, and which rows were already generated, identified by
// a key column (e.g. SKU). Opening a project re-reads the spreadsheet, so new
// rows appear and, with "only new rows", only those are generated.

export const PROJECTS_KEY = "elzoz.projects.v1";
const MAX_PROJECTS = 60;
const MAX_DONE_KEYS = 20000;

export function listProjects(storage) {
    try {
        const all = JSON.parse(storage.getItem(PROJECTS_KEY) || "[]");
        return Array.isArray(all) ? all.filter((p) => p && p.id && p.name) : [];
    } catch (e) {
        return [];
    }
}

function writeAll(storage, projects) {
    try {
        storage.setItem(PROJECTS_KEY, JSON.stringify(projects.slice(0, MAX_PROJECTS)));
        return true;
    } catch (e) {
        return false;
    }
}

export const getProject = (storage, id) => listProjects(storage).find((p) => p.id === id) || null;

/** Insert or update (most recent first). Returns the stored project, or null if storage failed. */
export function putProject(storage, project, now = Date.now()) {
    const all = listProjects(storage);
    const prev = all.find((p) => p.id === project.id);
    const stored = { ...prev, ...project, updatedAt: now, createdAt: (prev && prev.createdAt) || project.createdAt || now };
    return writeAll(storage, [stored, ...all.filter((p) => p.id !== project.id)]) ? stored : null;
}

export function deleteProject(storage, id) {
    return writeAll(storage, listProjects(storage).filter((p) => p.id !== id));
}

export const newProjectId = (now = Date.now()) => `prj${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Normalized key of a row (trimmed, case-insensitive, digits as typed); "" if none. */
export function rowKey(row, keyColumn) {
    if (!keyColumn || !row || !row.values) return "";
    return String(row.values[keyColumn] ?? "")
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
        .trim()
        .toLowerCase();
}

/**
 * Which rows to skip because they were generated before.
 * @returns {{skip: Set<number>, doneCount: number, emptyKeyRows: number[], duplicateKeyRows: number[]}}
 *   skip: sourceRows already generated; empty keys are never skipped (they can't be identified).
 */
export function partitionDone(rows, keyColumn, done = {}) {
    const skip = new Set();
    const emptyKeyRows = [];
    const duplicateKeyRows = [];
    const seen = new Set();
    for (const r of rows) {
        if (r.isEmpty) continue;
        const k = rowKey(r, keyColumn);
        if (!k) {
            emptyKeyRows.push(r.sourceRow);
            continue;
        }
        if (seen.has(k)) duplicateKeyRows.push(r.sourceRow);
        seen.add(k);
        if (Object.prototype.hasOwnProperty.call(done, k)) skip.add(r.sourceRow);
    }
    return { skip, doneCount: skip.size, emptyKeyRows, duplicateKeyRows };
}

/** Record the keys of succeeded rows as done (newest first wins when the cap is reached). */
export function markDone(done = {}, keys, when = new Date().toISOString()) {
    const next = { ...done };
    for (const k of keys) if (k) next[k] = when;
    const entries = Object.entries(next);
    if (entries.length <= MAX_DONE_KEYS) return next;
    return Object.fromEntries(entries.sort((a, b) => String(b[1]).localeCompare(String(a[1]))).slice(0, MAX_DONE_KEYS));
}

/** The keys of the rows a finished job generated successfully. */
export function succeededKeys(result, plan) {
    const keyBySource = new Map(plan.items.map((i) => [i.sourceRow, i.rowKey]));
    return result.items.filter((i) => i.status === "succeeded").map((i) => keyBySource.get(i.sourceRow)).filter(Boolean);
}
