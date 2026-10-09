// Resolving a spreadsheet cell value to an image file inside a chosen folder.
// Only plain file names are accepted: no paths, so a cell can never point
// outside the folder the user granted.

// Formats Photoshop can place. WebP is supported by Photoshop 23.2+.
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "tif", "tiff", "psd", "psb", "webp", "gif", "bmp"];

export function extensionOf(name) {
    const m = /\.([^.]+)$/.exec(name);
    return m ? m[1].toLowerCase() : "";
}

/** Build a lookup from a folder's file names (as returned by Folder.getEntries()). */
export function buildFolderIndex(fileNames) {
    const exact = new Map();
    const lower = new Map();
    const byStem = new Map(); // lowercased stem -> [names]
    for (const name of fileNames) {
        if (!IMAGE_EXTENSIONS.includes(extensionOf(name))) continue;
        exact.set(name, name);
        if (!lower.has(name.toLowerCase())) lower.set(name.toLowerCase(), name);
        const stem = name.slice(0, name.length - extensionOf(name).length - 1).toLowerCase();
        const list = byStem.get(stem) || [];
        list.push(name);
        byStem.set(stem, list);
    }
    return { exact, lower, byStem, count: exact.size };
}

/**
 * @returns {{ file: string|null, reason?: string, ambiguous?: string[] }}
 */
export function resolveImage(index, cellValue, { ignoreCase = true, addExtension = true } = {}) {
    const value = String(cellValue ?? "").trim();
    if (!value) return { file: null, reason: "empty" };
    if (/[\\/]/.test(value) || value === "." || value === "..") return { file: null, reason: "path_not_allowed" };

    if (index.exact.has(value)) return { file: value };
    if (ignoreCase && index.lower.has(value.toLowerCase())) return { file: index.lower.get(value.toLowerCase()) };

    const ext = extensionOf(value);
    if (addExtension && !IMAGE_EXTENSIONS.includes(ext)) {
        const candidates = index.byStem.get(value.toLowerCase()) || [];
        const matches = ignoreCase ? candidates : candidates.filter((n) => n.startsWith(value));
        if (matches.length === 1) return { file: matches[0] };
        if (matches.length > 1) {
            // Deterministic preference, but report the ambiguity.
            const sorted = matches.slice().sort((a, b) => IMAGE_EXTENSIONS.indexOf(extensionOf(a)) - IMAGE_EXTENSIONS.indexOf(extensionOf(b)));
            return { file: sorted[0], ambiguous: sorted };
        }
    }
    if (ext && !IMAGE_EXTENSIONS.includes(ext)) return { file: null, reason: "unsupported_type" };
    return { file: null, reason: "not_found" };
}
