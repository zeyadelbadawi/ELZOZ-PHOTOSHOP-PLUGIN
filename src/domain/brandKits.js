// Brand kits (feature 11): a named set of fixed values per client, e.g. primary and
// accent colors, phone, website, the logo's file name. Applying a kit adds its
// values as "fixed value" smart columns, so the same template serves many clients.
// Stored in the plugin's local storage on this computer.
import { newDerived } from "./derived.js";

export const KITS_KEY = "elzoz.brandkits.v1";
const MAX_KITS = 50;
const MAX_FIELDS = 30;

export function listKits(storage) {
    try {
        const all = JSON.parse(storage.getItem(KITS_KEY) || "[]");
        return Array.isArray(all) ? all.filter((k) => k && k.id && k.name && Array.isArray(k.fields)) : [];
    } catch (e) {
        return [];
    }
}

function write(storage, kits) {
    try {
        storage.setItem(KITS_KEY, JSON.stringify(kits.slice(0, MAX_KITS)));
        return true;
    } catch (e) {
        return false;
    }
}

const clean = (fields) =>
    fields
        .map((f) => ({ label: String(f.label || "").replace(/[{}]/g, "").trim(), value: String(f.value ?? "") }))
        .filter((f) => f.label)
        .slice(0, MAX_FIELDS);

/** Save (or replace by name, case-insensitively) a kit. Returns the saved kit or null. */
export function saveKit(storage, { name, fields }, now = Date.now()) {
    const n = String(name || "").trim();
    if (!n) return null;
    const kits = listKits(storage);
    const existing = kits.find((k) => k.name.toLowerCase() === n.toLowerCase());
    const kit = { id: existing ? existing.id : `kit${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: n, fields: clean(fields), savedAt: now };
    const next = [kit, ...kits.filter((k) => k.id !== kit.id)];
    return write(storage, next) ? kit : null;
}

export function deleteKit(storage, id) {
    return write(storage, listKits(storage).filter((k) => k.id !== id));
}

/** The kit's fields as fixed-value smart columns (marked with the kit id). */
export function kitToDerived(kit) {
    return kit.fields.map((f) => newDerived("constant", [], { label: f.label, value: f.value, kit: kit.id }));
}

/** Replace any applied kit's columns by this kit's; other smart columns are kept. */
export function applyKit(defs, kit) {
    const others = (defs || []).filter((d) => !d.kit);
    return kit ? [...others, ...kitToDerived(kit)] : others;
}

/** Fixed-value smart columns that can be saved as a kit. */
export const kitFieldsFrom = (defs) => (defs || []).filter((d) => d.type === "constant").map((d) => ({ label: d.label, value: d.value }));

export const appliedKitId = (defs) => ((defs || []).find((d) => d.kit) || {}).kit || "";
