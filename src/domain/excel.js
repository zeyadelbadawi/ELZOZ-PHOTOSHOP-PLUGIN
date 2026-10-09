// Spreadsheet reading and normalization. Pure: no UXP or Photoshop access,
// so it is unit-tested in Node. Values are taken as the formatted text Excel
// displays (raw: false), which is what users expect to see in a design.
import * as XLSX from "xlsx";

export const MAX_ROWS = 5000;

export function readWorkbook(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const workbook = XLSX.read(data, { type: "array", cellDates: false });
    return { workbook, sheetNames: workbook.SheetNames.slice() };
}

function columnLetter(index) {
    let n = index + 1;
    let s = "";
    while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";

/**
 * Build a normalized table from one sheet.
 * @returns {{sheetName, headers, rows, issues}}
 *  headers: [{ key, label, column, index, filled, empty }]
 *  rows:    [{ index, sourceRow, values: {key: string}, isEmpty }]
 *  issues:  [{ severity: 'error'|'warning', code, message, column?, rows? }]
 */
export function readTable(workbook, { sheetName, headerRow = 1 } = {}) {
    const issues = [];
    const name = sheetName || workbook.SheetNames[0];
    const sheet = workbook.Sheets[name];
    if (!sheet || !sheet["!ref"]) {
        return { sheetName: name, headers: [], rows: [], issues: [{ severity: "error", code: "empty_sheet", message: `Sheet "${name}" is empty.` }] };
    }

    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: true });
    const headerIdx = headerRow - 1;
    const headerCells = grid[headerIdx] || [];

    // Width = widest row, so columns that are empty in the header row are still seen.
    const width = grid.reduce((w, r) => Math.max(w, r.length), 0);
    const headers = [];
    const seen = new Map();
    for (let c = 0; c < width; c++) {
        const letter = columnLetter(range.s.c + c);
        let label = String(headerCells[c] ?? "").trim();
        if (!label) {
            const hasData = grid.slice(headerIdx + 1).some((r) => !isBlank(r[c]));
            if (!hasData) continue; // fully empty column: ignore silently
            label = `Column ${letter}`;
            issues.push({ severity: "warning", code: "empty_header", column: letter, message: `Column ${letter} has data but no header; named it "${label}".` });
        }
        let key = label;
        const lower = label.toLowerCase();
        if (seen.has(lower)) {
            const n = seen.get(lower) + 1;
            seen.set(lower, n);
            key = `${label} (${n})`;
            issues.push({ severity: "warning", code: "duplicate_header", column: letter, message: `Header "${label}" appears more than once; column ${letter} is named "${key}".` });
        } else {
            seen.set(lower, 1);
        }
        headers.push({ key, label, column: letter, index: c, filled: 0, empty: 0 });
    }

    if (headers.length === 0) {
        issues.push({ severity: "error", code: "no_headers", message: `No header row found in row ${headerRow} of "${name}".` });
        return { sheetName: name, headers, rows: [], issues };
    }

    // Drop trailing blank rows; keep interior blank rows but mark them.
    let last = grid.length - 1;
    while (last > headerIdx && headers.every((h) => isBlank((grid[last] || [])[h.index]))) last--;

    const rows = [];
    const blankRows = [];
    for (let r = headerIdx + 1; r <= last; r++) {
        const cells = grid[r] || [];
        const values = {};
        let isEmpty = true;
        for (const h of headers) {
            const v = cells[h.index];
            const text = v === null || v === undefined ? "" : String(v);
            values[h.key] = text;
            if (isBlank(text)) h.empty++;
            else {
                h.filled++;
                isEmpty = false;
            }
        }
        const sourceRow = range.s.r + r + 1;
        if (isEmpty) blankRows.push(sourceRow);
        rows.push({ index: rows.length, sourceRow, values, isEmpty });
    }

    if (blankRows.length) {
        issues.push({ severity: "warning", code: "blank_rows", rows: blankRows, message: `${blankRows.length} empty row(s) will be skipped.` });
    }
    const dataRows = rows.filter((r) => !r.isEmpty).length;
    if (dataRows === 0) {
        issues.push({ severity: "error", code: "no_rows", message: "The sheet has headers but no data rows." });
    }
    if (dataRows > MAX_ROWS) {
        issues.push({ severity: "error", code: "too_many_rows", message: `${dataRows} rows exceed the limit of ${MAX_ROWS} per job. Split the file.` });
    }

    return { sheetName: name, headers, rows, issues };
}
