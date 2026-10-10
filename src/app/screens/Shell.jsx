import React, { useEffect, useState } from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Button } from "../../ui/components.jsx";
import { stepBlocker, stepsFor, computePlan } from "../state.js";
import Account from "./Account.jsx";
import Projects from "./Projects.jsx";
import { UpdateBanner } from "./Gate.jsx";
import { Alert } from "../../ui/components.jsx";
import DataStep from "../steps/DataStep.jsx";
import TemplateStep from "../steps/TemplateStep.jsx";
import MapStep from "../steps/MapStep.jsx";
import AnimateStep from "../steps/AnimateStep.jsx";
import CheckStep from "../steps/CheckStep.jsx";
import GenerateStep from "../steps/GenerateStep.jsx";

const STEP_VIEWS = { data: DataStep, template: TemplateStep, map: MapStep, animate: AnimateStep, check: CheckStep, generate: GenerateStep };

function Header({ onAccount, onProjects }) {
    const { state, dispatch, account, session } = useApp();
    const { t } = useI18n();
    const running = state.run.status === "running";
    const low = account && account.available < 10;
    return (
        <div className="ez-header">
            <div className="ez-brand">
                Elzoz<span className="ez-brand-dot">.</span>
            </div>
            <div className="ez-segmented">
                {["design", "video"].map((m) => (
                    <div
                        key={m}
                        className={`ez-segment ${state.mode === m ? "ez-segment-on" : ""}`}
                        onClick={() => !running && state.mode !== m && dispatch({ type: "mode", mode: m })}
                    >
                        {m === "video" ? t("app.video") : t("app.designs")}
                    </div>
                ))}
            </div>
            <div className="ez-header-spacer" />
            <div className={`ez-pchip ${state.project ? "ez-pchip-on" : ""}`} onClick={() => !running && onProjects()} title={t("projects.title")} data-testid="projects-chip">
                {state.project ? <span className="ez-ellipsis ez-chip-name">{state.project.name}</span> : t("projects.chip")}
            </div>
            <div className={`ez-chip ${low ? "ez-chip-low" : ""}`} onClick={onAccount} title={t("app.account")}>
                {session.dev ? "DEV" : account ? account.available : "–"}
                <span className="ez-chip-label ez-muted">&nbsp;{t("app.credits")}</span>
            </div>
        </div>
    );
}

function Stepper() {
    const { state, dispatch } = useApp();
    const { t } = useI18n();
    const steps = stepsFor(state.mode);
    const current = steps.indexOf(state.step);
    const locked = state.run.status === "running";
    // A step is reachable if every earlier step is unblocked.
    const reachable = (i) => steps.slice(0, i).every((s) => !stepBlocker(state, s));
    return (
        <div className="ez-stepper">
            {steps.map((s, i) => {
                const cls = i === current ? "ez-step-current" : i < current ? "ez-step-done" : "";
                return (
                    <div key={s} className={`ez-step ${cls}`} onClick={() => !locked && reachable(i) && dispatch({ type: "go", step: s })}>
                        <div className="ez-step-num">{i < current ? "✓" : i + 1}</div>
                        <span className="ez-step-label">{t(`step.${s}`)}</span>
                    </div>
                );
            })}
        </div>
    );
}

function ActionBar() {
    const { state, dispatch, account, pricing, session } = useApp();
    const { t } = useI18n();
    const steps = stepsFor(state.mode);
    const i = steps.indexOf(state.step);
    if (state.step === "generate") return null;

    let blocker = stepBlocker(state, state.step);
    if (!blocker && state.step === "check") {
        const plan = computePlan(state, { balance: session.dev ? null : account ? account.available : null, pricing });
        if (!plan.ok) blocker = "check.blocking";
    }
    return (
        <div className="ez-actionbar">
            {i > 0 ? (
                <Button quiet onClick={() => dispatch({ type: "go", step: steps[i - 1] })}>
                    {t("app.back")}
                </Button>
            ) : (
                <div />
            )}
            <div className="ez-actionbar-hint ez-ellipsis">{blocker ? t(blocker) : ""}</div>
            <Button variant="cta" disabled={!!blocker} onClick={() => dispatch({ type: "go", step: steps[i + 1] })}>
                {t("app.next")}
            </Button>
        </div>
    );
}

export default function Shell() {
    const { state, session } = useApp();
    const { t } = useI18n();
    const [panel, setPanel] = useState(null); // null | "account" | "projects"
    const [missing, setMissing] = useState(null); // project items to pick again after opening
    const View = STEP_VIEWS[state.step] || DataStep;
    // The "project opened" notice is about the opened job; it goes away once a run starts.
    useEffect(() => {
        if (state.run.status === "running") setMissing(null);
    }, [state.run.status]);
    const toggle = (name) => setPanel(panel === name ? null : name);
    return (
        <>
            <Header onAccount={() => toggle("account")} onProjects={() => toggle("projects")} />
            {panel === "account" ? (
                <Account onClose={() => setPanel(null)} />
            ) : panel === "projects" ? (
                <Projects
                    onClose={(missingItems) => {
                        setPanel(null);
                        if (missingItems) setMissing(missingItems);
                    }}
                />
            ) : (
                <>
                    <Stepper />
                    <div className="ez-content">
                        {session.dev && state.step !== "generate" && <div className="ez-small ez-muted ez-mb2">{t("app.devMode")}</div>}
                        <UpdateBanner />
                        {missing && (
                            <Alert tone={missing.length ? "warning" : "success"} action={<span className="ez-link" onClick={() => setMissing(null)}>✕</span>}>
                                {missing.length
                                    ? t("projects.missing", { list: missing.map((m) => (m.startsWith("folder:") ? m.slice(7) : t(`projects.missing.${m}`))).join(", ") })
                                    : t("projects.opened")}
                            </Alert>
                        )}
                        <View />
                    </div>
                    <ActionBar />
                </>
            )}
        </>
    );
}
