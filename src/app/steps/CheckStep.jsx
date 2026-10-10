import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Alert, Button, Card, Checkbox, Field, FileField, NumberInput, Section, Select, Stat, TextInput } from "../../ui/components.jsx";
import { computePlan, effectiveTable, previewPlan } from "../state.js";
import { putProject, getProject } from "../../domain/projects.js";
import { PrintCard, ProofCard } from "./PrintProof.jsx";
import LinkDownloads, { CodeImages } from "./LinkDownloads.jsx";
import { artboardSize } from "../../domain/artboards.js";

const projectStorage = () => {
    try {
        return window.localStorage;
    } catch (e) {
        return null;
    }
};

/** The open project's key column and "only new rows" switch (saved immediately). */
function ProjectCard() {
    const { state, dispatch } = useApp();
    const { t } = useI18n();
    const p = state.project;
    const table = effectiveTable(state);
    const done = Object.keys(p.done || {}).length;
    const update = (patch) => {
        dispatch({ type: "project", project: patch });
        const store = projectStorage();
        const stored = store && getProject(store, p.id);
        if (stored) putProject(store, { ...stored, ...patch });
    };
    return (
        <Section title={t("projects.card", { name: p.name })}>
            <Card>
                <Field label={t("projects.key")} hint={t("projects.keyHint")}>
                    <Select value={p.keyColumn} placeholder={t("projects.noKey")} options={(table ? table.headers : []).filter((h) => !h.derived).map((h) => ({ value: h.key, label: h.key }))} onChange={(v) => update({ keyColumn: v })} />
                </Field>
                {p.keyColumn ? (
                    <>
                        <Checkbox checked={p.onlyNew} onChange={(v) => update({ onlyNew: v })} label={t("projects.onlyNew")} />
                        <div className="ez-small ez-muted">{t("projects.doneCount", { n: done, key: p.keyColumn })}</div>
                    </>
                ) : (
                    <div className="ez-small ez-muted">{t("projects.pickKey")}</div>
                )}
            </Card>
        </Section>
    );
}

/** Artboards: which sizes to export, and what a row turns into. */
function SizesCard({ plan }) {
    const { state, dispatch } = useApp();
    const { t } = useI18n();
    const boards = state.template.artboards;
    const off = new Set(state.settings.artboardsOff || []);
    const on = boards.filter((a) => !off.has(a.name));
    const rows = on.length ? Math.round(plan.items.length / on.length) : 0;
    const toggle = (name, v) => dispatch({ type: "settings", patch: { artboardsOff: v ? [...off].filter((n) => n !== name) : [...off, name] } });
    return (
        <Section title={t("artboards.sizes")}>
            <Card>
                {boards.map((a) => (
                    <Checkbox key={a.id} checked={!off.has(a.name)} onChange={(v) => toggle(a.name, v)} label={`${a.name} · ${artboardSize(a).width} × ${artboardSize(a).height}`} />
                ))}
                <div className="ez-small ez-strong" data-testid="sizes-summary">
                    {t("artboards.summary", { rows, sizes: on.length, n: plan.items.length })}
                </div>
                <div className="ez-small ez-muted">{t("artboards.naming")}</div>
            </Card>
        </Section>
    );
}

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
    const plan = useMemo(() => computePlan(state, { balance, pricing }), [state.data, state.template, state.mapping, state.folders, state.output, state.settings, state.video, state.mode, state.derived, state.project, balance, pricing]);

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
    // Issues that point at an earlier step get a "Fix" button that goes there
    // (e.g. a missing image: re-choose the folder in Map before spending credits).
    const fixAction = (issue) =>
        issue.fix && issue.fix.step && !["check", "generate", "account"].includes(issue.fix.step) ? (
            <Button quiet onClick={() => dispatch({ type: "go", step: issue.fix.step === "video" ? "animate" : issue.fix.step })}>
                {t("check.fix")}
            </Button>
        ) : null;
    const toggleFormat = (f, on) => setSettings({ formats: on ? [...new Set([...state.settings.formats, f])] : state.settings.formats.filter((x) => x !== f) });

    return (
        <>
            {state.project && <ProjectCard />}
            {!video && state.template && (state.template.artboards || []).length > 0 && <SizesCard plan={plan} />}
            <LinkDownloads />
            <CodeImages />
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
                    <Field label={t("check.rowsField")} hint={t("check.rowsHint")}>
                        <TextInput value={state.settings.rowSelection} placeholder={t("check.rowsAll")} onChange={(v) => setSettings({ rowSelection: v })} />
                    </Field>
                    {!video && state.template && (
                        <Field label={t("check.width")} hint={t("check.widthHint", { w: state.template.width, h: state.template.height })}>
                            <TextInput
                                value={state.settings.outputWidth == null ? "" : String(state.settings.outputWidth)}
                                placeholder={t("check.widthOriginal")}
                                onChange={(v) => setSettings({ outputWidth: v.trim() === "" ? null : /^\d+$/.test(v.trim()) ? Number(v.trim()) : v })}
                            />
                        </Field>
                    )}
                </Card>
            </Section>

            {!video && <PrintCard plan={plan} />}

            {error && <Alert tone="error">{error}</Alert>}

            {plan.blocking.length > 0 && (
                <Section title={t("check.blocking")}>
                    {plan.blocking.map((b, i) => (
                        <Alert
                            key={`b${i}`}
                            tone="error"
                            action={fixAction(b)}
                        >
                            {b.message}
                        </Alert>
                    ))}
                </Section>
            )}

            {plan.warnings.length > 0 && (
                <Section title={t("check.warnings")}>
                    {plan.warnings.map((w, i) => (
                        <Alert key={`w${i}`} tone={w.severity === "info" ? "info" : "warning"} action={fixAction(w)}>
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
                                {(video ? ["mov"] : plan.formats).map((f) => `${it.baseName}.${f}`).join(", ")}
                            </div>
                        ))}
                        {!video && state.settings.print.enabled && <div className="ez-small ez-accent">{t("print.plusPdf")}</div>}
                    </Card>
                </Section>
            )}

            {!video && <DesignPreview />}
            {!video && <ProofCard plan={plan} />}
        </>
    );
}

/** Free, low-resolution preview of any row before spending credits. */
function DesignPreview() {
    const { state, services } = useApp();
    const { t } = useI18n();
    const plan = useMemo(() => previewPlan(state), [state.data, state.template, state.mapping, state.folders, state.settings]); // eslint-disable-line react-hooks/exhaustive-deps
    const [key, setKey] = useState("");
    const [preview, setPreview] = useState({ busy: false, url: null, error: null });
    if (!plan.items || !plan.items.length) return null;
    const item = plan.items.find((i) => i.key === key) || plan.items[0];
    const run = async () => {
        setPreview({ busy: true, url: null, error: null });
        try {
            const template = state.template;
            const r = await services.previewDesign({
                template: { ref: template.entry ? { entry: template.entry } : { documentId: template.documentId }, width: template.width, height: template.height },
                layers: template.layers,
                item,
                folders: Object.fromEntries(Object.entries(state.folders).map(([k, f]) => [k, { name: f.name, entry: f.entry }])),
                outputSize: plan.outputSize
            });
            setPreview({ busy: false, url: r.url, error: null });
        } catch (e) {
            setPreview({ busy: false, url: null, error: e.message });
        }
    };
    return (
        <Section title={t("check.preview")}>
            <div className="ez-row ez-mb2">
                <div className="ez-grow ez-mr2">
                    <Select value={item.key} onChange={setKey} options={plan.items.map((i) => ({ value: i.key, label: `${t("gen.row", { row: i.sourceRow })} · ${i.baseName}` }))} />
                </div>
                <Button onClick={run} disabled={preview.busy}>
                    {preview.busy ? "…" : t("check.previewBtn")}
                </Button>
            </div>
            {preview.error && <Alert tone="error">{preview.error}</Alert>}
            {preview.url && <img className="ez-preview-img" src={preview.url} alt="" />}
            <div className="ez-small ez-muted ez-mt1">{t("check.previewNote")}</div>
        </Section>
    );
}
