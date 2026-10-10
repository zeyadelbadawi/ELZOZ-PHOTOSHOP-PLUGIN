// Video batch runner: one video per spreadsheet record.
// Same guarantees as designJob, plus: a video succeeds only when the MOV file
// was written AND re-read and verified (codec, size, frame count, duration,
// every frame's JPEG markers). Cancellation is checked between frames.
import { frameState } from "../domain/video/timeline.js";
import { ITEM, JOB } from "./designJob.js";

function describeError(e) {
    return { step: e.step || "unknown", message: e.message || String(e), layerId: e.layerId ?? null };
}

const pad = (n, w) => String(n).padStart(w, "0");

/**
 * @param {object} p
 * @param {object} p.plan        result of runVideoPreflight (ok === true), includes p.plan.timeline
 * @param {object} [p.options]   { keepFrames: boolean } also write the JPEG frames next to the video
 */
export async function runVideoJob({ port, billing, template, templateLayers, plan, folders, output, options = {}, signal = {}, onEvent = () => {} }) {
    if (!plan || !plan.ok || !plan.timeline) throw new Error("runVideoJob requires a video plan without blocking issues.");
    const tl = plan.timeline;
    const items = plan.items.map((it) => ({ key: it.key, sourceRow: it.sourceRow, baseName: it.baseName, status: ITEM.notStarted, files: [], error: null }));
    const result = { jobId: null, status: JOB.failed, startedAt: new Date().toISOString(), finishedAt: null, items, fatal: null };
    const finish = (status) => {
        result.status = status;
        result.finishedAt = new Date().toISOString();
        onEvent({ type: "finished", result });
        return result;
    };

    let job;
    try {
        job = await billing.startJob({
            kind: "video",
            items: items.map((i) => ({ key: i.key, duration_ms: Math.round(tl.durationMs), width: tl.width, height: tl.height }))
        });
        result.jobId = job.jobId;
    } catch (e) {
        result.fatal = { step: "billing", message: e.message };
        return finish(JOB.failed);
    }
    onEvent({ type: "started", jobId: job.jobId, total: items.length, framesPerItem: tl.frameCount });

    const animatedIds = tl.tracks.map((t) => t.layerId);
    const totalFrames = items.length * tl.frameCount;
    const width = String(tl.frameCount).length;
    let cancelled = false;

    try {
        await port.runModal("Elzoz: rendering videos", async (ctx) => {
            const session = await port.openWorkingCopy(template, templateLayers, { resizeTo: { width: tl.width, height: tl.height } });
            const isCancelled = () => ctx.isCancelled() || !!signal.cancelled;
            try {
                for (let i = 0; i < plan.items.length; i++) {
                    if (isCancelled()) {
                        cancelled = true;
                        break;
                    }
                    const planItem = plan.items[i];
                    const state = items[i];
                    onEvent({ type: "item-start", index: i, key: state.key });
                    let frameFolder = null;
                    try {
                        await session.applyItem(planItem, folders);
                        const rowState = session.snapshot();
                        const baseOpacity = session.readOpacity(animatedIds);
                        // baseName may contain subfolders ("Shoes/12_Name"), created on demand.
                        const target = await port.outputTarget(output.entry, planItem.baseName);
                        frameFolder = options.keepFrames
                            ? await target.folder.createFolder(`${target.name}_frames`)
                            : await port.createTempFolder(`elzoz-${job.jobId}-${i}`);

                        const frames = [];
                        for (let f = 0; f < tl.frameCount; f++) {
                            if (isCancelled()) throw Object.assign(new Error("Cancelled"), { cancelled: true });
                            await session.applyFrame(frameState(tl, f), baseOpacity);
                            frames.push(await session.exportFrame(frameFolder, `frame_${pad(f + 1, width)}.jpg`));
                            await session.restore(rowState);
                            const done = i * tl.frameCount + f + 1;
                            ctx.progress(done / totalFrames, `Video ${i + 1} of ${items.length} · frame ${f + 1} of ${tl.frameCount}`);
                            onEvent({ type: "frame", index: i, frame: f + 1, frames: tl.frameCount });
                        }
                        const format = options.videoFormat === "mp4" ? "mp4" : "mov";
                        const movie = await port.writeMovie({
                            folder: target.folder,
                            name: `${target.name}.${format}`,
                            frames,
                            width: tl.width,
                            height: tl.height,
                            fps: tl.fps,
                            format,
                            quality: options.videoQuality,
                            onProgress: (k, n) => ctx.progress(((i + 1) * tl.frameCount) / totalFrames, `Video ${i + 1} of ${items.length} · making the MP4 (${k}/${n})`)
                        });
                        state.files = [{ format, ...movie }];
                        state.status = ITEM.succeeded;
                    } catch (e) {
                        if (e.cancelled) {
                            state.status = ITEM.cancelled;
                            cancelled = true;
                        } else {
                            state.status = ITEM.failed;
                            state.error = describeError(e);
                        }
                    } finally {
                        await session.reset();
                        if (frameFolder && !options.keepFrames) await port.removeFolder(frameFolder);
                    }

                    if (state.status !== ITEM.cancelled) {
                        try {
                            await billing.reportItem({
                                jobId: job.jobId,
                                itemKey: state.key,
                                status: state.status,
                                evidence: state.status === ITEM.succeeded
                                    ? { files: state.files.map((f) => ({ name: f.name, size: f.size, frames: f.frameCount, durationMs: f.durationMs })) }
                                    : { error: state.error }
                            });
                        } catch (e) {
                            result.fatal = { step: "billing", message: `Couldn't record video ${i + 1}: ${e.message}` };
                            throw e;
                        }
                    }
                    onEvent({ type: "item-done", index: i, item: state });
                    if (cancelled) break;
                }
            } finally {
                await session.close();
            }
        });
    } catch (e) {
        if (!result.fatal) result.fatal = describeError(e);
    }

    if (cancelled) for (const it of items) if (it.status === ITEM.notStarted) it.status = ITEM.cancelled;
    const status = result.fatal ? JOB.failed : cancelled ? JOB.cancelled : items.every((i) => i.status === ITEM.succeeded) ? JOB.completed : JOB.completedWithErrors;
    try {
        result.billing = await billing.finishJob({ jobId: job.jobId, status });
    } catch (e) {
        result.billingWarning = `Couldn't close the job on the server (${e.message}). Unused credits are released automatically.`;
    }
    return finish(status);
}
