// Starting and cancelling jobs (designs, videos, approval sheets). Shared by
// the Check and Generate steps; the cancel signal lives here so a job started
// on one screen can be cancelled from another.
import { useApp } from "./AppContext.jsx";
import { runDesignJob } from "../engine/designJob.js";
import { runVideoJob } from "../engine/videoJob.js";
import { runProofJob } from "../engine/proofJob.js";
import { rememberMapping } from "./state.js";
import { markDone, succeededKeys } from "../domain/projects.js";
import { saveProject } from "./projectIO.js";

const current = { signal: { cancelled: false } };

const pad = (n) => String(n).padStart(2, "0");
/** "2026-10-10 14.05" — safe in file names on Windows and macOS. */
export function fileStamp(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

export function useRunner() {
    const { state, dispatch, services, session, refreshAccount, recheck } = useApp();

    const common = (thePlan) => ({
        port: services.port,
        template: state.template.entry ? { entry: state.template.entry } : { documentId: state.template.documentId },
        templateLayers: state.template.layers,
        plan: thePlan,
        folders: Object.fromEntries(Object.entries(state.folders).map(([k, f]) => [k, { name: f.name, entry: f.entry }])),
        output: { entry: state.output.entry },
        signal: current.signal,
        onEvent: (event) => dispatch({ type: "run-event", event })
    });
    const begin = (thePlan, kind) => {
        current.signal = { cancelled: false };
        dispatch({ type: "run-start", total: thePlan.items.length, plan: thePlan, kind });
    };
    const after = () => services.refreshOutputFolder(state.output).then((o) => dispatch({ type: "output", output: o })).catch(() => {});

    async function start(thePlan) {
        begin(thePlan, "job");
        try {
            rememberMapping(window.localStorage, state.template, state.mapping, Date.now(), state.derived);
        } catch (e) {
            /* storage unavailable: memory is a convenience only */
        }
        const video = state.mode === "video";
        const print = !video && state.settings.print && state.settings.print.enabled ? { options: state.settings.print, fileName: `Print ${fileStamp()}.pdf` } : null;
        const args = {
            ...common(thePlan),
            billing: services.billing({ dev: session.dev }),
            options: { jpgQuality: state.settings.jpgQuality, keepFrames: state.settings.keepFrames, videoFormat: state.settings.videoFormat, videoQuality: state.settings.videoQuality },
            print
        };
        const result = video ? await runVideoJob(args) : await runDesignJob(args);
        dispatch({ type: "run-done", result });
        // The server refused to start: show the update / computers screen right away.
        if (result.fatal && ["update_required", "device_limit"].includes(result.fatal.code)) recheck();
        // Open project: remember the rows that were generated, and the job's latest settings.
        if (state.project) {
            const done = markDone(state.project.done, succeededKeys(result, thePlan));
            dispatch({ type: "project", project: { done } });
            try {
                await saveProject({ storage: window.localStorage, services, state: { ...state, project: { ...state.project, done } } });
            } catch (e) {
                /* the job's files are written; the project just isn't updated */
            }
        }
        refreshAccount();
        after();
    }

    /** Free approval sheet of the planned rows (no credits). */
    async function startProof(thePlan) {
        begin(thePlan, "proof");
        const stamp = fileStamp();
        const result = await runProofJob({
            ...common(thePlan),
            proof: {
                perPage: state.settings.proof.perPage,
                saveImages: state.settings.proof.saveImages,
                fileName: `Approval sheet ${stamp}.pdf`,
                folderName: `Proofs ${stamp}`,
                title: state.project ? state.project.name : state.template.title.replace(/\.(psd|psb)$/i, ""),
                dateText: stamp.slice(0, 10),
                templateSize: { width: state.template.width, height: state.template.height }
            }
        });
        dispatch({ type: "run-done", result });
        after();
    }

    function cancel() {
        current.signal.cancelled = true;
        dispatch({ type: "run-cancel" });
    }

    return { start, startProof, cancel };
}
