// Smart columns (features 9 and 11): extra columns computed from each row, used in
// Map exactly like spreadsheet columns. Pure and unit-tested.
//
// A definition: { id, type, label, ...options }
//   discount   { oldColumn, newColumn, style: "percent"|"minus"|"save", digits }   "-25%" | "25%" | "وفّر 25%"
//   saving     { oldColumn, newColumn, number: {decimals, thousands}, prefix, suffix } amount saved
//   hasDiscount{ oldColumn, newColumn, minPercent }  "yes" / "" -> drives show/hide of a badge
//   price      { column, number: {decimals, thousands}, prefix, suffix }  formatted price
//   combine    { template: "{Name} - {Size}" }  any text built from columns
//   constant   { value }  the same value in every row (brand kits use this)
import { formatNumber, parseNumber } from "./transforms.js";

export const DERIVED_TYPES = ["discount", "saving", "hasDiscount", "price", "combine", "constant"];
const MARK = "✦ ";

export const derivedKey = (def) => `${MARK}${def.label}`;
export const isDerivedKey = (key) => String(key).startsWith(MARK);

export function newDerived(type, existing = [], overrides = {}) {
    const n = existing.filter((d) => d.type === type).length + 1;
    const base = {
        discount: { oldColumn: "", newColumn: "", style: "percent" },
        saving: { oldColumn: "", newColumn: "", number: { decimals: "auto", thousands: true }, prefix: "", suffix: "" },
        hasDiscount: { oldColumn: "", newColumn: "", minPercent: 1 },
        price: { column: "", number: { decimals: "auto", thousands: true }, prefix: "", suffix: "" },
        combine: { template: "" },
        constant: { value: "" }
    }[type];
    const label = overrides.label || `${DEFAULT_LABEL[type]}${n > 1 ? ` ${n}` : ""}`;
    return { id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, type, label, ...base, ...overrides };
}

const DEFAULT_LABEL = { discount: "Discount", saving: "Saving", hasDiscount: "Has discount", price: "Price", combine: "Combined", constant: "Fixed" };

function pricePair(row, def) {
    const oldP = parseNumber(row.values[def.oldColumn]);
    const newP = parseNumber(row.values[def.newColumn]);
    return { oldP, newP, ok: oldP !== null && newP !== null && oldP > 0 };
}

/** Columns a definition reads (for validation and pruning). */
export function derivedSources(def) {
    switch (def.type) {
        case "discount":
        case "saving":
        case "hasDiscount":
            return [def.oldColumn, def.newColumn];
        case "price":
            return [def.column];
        case "combine":
            return [...String(def.template || "").matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]);
        default:
            return [];
    }
}

/**
 * Value of one definition for one row. Rows whose prices can't be read get "",
 * so a discount badge mapped to "Has discount" simply hides.
 * @returns {{value: string, problem?: string}}
 */
export function derivedValue(def, row) {
    switch (def.type) {
        case "discount": {
            const { oldP, newP, ok } = pricePair(row, def);
            if (!ok) return { value: "", problem: emptyPair(row, def) ? undefined : "bad_price" };
            const pct = Math.round(((oldP - newP) / oldP) * 100);
            if (pct <= 0) return { value: "" };
            if (def.style === "minus") return { value: `-${pct}%` };
            if (def.style === "save") return { value: `وفّر ${pct}%` };
            if (def.style === "off") return { value: `${pct}% OFF` };
            return { value: `${pct}%` };
        }
        case "saving": {
            const { oldP, newP, ok } = pricePair(row, def);
            if (!ok) return { value: "", problem: emptyPair(row, def) ? undefined : "bad_price" };
            const saved = oldP - newP;
            if (saved <= 0) return { value: "" };
            return { value: `${def.prefix || ""}${formatNumber(saved, def.number || {})}${def.suffix || ""}` };
        }
        case "hasDiscount": {
            const { oldP, newP, ok } = pricePair(row, def);
            if (!ok) return { value: "" };
            const pct = ((oldP - newP) / oldP) * 100;
            return { value: pct >= Number(def.minPercent ?? 1) ? "yes" : "" };
        }
        case "price": {
            const raw = row.values[def.column];
            if (String(raw ?? "").trim() === "") return { value: "" };
            const n = parseNumber(raw);
            if (n === null) return { value: String(raw), problem: "bad_price" };
            return { value: `${def.prefix || ""}${formatNumber(n, def.number || {})}${def.suffix || ""}` };
        }
        case "combine":
            return {
                value: String(def.template || "")
                    .replace(/\{([^{}]+)\}/g, (m, key) => (row.values[key] !== undefined ? String(row.values[key]) : ""))
                    .replace(/[ \t]{2,}/g, " ")
                    .trim()
            };
        case "constant":
            return { value: String(def.value ?? "") };
        default:
            return { value: "" };
    }
}

function emptyPair(row, def) {
    return String(row.values[def.oldColumn] ?? "").trim() === "" || String(row.values[def.newColumn] ?? "").trim() === "";
}

/** Problems with a definition itself (shown in Data and blocking in Check). */
export function validateDerived(def, headers) {
    const keys = new Set(headers.map((h) => h.key));
    const missing = derivedSources(def).filter((c) => !c || !keys.has(c));
    const problems = [];
    if (!String(def.label || "").trim()) problems.push("no_label");
    if (["discount", "saving", "hasDiscount"].includes(def.type) && (!def.oldColumn || !def.newColumn)) problems.push("pick_columns");
    else if (def.type === "price" && !def.column) problems.push("pick_columns");
    else if (def.type === "combine" && !String(def.template || "").trim()) problems.push("empty_template");
    else if (missing.length) problems.push("missing_columns");
    return problems;
}

/**
 * Add smart columns to a table. Returns a new table; the original is untouched.
 * Invalid definitions are skipped (their problems are reported by validateDerived).
 * Rows where a price can't be read are reported once per definition as a warning.
 */
export function applyDerived(table, defs = []) {
    if (!table || !defs.length) return table;
    const realHeaders = table.headers.filter((h) => !h.derived);
    const usable = defs.filter((d) => validateDerived(d, realHeaders).length === 0);
    if (!usable.length) return table;
    const issues = [...table.issues];
    const headers = [...realHeaders];
    const taken = new Set(headers.map((h) => h.key.toLowerCase()));
    const keyFor = new Map();
    for (const d of usable) {
        let key = derivedKey(d);
        let n = 2;
        while (taken.has(key.toLowerCase())) key = `${derivedKey(d)} (${n++})`;
        taken.add(key.toLowerCase());
        keyFor.set(d.id, key);
        headers.push({ key, label: key, column: "✦", index: -1, filled: 0, empty: 0, derived: d.id });
    }
    const badRows = new Map();
    const rows = table.rows.map((r) => {
        if (r.isEmpty) return r;
        const values = { ...r.values };
        for (const d of usable) {
            const res = derivedValue(d, r);
            values[keyFor.get(d.id)] = res.value;
            const h = headers.find((x) => x.key === keyFor.get(d.id));
            if (res.value === "") h.empty++;
            else h.filled++;
            if (res.problem) {
                const list = badRows.get(d.id) || [];
                list.push(r.sourceRow);
                badRows.set(d.id, list);
            }
        }
        return { ...r, values };
    });
    for (const d of usable) {
        const list = badRows.get(d.id);
        if (list) issues.push({ severity: "warning", code: "bad_price", rows: list, message: `"${d.label}": the price can't be read in ${list.length} row(s); those rows get an empty value.` });
    }
    return { ...table, headers, rows, issues };
}
