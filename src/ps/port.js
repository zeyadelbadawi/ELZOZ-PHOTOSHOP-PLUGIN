// The Photoshop "port": the only object the engine talks to. It composes the
// adapters and enforces the non-destructive contract:
//   * the template document is never modified or saved,
//   * all work happens on a duplicate ("working copy"),
//   * each row is one history state and is reverted afterwards,
//   * the working copy is closed without saving at the end.
import { detectCapabilities } from "./compat.js";
import { mapLayersByStructure, walkDocument } from "./layerTree.js";
import { setLayerText, StepError } from "./text.js";
import { bounds, placeImage } from "./images.js";
import { shrinkTextToBox } from "./textFit.js";
import { setLayerColor } from "./color.js";
import { splitOutputPath } from "../domain/naming.js";
import { exportDocument, saveOptionsFor } from "./export.js";
import { addProofOverlay } from "./proof.js";
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

/** Resolve "Shoes/Red/12_Name" under the output folder, creating missing subfolders. */
async function outputTarget(root, relPath) {
    const { folders, name } = splitOutputPath(relPath);
    let folder = root;
    for (const seg of folders) {
        let next = null;
        try {
            next = await folder.getEntry(seg);
        } catch (e) {
            next = null;
        }
        if (next && !next.isFolder) throw new StepError("export", `"${seg}" in the output folder is a file, not a folder.`);
        if (!next) {
            try {
                next = await folder.createFolder(seg);
            } catch (e) {
                throw new StepError("export", `Can't create the folder "${seg}": ${e.message}`);
            }
        }
        folder = next;
    }
    return { folder, name };
}

/**
 * Artboards of a document: top-level groups whose layer descriptor has
 * artboardEnabled, with their rectangle (batchPlay "get" of the layer).
 */
async function readArtboards(photoshop, doc, descriptors) {
    const out = [];
    for (const d of descriptors.filter((x) => x.depth === 0 && x.kind === "group")) {
        try {
            const r = await photoshop.action.batchPlay([{ _obj: "get", _target: [{ _ref: "layer", _id: d.id }, { _ref: "document", _id: doc.id }], _options: { dialogOptions: "dontDisplay" } }], {});
            const info = r && r[0];
            const rect = info && info.artboardEnabled && info.artboard && info.artboard.artboardRect;
            if (!rect) continue;
            const n = (v) => Number(v && typeof v === "object" ? v._value : v);
            out.push({ id: d.id, name: d.name, indexPath: d.indexPath, rect: { left: n(rect.left), top: n(rect.top), right: n(rect.right), bottom: n(rect.bottom) } });
        } catch (e) {
            /* not readable: treated as a normal group */
        }
    }
    // Canvas reading order (rows top to bottom, then left to right), not Layers panel order.
    return out.sort((a, b) => (Math.abs(a.rect.top - b.rect.top) > 50 ? a.rect.top - b.rect.top : a.rect.left - b.rect.left));
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
                const artboards = await readArtboards(photoshop, doc, descriptors);
                return { documentId: doc.id, title: doc.title, width: doc.width, height: doc.height, resolution: Number(doc.resolution) || 72, layers: descriptors, artboards };
            });
        },

        outputTarget: (root, relPath) => outputTarget(root, relPath),

        /** A fresh temporary folder for one item's frames. */
        async createTempFolder(name) {
            const temp = await fs.getTemporaryFolder();
            return temp.createFolder(name);
        },

        /**
         * A new file in `folder` written in pieces (PDFs). A taken name gets " (2)", " (3)"...
         * Small pieces are buffered so UXP sees few, large writes.
         */
        async openOutputFile(folder, fileName) {
            const dot = fileName.lastIndexOf(".");
            const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
            const ext = dot > 0 ? fileName.slice(dot) : "";
            let entry = null;
            for (let n = 1; !entry && n < 100; n++) {
                const name = n === 1 ? fileName : `${stem} (${n})${ext}`;
                try {
                    entry = await folder.createFile(name, { overwrite: false });
                } catch (e) {
                    entry = null;
                }
            }
            if (!entry) throw new StepError("export", `Can't create "${fileName}" in the output folder.`);
            const binary = uxp.storage.formats.binary;
            let pending = [];
            let pendingSize = 0;
            let first = true;
            const flush = async () => {
                if (!pendingSize) return;
                const data = new Uint8Array(pendingSize);
                let o = 0;
                for (const c of pending) {
                    data.set(c, o);
                    o += c.length;
                }
                pending = [];
                pendingSize = 0;
                await entry.write(data.buffer, { format: binary, append: !first });
                first = false;
            };
            return {
                name: entry.name,
                async write(bytes) {
                    pending.push(bytes);
                    pendingSize += bytes.length;
                    if (pendingSize >= 1 << 20) await flush();
                },
                async close() {
                    await flush();
                    const meta = await entry.getMetadata().catch(() => null);
                    if (!meta || !(meta.size > 0)) throw new StepError("export", `"${entry.name}" was not written.`);
                    return { name: entry.name, size: meta.size, nativePath: entry.nativePath };
                },
                async remove() {
                    await entry.delete().catch(() => {});
                }
            };
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
        async openWorkingCopy(template, templateLayers, { resizeTo = null, proof = null } = {}) {
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
            // Approval sheet: watermark + label strip, part of the pristine state (kept across rows).
            let overlay = null;
            if (proof) {
                try {
                    overlay = await addProofOverlay({ photoshop, doc, watermark: proof.watermark });
                } catch (e) {
                    await doc.closeWithoutSaving().catch(() => {});
                    if (openedByUs) await source.closeWithoutSaving().catch(() => {});
                    throw e;
                }
            }
            // Pristine state of layers a row changes outside History: visibility changes are not
            // undoable by default in Photoshop (History Options), so reset() restores them itself.
            const baseVisible = new Map();
            const baseBox = new Map(); // text box before any row, for shrink-to-fit
            const kinds = new Map(templateLayers.map((l) => [l.id, l.kind]));
            const baseState = doc.activeHistoryState;

            // The current state as JPEG bytes (temporary file, deleted afterwards).
            const renderJpegNow = async (quality) => {
                const temp = await fs.getTemporaryFolder();
                const name = `elzoz-render-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
                const entry = await temp.createFile(name, { overwrite: true });
                try {
                    await asStep("export", null, () => doc.saveAs.jpg(entry, saveOptionsFor("jpg", { jpgQuality: quality }), true));
                    const bytes = new Uint8Array(await entry.read({ format: uxp.storage.formats.binary }));
                    if (!bytes.length) throw new StepError("export", "Photoshop wrote an empty JPEG.");
                    return bytes;
                } finally {
                    await entry.delete().catch(() => {});
                }
            };
            // Artboards: crop the canvas to one artboard for this export, then step back in History.
            const withCrop = async (crop, fn) => {
                if (!crop) return fn();
                const before = doc.activeHistoryState;
                await asStep("export", null, () => doc.crop({ left: crop.left, top: crop.top, right: crop.right, bottom: crop.bottom }));
                try {
                    return await fn();
                } finally {
                    doc.activeHistoryState = before;
                }
            };

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
                    const notes = []; // things worth telling the user about this row (it still succeeded)
                    await doc.suspendHistory(async () => {
                        for (const t of item.text) {
                            const layer = layerFor(t.layerId);
                            if (t.shrink && !baseBox.has(t.layerId)) baseBox.set(t.layerId, bounds(layer));
                            await asStep("text", t.layerId, () => setLayerText({ photoshop, layer, value: t.value }));
                            if (t.shrink) await asStep("text", t.layerId, () => shrinkTextToBox({ photoshop, layer, box: baseBox.get(t.layerId) }));
                        }
                        for (const img of item.images) {
                            const folder = folders[img.folderKey];
                            let file;
                            try {
                                file = await folder.entry.getEntry(img.file);
                            } catch (e) {
                                throw new StepError("image", `Image "${img.file}" is no longer in "${folder.name}".`, { layerId: img.layerId });
                            }
                            const placed = await asStep("image", img.layerId, () =>
                                placeImage({ photoshop, fs, doc, layer: layerFor(img.layerId), kind: kinds.get(img.layerId), file, fit: img.fit, removeBg: !!img.removeBg, bgFail: img.bgFail || "keep" })
                            );
                            if (placed && placed.notes) notes.push(...placed.notes);
                        }
                        for (const c of item.colors || []) {
                            await asStep("color", c.layerId, () => setLayerColor({ photoshop, layer: layerFor(c.layerId), kind: kinds.get(c.layerId), rgb: c.rgb }));
                        }
                        for (const v of item.visibility || []) {
                            const layer = layerFor(v.layerId);
                            if (!baseVisible.has(v.layerId)) baseVisible.set(v.layerId, !!layer.visible);
                            await asStep("layer", v.layerId, async () => {
                                layer.visible = v.visible;
                            });
                        }
                    }, "Elzoz: apply row");
                    return { notes };
                },
                /** baseName may contain subfolders ("Shoes/12_Name"); they are created as needed. */
                async exportItem(folder, baseName, formats, options, crop = null) {
                    const target = await outputTarget(folder, baseName);
                    return withCrop(crop, () => exportDocument({ doc, folder: target.folder, baseName: target.name, formats, options }));
                },
                /** Set the approval-sheet label for the current row (reverted by reset()). */
                async setProofLabel(text) {
                    if (!overlay) return;
                    await doc.suspendHistory(async () => {
                        await asStep("proof", null, () => setLayerText({ photoshop, layer: overlay.label, value: text }));
                    }, "Elzoz: proof label");
                },
                /** The current state as JPEG bytes (temporary file, deleted afterwards). */
                async renderJpeg(quality = 12, crop = null) {
                    return withCrop(crop, () => renderJpegNow(quality));
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
                    for (const [id, visible] of baseVisible) {
                        const layer = layerFor(id);
                        if (!!layer.visible !== visible) layer.visible = visible;
                    }
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
