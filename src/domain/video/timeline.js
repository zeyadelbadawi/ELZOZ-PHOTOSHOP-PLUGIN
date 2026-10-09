// Video timeline: formats, animation presets, easing and per-frame layer state.
// Pure and deterministic; the Photoshop frame renderer just applies the
// state returned by frameState() to the working copy.

export const FORMATS = {
    reel: { id: "reel", label: "Reel / Story 9:16", width: 1080, height: 1920 },
    portrait: { id: "portrait", label: "Portrait 4:5", width: 1080, height: 1350 },
    square: { id: "square", label: "Square 1:1", width: 1080, height: 1080 },
    landscape: { id: "landscape", label: "Landscape 16:9", width: 1920, height: 1080 }
};
export const FPS_OPTIONS = [24, 25, 30];
export const DURATION_LIMITS = { min: 1000, max: 60000 };

export const EASINGS = {
    linear: (t) => t,
    easeOut: (t) => 1 - Math.pow(1 - t, 3),
    easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    backOut: (t) => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
};

// Each preset maps eased progress p (0..1) to { opacity 0..1, dx, dy (fraction of canvas), scale (1 = 100%) }.
// The layer reaches its designed position/size at p = 1.
export const PRESETS = {
    none: { label: "No animation", at: () => ({ opacity: 1, dx: 0, dy: 0, scale: 1 }) },
    fadeIn: { label: "Fade in", at: (p) => ({ opacity: p, dx: 0, dy: 0, scale: 1 }) },
    slideUp: { label: "Slide up", at: (p, d) => ({ opacity: p, dx: 0, dy: (1 - p) * d, scale: 1 }) },
    slideDown: { label: "Slide down", at: (p, d) => ({ opacity: p, dx: 0, dy: (p - 1) * d, scale: 1 }) },
    slideLeft: { label: "Slide in from right", at: (p, d) => ({ opacity: p, dx: (1 - p) * d, dy: 0, scale: 1 }) },
    slideRight: { label: "Slide in from left", at: (p, d) => ({ opacity: p, dx: (p - 1) * d, dy: 0, scale: 1 }) },
    zoomIn: { label: "Zoom in", at: (p) => ({ opacity: p, dx: 0, dy: 0, scale: 0.6 + 0.4 * p }) },
    pop: { label: "Pop", defaultEasing: "backOut", at: (p) => ({ opacity: Math.min(1, p * 2), dx: 0, dy: 0, scale: Math.max(0.01, p) }) },
    // Ken Burns runs for the whole clip: slow zoom from 100% to 112%.
    kenBurns: { label: "Ken Burns", wholeClip: true, at: (p) => ({ opacity: 1, dx: 0, dy: 0, scale: 1 + 0.12 * p }) }
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * @param {object} spec
 * @param {string} spec.format       key of FORMATS
 * @param {number} spec.fps
 * @param {number} spec.durationMs
 * @param {Array}  spec.tracks       [{ layerId, preset, startMs, lengthMs, easing, distance }]
 * @param {number} [spec.fadeOutMs]  global fade-out of animated layers at the end (0 = none)
 * @returns {{ ok, errors, timeline }}
 */
export function buildTimeline(spec) {
    const errors = [];
    const format = FORMATS[spec.format];
    if (!format) errors.push({ code: "bad_format", message: "Choose a video format." });
    if (!FPS_OPTIONS.includes(spec.fps)) errors.push({ code: "bad_fps", message: `Frame rate must be one of ${FPS_OPTIONS.join(", ")}.` });
    const d = Number(spec.durationMs);
    if (!Number.isFinite(d) || d < DURATION_LIMITS.min || d > DURATION_LIMITS.max) {
        errors.push({ code: "bad_duration", message: `Duration must be between ${DURATION_LIMITS.min / 1000} and ${DURATION_LIMITS.max / 1000} seconds.` });
    }
    const fadeOutMs = Math.max(0, Number(spec.fadeOutMs || 0));
    if (fadeOutMs > d / 2) errors.push({ code: "bad_fade", message: "Fade-out can't be longer than half the video." });

    const tracks = [];
    const seen = new Set();
    for (const t of spec.tracks || []) {
        const preset = PRESETS[t.preset];
        if (!preset) {
            errors.push({ code: "bad_preset", layerId: t.layerId, message: `Unknown animation "${t.preset}".` });
            continue;
        }
        if (seen.has(t.layerId)) {
            errors.push({ code: "duplicate_track", layerId: t.layerId, message: "A layer can have only one animation." });
            continue;
        }
        seen.add(t.layerId);
        const startMs = preset.wholeClip ? 0 : Math.max(0, Number(t.startMs || 0));
        const lengthMs = preset.wholeClip ? d : Math.max(1, Number(t.lengthMs || 600));
        if (!preset.wholeClip && startMs + lengthMs > d) {
            errors.push({ code: "track_overflow", layerId: t.layerId, message: "An animation ends after the video ends." });
        }
        const easing = t.easing || preset.defaultEasing || "easeOut";
        if (!EASINGS[easing]) errors.push({ code: "bad_easing", layerId: t.layerId, message: `Unknown easing "${easing}".` });
        tracks.push({ layerId: t.layerId, preset: t.preset, startMs, lengthMs, easing, distance: t.distance ?? 0.15 });
    }

    if (errors.length) return { ok: false, errors, timeline: null };
    const frameCount = Math.round((d * spec.fps) / 1000);
    return {
        ok: true,
        errors,
        timeline: { format, width: format.width, height: format.height, fps: spec.fps, durationMs: frameCount * (1000 / spec.fps), frameCount, tracks, fadeOutMs }
    };
}

/**
 * State of every animated layer at a frame, relative to the layer as designed.
 * @returns {Array<{layerId, opacity, dx, dy, scale}>}  dx/dy in pixels
 */
export function frameState(timeline, frameIndex) {
    const t = (frameIndex * 1000) / timeline.fps;
    const fadeStart = timeline.durationMs - timeline.fadeOutMs;
    const fade = timeline.fadeOutMs > 0 && t > fadeStart ? 1 - clamp01((t - fadeStart) / timeline.fadeOutMs) : 1;
    return timeline.tracks.map((tr) => {
        const raw = clamp01((t - tr.startMs) / tr.lengthMs);
        const p = EASINGS[tr.easing](raw);
        const s = PRESETS[tr.preset].at(p, tr.distance);
        return {
            layerId: tr.layerId,
            opacity: clamp01(s.opacity) * fade,
            dx: Math.round(s.dx * timeline.width * 100) / 100,
            dy: Math.round(s.dy * timeline.height * 100) / 100,
            scale: s.scale
        };
    });
}

/** True if the template's aspect ratio matches the format (within 0.5%). */
export function aspectMatches(templateWidth, templateHeight, format) {
    return Math.abs(templateWidth / templateHeight - format.width / format.height) / (format.width / format.height) < 0.005;
}

/** Credits units, mirroring the server's pricing (the server remains the authority). */
export function videoUnits(durationMs, width, height, { hdLongEdge = 1920, hdMultiplier = 2 } = {}) {
    return Math.ceil(durationMs / 5000) * (Math.max(width, height) > hdLongEdge ? hdMultiplier : 1);
}
