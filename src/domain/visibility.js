// Show/hide a layer from a spreadsheet cell.
// "no / false / 0 / hide / off / لا / إخفاء" hide the layer; any other text shows it
// (so a "Badge" column with "NEW" shows the badge). Empty cells follow the rule's
// emptyPolicy: "hide" (default), "show" or "keep" (leave the template as designed).

export const VISIBILITY_EMPTY = ["hide", "show", "keep"];

const HIDE = new Set(["no", "n", "false", "0", "hide", "hidden", "off", "none", "-", "لا", "اخفاء", "إخفاء", "مخفي", "مخفى"]);

/** @returns {boolean|null} true = show, false = hide, null = leave as designed */
export function visibilityFor(value, emptyPolicy = "hide") {
    const v = String(value ?? "").trim().toLowerCase();
    if (!v) return emptyPolicy === "show" ? true : emptyPolicy === "keep" ? null : false;
    return !HIDE.has(v);
}
