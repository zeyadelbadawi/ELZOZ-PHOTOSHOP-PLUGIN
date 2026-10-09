// Export with the documented DOM API: Document.saveAs.{jpg,png,psd}(entry, options, asCopy=true).
// asCopy keeps the working document bound to nothing on disk, so a later save
// can never overwrite an export or the template. Every file is verified on disk.
import { StepError } from "./text.js";

export const EXTENSIONS = { jpg: "jpg", png: "png", psd: "psd" };

export function saveOptionsFor(format, options = {}) {
    switch (format) {
        case "jpg":
            return { quality: clampInt(options.jpgQuality ?? 10, 0, 12), embedColorProfile: true };
        case "png":
            return { compression: clampInt(options.pngCompression ?? 6, 0, 9) };
        case "psd":
            return { layers: true, embedColorProfile: true, maximizeCompatibility: true };
        default:
            throw new StepError("export", `Unsupported format "${format}".`);
    }
}

const clampInt = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n))));

/**
 * @returns {Promise<Array<{format, name, size, nativePath}>>}
 */
export async function exportDocument({ doc, folder, baseName, formats, options = {} }) {
    const files = [];
    const written = [];
    try {
        for (const format of formats) {
            files.push(await exportOne({ doc, folder, baseName, format, options, written }));
        }
    } catch (e) {
        // A failed item leaves no partial outputs behind (it is not charged, and a retry must be able to write).
        for (const entry of written) await entry.delete().catch(() => {});
        throw e;
    }
    return files;
}

async function exportOne({ doc, folder, baseName, format, options, written }) {
    const name = `${baseName}.${EXTENSIONS[format]}`;
    let entry;
    try {
        entry = await folder.createFile(name, { overwrite: false });
    } catch (e) {
        throw new StepError("export", `Can't create "${name}" in the output folder: ${e.message}`, { format });
    }
    written.push(entry); // registered before saving, so a half-written file is cleaned up too
    try {
        await doc.saveAs[format](entry, saveOptionsFor(format, options), true);
    } catch (e) {
        throw new StepError("export", `Photoshop couldn't save ${format.toUpperCase()} "${name}": ${e.message}`, { format });
    }
    const meta = await entry.getMetadata().catch(() => null);
    if (!meta || !(meta.size > 0)) {
        throw new StepError("export", `"${name}" was not written (file missing or empty).`, { format });
    }
    return { format, name, size: meta.size, nativePath: entry.nativePath };
}
