// Template layer model. The Photoshop adapter (src/ps/layerTree.js) produces
// plain descriptors; everything here is pure.
//
// Descriptor: { id, name, kind, path: [names...], indexPath: "0/2/1", depth,
//               visible, locked, bounds: {left, top, right, bottom} | null }
// kind is normalized to: 'text' | 'smartObject' | 'pixel' | 'fill' | 'group' | 'other'
// ('fill' = solid color fill layers, which is also how Photoshop reports shape layers)

export const TEXT_KINDS = new Set(["text"]);
export const IMAGE_KINDS = new Set(["smartObject", "pixel"]);

export const isTextLayer = (layer) => TEXT_KINDS.has(layer.kind);
export const isImageLayer = (layer) => IMAGE_KINDS.has(layer.kind);
/** Layers whose color can come from a column: text, and solid color fill / shape layers. */
export const isColorLayer = (layer) => layer.kind === "text" || layer.kind === "fill";

export function displayPath(layer) {
    return layer.path.join(" / ");
}

/** Summarize a template for the Template step and preflight. */
export function summarizeTemplate(layers) {
    const byName = new Map();
    for (const l of layers) {
        if (l.kind === "group") continue;
        const list = byName.get(l.name) || [];
        list.push(l);
        byName.set(l.name, list);
    }
    const duplicateNames = [...byName.entries()].filter(([, list]) => list.length > 1).map(([name, list]) => ({ name, layers: list }));
    return {
        total: layers.length,
        text: layers.filter(isTextLayer),
        images: layers.filter(isImageLayer),
        groups: layers.filter((l) => l.kind === "group").length,
        duplicateNames
    };
}

export function findLayer(layers, id) {
    return layers.find((l) => l.id === id) || null;
}
