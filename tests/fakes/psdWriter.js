// Simulated "Save as PSD": writes the simulator document as a real layered PSD
// (ag-psd), so exported files can be inspected with an independent parser:
// text layers carry the row's text, Smart Objects embed the placed image file.
import { writePsd } from "ag-psd";
import { imageInfo } from "./imageInfo.js";

const rgbOf = (s) => {
    const m = String(s || "").match(/(\d+)\D+(\d+)\D+(\d+)/);
    return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
};

/**
 * @param {object} doc         simulator FakeDocument
 * @param {object} deps        { pixelStore, fileBytes(name) -> Uint8Array|null }
 */
export function writeSimulatedPsd(doc, { pixelStore, fileBytes }) {
    const linkedFiles = [];
    let n = 0;
    const convert = (l) => {
        const b = l.b;
        const base = { name: l.name, hidden: !l.visible, opacity: (l.opacity ?? 100) / 100 };
        if (l.kind === "group") return { ...base, children: (l.layers || []).slice().reverse().map(convert), opened: true };
        if (l.kind === "text") {
            const size = l.fontSize ? l.fontSize * l.scaleFactor() : 24;
            const fillColor = rgbOf(l.color);
            return {
                ...base,
                text: { text: String(l._text ?? ""), transform: [1, 0, 0, 1, Math.round(b.left), Math.round(b.top + size)], style: { font: { name: "ArialMT" }, fontSize: Math.max(1, Math.round(size)), ...(fillColor ? { fillColor } : {}) } }
            };
        }
        if (l.kind === "solidColor") {
            const c = rgbOf(l.fillColor) || { r: 0, g: 0, b: 0 };
            const w = Math.max(1, Math.round(b.right - b.left));
            const h = Math.max(1, Math.round(b.bottom - b.top));
            const data = new Uint8ClampedArray(w * h * 4);
            for (let i = 0; i < data.length; i += 4) data.set([c.r, c.g, c.b, 255], i);
            return { ...base, left: Math.round(b.left), top: Math.round(b.top), imageData: { width: w, height: h, data }, vectorFill: { type: "color", color: c } };
        }
        const w = Math.round(b.right - b.left);
        const h = Math.round(b.bottom - b.top);
        const px = l.pixels ? pixelStore.get(l.pixels) : null;
        const sameSize = px && px.width === w && px.height === h;
        const layer = { ...base, left: Math.round(b.left), top: Math.round(b.top), ...(sameSize ? { imageData: px } : {}) };
        if (l.kind === "smartObject") {
            const name = l.content || l.embedded || "placeholder.png";
            const data = (l.content && fileBytes(l.content)) || new Uint8Array(0);
            const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
            linkedFiles.push({ id, name, data });
            const info = data.length ? imageInfo(data) : null;
            layer.placedLayer = { id, placed: id, type: "raster", width: info ? info.width : Math.max(1, w), height: info ? info.height : Math.max(1, h), transform: [b.left, b.top, b.right, b.top, b.right, b.bottom, b.left, b.bottom] };
        }
        return layer;
    };
    const psd = { width: Math.round(doc.width), height: Math.round(doc.height), children: doc.layers.slice().reverse().map(convert), linkedFiles };
    return new Uint8Array(writePsd(psd, { invalidateTextLayers: true, generateThumbnail: false }));
}
