// Capability detection. Decisions are made on capabilities; the version
// numbers come from Adobe's documented "min version" for each API and are only
// used where no runtime probe exists. Nothing here means "tested on version X".

export const MIN_HOST = [23, 3]; // Manifest v5 (UXP 6.0)
export const RECOMMENDED_HOST = [24, 2]; // DOM text API (Layer.textItem)

export function parseVersion(text) {
    const m = String(text || "").match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    return m ? [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)] : [0, 0, 0];
}

export function versionAtLeast(version, min) {
    for (let i = 0; i < Math.max(version.length, min.length); i++) {
        const a = version[i] || 0;
        const b = min[i] || 0;
        if (a !== b) return a > b;
    }
    return true;
}

export function detectCapabilities(photoshop, uxp, globals = globalThis) {
    const ps = parseVersion(photoshop && photoshop.app && photoshop.app.version);
    const uxpVersion = parseVersion(uxp && uxp.versions && uxp.versions.uxp);
    const at = (min) => versionAtLeast(ps, min);
    return {
        photoshopVersion: ps.join("."),
        uxpVersion: uxpVersion.join("."),
        hostSupported: at(MIN_HOST),
        hostRecommended: at(RECOMMENDED_HOST),
        // Document.duplicate, suspendHistory, Layer.translate/scale/rotate (23.0)
        workingCopy: at([23, 0]),
        layerTransforms: at([23, 0]),
        // Text: DOM path from 24.2; older versions fall back to a batchPlay "set textLayer" call.
        domText: at([24, 2]),
        // Imaging API (24.2, labelled beta by Adobe)
        imaging: !!(photoshop && photoshop.imaging && typeof photoshop.imaging.getPixels === "function"),
        wasm: typeof globals.WebAssembly === "object",
        secureRandom: !!(globals.crypto && typeof globals.crypto.getRandomValues === "function"),
        secureStorage: !!(uxp && uxp.storage && uxp.storage.secureStorage)
    };
}

/** Human message for a missing capability, shown next to the disabled option. */
export function requirementMessage(capability) {
    const map = {
        hostSupported: "Elzoz needs Photoshop 23.3 or later.",
        workingCopy: "Needs Photoshop 23.0 or later.",
        layerTransforms: "Video animation needs Photoshop 23.0 or later.",
        domText: "Text replacement uses a compatibility path on Photoshop versions before 24.2.",
        secureRandom: "Signing in needs Photoshop 24.0 or later (secure random numbers)."
    };
    return map[capability] || "Not available in this Photoshop version.";
}
