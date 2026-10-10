// Recoloring layers from a spreadsheet cell (feature 11).
//
// Text layers: the documented DOM path (TextItem.characterStyle.color with a
//   SolidColor, Photoshop 24.1+), read back to confirm. Older versions: a
//   batchPlay "set textStyle" on the selected text layer (the descriptor
//   Photoshop records for the Character panel's color).
// Color fill and shape layers (LayerKind.SOLIDCOLOR): batchPlay "set" on the
//   contentLayer with a solidColorLayer descriptor, the descriptor Photoshop
//   records for Layer > Layer Content Options. Not documented for UXP: the
//   self-test checks it on each Photoshop version.
// The whole text takes one color; per-character styling inside the text is replaced.
import { assertBatchPlayOk, StepError } from "./text.js";

const DONT_DISPLAY = { dialogOptions: "dontDisplay" };
const rgbDescriptor = ({ r, g, b }) => ({ _obj: "RGBColor", red: r, grain: g, blue: b });

function solidColor(photoshop, { r, g, b }) {
    const SolidColor = photoshop.app && photoshop.app.SolidColor;
    if (typeof SolidColor !== "function") return null;
    const c = new SolidColor();
    c.rgb.red = r;
    c.rgb.green = g;
    c.rgb.blue = b;
    return c;
}

function readRgb(color) {
    try {
        const rgb = color && color.rgb;
        return rgb ? { r: Math.round(rgb.red), g: Math.round(rgb.green), b: Math.round(rgb.blue) } : null;
    } catch (e) {
        return null;
    }
}

async function select(photoshop, layer) {
    const r = await photoshop.action.batchPlay(
        [{ _obj: "select", _target: [{ _ref: "layer", _id: layer.id }], makeVisible: false, layerID: [layer.id], _options: DONT_DISPLAY }],
        {}
    );
    assertBatchPlayOk(r, "color", layer);
}

/**
 * @param {object} p
 * @param {object} p.photoshop  require("photoshop")
 * @param {object} p.layer      layer in the working copy
 * @param {string} p.kind       "text" | "fill"
 * @param {{r,g,b}} p.rgb
 * @returns {Promise<"dom"|"batchPlay">}
 */
export async function setLayerColor({ photoshop, layer, kind, rgb }) {
    if (kind === "text") {
        const style = (() => {
            try {
                return layer.textItem && layer.textItem.characterStyle;
            } catch (e) {
                return null;
            }
        })();
        const color = solidColor(photoshop, rgb);
        if (style && color) {
            style.color = color;
            const back = readRgb(style.color);
            if (back && Math.abs(back.r - rgb.r) <= 1 && Math.abs(back.g - rgb.g) <= 1 && Math.abs(back.b - rgb.b) <= 1) return "dom";
            if (back) throw new StepError("color", `Photoshop did not accept the new color for "${layer.name}".`, { layerId: layer.id });
        }
        await select(photoshop, layer);
        const r = await photoshop.action.batchPlay(
            [
                {
                    _obj: "set",
                    _target: [{ _ref: "property", _property: "textStyle" }, { _ref: "textLayer", _enum: "ordinal", _value: "targetEnum" }],
                    to: { _obj: "textStyle", textOverrideFeatureName: 808465458, typeStyleOperationType: 3, color: rgbDescriptor(rgb) },
                    _options: DONT_DISPLAY
                }
            ],
            {}
        );
        assertBatchPlayOk(r, "color", layer);
        return "batchPlay";
    }
    if (kind === "fill") {
        await select(photoshop, layer);
        const r = await photoshop.action.batchPlay(
            [{ _obj: "set", _target: [{ _ref: "contentLayer", _enum: "ordinal", _value: "targetEnum" }], to: { _obj: "solidColorLayer", color: rgbDescriptor(rgb) }, _options: DONT_DISPLAY }],
            {}
        );
        assertBatchPlayOk(r, "color", layer);
        return "batchPlay";
    }
    throw new StepError("color", `"${layer.name}" can't take a color.`, { layerId: layer.id });
}
