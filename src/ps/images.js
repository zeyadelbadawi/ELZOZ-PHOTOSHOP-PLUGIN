// Image placement.
// Smart Object: batchPlay "placedLayerReplaceContents" with a session token
//   (Adobe docs: batchPlay file arguments need {_path: token, _kind: "local"}).
//   The layer is selected first; community reports show "Replace Contents is
//   not currently available" (-25920) otherwise.
// Pixel layer: place the file as a new layer above it, fit it to the pixel
//   layer's bounds and hide the original. The row revert restores everything.
// Then the result is fitted into the original frame (fit = contain, fill = cover).
import { assertBatchPlayOk, StepError } from "./text.js";
import { removeBackground, subjectBounds } from "./subject.js";
import { subjectShift, usableSubject } from "../domain/subjectCrop.js";

const DONT_DISPLAY = { dialogOptions: "dontDisplay" };

export function bounds(layer) {
    const b = layer.boundsNoEffects || layer.bounds;
    const box = { left: Number(b.left), top: Number(b.top), right: Number(b.right), bottom: Number(b.bottom) };
    box.width = box.right - box.left;
    box.height = box.bottom - box.top;
    return box;
}

export function fitScale(content, frame, mode) {
    if (mode === "none") return 1;
    if (content.width <= 0 || content.height <= 0) throw new StepError("image", "The placed image has no visible pixels.");
    const sx = frame.width / content.width;
    const sy = frame.height / content.height;
    return mode === "fill" ? Math.max(sx, sy) : Math.min(sx, sy);
}

export async function fitLayerToFrame({ photoshop, layer, frame, mode }) {
    if (mode === "none") return;
    const anchor = photoshop.constants && photoshop.constants.AnchorPosition ? photoshop.constants.AnchorPosition.MIDDLECENTER : "middleCenter";
    const s = fitScale(bounds(layer), frame, mode);
    if (Math.abs(s - 1) > 1e-4) await layer.scale(s * 100, s * 100, anchor);
    const after = bounds(layer);
    const dx = (frame.left + frame.right) / 2 - (after.left + after.right) / 2;
    const dy = (frame.top + frame.bottom) / 2 - (after.top + after.bottom) / 2;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) await layer.translate(dx, dy);
}

/** Fit (and, if asked, centre on the subject and remove the background). Returns notes for the results. */
async function finish({ photoshop, doc, target, frame, fit, removeBg, bgFail, name }) {
    const notes = [];
    await fitLayerToFrame({ photoshop, layer: target, frame, mode: fit === "subject" ? "fill" : fit });
    if (fit === "subject") {
        const image = bounds(target);
        let subject = null;
        try {
            subject = await subjectBounds({ photoshop, doc, layer: target });
        } catch (e) {
            subject = null;
        }
        if (usableSubject(subject, image)) {
            const { dx, dy, keptTop } = subjectShift(frame, image, subject);
            if (dx || dy) await target.translate(dx, dy);
            if (keptTop) notes.push(`"${name}": the subject is taller than the frame; its top is kept in view.`);
        } else notes.push(`"${name}": no clear subject found; the photo is centred.`);
    }
    if (removeBg) {
        try {
            await removeBackground({ photoshop, layer: target });
        } catch (e) {
            if (bgFail === "skip") throw e;
            notes.push(`${e.message} The photo is used with its background.`);
        }
    }
    return notes;
}

async function selectOnly(photoshop, layer) {
    const r = await photoshop.action.batchPlay(
        [{ _obj: "select", _target: [{ _ref: "layer", _id: layer.id }], makeVisible: false, layerID: [layer.id], _options: DONT_DISPLAY }],
        {}
    );
    assertBatchPlayOk(r, "image", layer);
}

/**
 * @param {object} p
 * @param {object} p.photoshop  require('photoshop')
 * @param {object} p.fs         require('uxp').storage.localFileSystem
 * @param {object} p.doc        working-copy document
 * @param {object} p.layer      target layer in the working copy
 * @param {string} p.kind       'smartObject' | 'pixel'
 * @param {object} p.file       UXP File entry
 * @param {string} p.fit        'fit' | 'fill' | 'subject' (fill, centred on the subject) | 'none'
 * @param {boolean} [p.removeBg] hide the photo's background (Remove Background)
 * @param {string} [p.bgFail]    'keep' (place it as is, with a note) | 'skip' (the row fails)
 * @returns {Promise<{method, notes: string[]}>}
 */
export async function placeImage({ photoshop, fs, doc, layer, kind, file, fit = "fit", removeBg = false, bgFail = "keep" }) {
    const frame = bounds(layer);
    const token = await fs.createSessionToken(file);
    await selectOnly(photoshop, layer);

    if (kind === "smartObject") {
        const r = await photoshop.action.batchPlay(
            [{ _obj: "placedLayerReplaceContents", null: { _path: token, _kind: "local" }, layerID: layer.id, _options: DONT_DISPLAY }],
            {}
        );
        assertBatchPlayOk(r, "image", layer);
        const notes = await finish({ photoshop, doc, target: layer, frame, fit, removeBg, bgFail, name: file.name });
        return { method: "replaceContents", notes };
    }

    if (kind === "pixel") {
        const r = await photoshop.action.batchPlay(
            [{
                _obj: "placeEvent",
                null: { _path: token, _kind: "local" },
                freeTransformCenterState: { _enum: "quadCenterState", _value: "QCSAverage" },
                offset: { _obj: "offset", horizontal: { _unit: "pixelsUnit", _value: 0 }, vertical: { _unit: "pixelsUnit", _value: 0 } },
                _options: DONT_DISPLAY
            }],
            {}
        );
        assertBatchPlayOk(r, "image", layer);
        const placed = doc.activeLayers && doc.activeLayers[0];
        if (!placed || placed.id === layer.id) throw new StepError("image", `Photoshop did not place the image above "${layer.name}".`, { layerId: layer.id });
        const notes = await finish({ photoshop, doc, target: placed, frame, fit: fit === "none" ? "fit" : fit, removeBg, bgFail, name: file.name });
        layer.visible = false;
        return { method: "placeAbove", notes };
    }

    throw new StepError("image", `"${layer.name}" can't receive images.`, { layerId: layer.id });
}
