// Several sizes per row from artboards (feature 5). Pure.
//
// A template with artboards (Post 1080×1080, Story 1080×1920, Banner ...) is
// mapped once, on its first artboard. Layers at the same place in the other
// artboards (same group path and name below the artboard) follow the same
// rules. Each row then becomes one design per artboard, exported at the
// artboard's size; each design is one output (and one credit).

const topIndex = (layer) => String(layer.indexPath || "").split("/")[0];
const below = (layer) => (layer.path || []).slice(1).join("\u0001") + "\u0002" + layer.kind;

/** Artboards in template order, each with its layers. */
export function artboardGroups(layers, artboards) {
    return (artboards || []).map((a) => ({ ...a, layers: layers.filter((l) => l.id !== a.id && topIndex(l) === a.indexPath) }));
}

/** The layers the Map step shows: the first artboard's, plus layers outside any artboard. */
export function leadLayers(layers, artboards) {
    if (!artboards || !artboards.length) return layers;
    const boardIdx = new Set(artboards.map((a) => a.indexPath));
    const lead = artboards[0].indexPath;
    return layers.filter((l) => !artboards.some((a) => a.id === l.id) && (topIndex(l) === lead || !boardIdx.has(topIndex(l))));
}

/**
 * For each artboard: lead layer id → the layer at the same place in that artboard.
 * Same relative path and kind; repeated names pair up in order.
 */
export function counterpartMaps(layers, artboards) {
    const groups = artboardGroups(layers, artboards);
    if (!groups.length) return new Map();
    const keyed = (g) => {
        const seen = new Map();
        return g.layers.map((l) => {
            const base = below(l);
            const n = seen.get(base) || 0;
            seen.set(base, n + 1);
            return [`${base}#${n}`, l];
        });
    };
    const lead = new Map(keyed(groups[0]));
    const out = new Map();
    for (const g of groups) {
        const mine = new Map(keyed(g));
        const map = new Map();
        for (const [k, l] of lead) {
            const c = mine.get(k);
            if (c) map.set(l.id, c.id);
        }
        // Layers outside any artboard are shared by every artboard.
        for (const l of layers) if (!groups.some((x) => x.indexPath === topIndex(l)) && !artboards.some((a) => a.id === l.id)) map.set(l.id, l.id);
        out.set(g.id, map);
    }
    return out;
}

/**
 * One row item → one item per artboard, with the layer ids of that artboard.
 * @returns {{items: Array, missing: Map<string, Set<string>>}} missing: artboard name → lead layer names it lacks
 */
export function expandItems(items, layers, artboards) {
    const maps = counterpartMaps(layers, artboards);
    const names = new Map(layers.map((l) => [l.id, l.name]));
    const missing = new Map();
    const out = [];
    for (const it of items) {
        for (const a of artboards) {
            const map = maps.get(a.id);
            const remap = (list) =>
                (list || []).flatMap((x) => {
                    const id = map.get(x.layerId);
                    if (id == null) {
                        if (!missing.has(a.name)) missing.set(a.name, new Set());
                        missing.get(a.name).add(names.get(x.layerId) || String(x.layerId));
                        return [];
                    }
                    return [{ ...x, layerId: id }];
                });
            out.push({
                ...it,
                key: `${it.key}@${a.id}`,
                artboard: { id: a.id, name: a.name, rect: a.rect },
                text: remap(it.text),
                images: remap(it.images),
                visibility: remap(it.visibility),
                colors: remap(it.colors)
            });
        }
    }
    return { items: out, missing };
}

/** Everything a row changes, in every artboard at once (the approval sheet shows all sizes together). */
export function combineRow(expanded) {
    const first = expanded[0];
    const pick = (k) => expanded.flatMap((e) => e[k] || []);
    return { ...first, key: first.key.split("@")[0], artboard: null, text: pick("text"), images: pick("images"), visibility: pick("visibility"), colors: pick("colors") };
}

export const artboardSize = (a) => ({ width: Math.round(a.rect.right - a.rect.left), height: Math.round(a.rect.bottom - a.rect.top) });
