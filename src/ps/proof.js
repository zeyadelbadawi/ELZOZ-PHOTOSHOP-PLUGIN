// Approval-sheet overlay (feature 14), added to the working copy only:
//  * a white strip under the design for the label ("#3  A1_Aurora Laptop")
//  * a large semi-transparent "PROOF" watermark across the design
// Both are made by Photoshop itself (batchPlay "make textLayer"), so they are
// baked into the exported pixels. If the watermark can't be created, the
// approval sheet stops: free proofs must never come out clean.
import { assertBatchPlayOk, StepError } from "./text.js";

const pt = (px, resolution) => (px * 72) / (resolution || 72);

function makeText({ text, x, y, sizePx, resolution, rgb, align = "center" }) {
    return {
        _obj: "make",
        _target: [{ _ref: "textLayer" }],
        using: {
            _obj: "textLayer",
            textKey: text,
            textClickPoint: { _obj: "paint", horizontal: { _unit: "pixelsUnit", _value: x }, vertical: { _unit: "pixelsUnit", _value: y } },
            orientation: { _enum: "orientation", _value: "horizontal" },
            textStyleRange: [
                {
                    _obj: "textStyleRange",
                    from: 0,
                    to: text.length,
                    textStyle: {
                        _obj: "textStyle",
                        fontPostScriptName: "ArialMT",
                        size: { _unit: "pointsUnit", _value: pt(sizePx, resolution) },
                        color: { _obj: "RGBColor", red: rgb[0], grain: rgb[1], blue: rgb[2] }
                    }
                }
            ],
            paragraphStyleRange: [{ _obj: "paragraphStyleRange", from: 0, to: text.length, paragraphStyle: { _obj: "paragraphStyle", align: { _enum: "alignmentType", _value: align } } }]
        },
        _options: { dialogOptions: "dontDisplay" }
    };
}

/**
 * @returns {Promise<{label: object, strip: number}>} the label text layer and the strip height (px)
 */
export async function addProofOverlay({ photoshop, doc, watermark = "PROOF" }) {
    const { constants } = photoshop;
    const w = doc.width;
    const h = doc.height;
    const strip = Math.max(28, Math.round(Math.min(w, h) * 0.07));
    try {
        await doc.resizeCanvas(w, h + strip, constants.AnchorPosition.TOPCENTER);
    } catch (e) {
        throw new StepError("proof", `Couldn't add the label area under the design: ${e.message}`);
    }
    const resolution = doc.resolution || 72;
    // Arial capitals are ~0.71 em wide: the word spans ~80% of the design width.
    const sizeW = Math.round(Math.min((w * 0.8) / (watermark.length * 0.71), h * 0.3));
    const top = (layer) => (doc.activeLayers && doc.activeLayers[0]) || layer;

    const wm = await photoshop.action.batchPlay([makeText({ text: watermark, x: w / 2, y: h / 2 + sizeW * 0.35, sizePx: sizeW, resolution, rgb: [128, 128, 128] })], {});
    assertBatchPlayOk(wm, "proof", { name: "watermark" });
    const watermarkLayer = top(null);
    if (!watermarkLayer || watermarkLayer.kind === undefined) throw new StepError("proof", "Photoshop didn't create the PROOF watermark.");
    watermarkLayer.opacity = 35;

    const labelSize = Math.round(strip * 0.5);
    const lab = await photoshop.action.batchPlay([makeText({ text: "#0", x: Math.round(strip * 0.35), y: h + Math.round(strip * 0.68), sizePx: labelSize, resolution, rgb: [30, 30, 36], align: "left" })], {});
    assertBatchPlayOk(lab, "proof", { name: "label" });
    const label = top(null);
    if (!label) throw new StepError("proof", "Photoshop didn't create the proof label.");
    return { label, watermark: watermarkLayer, strip };
}
