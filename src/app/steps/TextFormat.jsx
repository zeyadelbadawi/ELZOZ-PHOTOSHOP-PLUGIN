// Formatting options for one text mapping (Map step), with a live preview of row 1.
import React, { useState } from "react";
import { useI18n } from "../i18n.jsx";
import { Button, Checkbox, Field, Select, TextInput } from "../../ui/components.jsx";
import { CASE_STYLES, DATE_INPUTS, DATE_OUTPUTS, DIGIT_STYLES, EMPTY_FORMAT, PHONE_STYLES, formatValue, isFormatActive } from "../../domain/transforms.js";

const kindOf = (f) => (f.number ? "number" : f.date ? "date" : f.phone ? "phone" : "text");

export default function TextFormat({ format, sample, onChange }) {
    const { t } = useI18n();
    const f = { ...EMPTY_FORMAT, ...(format || {}) };
    const active = isFormatActive(f);
    const [open, setOpen] = useState(false);
    const set = (patch) => onChange({ ...f, ...patch });
    const kind = kindOf(f);
    const setKind = (k) =>
        set({
            number: k === "number" ? f.number || { decimals: "auto", thousands: true } : null,
            date: k === "date" ? f.date || { input: "dmy", output: "dd/MM/yyyy", lang: "ar" } : null,
            phone: k === "phone" ? f.phone || "spaced" : null
        });
    const preview = sample !== null && sample !== undefined ? formatValue(sample, f) : null;

    return (
        <div className="ez-format">
            <div className="ez-row">
                <Button quiet onClick={() => setOpen(!open)}>
                    {open ? "▾" : "▸"} {t("format.title")}
                </Button>
                {active && !open && <span className="ez-small ez-accent ez-ml2">{t("format.on")}</span>}
                <div className="ez-grow" />
                {active && (
                    <Button quiet onClick={() => onChange(null)}>
                        {t("format.reset")}
                    </Button>
                )}
            </div>
            {open && (
                <div className="ez-format-body">
                    <Field label={t("format.kind")}>
                        <Select value={kind} options={["text", "number", "date", "phone"].map((v) => ({ value: v, label: t(`format.kind.${v}`) }))} onChange={setKind} />
                    </Field>
                    {kind === "number" && (
                        <div className="ez-row">
                            <div className="ez-grow ez-mr2">
                                <Field label={t("format.decimals")}>
                                    <Select
                                        value={String(f.number.decimals)}
                                        options={["auto", "0", "1", "2"].map((v) => ({ value: v, label: t(`format.decimals.${v}`) }))}
                                        onChange={(v) => set({ number: { ...f.number, decimals: v === "auto" ? "auto" : Number(v) } })}
                                    />
                                </Field>
                            </div>
                            <div className="ez-grow">
                                <Field label={t("format.thousands")}>
                                    <Select value={f.number.thousands ? "yes" : "no"} options={[{ value: "yes", label: "1,299" }, { value: "no", label: "1299" }]} onChange={(v) => set({ number: { ...f.number, thousands: v === "yes" } })} />
                                </Field>
                            </div>
                        </div>
                    )}
                    {kind === "date" && (
                        <>
                            <div className="ez-row">
                                <div className="ez-grow ez-mr2">
                                    <Field label={t("format.dateInput")}>
                                        <Select value={f.date.input} options={DATE_INPUTS.map((v) => ({ value: v, label: t(`format.dateInput.${v}`) }))} onChange={(v) => set({ date: { ...f.date, input: v } })} />
                                    </Field>
                                </div>
                                <div className="ez-grow">
                                    <Field label={t("format.dateLang")}>
                                        <Select value={f.date.lang} options={[{ value: "ar", label: "العربية" }, { value: "en", label: "English" }]} onChange={(v) => set({ date: { ...f.date, lang: v } })} />
                                    </Field>
                                </div>
                            </div>
                            <Field label={t("format.dateOutput")}>
                                <Select value={f.date.output} options={DATE_OUTPUTS.map((v) => ({ value: v, label: v }))} onChange={(v) => set({ date: { ...f.date, output: v } })} />
                            </Field>
                        </>
                    )}
                    {kind === "phone" && (
                        <Field label={t("format.phoneStyle")}>
                            <Select value={f.phone} options={PHONE_STYLES.map((v) => ({ value: v, label: t(`format.phone.${v}`) }))} onChange={(v) => set({ phone: v })} />
                        </Field>
                    )}
                    <div className="ez-row">
                        <div className="ez-grow ez-mr2">
                            <Field label={t("format.case")}>
                                <Select value={f.case} options={CASE_STYLES.map((v) => ({ value: v, label: t(`format.case.${v}`) }))} onChange={(v) => set({ case: v })} />
                            </Field>
                        </div>
                        <div className="ez-grow">
                            <Field label={t("format.digits")}>
                                <Select value={f.digits} options={DIGIT_STYLES.map((v) => ({ value: v, label: t(`format.digits.${v}`) }))} onChange={(v) => set({ digits: v })} />
                            </Field>
                        </div>
                    </div>
                    <div className="ez-row">
                        <div className="ez-grow ez-mr2">
                            <Field label={t("format.prefix")}>
                                <TextInput value={f.prefix} onChange={(v) => set({ prefix: v })} />
                            </Field>
                        </div>
                        <div className="ez-grow">
                            <Field label={t("format.suffix")}>
                                <TextInput value={f.suffix} onChange={(v) => set({ suffix: v })} />
                            </Field>
                        </div>
                    </div>
                    <Checkbox checked={f.trim} onChange={(v) => set({ trim: v })} label={t("format.trim")} />
                    {preview && (
                        <div className={`ez-small ${preview.problem ? "ez-warn" : "ez-muted"}`} data-testid="format-preview">
                            {t("format.preview", { from: String(sample) || "—", to: preview.value || "—" })}
                            {preview.problem && ` · ${t(`format.problem.${preview.problem}`)}`}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
