// "Shrink to fit": after new text is set, a point-text layer that became wider
// than the template's text box is scaled down to fit it, then re-aligned to the
// box. Alignment is read from the bounds themselves (left edge kept = left
// aligned, right edge kept = right aligned, otherwise centered), so no
// version-specific text API is needed: Layer.scale/translate exist since 23.0.
// Paragraph (box) text wraps inside its box and is left alone.
import { bounds } from "./images.js";

export const MIN_SCALE_PCT = 30;

/** Pure: how to bring `now` back inside `box`. null = already fits. */
export function textFitPlan(box, now) {
    const boxW = box.right - box.left;
    const w = now.right - now.left;
    if (!(boxW > 0) || !(w > boxW + 0.5)) return null;
    const pct = Math.max(MIN_SCALE_PCT, (boxW / w) * 100);
    const align = Math.abs(now.left - box.left) <= 2 ? "left" : Math.abs(now.right - box.right) <= 2 ? "right" : "center";
    return { pct, align };
}

/** Pure: horizontal shift that re-aligns the scaled text to the box. */
export function alignShift(box, after, align) {
    if (align === "left") return box.left - after.left;
    if (align === "right") return box.right - after.right;
    return (box.left + box.right) / 2 - (after.left + after.right) / 2;
}

export async function shrinkTextToBox({ photoshop, layer, box }) {
    const plan = textFitPlan(box, bounds(layer));
    if (!plan) return null;
    const anchor = photoshop.constants && photoshop.constants.AnchorPosition ? photoshop.constants.AnchorPosition.MIDDLECENTER : "middleCenter";
    await layer.scale(plan.pct, plan.pct, anchor);
    const dx = alignShift(box, bounds(layer), plan.align);
    if (Math.abs(dx) > 0.5) await layer.translate(dx, 0);
    return plan;
}
