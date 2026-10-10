// Check step: print-ready PDF options (feature 13) and the free client
// approval sheet (feature 14).
import React from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Button, Card, Checkbox, Field, NumberInput, Section, Select } from "../../ui/components.jsx";
import { PAPERS } from "../../domain/imposition.js";
import { proofBlocking } from "../state.js";
import { useRunner } from "../runner.js";

const r1 = (n) => Math.round(n * 10) / 10;

/** A small to-scale drawing of the first sheet. */
function SheetDiagram({ layout }) {
    const scale = 150 / Math.max(layout.sheetW, layout.sheetH);
    const d = layout.design;
    return (
        <div className="ez-sheet" style={{ width: `${layout.sheetW * scale}px`, height: `${layout.sheetH * scale}px` }} data-testid="sheet-diagram">
            {layout.cells.map((c, i) => (
                <div key={i} className="ez-sheet-cell" style={{ left: `${c.x * scale}px`, top: `${c.y * scale}px`, width: `${d.w * scale}px`, height: `${d.h * scale}px` }} />
            ))}
        </div>
    );
}

export function PrintCard({ plan }) {
    const { state, dispatch } = useApp();
    const { t } = useI18n();
    const p = state.settings.print;
    const set = (patch) => dispatch({ type: "settings", patch: { print: { ...p, ...patch } } });
    const info = plan.print || {};
    const tpl = state.template;
    return (
        <Section title={t("print.title")}>
            <Card>
                <Checkbox checked={p.enabled} onChange={(v) => set({ enabled: v })} label={t("print.enable")} />
                {!p.enabled && <div className="ez-small ez-muted">{t("print.about")}</div>}
                {p.enabled && (
                    <>
                        <Field label={t("print.layout")}>
                            <Select
                                value={p.layout}
                                options={[
                                    { value: "pages", label: t("print.layout.pages") },
                                    { value: "sheet", label: t("print.layout.sheet") }
                                ]}
                                onChange={(v) => set({ layout: v })}
                            />
                        </Field>
                        <Field
                            label={t("print.dpi")}
                            hint={info.design ? t("print.size", { w: r1(info.design.trimW), h: r1(info.design.trimH) }) + (tpl && tpl.resolution && tpl.resolution !== p.dpi ? ` ${t("print.templateDpi", { dpi: tpl.resolution })}` : "") : t("print.dpiHint")}
                        >
                            <NumberInput value={p.dpi} min={72} max={1200} step={50} onChange={(n) => set({ dpi: Math.round(n) })} suffix="dpi" />
                        </Field>
                        {tpl && tpl.resolution >= 150 && tpl.resolution !== p.dpi && (
                            <Button quiet onClick={() => set({ dpi: tpl.resolution })}>
                                {t("print.useTemplateDpi", { dpi: tpl.resolution })}
                            </Button>
                        )}
                        <Field label={t("print.bleed")} hint={t("print.bleedHint")}>
                            <NumberInput value={p.bleedMm} min={0} max={20} step={0.5} onChange={(n) => set({ bleedMm: Math.max(0, n) })} suffix="mm" />
                        </Field>
                        <Checkbox checked={p.marks} onChange={(v) => set({ marks: v })} label={t("print.marks")} />
                        {p.layout === "sheet" && (
                            <>
                                <Field label={t("print.paper")}>
                                    <Select
                                        value={p.paper}
                                        options={[...Object.entries(PAPERS).map(([k, v]) => ({ value: k, label: `${k} (${v.w} × ${v.h} mm)` })), { value: "custom", label: t("print.custom") }]}
                                        onChange={(v) => set({ paper: v })}
                                    />
                                </Field>
                                {p.paper === "custom" && (
                                    <div className="ez-row">
                                        <Field label={t("print.width")}>
                                            <NumberInput value={p.customW} min={50} max={1500} onChange={(n) => set({ customW: n })} suffix="mm" />
                                        </Field>
                                        <div className="ez-mr2" />
                                        <Field label={t("print.height")}>
                                            <NumberInput value={p.customH} min={50} max={1500} onChange={(n) => set({ customH: n })} suffix="mm" />
                                        </Field>
                                    </div>
                                )}
                                <Field label={t("print.orientation")}>
                                    <Select
                                        value={p.orientation}
                                        options={["auto", "portrait", "landscape"].map((o) => ({ value: o, label: t(`print.orientation.${o}`) }))}
                                        onChange={(v) => set({ orientation: v })}
                                    />
                                </Field>
                                <Field label={t("print.gap")} hint={t("print.gapHint")}>
                                    <NumberInput value={p.gapMm} min={0} max={50} step={1} onChange={(n) => set({ gapMm: Math.max(0, n) })} suffix="mm" />
                                </Field>
                                <Field label={t("print.copies")} hint={t("print.copiesHint")}>
                                    <NumberInput value={p.copies} min={1} max={500} onChange={(n) => set({ copies: Math.round(n) })} />
                                </Field>
                                {info.layout && info.layout.ok && (
                                    <div className="ez-row ez-sheet-summary">
                                        <SheetDiagram layout={info.layout} />
                                        <div className="ez-grow ez-small" data-testid="sheet-summary">
                                            <div className="ez-strong">{t("print.perSheet", { n: info.layout.perSheet, cols: info.layout.cols, rows: info.layout.rows })}</div>
                                            <div className="ez-muted">{t(`print.orientation.${info.layout.orientation}`)}</div>
                                            <div className="ez-muted">{t("print.sheets", { sheets: info.layout.sheets, n: plan.items.length, copies: p.copies })}</div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                        <div className="ez-small ez-muted ez-mt2">{t("print.free")}</div>
                    </>
                )}
            </Card>
        </Section>
    );
}

export function ProofCard({ plan }) {
    const { state, dispatch } = useApp();
    const { t } = useI18n();
    const runner = useRunner();
    const pr = state.settings.proof;
    const set = (patch) => dispatch({ type: "settings", patch: { proof: { ...pr, ...patch } } });
    const blockers = proofBlocking(plan);
    const ready = !!state.output && plan.items.length > 0 && blockers.length === 0;
    return (
        <Section title={t("proof.title")}>
            <Card>
                <div className="ez-small ez-mb2">{t("proof.about")}</div>
                <Field label={t("proof.perPage")}>
                    <Select value={String(pr.perPage)} options={[4, 6, 9, 12].map((n) => ({ value: String(n), label: t("proof.perPageN", { n }) }))} onChange={(v) => set({ perPage: Number(v) })} />
                </Field>
                <Checkbox checked={pr.saveImages} onChange={(v) => set({ saveImages: v })} label={t("proof.saveImages")} />
                <Button variant="primary" disabled={!ready} onClick={() => runner.startProof(plan)}>
                    {t("proof.make", { n: plan.items.length })}
                </Button>
                {!ready && <div className="ez-small ez-muted ez-mt2">{!state.output ? t("proof.needOutput") : t("proof.needFix")}</div>}
            </Card>
        </Section>
    );
}
