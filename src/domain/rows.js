// Which spreadsheet rows to generate: "" = all, or a list like "2-10, 15, 20-".
// Numbers are the spreadsheet's own row numbers (the "#" column in the preview
// and the "Rows …" in warnings), so what users see is what they type.

/**
 * @returns {{ok: true, all: boolean, ranges: Array<[number, number]>} | {ok: false, error: string}}
 *   ranges are inclusive; an open end ("20-") is Infinity.
 */
export function parseRowSelection(text) {
    const s = String(text ?? "").trim();
    if (!s) return { ok: true, all: true, ranges: [] };
    const ranges = [];
    // Arabic-Indic and Persian digits are accepted (users type them on Arabic keyboards).
    const normalized = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
    // "3 – 5" and "3-5" are the same range: glue dashes before splitting on spaces/commas.
    for (const part of normalized.replace(/\s*[-–]\s*/g, "-").split(/[,،;\s]+/).filter(Boolean)) {
        const m = part.match(/^(\d+)(?:-(\d*))?$/);
        if (!m) return { ok: false, error: part };
        const from = Number(m[1]);
        const to = m[2] === undefined ? from : m[2] === "" ? Infinity : Number(m[2]);
        if (from < 1 || to < from) return { ok: false, error: part };
        ranges.push([from, to]);
    }
    return { ok: true, all: false, ranges };
}

export const rowSelected = (selection, sourceRow) => selection.all || selection.ranges.some(([a, b]) => sourceRow >= a && sourceRow <= b);
