// Video preflight: the design preflight (rows, mapping, images, names, cost)
// plus timeline validity, aspect ratio and animated-layer checks.
import { runPreflight } from "../preflight.js";
import { findLayer, displayPath } from "../layers.js";
import { aspectMatches, buildTimeline, videoUnits } from "./timeline.js";

const AVG_FRAME_BYTES = 180 * 1024; // rough JPEG size at 1080p, for the disk estimate only

export function runVideoPreflight(input) {
    const { timelineSpec, template, pricing = {}, layers } = input;
    const blocking = [];
    const warnings = [];

    const tl = buildTimeline(timelineSpec);
    for (const e of tl.errors) blocking.push({ severity: "error", code: e.code, message: e.message, fix: { step: "video", layerId: e.layerId } });

    if (tl.ok) {
        const { format } = tl.timeline;
        if (!template || !aspectMatches(template.width, template.height, format)) {
            blocking.push({
                severity: "error",
                code: "aspect_mismatch",
                message: `The template is ${template ? `${template.width}×${template.height}` : "not loaded"}; ${format.label} needs a ${format.width}:${format.height} template.`,
                fix: { step: "video" }
            });
        } else if (template.width < format.width) {
            warnings.push({ severity: "warning", code: "upscaled", message: `The template is smaller than ${format.width}×${format.height} and will be enlarged.`, fix: { step: "template" } });
        }
        for (const t of tl.timeline.tracks) {
            const layer = findLayer(layers || [], t.layerId);
            if (!layer) blocking.push({ severity: "error", code: "layer_missing", message: "An animated layer no longer exists in the template.", fix: { step: "video", layerId: t.layerId } });
            else if (layer.locked) blocking.push({ severity: "error", code: "layer_locked", message: `"${displayPath(layer)}" is locked and can't be animated.`, fix: { step: "video", layerId: t.layerId } });
        }
        if (!tl.timeline.tracks.length) warnings.push({ severity: "warning", code: "no_animation", message: "No layer is animated; every frame will look the same.", fix: { step: "video" } });
    }

    const unitsPerItem = tl.ok ? videoUnits(tl.timeline.durationMs, tl.timeline.width, tl.timeline.height, { hdLongEdge: pricing.hdLongEdge, hdMultiplier: pricing.hdMultiplier }) : 1;
    const base = runPreflight({ ...input, formats: ["mov"], allowedFormats: ["mov"], unitsPerItem, pricing: { unitPrice: pricing.unitPrice ?? 1 } });

    const all = { blocking: [...blocking, ...base.blocking], warnings: [...warnings, ...base.warnings] };
    if (tl.ok && base.units) {
        const frames = tl.timeline.frameCount;
        all.warnings.push({
            severity: "info",
            code: "estimate",
            message: `${base.units} video(s) × ${frames} frames. Temporary disk use about ${Math.ceil((frames * AVG_FRAME_BYTES) / (1024 * 1024))} MB per video.`
        });
    }
    return { ...base, ...all, ok: all.blocking.length === 0, timeline: tl.timeline, unitsPerItem };
}
