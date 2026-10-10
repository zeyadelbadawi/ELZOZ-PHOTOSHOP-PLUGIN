// Client approval sheet (feature 14). Free: no credits are reserved or charged.
// To keep it from replacing paid exports, every design is rendered small
// (PROOF_MAX px on the long side) with a "PROOF" watermark baked in by
// Photoshop, then the designs are gathered, numbered, into one PDF.
// Optional: the same watermarked JPEGs in a "Proofs ..." folder, ready to send
// on WhatsApp.
import { createProofPdf } from "../domain/printPdf.js";
import { latinOnly } from "../domain/pdf.js";
import { ITEM, JOB } from "./designJob.js";

export const PROOF_MAX = 800;

export function proofSize(width, height) {
    const scale = Math.min(1, PROOF_MAX / Math.max(width, height));
    return scale < 1 ? { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) } : null;
}

/** The design's file name without folders or the " (2)" added to avoid existing final files. */
export const proofName = (item) => String(item.baseName || "").split("/").pop().replace(/ \(\d+\)$/, "");

/** "#3  A1_Aurora Laptop" — names Photoshop's default font may not shape (Arabic) fall back to the row. */
export function proofLabel(number, item) {
    const name = proofName(item);
    return `#${number}  ${name && latinOnly(name) ? name : `row ${item.sourceRow}`}`;
}

/**
 * @param {object} p
 * @param {object} p.template, p.templateLayers, p.plan, p.folders, p.output   as for runDesignJob
 * @param {object} p.proof   { perPage, saveImages, fileName, folderName, title, dateText, templateSize }
 */
export async function runProofJob({ port, template, templateLayers, plan, folders, output, proof, signal = {}, onEvent = () => {} }) {
    const startedAt = new Date().toISOString();
    // With artboards, the approval sheet shows each row once with all its sizes (plan.proofItems).
    const list = plan.proofItems || plan.items;
    const items = list.map((it) => ({ key: it.key, sourceRow: it.sourceRow, baseName: it.baseName, status: ITEM.notStarted, files: [], error: null }));
    const result = { kind: "proof", jobId: null, status: JOB.failed, startedAt, finishedAt: null, items, fatal: null, proof: null, billing: { charged: 0 } };
    onEvent({ type: "started", jobId: null, total: items.length });

    let cancelled = false;
    let pdfFile = null;
    let pdf = null;
    let imagesFolder = null;
    try {
        await port.runModal("Elzoz: approval sheet", async (ctx) => {
            const base = plan.outputSize || proof.templateSize;
            const session = await port.openWorkingCopy(template, templateLayers, { resizeTo: base ? proofSize(base.width, base.height) : null, proof: { watermark: "PROOF" } });
            try {
                for (let i = 0; i < list.length; i++) {
                    if (ctx.isCancelled() || signal.cancelled) {
                        cancelled = true;
                        break;
                    }
                    const planItem = list[i];
                    const state = items[i];
                    ctx.progress(i / list.length, `Proof ${i + 1} of ${list.length}`);
                    onEvent({ type: "item-start", index: i, key: state.key });
                    const label = proofLabel(i + 1, planItem);
                    try {
                        await session.applyItem(planItem, folders);
                        await session.setProofLabel(label);
                        const bytes = await session.renderJpeg(8);
                        if (!pdf) {
                            pdfFile = await port.openOutputFile(output.entry, proof.fileName);
                            pdf = createProofPdf({ write: (b) => pdfFile.write(b), perPage: proof.perPage, title: proof.title, dateText: proof.dateText });
                        }
                        await pdf.addProof(bytes, { number: i + 1, label: label.replace(/^#\d+\s+/, "") });
                        if (proof.saveImages) {
                            if (!imagesFolder) imagesFolder = await port.outputTarget(output.entry, `${proof.folderName}/x`).then((t) => t.folder);
                            const file = await port.openOutputFile(imagesFolder, `${String(i + 1).padStart(2, "0")}_${proofName(planItem)}.jpg`);
                            await file.write(bytes);
                            state.files = [{ format: "jpg", ...(await file.close()) }];
                        }
                        state.status = ITEM.succeeded;
                    } catch (e) {
                        state.status = ITEM.failed;
                        state.error = { step: e.step || "proof", message: e.message || String(e) };
                        // The watermark is the condition for a free proof: without it, stop.
                        if (e.step === "proof") throw e;
                    } finally {
                        await session.reset();
                    }
                    onEvent({ type: "item-done", index: i, item: state });
                }
                ctx.progress(1, "Finishing");
            } finally {
                await session.close();
            }
        });
    } catch (e) {
        result.fatal = { step: e.step || "proof", message: e.message || String(e) };
    }
    if (cancelled) for (const it of items) if (it.status === ITEM.notStarted) it.status = ITEM.cancelled;

    if (pdf && !result.fatal) {
        try {
            const done = await pdf.finish();
            const file = await pdfFile.close();
            result.proof = { file: file.name, pages: done.pages, designs: items.filter((i) => i.status === ITEM.succeeded).length, folder: imagesFolder ? proof.folderName : null };
        } catch (e) {
            result.fatal = { step: "export", message: `The approval sheet couldn't be written: ${e.message}` };
        }
    }
    if (pdfFile && !result.proof) await pdfFile.remove();

    result.status = result.fatal ? JOB.failed : cancelled ? JOB.cancelled : items.every((i) => i.status === ITEM.succeeded) ? JOB.completed : JOB.completedWithErrors;
    result.finishedAt = new Date().toISOString();
    onEvent({ type: "finished", result });
    return result;
}
