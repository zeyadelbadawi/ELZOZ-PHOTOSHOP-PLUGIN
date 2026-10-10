// Turns a real PSD file (read with ag-psd) into the simulator's document spec,
// so simulated runs use the actual fixture templates rather than hand-written
// layer lists. Pixel data is kept in a shared store by key (not in history JSON).
import { readPsd, initializeCanvas } from "ag-psd";

// In Node there is no canvas; ag-psd only needs plain ImageData objects when
// reading with useImageData, so provide those.
if (typeof document === "undefined" && typeof OffscreenCanvas === "undefined") {
    initializeCanvas(
        () => {
            throw new Error("canvas not available in the Node simulator");
        },
        (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) })
    );
}

export function createPixelStore() {
    const store = new Map();
    let n = 0;
    return {
        put(imageData) {
            const key = `px${++n}`;
            store.set(key, imageData);
            return key;
        },
        get: (key) => store.get(key)
    };
}

/**
 * @param {Uint8Array|ArrayBuffer} bytes  PSD file
 * @param {object} pixelStore            from createPixelStore()
 * @returns {{title, width, height, layers}} top-to-bottom like Document.layers
 */
export function templateFromPsd(bytes, pixelStore, title = "template.psd") {
    const psd = readPsd(bytes, { useImageData: true, skipThumbnail: true, skipCompositeImageData: true });
    const linked = new Map((psd.linkedFiles || []).map((f) => [f.id, f]));
    const convert = (layer) => {
        const base = { name: layer.name, visible: !layer.hidden, opacity: Math.round((layer.opacity ?? 1) * 100) };
        if (layer.children) return { ...base, kind: "group", layers: layer.children.slice().reverse().map(convert), bounds: { left: 0, top: 0, right: 0, bottom: 0 } };
        if (layer.text) {
            const t = layer.text;
            const size = (t.style && t.style.fontSize) || 24;
            const x = t.transform ? t.transform[4] : layer.left || 0;
            const y = t.transform ? t.transform[5] : (layer.top || 0) + size;
            const widest = Math.max(...String(t.text).split(/\r|\n/).map((s) => s.length), 1);
            const c = (t.style && t.style.fillColor) || { r: 0, g: 0, b: 0 };
            return {
                ...base,
                kind: "text",
                text: t.text,
                fontSize: size,
                color: `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`,
                bounds: { left: x, top: y - size, right: x + Math.max(size, widest * size * 0.55), bottom: y + size * 0.25 }
            };
        }
        const bounds = { left: layer.left || 0, top: layer.top || 0, right: layer.right || 0, bottom: layer.bottom || 0 };
        const pixels = layer.imageData ? pixelStore.put(layer.imageData) : null;
        if (layer.vectorFill && layer.vectorFill.type === "color") {
            const c = layer.vectorFill.color || { r: 0, g: 0, b: 0 };
            return { ...base, kind: "solidColor", bounds, fillColor: `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})` };
        }
        if (layer.placedLayer) {
            const f = linked.get(layer.placedLayer.id);
            return { ...base, kind: "smartObject", bounds, pixels, content: null, embedded: f ? f.name : null };
        }
        return { ...base, kind: "pixel", bounds, pixels };
    };
    const res = psd.imageResources && psd.imageResources.resolutionInfo;
    return { title, width: psd.width, height: psd.height, resolution: res ? Math.round(res.horizontalResolution) : 72, layers: (psd.children || []).slice().reverse().map(convert) };
}
