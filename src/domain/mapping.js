// Mapping model: which spreadsheet column feeds which template layer.
// Keyed by template layer id, so one column can feed many layers and
// duplicate layer names are unambiguous.
import { isImageLayer, isTextLayer } from "./layers.js";

export const EMPTY_POLICIES = ["blank", "keepTemplate", "skipRow"];
export const FIT_MODES = ["fit", "fill", "none"];

export function createMapping() {
    return { text: {}, images: {} };
}

export function setTextMapping(mapping, layerId, column, emptyPolicy = "blank") {
    const text = { ...mapping.text };
    if (!column) delete text[layerId];
    else text[layerId] = { layerId, column, emptyPolicy };
    return { ...mapping, text };
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
    return Object.keys(mapping.text).length + Object.keys(mapping.images).length;
}

const normalize = (s) => String(s).toLowerCase().replace(/[\s_\-.]+/g, "");

/** Map layers whose names match a header (case/space/underscore-insensitive). Existing mappings win. */
export function autoMap(mapping, headers, layers) {
    const byNorm = new Map(headers.map((h) => [normalize(h.label), h.key]));
    let next = mapping;
    for (const layer of layers) {
        const column = byNorm.get(normalize(layer.name));
        if (!column) continue;
        if (isTextLayer(layer) && !next.text[layer.id]) next = setTextMapping(next, layer.id, column);
        else if (isImageLayer(layer) && !next.images[layer.id]) next = setImageMapping(next, layer.id, { column });
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
        images: Object.fromEntries(Object.entries(mapping.images).filter(([, r]) => keep(r)))
    };
}
