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

export function renderName(pattern, row, { total }) {
    const width = String(Math.max(total, 1)).length;
    const byLabel = {};
    for (const [k, v] of Object.entries(row.values)) byLabel[k] = v;
    const rendered = String(pattern || DEFAULT_PATTERN).replace(/\{([^{}]+)\}/g, (_, token) => {
        if (token === "row") return String(row.index + 1).padStart(width, "0");
        if (token === "sheetRow") return String(row.sourceRow);
        return byLabel[token] !== undefined ? String(byLabel[token]) : "";
    });
    const safe = sanitizeFileName(rendered);
    return safe === "_" ? `design_${String(row.index + 1).padStart(width, "0")}` : safe;
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
