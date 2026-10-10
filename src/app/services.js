// Wires the UI to the host (Photoshop + UXP) and the server (Supabase).
// Everything else in src/app talks to these services, never to UXP directly.
import { createPhotoshopPort } from "../ps/port.js";
import { createAuthClient } from "../account/auth.js";
import { createBilling, createCreditsClient } from "../account/credits.js";
import { createDevBilling } from "../account/devBilling.js";
import { runSelfTest } from "../dev/selfTest.js";
import { supabaseConfig } from "../config/supabase-config.js";
import { readWorkbook, readTable } from "../domain/excel.js";
import { buildFolderIndex } from "../domain/imageFiles.js";
import { frameState } from "../domain/video/timeline.js";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function base64(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i];
        const b = bytes[i + 1];
        const c = bytes[i + 2];
        out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
        out += b === undefined ? "=" : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
        out += c === undefined ? "=" : B64[c & 63];
    }
    return out;
}

export const PREVIEW_MAX = 640;

export function createServices({ photoshop, uxp }) {
    const port = createPhotoshopPort({ photoshop, uxp });
    const fs = uxp.storage.localFileSystem;
    const binary = uxp.storage.formats.binary;
    const configured = !!(supabaseConfig.url && supabaseConfig.anonKey);

    const auth = configured ? createAuthClient({ url: supabaseConfig.url, anonKey: supabaseConfig.anonKey, secureStorage: uxp.storage.secureStorage }) : null;
    const credits = configured ? createCreditsClient({ url: supabaseConfig.url, anonKey: supabaseConfig.anonKey, auth }) : null;

    async function listFileNames(folder) {
        const entries = await folder.getEntries();
        return entries.filter((e) => e.isFile).map((e) => e.name);
    }

    // Loaders shared by the pickers and by reopening a saved project.
    const loadSpreadsheet = async (entry) => {
        const bytes = new Uint8Array(await entry.read({ format: binary }));
        const { workbook, sheetNames } = readWorkbook(bytes);
        return { entry, fileName: entry.name, workbook, sheetNames };
    };
    const loadTemplate = async (entry) => ({ entry, ...(await port.inspectTemplate({ entry })) });
    const loadImageFolder = async (entry) => ({ entry, name: entry.name, path: entry.nativePath, index: buildFolderIndex(await listFileNames(entry)) });
    const loadOutputFolder = async (entry) => ({ entry, name: entry.name, path: entry.nativePath, existingFileNames: await listFileNames(entry) });

    return {
        port,
        caps: port.caps,
        configured,
        devAvailable: typeof __ELZOZ_DEV__ !== "undefined" && __ELZOZ_DEV__,
        // Developer builds only: the Photoshop self-test on a QA kit folder (see docs/PHOTOSHOP_TESTING.md).
        selfTest:
            typeof __ELZOZ_DEV__ !== "undefined" && __ELZOZ_DEV__
                ? async (onStep) => {
                      const kit = await fs.getFolder();
                      return kit ? runSelfTest({ photoshop, uxp, port, kit, onStep }) : null;
                  }
                : null,
        auth,
        credits,

        billing({ dev = false } = {}) {
            if (dev && typeof __ELZOZ_DEV__ !== "undefined" && __ELZOZ_DEV__) return createDevBilling();
            if (!credits) throw new Error("Server not configured.");
            return createBilling(credits, { clientInfo: { plugin: uxp.versions.plugin, photoshop: port.caps.photoshopVersion, uxp: port.caps.uxpVersion } });
        },

        async pickSpreadsheet() {
            const entry = await fs.getFileForOpening({ types: ["xlsx", "xls", "csv"], allowMultiple: false });
            if (!entry) return null;
            return loadSpreadsheet(entry);
        },
        loadSpreadsheet,
        loadTemplate,
        loadImageFolder,
        loadOutputFolder,

        /**
         * Persistent access to a picked file or folder (UXP persistent tokens), so a saved
         * project can be reopened without the file pickers. null if unavailable.
         */
        async persistEntry(entry) {
            if (!entry || typeof fs.createPersistentToken !== "function") return null;
            try {
                return await fs.createPersistentToken(entry);
            } catch (e) {
                return null;
            }
        },

        /** The entry behind a persistent token; null if it was moved, deleted or access was revoked. */
        async entryFromToken(token) {
            if (!token || typeof fs.getEntryForPersistentToken !== "function") return null;
            try {
                return await fs.getEntryForPersistentToken(token);
            } catch (e) {
                return null;
            }
        },

        readSheet(workbook, sheetName, headerRow) {
            return readTable(workbook, { sheetName, headerRow });
        },

        async pickTemplate() {
            const entry = await fs.getFileForOpening({ types: ["psd", "psb"], allowMultiple: false });
            if (!entry) return null;
            return loadTemplate(entry);
        },

        async useActiveDocument() {
            const doc = photoshop.app.activeDocument;
            if (!doc) return null;
            const info = await port.inspectTemplate({ documentId: doc.id });
            return { entry: null, ...info };
        },

        async pickImageFolder() {
            const entry = await fs.getFolder();
            if (!entry) return null;
            return loadImageFolder(entry);
        },

        async pickOutputFolder() {
            const entry = await fs.getFolder();
            if (!entry) return null;
            return loadOutputFolder(entry);
        },

        async refreshOutputFolder(output) {
            return { ...output, existingFileNames: await listFileNames(output.entry) };
        },

        async writeReport(output, fileName, text) {
            const file = await output.entry.createFile(fileName, { overwrite: false });
            await file.write(text);
            return file.name;
        },

        /**
         * Free preview of one design row: rendered on a temporary copy at most
         * PREVIEW_MAX px on the long edge (low resolution on purpose, so a preview
         * can't replace a paid export). Returns a data URL.
         */
        async previewDesign({ template, layers, item, folders, outputSize }) {
            return port.runModal("Elzoz: preview", async () => {
                const base = outputSize || { width: template.width, height: template.height };
                const scale = Math.min(1, PREVIEW_MAX / Math.max(base.width, base.height));
                const resizeTo = { width: Math.max(1, Math.round(base.width * scale)), height: Math.max(1, Math.round(base.height * scale)) };
                const session = await port.openWorkingCopy(template.ref, layers, { resizeTo });
                const temp = await port.createTempFolder(`elzoz-preview-${Date.now()}`);
                try {
                    await session.applyItem(item, folders);
                    const file = await session.exportFrame(temp, "preview.jpg");
                    const bytes = new Uint8Array(await file.read({ format: binary }));
                    return { url: `data:image/jpeg;base64,${base64(bytes)}`, width: resizeTo.width, height: resizeTo.height };
                } finally {
                    await session.close();
                    await port.removeFolder(temp);
                }
            });
        },

        /** Render one frame of row 1 on a temporary copy and return a data URL. */
        async previewFrame({ template, layers, item, folders, timeline, frame }) {
            return port.runModal("Elzoz: preview", async () => {
                const session = await port.openWorkingCopy(template, layers, { resizeTo: { width: timeline.width, height: timeline.height } });
                const temp = await port.createTempFolder(`elzoz-preview-${Date.now()}`);
                try {
                    if (item) await session.applyItem(item, folders);
                    const ids = timeline.tracks.map((t) => t.layerId);
                    await session.applyFrame(frameState(timeline, frame), session.readOpacity(ids));
                    const file = await session.exportFrame(temp, "preview.jpg");
                    const bytes = new Uint8Array(await file.read({ format: binary }));
                    return `data:image/jpeg;base64,${base64(bytes)}`;
                } finally {
                    await session.close();
                    await port.removeFolder(temp);
                }
            });
        },

        openExternal(url) {
            if (url) uxp.shell.openExternal(url);
        }
    };
}
