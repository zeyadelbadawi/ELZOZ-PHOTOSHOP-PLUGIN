// Photoshop's subject detection for placed images (features 7 and 12).
//  * Select Subject: batchPlay "autoCutout" on the active layer; the selection
//    bounds are read back with a "get" of the document's selection.
//  * Remove Background: the Remove Background quick action ("removeBackground");
//    if Photoshop refuses it, Select Subject + a layer mask that reveals the
//    selection does the same thing.
// Both work on the working copy only and are undone with the row.
import { assertBatchPlayOk, StepError } from "./text.js";

const DONT_DISPLAY = { dialogOptions: "dontDisplay" };
const isError = (r) => Array.isArray(r) && r[0] && (r[0]._obj === "error" || (typeof r[0].result === "number" && r[0].result !== 0));
const px = (v) => (v && typeof v === "object" ? Number(v._value) : Number(v));

async function select(photoshop, layer) {
    const r = await photoshop.action.batchPlay([{ _obj: "select", _target: [{ _ref: "layer", _id: layer.id }], makeVisible: false, layerID: [layer.id], _options: DONT_DISPLAY }], {});
    assertBatchPlayOk(r, "image", layer);
}

async function deselect(photoshop) {
    await photoshop.action.batchPlay([{ _obj: "set", _target: [{ _ref: "channel", _property: "selection" }], to: { _enum: "ordinal", _value: "none" }, _options: DONT_DISPLAY }], {});
}

/** Select Subject on this layer; returns the subject's bounds (px) or null. Leaves nothing selected. */
export async function subjectBounds({ photoshop, doc, layer }) {
    await select(photoshop, layer);
    const cut = await photoshop.action.batchPlay([{ _obj: "autoCutout", sampleAllLayers: false, _options: DONT_DISPLAY }], {});
    if (isError(cut)) return null;
    try {
        const got = await photoshop.action.batchPlay([{ _obj: "get", _target: [{ _property: "selection" }, { _ref: "document", _id: doc.id }], _options: DONT_DISPLAY }], {});
        const sel = got && got[0] && got[0].selection;
        if (!sel) return null;
        const b = { left: px(sel.left), top: px(sel.top), right: px(sel.right), bottom: px(sel.bottom) };
        return [b.left, b.top, b.right, b.bottom].every(Number.isFinite) ? b : null;
    } finally {
        await deselect(photoshop);
    }
}

/**
 * Hide the background of this layer with a mask. Returns how it was done.
 * Throws StepError("background") when neither way works (e.g. the layer already has a mask).
 */
export async function removeBackground({ photoshop, layer }) {
    await select(photoshop, layer);
    const quick = await photoshop.action.batchPlay([{ _obj: "removeBackground", _options: DONT_DISPLAY }], {});
    if (!isError(quick)) return "removeBackground";
    const cut = await photoshop.action.batchPlay([{ _obj: "autoCutout", sampleAllLayers: false, _options: DONT_DISPLAY }], {});
    const got = isError(cut) ? null : await photoshop.action.batchPlay([{ _obj: "get", _target: [{ _property: "selection" }, { _ref: "document", _enum: "ordinal", _value: "targetEnum" }], _options: DONT_DISPLAY }], {});
    if (!got || !got[0] || !got[0].selection) {
        await deselect(photoshop);
        throw new StepError("background", `Photoshop couldn't find the subject in "${layer.name}".`, { layerId: layer.id });
    }
    const mask = await photoshop.action.batchPlay(
        [{ _obj: "make", new: { _class: "channel" }, at: { _ref: "channel", _enum: "channel", _value: "mask" }, using: { _enum: "userMaskEnabled", _value: "revealSelection" }, _options: DONT_DISPLAY }],
        {}
    );
    await deselect(photoshop);
    if (isError(mask)) throw new StepError("background", `Photoshop couldn't mask the background of "${layer.name}" (does the layer already have a mask?).`, { layerId: layer.id });
    return "selectSubjectMask";
}
