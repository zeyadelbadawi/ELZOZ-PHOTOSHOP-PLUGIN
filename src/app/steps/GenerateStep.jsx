import React, { useState } from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Alert, Button, Card, ProgressBar, Section, Stat } from "../../ui/components.jsx";
import { summarize } from "../../engine/designJob.js";
import { computePlan, reportCsv, retryKeys, runProgress, subsetPlan } from "../state.js";
import { useRunner } from "../runner.js";

const CONFIRM_ABOVE = 50;

export default function GenerateStep() {
    const ctx = useApp();
    const { state, dispatch, services, account, pricing, session } = ctx;
    const { t } = useI18n();
    const [confirming, setConfirming] = useState(false);
    const [notice, setNotice] = useState(null);
    const runner = useRunner();
    const video = state.mode === "video";
    const run = state.run;

    const balance = session.dev ? null : account ? account.available : null;
    const plan = run.plan || computePlan(state, { balance, pricing });

    const start = (thePlan) => {
        setConfirming(false);
        setNotice(null);
        runner.start(thePlan);
    };
    const cancel = runner.cancel;

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
                <div className="ez-title">{run.kind === "proof" ? t("proof.running") : t("gen.running")}</div>
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
    if (result.kind === "proof") return <ProofResult result={result} s={s} />;
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
            {result.print && result.print.file && (
                <Alert tone="success" title={t("print.ready", { file: result.print.file })}>
                    {t("print.readyInfo", { pages: result.print.pages, designs: result.print.designs })}
                </Alert>
            )}
            {result.print && result.print.error && <Alert tone="warning">{result.print.error}</Alert>}
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

/** Results of a free approval sheet. */
function ProofResult({ result, s }) {
    const { state, dispatch } = useApp();
    const { t } = useI18n();
    const tone = result.status === "completed" ? "success" : result.status === "failed" ? "error" : "warning";
    return (
        <>
            {result.proof ? (
                <Alert tone={tone} title={t("proof.ready", { file: result.proof.file })}>
                    {t("proof.readyInfo", { pages: result.proof.pages, designs: result.proof.designs })}
                    {result.proof.folder && <div>{t("proof.imagesIn", { folder: result.proof.folder })}</div>}
                </Alert>
            ) : (
                <Alert tone="error" title={t("proof.failed")}>
                    {result.fatal && result.fatal.message}
                </Alert>
            )}
            <div className="ez-stats">
                <Stat label={t("gen.succeeded")} value={s.succeeded} tone="success" />
                <Stat label={t("gen.failed")} value={s.failed} tone={s.failed ? "error" : null} />
                <Stat label={t("gen.charged")} value={0} />
            </div>
            <div className="ez-small ez-muted ez-mb2 ez-ellipsis" title={state.output && state.output.path}>
                {t("gen.outputAt", { path: state.output ? state.output.path : "" })}
            </div>
            <div className="ez-small ez-muted ez-mb2">{t("proof.next")}</div>
            <div className="ez-row ez-mb2">
                <Button variant="cta" onClick={() => dispatch({ type: "run-reset" })}>
                    {t("proof.generateNow")}
                </Button>
                <div className="ez-grow" />
                <Button
                    quiet
                    onClick={() => {
                        dispatch({ type: "run-reset" });
                        dispatch({ type: "go", step: "check" });
                    }}
                >
                    {t("proof.backToCheck")}
                </Button>
            </div>
            <Section>
                <Card>
                    {result.items.map((it, i) => (
                        <div key={it.key} className="ez-result">
                            <div className={`ez-dot ez-dot-${it.status}`} />
                            <div className="ez-grow">
                                <div className="ez-ellipsis">
                                    #{i + 1} · {t("gen.row", { row: it.sourceRow })} · {it.files && it.files.length ? it.files.map((f) => f.name).join(", ") : it.baseName}
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
