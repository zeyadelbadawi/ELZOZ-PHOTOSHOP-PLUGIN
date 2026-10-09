// The Photoshop "port": the only object the engine talks to. It composes the
// adapters and enforces the non-destructive contract:
//   * the template document is never modified or saved,
//   * all work happens on a duplicate ("working copy"),
//   * each row is one history state and is reverted afterwards,
//   * the working copy is closed without saving at the end.
import { detectCapabilities } from "./compat.js";
import { mapLayersByStructure, walkDocument } from "./layerTree.js";
import { setLayerText, StepError } from "./text.js";
import { placeImage } from "./images.js";
import { exportDocument } from "./export.js";
import { applyFrameState, exportFrame, writeAndVerifyMovie } from "./video.js";

// Label any Photoshop exception with the step and layer it happened on.
async function asStep(step, layerId, fn) {
    try {
        return await fn();
    } catch (e) {
        if (e instanceof StepError) throw e;
        throw new StepError(step, e.message || String(e), { layerId });
    }
}

export function createPhotoshopPort({ photoshop, uxp }) {
    const { app, core, constants } = photoshop;
    const fs = uxp.storage.localFileSystem;
    const caps = detectCapabilities(photoshop, uxp);

    const findOpenDocument = (template) => {
        if (template.documentId != null) return app.documents.find((d) => d.id === template.documentId) || null;
        if (template.entry && template.entry.nativePath) return app.documents.find((d) => d.path === template.entry.nativePath) || null;
        return null;
    };

    return {
        caps,

        /** Run fn inside one modal scope with real progress and cancellation. */
        async runModal(commandName, fn) {
            return core.executeAsModal(
                async (ctx) =>
                    fn({
                        isCancelled: () => !!ctx.isCancelled,
                        progress: (value, message) => {
                            const p = { value: Math.max(0, Math.min(1, value)) };
                            if (message) p.commandName = message;
                            ctx.reportProgress(p);
                        }
                    }),
                { commandName }
            );
        },

        /** Read the template's layer tree (opens it if needed; never modifies it). */
        async inspectTemplate(template) {
            return this.runModal("Elzoz: reading template", async () => {
                let doc = findOpenDocument(template);
                if (!doc) doc = await app.open(template.entry);
                const { descriptors } = walkDocument(doc, constants);
                return { documentId: doc.id, title: doc.title, width: doc.width, height: doc.height, layers: descriptors };
            });
        },

        /** A fresh temporary folder for one item's frames. */
        async createTempFolder(name) {
            const temp = await fs.getTemporaryFolder();
            return temp.createFolder(name);
        },

        async writeMovie(args) {
            return writeAndVerifyMovie({ uxp, ...args });
        },

        async removeFolder(folder) {
            try {
                for (const e of await folder.getEntries()) await e.delete();
                await folder.delete();
            } catch (e) {
                /* best effort: temp files are cleaned by the OS eventually */
            }
        },

        /**
         * Must be called inside runModal. Returns a session bound to a duplicate
         * of the template. `templateLayers` are the descriptors used for mapping.
         */
        async openWorkingCopy(template, templateLayers, { resizeTo = null } = {}) {
            let source = findOpenDocument(template);
            let openedByUs = false;
            if (!source) {
                source = await app.open(template.entry);
                openedByUs = true;
            }
            const doc = await source.duplicate("Elzoz working copy");
            // Video: render at the output size (aspect ratio already checked by preflight).
            if (resizeTo && (doc.width !== resizeTo.width || doc.height !== resizeTo.height)) {
                await doc.resizeImage(resizeTo.width, resizeTo.height);
            }
            const layerMap = mapLayersByStructure(templateLayers, doc, constants);
            const kinds = new Map(templateLayers.map((l) => [l.id, l.kind]));
            const baseState = doc.activeHistoryState;

            const layerFor = (templateId) => {
                const layer = layerMap.get(templateId);
                if (!layer) throw new StepError("layer", "A mapped layer could not be found in the working copy.", { layerId: templateId });
                return layer;
            };

            return {
                doc,
                layerFor,
                /** Apply one plan item (text + images) as a single history state. */
                async applyItem(item, folders) {
                    await doc.suspendHistory(async () => {
                        for (const t of item.text) {
                            await asStep("text", t.layerId, () => setLayerText({ photoshop, layer: layerFor(t.layerId), value: t.value }));
                        }
                        for (const img of item.images) {
                            const folder = folders[img.folderKey];
                            let file;
                            try {
                                file = await folder.entry.getEntry(img.file);
                            } catch (e) {
                                throw new StepError("image", `Image "${img.file}" is no longer in "${folder.name}".`, { layerId: img.layerId });
                            }
                            await asStep("image", img.layerId, () => placeImage({ photoshop, fs, doc, layer: layerFor(img.layerId), kind: kinds.get(img.layerId), file, fit: img.fit }));
                        }
                    }, "Elzoz: apply row");
                },
                async exportItem(folder, baseName, formats, options) {
                    return exportDocument({ doc, folder, baseName, formats, options });
                },
                snapshot() {
                    return doc.activeHistoryState;
                },
                async restore(state) {
                    doc.activeHistoryState = state;
                },
                /** Current opacity of the given template layers (video frames scale relative to it). */
                readOpacity(layerIds) {
                    return new Map(layerIds.map((id) => [id, Number(layerFor(id).opacity)]));
                },
                async applyFrame(states, baseOpacity) {
                    await asStep("video", null, () => applyFrameState({ photoshop, doc, layerFor, states, baseOpacity }));
                },
                async exportFrame(folder, name) {
                    return asStep("video", null, () => exportFrame({ doc, folder, name }));
                },
                /** Back to the untouched duplicate. */
                async reset() {
                    doc.activeHistoryState = baseState;
                },
                async close() {
                    try {
                        await doc.closeWithoutSaving();
                    } finally {
                        if (openedByUs) await source.closeWithoutSaving();
                    }
                }
            };
        }
    };
}
