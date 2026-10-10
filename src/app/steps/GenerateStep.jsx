import React, { useRef, useState } from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Alert, Button, Card, ProgressBar, Section, Stat } from "../../ui/components.jsx";
import { runDesignJob, summarize } from "../../engine/designJob.js";
import { runVideoJob } from "../../engine/videoJob.js";
import { computePlan, rememberMapping, reportCsv, retryKeys, runProgress, subsetPlan } from "../state.js";
import { markDone, succeededKeys } from "../../domain/projects.js";
import { saveProject } from "../projectIO.js";

const CONFIRM_ABOVE = 50;

export default function GenerateStep() {
    const ctx = useApp();
    const { state, dispatch, services, account, pricing, session, refreshAccount } = ctx;
    const { t } = useI18n();
    const [confirming, setConfirming] = useState(false);
    const [notice, setNotice] = useState(null);
    const signal = useRef({ cancelled: false });
    const video = state.mode === "video";
    const run = state.run;

    const balance = session.dev ? null : account ? account.available : null;
    const plan = run.plan || computePlan(state, { balance, pricing });

    const start = async (thePlan) => {
        setConfirming(false);
        setNotice(null);
        signal.current = { cancelled: false };
        dispatch({ type: "run-start", total: thePlan.items.length, plan: thePlan });
        try {
            rememberMapping(window.localStorage, state.template, state.mapping, Date.now(), state.derived);
        } catch (e) {
            /* storage unavailable: memory is a convenience only */
        }
        const args = {
            port: services.port,
            billing: services.billing({ dev: session.dev }),
            template: state.template.entry ? { entry: state.template.entry } : { documentId: state.template.documentId },
            templateLayers: state.template.layers,
            plan: thePlan,
            folders: Object.fromEntries(Object.entries(state.folders).map(([k, f]) => [k, { name: f.name, entry: f.entry }])),
            output: { entry: state.output.entry },
            options: { jpgQuality: state.settings.jpgQuality, keepFrames: state.settings.keepFrames },
            signal: signal.current,
            onEvent: (event) => dispatch({ type: "run-event", event })
        };
        const result = video ? await runVideoJob(args) : await runDesignJob(args);
        dispatch({ type: "run-done", result });
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
        services.refreshOutputFolder(state.output).then((o) => dispatch({ type: "output", output: o })).catch(() => {});
    };

    const cancel = () => {
        signal.current.cancelled = true;
        dispatch({ type: "run-cancel" });
    };

    const saveReport = async () => {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        try {
            const name = await services.writeReport(state.output, `elzoz-report-${stamp}.csv`, reportCsv(run.result));
            setNotice(t("gen.reportSaved", { name }));
        } catch (e) {
            setNotice(t("error.generic", { message: e.message }));
        }
    };

    // ---------- before running ----------
    if (run.status === "idle") {
        if (!plan.ok) {
            return (
                <Alert tone="error" action={<Button onClick={() => dispatch({ type: "go", step: "check" })}>{t("app.back")}</Button>}>
                    {t("check.blocking")}
                </Alert>
            );
        }
        const cost = session.dev ? 0 : plan.cost;
        const label = video ? t("gen.startVideo", { n: plan.units, cost }) : t("gen.start", { n: plan.units, cost });
        return (
            <>
                {session.dev && <Alert tone="warning">{t("app.devMode")}</Alert>}
                <div className="ez-stats">
                    <Stat label={t("check.items")} value={plan.units} />
                    <Stat label={t("check.cost")} value={cost} />
                </div>
                {confirming ? (
                    <Card>
                        <div className="ez-mb2">{t("gen.confirm", { cost })}</div>
                        <div className="ez-row">
                            <Button variant="cta" onClick={() => start(plan)}>
                                {t("gen.yes")}
                            </Button>
                            <div className="ez-mr2" />
                            <Button quiet onClick={() => setConfirming(false)}>
                                {t("gen.cancel")}
                            </Button>
                        </div>
                    </Card>
                ) : (
                    <Button variant="cta" onClick={() => (cost > CONFIRM_ABOVE ? setConfirming(true) : start(plan))}>
                        {label}
                    </Button>
                )}
            </>
        );
    }

    // ---------- running ----------
    if (run.status === "running") {
        return (
            <>
                <div className="ez-title">{t("gen.running")}</div>
                <ProgressBar value={runProgress(run)} />
                <div className="ez-row ez-mt2">
                    <div className="ez-grow ez-small">
                        {run.label}
                        {run.frames ? ` · ${run.frame}/${run.frames}` : ""}
                    </div>
                    <div className="ez-small ez-muted">
                        {run.items.filter((i) => i.status === "succeeded").length} ✓ · {run.items.filter((i) => i.status === "failed").length} ✕
                    </div>
                </div>
                <div className="ez-mt3">
                    <Button variant="warning" onClick={cancel} disabled={run.cancelling}>
                        {run.cancelling ? t("gen.cancelling") : t("gen.cancel")}
                    </Button>
                </div>
                <div className="ez-small ez-muted ez-mt2">{t("gen.photoshopCancel")}</div>
            </>
        );
    }

    // ---------- results ----------
    const result = run.result;
    const s = summarize(result);
    const toRetry = retryKeys(result);
    const anyFailed = result.items.some((i) => i.status === "failed");
    const tone = result.status === "completed" ? "success" : result.status === "failed" ? "error" : "warning";
    const charged = result.billing && typeof result.billing.charged === "number" ? result.billing.charged : null;
    return (
        <>
            <Alert tone={tone} title={t(`gen.done.${result.status}`)}>
                {result.fatal && result.fatal.message}
                {result.billingWarning && <div>{result.billingWarning}</div>}
            </Alert>
            <div className="ez-stats">
                <Stat label={t("gen.succeeded")} value={s.succeeded} tone="success" />
                <Stat label={t("gen.failed")} value={s.failed} tone={s.failed ? "error" : null} />
                {s.cancelled + s.notStarted > 0 && <Stat label={t("gen.cancelled")} value={s.cancelled + s.notStarted} tone="warning" />}
                {charged !== null && <Stat label={t("gen.charged")} value={charged} />}
            </div>
            <div className="ez-small ez-muted ez-mb2 ez-ellipsis" title={state.output && state.output.path}>
                {t("gen.outputAt", { path: state.output ? state.output.path : "" })}
            </div>
            <div className="ez-row ez-mb2">
                {toRetry.length > 0 && (
                    <>
                        <Button variant="primary" onClick={() => start(subsetPlan(run.plan, toRetry))}>
                            {anyFailed ? t("gen.retry") : t("gen.tryAgain")}
                        </Button>
                        <div className="ez-mr2" />
                    </>
                )}
                <Button onClick={saveReport}>{t("gen.report")}</Button>
                <div className="ez-grow" />
                <Button quiet onClick={() => dispatch({ type: "new-job" })}>
                    {t("gen.newJob")}
                </Button>
            </div>
            {notice && <Alert tone="info">{notice}</Alert>}
            <Section>
                <Card>
                    {result.items.map((it) => (
                        <div key={it.key} className="ez-result">
                            <div className={`ez-dot ez-dot-${it.status}`} />
                            <div className="ez-grow">
                                <div className="ez-ellipsis">
                                    {t("gen.row", { row: it.sourceRow })} · {it.files && it.files.length ? it.files.map((f) => f.name).join(", ") : it.baseName}
                                </div>
                                {it.error && <div className="ez-small ez-muted">{`${it.error.step}: ${it.error.message}`}</div>}
                            </div>
                        </div>
                    ))}
                </Card>
            </Section>
        </>
    );
}
