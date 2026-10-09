import * as XLSX from "xlsx";

/** Build an .xlsx file in memory from an array of arrays (first row = headers). */
export function makeXlsx(sheets) {
    const wb = XLSX.utils.book_new();
    for (const [name, aoa] of Object.entries(sheets)) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
    }
    return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

/** A template layer list as src/ps/layerTree.js would produce it. */
export function sampleLayers() {
    return [
        { id: 1, name: "Background", kind: "pixel", path: ["Background"], indexPath: "4", depth: 0 },
        { id: 2, name: "Card", kind: "group", path: ["Card"], indexPath: "0", depth: 0 },
        { id: 3, name: "Name", kind: "text", path: ["Card", "Name"], indexPath: "0/0", depth: 1 },
        { id: 4, name: "Price", kind: "text", path: ["Card", "Price"], indexPath: "0/1", depth: 1 },
        { id: 5, name: "Photo", kind: "smartObject", path: ["Card", "Photo"], indexPath: "0/2", depth: 1 },
        { id: 6, name: "Name", kind: "text", path: ["Footer", "Name"], indexPath: "1/0", depth: 1 },
        { id: 7, name: "Logo", kind: "smartObject", path: ["Logo"], indexPath: "2", depth: 0 }
    ];
}
