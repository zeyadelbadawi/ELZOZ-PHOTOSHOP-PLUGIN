// Smart columns editor (Data step): discount %, saving, has-discount, formatted price,
// combined text and fixed values, each previewed on the first data row.
import React, { useState } from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Alert, Button, Card, Field, Section, Select, TextInput } from "../../ui/components.jsx";
import { DERIVED_TYPES, derivedValue, newDerived, validateDerived } from "../../domain/derived.js";

const NUMBER_TYPES = ["saving", "price"];

export default function SmartColumns() {
    const { state, dispatch } = useApp();
    const { t } = useI18n();
    const [adding, setAdding] = useState("");
    const table = state.data.table;
    const defs = state.derived || [];
    const columns = table.headers.filter((h) => !h.derived).map((h) => ({ value: h.key, label: h.key }));
    const firstRow = table.rows.find((r) => !r.isEmpty);
    const set = (next) => dispatch({ type: "derived", derived: next });
    const update = (id, patch) => set(defs.map((d) => (d.id === id ? { ...d, ...patch } : d)));

    const add = () => {
        if (!adding) return;
        // Guess the price columns from their names ("Old price", "السعر قبل", "Price"…).
        const find = (re) => (columns.find((c) => re.test(c.value)) || {}).value || "";
        const oldColumn = find(/old|before|was|قبل|قديم|الأصلي/i);
        const newColumn = find(/new|now|after|sale|بعد|جديد|الحالي/i) || find(/price|سعر/i);
        const guess = ["discount", "saving", "hasDiscount"].includes(adding) ? { oldColumn, newColumn: newColumn !== oldColumn ? newColumn : "" } : adding === "price" ? { column: newColumn || find(/price|سعر/i) } : {};
        set([...defs, newDerived(adding, defs, { label: t(`derived.default.${adding}`), ...guess })]);
        setAdding("");
    };

    return (
        <Section title={t("derived.title")}>
            <div className="ez-small ez-muted ez-mb2">{t("derived.hint")}</div>
            {defs.map((d) => {
                const problems = validateDerived(d, table.headers.filter((h) => !h.derived));
                const sample = problems.length === 0 && firstRow ? derivedValue(d, firstRow).value : null;
                return (
                    <Card key={d.id} className="ez-derived">
                        <div className="ez-row ez-mb2">
                            <div className="ez-grow ez-strong">{t(`derived.type.${d.type}`)}</div>
                            <Button quiet onClick={() => set(defs.filter((x) => x.id !== d.id))}>
                                {t("derived.remove")}
                            </Button>
                        </div>
                        <Field label={t("derived.name")} hint={t("derived.nameHint")}>
                            <TextInput value={d.label} onChange={(v) => update(d.id, { label: v.replace(/[{}]/g, "") })} />
                        </Field>
                        {["discount", "saving", "hasDiscount"].includes(d.type) && (
                            <div className="ez-row">
                                <div className="ez-grow ez-mr2">
                                    <Field label={t("derived.oldPrice")}>
                                        <Select value={d.oldColumn} placeholder={t("map.none")} options={columns} onChange={(v) => update(d.id, { oldColumn: v })} />
                                    </Field>
                                </div>
                                <div className="ez-grow">
                                    <Field label={t("derived.newPrice")}>
                                        <Select value={d.newColumn} placeholder={t("map.none")} options={columns} onChange={(v) => update(d.id, { newColumn: v })} />
                                    </Field>
                                </div>
                            </div>
                        )}
                        {d.type === "discount" && (
                            <Field label={t("derived.style")}>
                                <Select value={d.style} options={["percent", "minus", "off", "save"].map((v) => ({ value: v, label: t(`derived.style.${v}`) }))} onChange={(v) => update(d.id, { style: v })} />
                            </Field>
                        )}
                        {d.type === "hasDiscount" && <div className="ez-small ez-muted ez-mb2">{t("derived.hasDiscountHint")}</div>}
                        {d.type === "price" && (
                            <Field label={t("derived.column")}>
                                <Select value={d.column} placeholder={t("map.none")} options={columns} onChange={(v) => update(d.id, { column: v })} />
                            </Field>
                        )}
                        {NUMBER_TYPES.includes(d.type) && (
                            <>
                                <div className="ez-row">
                                    <div className="ez-grow ez-mr2">
                                        <Field label={t("format.decimals")}>
                                            <Select
                                                value={String(d.number.decimals)}
                                                options={["auto", "0", "1", "2"].map((v) => ({ value: v, label: t(`format.decimals.${v}`) }))}
                                                onChange={(v) => update(d.id, { number: { ...d.number, decimals: v === "auto" ? "auto" : Number(v) } })}
                                            />
                                        </Field>
                                    </div>
                                    <div className="ez-grow">
                                        <Field label={t("format.thousands")}>
                                            <Select
                                                value={d.number.thousands ? "yes" : "no"}
                                                options={[{ value: "yes", label: "1,299" }, { value: "no", label: "1299" }]}
                                                onChange={(v) => update(d.id, { number: { ...d.number, thousands: v === "yes" } })}
                                            />
                                        </Field>
                                    </div>
                                </div>
                                <div className="ez-row">
                                    <div className="ez-grow ez-mr2">
                                        <Field label={t("format.prefix")}>
                                            <TextInput value={d.prefix} placeholder="EGP " onChange={(v) => update(d.id, { prefix: v })} />
                                        </Field>
                                    </div>
                                    <div className="ez-grow">
                                        <Field label={t("format.suffix")}>
                                            <TextInput value={d.suffix} placeholder=" ج.م" onChange={(v) => update(d.id, { suffix: v })} />
                                        </Field>
                                    </div>
                                </div>
                            </>
                        )}
                        {d.type === "combine" && (
                            <Field label={t("derived.template")} hint={t("derived.templateHint")}>
                                <TextInput value={d.template} placeholder="{Name} - {Size}" onChange={(v) => update(d.id, { template: v })} />
                            </Field>
                        )}
                        {d.type === "constant" && (
                            <Field label={t("derived.value")}>
                                <TextInput value={d.value} onChange={(v) => update(d.id, { value: v })} />
                            </Field>
                        )}
                        {problems.length > 0 ? (
                            <Alert tone="warning">{t(`derived.problem.${problems[0]}`)}</Alert>
                        ) : (
                            <div className="ez-small ez-muted" data-testid="derived-sample">
                                {t("map.example", { value: sample === "" ? t("derived.emptyValue") : sample })}
                            </div>
                        )}
                    </Card>
                );
            })}
            <div className="ez-row">
                <div className="ez-grow ez-mr2">
                    <Select value={adding} placeholder={t("derived.pick")} options={DERIVED_TYPES.map((v) => ({ value: v, label: t(`derived.type.${v}`) }))} onChange={setAdding} />
                </div>
                <Button disabled={!adding} onClick={add}>
                    {t("derived.add")}
                </Button>
            </div>
        </Section>
    );
}
