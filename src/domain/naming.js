// Output file naming: user pattern -> safe, unique base names.
// Tokens: {row} (padded data row number), {sheetRow} (spreadsheet row),
// {Header} for any column label, e.g. "{row}_{Product name}".

export const DEFAULT_PATTERN = "{row}";
const MAX_LENGTH = 120;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i; // Windows device names

export function patternTokens(pattern) {
    return [...String(pattern).matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]);
}

/** @returns {string[]} unknown tokens */
export function validatePattern(pattern, headers) {
    const known = new Set(["row", "sheetRow", ...headers.map((h) => h.key), ...headers.map((h) => h.label)]);
    return patternTokens(pattern).filter((t) => !known.has(t));
}

export function sanitizeFileName(name) {
    let s = String(name)
        .normalize("NFC")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^[.\s]+|[.\s]+$/g, "");
    if (s.length > MAX_LENGTH) s = s.slice(0, MAX_LENGTH).trim();
    if (!s || RESERVED.test(s)) s = `_${s}`;
    return s;
}

export const MAX_FOLDER_DEPTH = 3;

/**
 * Render a pattern for one row. A "/" in the PATTERN makes subfolders
 * ("{Category}/{row}_{Name}"); a "/" inside a cell value is sanitized like any
 * other illegal character, so data can never create folders by itself.
 * Empty folder segments (an empty cell) are dropped.
 */
export function renderName(pattern, row, { total }) {
    const width = String(Math.max(total, 1)).length;
    const byLabel = {};
    for (const [k, v] of Object.entries(row.values)) byLabel[k] = v;
    const renderSegment = (seg) =>
        seg.replace(/\{([^{}]+)\}/g, (_, token) => {
            if (token === "row") return String(row.index + 1).padStart(width, "0");
            if (token === "sheetRow") return String(row.sourceRow);
            // Cell spaces at the ends are noise in a file name ("A1_ aurora" -> "A1_aurora").
            return byLabel[token] !== undefined ? String(byLabel[token]).trim() : "";
        });
    const segments = String(pattern || DEFAULT_PATTERN).split("/");
    const fileSeg = segments.pop();
    const folders = segments
        .map((seg) => renderSegment(seg))
        .filter((v) => v.trim() !== "")
        .map((v) => sanitizeFileName(v))
        .slice(0, MAX_FOLDER_DEPTH);
    const rendered = renderSegment(fileSeg);
    let safe = sanitizeFileName(rendered);
    if (safe === "_") safe = `design_${String(row.index + 1).padStart(width, "0")}`;
    return [...folders, safe].join("/");
}

/** "Shoes/Red/12_Name" -> { folders: ["Shoes", "Red"], name: "12_Name" } */
export function splitOutputPath(baseName) {
    const parts = String(baseName).split("/");
    return { folders: parts.slice(0, -1), name: parts[parts.length - 1] };
}

/**
 * Make base names unique against each other and against files already in the
 * output folder, case-insensitively (macOS/Windows file systems are case-insensitive).
 * @param {string[]} baseNames
 * @param {string[]} existingFileNames  names already in the output folder
 * @param {string[]} extensions         e.g. ['jpg','png']
 */
export function dedupeNames(baseNames, existingFileNames, extensions) {
    const taken = new Set(existingFileNames.map((n) => n.toLowerCase()));
    const clash = (base) => extensions.some((ext) => taken.has(`${base}.${ext}`.toLowerCase()));
    return baseNames.map((base) => {
        let candidate = base;
        let n = 2;
        while (clash(candidate)) candidate = `${base} (${n++})`;
        for (const ext of extensions) taken.add(`${candidate}.${ext}`.toLowerCase());
        return candidate;
    });
}
