// Mapping model: which spreadsheet column feeds which template layer.
// Keyed by template layer id, so one column can feed many layers and
// duplicate layer names are unambiguous.
import { isImageLayer, isTextLayer } from "./layers.js";
import { IMAGE_EXTENSIONS, extensionOf } from "./imageFiles.js";

export const EMPTY_POLICIES = ["blank", "keepTemplate", "skipRow"];
export const FIT_MODES = ["fit", "fill", "none"];

export function createMapping() {
    return { text: {}, images: {}, visibility: {} };
}

export function setTextMapping(mapping, layerId, column, emptyPolicy = "blank") {
    const text = { ...mapping.text };
    if (!column) delete text[layerId];
    else text[layerId] = { layerId, column, emptyPolicy, shrinkToFit: !!(mapping.text[layerId] && mapping.text[layerId].shrinkToFit) };
    return { ...mapping, text };
}

/** Text options other than the column, e.g. { shrinkToFit: true }. */
export function setTextOptions(mapping, layerId, patch) {
    const rule = mapping.text[layerId];
    if (!rule) return mapping;
    return { ...mapping, text: { ...mapping.text, [layerId]: { ...rule, ...patch } } };
}

/** Show/hide any layer (or group) from a column. emptyPolicy: "hide" | "show" | "keep". */
export function setVisibilityMapping(mapping, layerId, column, emptyPolicy = "hide") {
    const visibility = { ...(mapping.visibility || {}) };
    if (!column) delete visibility[layerId];
    else visibility[layerId] = { layerId, column, emptyPolicy };
    return { ...mapping, visibility };
}

export function setImageMapping(mapping, layerId, rule) {
    const images = { ...mapping.images };
    if (!rule || !rule.column) delete images[layerId];
    else {
        images[layerId] = {
            layerId,
            column: rule.column,
            folderKey: rule.folderKey || null,
            fit: rule.fit || "fit",
            emptyPolicy: rule.emptyPolicy || "keepTemplate",
            ignoreCase: rule.ignoreCase !== false,
            addExtension: rule.addExtension !== false
        };
    }
    return { ...mapping, images };
}

export function mappedCount(mapping) {
    return Object.keys(mapping.text).length + Object.keys(mapping.images).length + Object.keys(mapping.visibility || {}).length;
}

const normalize = (s) => String(s).toLowerCase().replace(/[\s_\-.]+/g, "");

/** Map layers whose names match a header (case/space/underscore-insensitive). Existing mappings win. */
export function autoMap(mapping, headers, layers, rows = null) {
    const byNorm = new Map(headers.map((h) => [normalize(h.label), h.key]));
    // With rows, an image layer is only auto-mapped to a column that holds at
    // least one image file name; a text column ("Badge": "NEW") that happens to
    // share a layer's name would otherwise skip every row as "image not found".
    const holdsFiles = (column) =>
        !rows || rows.some((r) => r.values && IMAGE_EXTENSIONS.includes(extensionOf(String(r.values[column] || "").trim())));
    let next = mapping;
    for (const layer of layers) {
        const column = byNorm.get(normalize(layer.name));
        if (!column) continue;
        if (isTextLayer(layer) && !next.text[layer.id]) next = setTextMapping(next, layer.id, column);
        else if (isImageLayer(layer) && !next.images[layer.id] && holdsFiles(column)) next = setImageMapping(next, layer.id, { column });
    }
    return next;
}

/** Drop mappings that point at columns or layers that no longer exist (e.g. after reloading files). */
export function pruneMapping(mapping, headers, layers) {
    const columns = new Set(headers.map((h) => h.key));
    const ids = new Set(layers.map((l) => l.id));
    const keep = (rule) => columns.has(rule.column) && ids.has(rule.layerId);
    return {
        text: Object.fromEntries(Object.entries(mapping.text).filter(([, r]) => keep(r))),
        images: Object.fromEntries(Object.entries(mapping.images).filter(([, r]) => keep(r))),
        visibility: Object.fromEntries(Object.entries(mapping.visibility || {}).filter(([, r]) => keep(r)))
    };
}
