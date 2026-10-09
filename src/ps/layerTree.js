// Walk a Photoshop document into plain layer descriptors (see src/domain/layers.js).
// Must run inside executeAsModal when called from a modal job; reading is also
// allowed outside a modal scope.

export function kindNormalizer(constants) {
    const K = (constants && constants.LayerKind) || {};
    const table = new Map([
        [K.TEXT || "text", "text"],
        [K.SMARTOBJECT || "smartObject", "smartObject"],
        [K.NORMAL || "pixel", "pixel"],
        [K.GROUP || "group", "group"]
    ]);
    return (kind) => table.get(kind) || "other";
}

function readBounds(layer) {
    try {
        const b = layer.boundsNoEffects || layer.bounds;
        if (!b) return null;
        return { left: Number(b.left), top: Number(b.top), right: Number(b.right), bottom: Number(b.bottom) };
    } catch (e) {
        return null;
    }
}

/**
 * @returns {{descriptors: Array, byIndexPath: Map<string, Layer>}}
 */
export function walkDocument(doc, constants) {
    const normalize = kindNormalizer(constants);
    const descriptors = [];
    const byIndexPath = new Map();
    const visit = (collection, parentPath, parentIndex, depth) => {
        let i = 0;
        for (const layer of collection) {
            const indexPath = parentIndex ? `${parentIndex}/${i}` : String(i);
            const path = [...parentPath, layer.name];
            const kind = normalize(layer.kind);
            descriptors.push({
                id: layer.id,
                name: layer.name,
                kind,
                path,
                indexPath,
                depth,
                visible: !!layer.visible,
                locked: !!layer.locked,
                bounds: kind === "group" ? null : readBounds(layer)
            });
            byIndexPath.set(indexPath, layer);
            if (kind === "group" && layer.layers) visit(layer.layers, path, indexPath, depth + 1);
            i++;
        }
    };
    visit(doc.layers, [], "", 0);
    return { descriptors, byIndexPath };
}

/**
 * Map template layer ids to the corresponding layers of a duplicated document.
 * Layer ids are not guaranteed to survive Document.duplicate(), but the tree
 * structure is identical, so the index path is used as the join key.
 */
export function mapLayersByStructure(sourceDescriptors, workDoc, constants) {
    const { byIndexPath } = walkDocument(workDoc, constants);
    const map = new Map();
    for (const d of sourceDescriptors) {
        const layer = byIndexPath.get(d.indexPath);
        if (layer && layer.name === d.name) map.set(d.id, layer);
    }
    return map;
}
