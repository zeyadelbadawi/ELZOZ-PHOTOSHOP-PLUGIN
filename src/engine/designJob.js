// Design batch runner. Depends only on a "port" (src/ps/port.js or a test fake)
// and a "billing" client (src/account/credits.js or a test fake).
//
// Guarantees (enforced here and by tests):
//  * nothing renders until the server has reserved credits for the plan
//  * one modal scope, one working copy, reverted after every item
//  * an item succeeds only if every operation succeeded and every file was verified
//  * billing is told the truth about each item; failed items are never charged
//  * the working copy is closed even when the job fails or is cancelled
//  * the optional print PDF only contains designs whose files were written
import { createPrintPdf } from "../domain/printPdf.js";

export const ITEM = { succeeded: "succeeded", failed: "failed", cancelled: "cancelled", notStarted: "not_started" };
export const JOB = { completed: "completed", completedWithErrors: "completed_with_errors", cancelled: "cancelled", failed: "failed" };

function describeError(e) {
    return { step: e.step || "unknown", message: e.message || String(e), layerId: e.layerId ?? null, format: e.format ?? null };
}

/**
 * @param {object} p
 * @param {object} p.port              Photoshop port
 * @param {object} p.billing           { startJob, reportItem, finishJob }
 * @param {object} p.template          { entry } or { documentId }
 * @param {Array}  p.templateLayers    descriptors used during mapping
 * @param {object} p.plan              result of runPreflight (ok === true)
 * @param {object} p.folders           { key: { name, entry } }
 * @param {object} p.output            { entry: UXP Folder }
 * @param {object} [p.options]         { jpgQuality, pngCompression }
 * @param {{cancelled: boolean}} [p.signal]  set cancelled = true from the UI
 * @param {Function} [p.onEvent]       ({type, ...}) progress callback for the UI
 * @param {object} [p.print]           { options: DEFAULT_PRINT-shaped, fileName } → one print PDF of all designs
 */
export async function runDesignJob({ port, billing, template, templateLayers, plan, folders, output, options = {}, signal = {}, onEvent = () => {}, print = null }) {
    if (!plan || !plan.ok) throw new Error("runDesignJob requires a plan without blocking issues.");
    const startedAt = new Date().toISOString();
    const items = plan.items.map((it) => ({ key: it.key, sourceRow: it.sourceRow, baseName: it.baseName, status: ITEM.notStarted, files: [], error: null }));
    const result = { jobId: null, status: JOB.failed, startedAt, finishedAt: null, items, fatal: null };
    const finish = (status) => {
        result.status = status;
        result.finishedAt = new Date().toISOString();
        onEvent({ type: "finished", result });
        return result;
    };

    // 1. Server reservation. Nothing renders without it.
    let job;
    try {
        job = await billing.startJob({ kind: "design", itemKeys: items.map((i) => i.key) });
        result.jobId = job.jobId;
    } catch (e) {
        result.fatal = { step: "billing", message: e.message };
        return finish(JOB.failed);
    }
    onEvent({ type: "started", jobId: job.jobId, total: items.length });

    let cancelled = false;
    try {
        await port.runModal("Elzoz: generating designs", async (ctx) => {
            // Optional output size: the working copy is resized once, before any row is applied.
            const session = await port.openWorkingCopy(template, templateLayers, { resizeTo: plan.outputSize || null });
            // Print PDF: opened at the first written design, so a job where nothing succeeds leaves no empty PDF.
            let pdf = null;
            let pdfFile = null;
            const addToPdf = async (bytes) => {
                if (result.print && result.print.error) return;
                try {
                    if (!pdf) {
                        pdfFile = await port.openOutputFile(output.entry, print.fileName);
                        pdf = createPrintPdf({ write: (b) => pdfFile.write(b), print: print.options, size: { width: session.doc.width, height: session.doc.height }, title: print.fileName });
                    }
                    await pdf.addDesign(bytes);
                    result.print = { designs: (result.print ? result.print.designs : 0) + 1 };
                } catch (e) {
                    result.print = { error: `The print PDF couldn't be written: ${e.message}` };
                }
            };
            try {
                for (let i = 0; i < plan.items.length; i++) {
                    if (ctx.isCancelled() || signal.cancelled) {
                        cancelled = true;
                        break;
                    }
                    const planItem = plan.items[i];
                    const state = items[i];
                    ctx.progress(i / plan.items.length, `Row ${i + 1} of ${plan.items.length}`);
                    onEvent({ type: "item-start", index: i, key: state.key });

                    try {
                        await session.applyItem(planItem, folders);
                        // Rendered before the files, so a failure here leaves nothing behind for this row.
                        const printBytes = print ? await session.renderJpeg(12) : null;
                        state.files = await session.exportItem(output.entry, planItem.baseName, plan.formats, options);
                        state.status = ITEM.succeeded;
                        if (printBytes) await addToPdf(printBytes);
                    } catch (e) {
                        state.status = ITEM.failed;
                        state.error = describeError(e);
                    } finally {
                        await session.reset();
                    }

                    // Report truthfully; the server charges only succeeded items.
                    try {
                        await billing.reportItem({
                            jobId: job.jobId,
                            itemKey: state.key,
                            status: state.status,
                            evidence: state.status === ITEM.succeeded ? { files: state.files.map((f) => ({ name: f.name, size: f.size })) } : { error: state.error }
                        });
                    } catch (e) {
                        // Billing must stay consistent with outputs; stop rather than keep rendering.
                        result.fatal = { step: "billing", message: `Couldn't record row ${state.sourceRow}: ${e.message}` };
                        throw e;
                    }
                    onEvent({ type: "item-done", index: i, item: state });
                }
                ctx.progress(1, "Finishing");
            } finally {
                await session.close();
                if (pdf && !(result.print && result.print.error)) {
                    try {
                        const done = await pdf.finish();
                        const file = await pdfFile.close();
                        result.print = { ...result.print, file: file.name, pages: done.pages, size: file.size };
                    } catch (e) {
                        result.print = { error: `The print PDF couldn't be finished: ${e.message}` };
                    }
                }
                if (pdfFile && result.print && result.print.error) await pdfFile.remove();
            }
        });
    } catch (e) {
        if (!result.fatal) result.fatal = describeError(e);
    }

    if (cancelled) for (const it of items) if (it.status === ITEM.notStarted) it.status = ITEM.cancelled;

    const status = result.fatal ? JOB.failed : cancelled ? JOB.cancelled : items.every((i) => i.status === ITEM.succeeded) ? JOB.completed : JOB.completedWithErrors;
    try {
        const summary = await billing.finishJob({ jobId: job.jobId, status });
        result.billing = summary;
    } catch (e) {
        // Unreported reservations expire server-side; record the problem for the UI.
        result.billingWarning = `Couldn't close the job on the server (${e.message}). Unused credits are released automatically.`;
    }
    return finish(status);
}

export function summarize(result) {
    const count = (s) => result.items.filter((i) => i.status === s).length;
    return { total: result.items.length, succeeded: count(ITEM.succeeded), failed: count(ITEM.failed), cancelled: count(ITEM.cancelled), notStarted: count(ITEM.notStarted) };
}
