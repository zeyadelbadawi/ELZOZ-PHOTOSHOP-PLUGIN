import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Alert, Button, Card, Checkbox, Field, FileField, NumberInput, Section, Stat, TextInput } from "../../ui/components.jsx";
import { computePlan } from "../state.js";

const rowsText = (rows) => (rows.length > 8 ? `${rows.slice(0, 8).join(", ")} … (+${rows.length - 8})` : rows.join(", "));

export default function CheckStep() {
    const { state, dispatch, services, account, pricing, session, refreshAccount } = useApp();
    const { t } = useI18n();
    const [error, setError] = useState(null);
    const video = state.mode === "video";

    useEffect(() => {
        refreshAccount();
        if (state.output) services.refreshOutputFolder(state.output).then((o) => dispatch({ type: "output", output: o })).catch(() => {});
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const balance = session.dev ? null : account ? account.available : null;
    const plan = useMemo(() => computePlan(state, { balance, pricing }), [state.data, state.template, state.mapping, state.folders, state.output, state.settings, state.video, state.mode, balance, pricing]);

    const pickOutput = async () => {
        setError(null);
        try {
            const o = await services.pickOutputFolder();
            if (o) dispatch({ type: "output", output: o });
        } catch (e) {
            setError(e.message);
        }
    };
    const setSettings = (patch) => dispatch({ type: "settings", patch });
    const toggleFormat = (f, on) => setSettings({ formats: on ? [...new Set([...state.settings.formats, f])] : state.settings.formats.filter((x) => x !== f) });

    return (
        <>
            <Section title={t("check.output")}>
                <Card>
                    <Field label={t("check.folder")}>
                        <FileField name={state.output && state.output.name} meta={state.output && state.output.path} emptyLabel={t("check.folderEmpty")} actionLabel={t("check.folderPick")} onPick={pickOutput} />
                    </Field>
                    {!video && (
                        <Field label={t("check.formats")}>
                            <Checkbox checked={state.settings.formats.includes("jpg")} onChange={(v) => toggleFormat("jpg", v)} label="JPG" />
                            <Checkbox checked={state.settings.formats.includes("png")} onChange={(v) => toggleFormat("png", v)} label="PNG" />
                            <Checkbox checked={state.settings.formats.includes("psd")} onChange={(v) => toggleFormat("psd", v)} label="PSD" />
                        </Field>
                    )}
                    {!video && state.settings.formats.includes("jpg") && (
                        <Field label={t("check.jpgQuality")}>
                            <NumberInput value={state.settings.jpgQuality} min={0} max={12} onChange={(n) => setSettings({ jpgQuality: Math.max(0, Math.min(12, Math.round(n))) })} />
                        </Field>
                    )}
                    {video && <Checkbox checked={state.settings.keepFrames} onChange={(v) => setSettings({ keepFrames: v })} label={t("check.keepFrames")} />}
                    <Field label={t("check.pattern")} hint={t("check.patternHint")}>
                        <TextInput value={state.settings.namePattern} onChange={(v) => setSettings({ namePattern: v })} />
                    </Field>
                </Card>
            </Section>

            {error && <Alert tone="error">{error}</Alert>}

            {plan.blocking.length > 0 && (
                <Section title={t("check.blocking")}>
                    {plan.blocking.map((b, i) => (
                        <Alert
                            key={`b${i}`}
                            tone="error"
                            action={
                                b.fix && b.fix.step && b.fix.step !== "check" && b.fix.step !== "generate" && b.fix.step !== "account" ? (
                                    <Button quiet onClick={() => dispatch({ type: "go", step: b.fix.step === "video" ? "animate" : b.fix.step })}>
                                        {t("check.fix")}
                                    </Button>
                                ) : null
                            }
                        >
                            {b.message}
                        </Alert>
                    ))}
                </Section>
            )}

            {plan.warnings.length > 0 && (
                <Section title={t("check.warnings")}>
                    {plan.warnings.map((w, i) => (
                        <Alert key={`w${i}`} tone={w.severity === "info" ? "info" : "warning"}>
                            {w.message}
                            {w.rows && w.rows.length > 0 && <div className="ez-muted">{t("check.rows", { rows: rowsText(w.rows) })}</div>}
                        </Alert>
                    ))}
                </Section>
            )}

            {plan.blocking.length === 0 && (
                <Section title={t("check.summary")}>
                    <Alert tone="success" title={t("check.ready")} />
                    <div className="ez-stats">
                        <Stat label={t("check.items")} value={plan.units} />
                        <Stat label={t("check.skipped")} value={plan.skipped.length} tone={plan.skipped.length ? "warning" : null} />
                        <Stat label={t("check.cost")} value={session.dev ? 0 : plan.cost} />
                        {balance !== null && <Stat label={t("check.available")} value={balance} />}
                    </div>
                    <Card>
                        <div className="ez-label">{t("check.names")}</div>
                        {plan.items.slice(0, 3).map((it) => (
                            <div key={it.key} className="ez-small ez-ellipsis">
                                {it.baseName}.{video ? "mov" : plan.formats.join(" / .")}
                            </div>
                        ))}
                    </Card>
                </Section>
            )}
        </>
    );
}
