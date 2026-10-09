// Preflight: turn (table, template layers, mapping, folders, output settings)
// into an explicit plan plus issues. Nothing is rendered or charged unless the
// plan has no blocking issues. Pure and unit-tested.
import { findLayer, isImageLayer, isTextLayer, displayPath, summarizeTemplate } from "./layers.js";
import { resolveImage } from "./imageFiles.js";
import { dedupeNames, renderName, validatePattern } from "./naming.js";
import { mappedCount } from "./mapping.js";

export const FORMATS = ["jpg", "png", "psd"];

const issue = (severity, code, message, extra = {}) => ({ severity, code, message, ...extra });

/** Resolve one row against the mapping. Shared by design and video preflight. */
export function resolveRow(row, mapping, folders) {
    const text = [];
    const images = [];
    const problems = [];
    const notes = [];

    for (const rule of Object.values(mapping.text)) {
        const value = row.values[rule.column] ?? "";
        if (String(value).trim() === "") {
            if (rule.emptyPolicy === "keepTemplate") continue;
            if (rule.emptyPolicy === "skipRow") {
                problems.push({ code: "empty_text", column: rule.column, layerId: rule.layerId });
                continue;
            }
            text.push({ layerId: rule.layerId, value: "" });
            continue;
        }
        text.push({ layerId: rule.layerId, value: String(value) });
    }

    for (const rule of Object.values(mapping.images)) {
        const value = row.values[rule.column] ?? "";
        if (String(value).trim() === "") {
            if (rule.emptyPolicy === "skipRow") problems.push({ code: "empty_image", column: rule.column, layerId: rule.layerId });
            continue;
        }
        const folder = folders[rule.folderKey];
        if (!folder) {
            problems.push({ code: "folder_missing", column: rule.column, layerId: rule.layerId });
            continue;
        }
        const res = resolveImage(folder.index, value, rule);
        if (!res.file) {
            problems.push({ code: `image_${res.reason}`, column: rule.column, layerId: rule.layerId, value: String(value).trim() });
            continue;
        }
        if (res.ambiguous) notes.push({ code: "image_ambiguous", column: rule.column, value: String(value).trim(), chosen: res.file, candidates: res.ambiguous });
        images.push({ layerId: rule.layerId, folderKey: rule.folderKey, file: res.file, fit: rule.fit });
    }

    return { text, images, problems, notes };
}

const PROBLEM_TEXT = {
    empty_text: (p) => `Empty "${p.column}" cell (text set to skip the row when empty)`,
    empty_image: (p) => `Empty "${p.column}" cell (image set to skip the row when empty)`,
    folder_missing: (p) => `No image folder chosen for column "${p.column}"`,
    image_not_found: (p) => `Image not found for "${p.column}"`,
    image_path_not_allowed: (p) => `"${p.column}" contains a path; use a file name only`,
    image_unsupported_type: (p) => `Unsupported image type in "${p.column}"`
};

/**
 * @param {object} input
 * @param {{headers, rows, issues}} input.table
 * @param {Array} input.layers           template layer descriptors
 * @param {{text, images}} input.mapping
 * @param {Object<string,{name, index}>} input.folders   image folders by key
 * @param {{name: string, existingFileNames: string[]}|null} input.output
 * @param {string[]} input.formats
 * @param {string} input.namePattern
 * @param {{unitPrice: number}} input.pricing
 * @param {number|null} input.balance     available credits (null = unknown)
 * @param {string[]} [input.allowedFormats] defaults to the design formats
 * @param {number} [input.unitsPerItem]     credit units per item (video: per started 5 s)
 */
export function runPreflight(input) {
    const { table, layers, mapping, folders = {}, output, formats = [], namePattern, pricing, balance = null, allowedFormats = FORMATS, unitsPerItem = 1 } = input;
    const blocking = [];
    const warnings = [];

    // --- Inputs present ---------------------------------------------------
    if (!table || !table.headers.length) blocking.push(issue("error", "no_data", "Load a spreadsheet first.", { fix: { step: "data" } }));
    for (const i of table?.issues || []) (i.severity === "error" ? blocking : warnings).push({ ...i, fix: { step: "data" } });
    if (!layers || !layers.length) blocking.push(issue("error", "no_template", "Load a PSD template first.", { fix: { step: "template" } }));
    if (!mapping || mappedCount(mapping) === 0) blocking.push(issue("error", "no_mapping", "Map at least one layer to a column.", { fix: { step: "map" } }));
    if (!output) blocking.push(issue("error", "no_output", "Choose an output folder.", { fix: { step: "generate" } }));
    const fmts = formats.filter((f) => allowedFormats.includes(f));
    if (!fmts.length) blocking.push(issue("error", "no_format", "Select at least one output format.", { fix: { step: "generate" } }));
    const unknownTokens = table ? validatePattern(namePattern, table.headers) : [];
    if (unknownTokens.length) blocking.push(issue("error", "bad_pattern", `Unknown name token(s): ${unknownTokens.map((t) => `{${t}}`).join(", ")}`, { fix: { step: "generate" } }));

    if (blocking.length) return { ok: false, blocking, warnings, items: [], skipped: [], units: 0, cost: 0 };

    // --- Mapping consistency ---------------------------------------------------
    const columns = new Set(table.headers.map((h) => h.key));
    for (const rule of Object.values(mapping.text)) {
        const layer = findLayer(layers, rule.layerId);
        if (!layer) blocking.push(issue("error", "layer_missing", `A mapped text layer no longer exists in the template.`, { fix: { step: "map", layerId: rule.layerId } }));
        else if (!isTextLayer(layer)) blocking.push(issue("error", "not_text", `"${displayPath(layer)}" is not a text layer.`, { fix: { step: "map", layerId: rule.layerId } }));
        if (!columns.has(rule.column)) blocking.push(issue("error", "column_missing", `Column "${rule.column}" is not in the spreadsheet.`, { fix: { step: "map", layerId: rule.layerId } }));
    }
    for (const rule of Object.values(mapping.images)) {
        const layer = findLayer(layers, rule.layerId);
        if (!layer) blocking.push(issue("error", "layer_missing", `A mapped image layer no longer exists in the template.`, { fix: { step: "map", layerId: rule.layerId } }));
        else if (!isImageLayer(layer)) blocking.push(issue("error", "not_image", `"${displayPath(layer)}" can't receive images (Smart Object or pixel layer required).`, { fix: { step: "map", layerId: rule.layerId } }));
        if (!columns.has(rule.column)) blocking.push(issue("error", "column_missing", `Column "${rule.column}" is not in the spreadsheet.`, { fix: { step: "map", layerId: rule.layerId } }));
        if (!rule.folderKey || !folders[rule.folderKey]) blocking.push(issue("error", "folder_missing", `Choose an image folder for "${layer ? displayPath(layer) : rule.column}".`, { fix: { step: "map", layerId: rule.layerId } }));
    }
    const mappedIds = new Set([...Object.keys(mapping.text), ...Object.keys(mapping.images)].map(Number));
    for (const dup of summarizeTemplate(layers).duplicateNames) {
        if (dup.layers.some((l) => mappedIds.has(l.id))) {
            warnings.push(issue("warning", "duplicate_layer_name", `${dup.layers.length} layers are named "${dup.name}". Check the group path shown in Map.`, { fix: { step: "map" } }));
        }
    }
    if (blocking.length) return { ok: false, blocking, warnings, items: [], skipped: [], units: 0, cost: 0 };

    // --- Rows --------------------------------------------------------------
    const items = [];
    const skipped = [];
    const grouped = new Map(); // code|column -> {problem, rows}
    const ambiguous = new Map();
    const dataRows = table.rows.filter((r) => !r.isEmpty);
    for (const row of dataRows) {
        const res = resolveRow(row, mapping, folders);
        for (const n of res.notes) {
            const k = `${n.column}`;
            const g = ambiguous.get(k) || { column: n.column, rows: [] };
            g.rows.push(row.sourceRow);
            ambiguous.set(k, g);
        }
        if (res.problems.length) {
            skipped.push({ index: row.index, sourceRow: row.sourceRow, problems: res.problems });
            for (const p of res.problems) {
                const k = `${p.code}|${p.column}`;
                const g = grouped.get(k) || { problem: p, rows: [] };
                g.rows.push(row.sourceRow);
                grouped.set(k, g);
            }
            continue;
        }
        items.push({ key: `row-${row.sourceRow}`, index: row.index, sourceRow: row.sourceRow, text: res.text, images: res.images, row });
    }
    for (const { problem, rows } of grouped.values()) {
        const describe = PROBLEM_TEXT[problem.code] || (() => problem.code);
        warnings.push(issue("warning", problem.code, `${describe(problem)} in ${rows.length} row(s); those rows will be skipped.`, { rows, fix: { step: "map", layerId: problem.layerId } }));
    }
    for (const g of ambiguous.values()) {
        warnings.push(issue("warning", "image_ambiguous", `Several files match "${g.column}" values without an extension in ${g.rows.length} row(s); JPG is preferred, then PNG.`, { rows: g.rows, fix: { step: "map" } }));
    }

    // --- Names ---------------------------------------------------------------
    const bases = items.map((it) => renderName(namePattern, it.row, { total: dataRows.length }));
    const unique = dedupeNames(bases, output.existingFileNames || [], fmts);
    let renamed = 0;
    items.forEach((it, i) => {
        it.baseName = unique[i];
        if (unique[i] !== bases[i]) renamed++;
        delete it.row;
    });
    if (renamed) warnings.push(issue("warning", "names_deduplicated", `${renamed} output name(s) were already taken and got a numbered suffix; nothing will be overwritten.`, { fix: { step: "generate" } }));

    // --- Cost --------------------------------------------------------------------
    const units = items.length;
    const cost = units * unitsPerItem * (pricing?.unitPrice ?? 1);
    if (!units) blocking.push(issue("error", "nothing_to_generate", "Every row has a problem, so nothing can be generated.", { fix: { step: "map" } }));
    if (balance !== null && balance < cost) blocking.push(issue("error", "insufficient_credits", `This job needs ${cost} credits; ${balance} available.`, { fix: { step: "account" } }));

    return { ok: blocking.length === 0, blocking, warnings, items, skipped, units, cost, formats: fmts };
}
