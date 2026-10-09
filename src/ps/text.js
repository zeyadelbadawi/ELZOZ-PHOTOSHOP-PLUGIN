// Text replacement.
// Photoshop 24.2+: DOM Layer.textItem.contents (documented).
// Older versions: batchPlay "set" on the textLayer descriptor's textKey. The
// legacy code assigned `layer.textKey`, which is not a DOM property and did nothing.

// Photoshop uses carriage returns for paragraph breaks.
export const normalizeText = (value) => String(value ?? "").replace(/\r\n|\n/g, "\r");

export class StepError extends Error {
    constructor(step, message, details = {}) {
        super(message);
        this.step = step;
        Object.assign(this, details);
    }
}

function hasDomText(layer) {
    try {
        return !!layer.textItem && typeof layer.textItem.contents === "string";
    } catch (e) {
        return false;
    }
}

export async function setLayerText({ photoshop, layer, value }) {
    const text = normalizeText(value);
    if (hasDomText(layer)) {
        layer.textItem.contents = text;
        // Read back: success is what Photoshop reports, not what we assigned.
        if (normalizeText(layer.textItem.contents) !== text) {
            throw new StepError("text", `Photoshop did not accept the new text for "${layer.name}".`, { layerId: layer.id });
        }
        return "dom";
    }
    const result = await photoshop.action.batchPlay(
        [{ _obj: "set", _target: [{ _ref: "textLayer", _id: layer.id }], to: { _obj: "textLayer", textKey: text }, _options: { dialogOptions: "dontDisplay" } }],
        {}
    );
    assertBatchPlayOk(result, "text", layer);
    return "batchPlay";
}

export function assertBatchPlayOk(result, step, layer) {
    const first = Array.isArray(result) ? result[0] : null;
    if (first && (first._obj === "error" || (typeof first.result === "number" && first.result !== 0))) {
        const msg = first.message || `error ${first.result}`;
        throw new StepError(step, `Photoshop rejected the ${step} change on "${layer.name}": ${msg}`, { layerId: layer.id, code: first.result });
    }
}
