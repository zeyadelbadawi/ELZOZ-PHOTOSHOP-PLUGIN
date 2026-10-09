import React, { useState } from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Alert, Field, FileField, NumberInput, Section, Select } from "../../ui/components.jsx";

function Preview({ table }) {
    const headers = table.headers;
    const rows = table.rows.filter((r) => !r.isEmpty).slice(0, 5);
    return (
        <div className="ez-table-wrap">
            <div className="ez-table-row ez-table-head">
                <div className="ez-cell ez-cell-num">#</div>
                {headers.map((h) => (
                    <div key={h.key} className="ez-cell" title={h.key}>
                        {h.key}
                    </div>
                ))}
            </div>
            {rows.map((r) => (
                <div key={r.sourceRow} className="ez-table-row">
                    <div className="ez-cell ez-cell-num">{r.sourceRow}</div>
                    {headers.map((h) => (
                        <div key={h.key} className="ez-cell" title={r.values[h.key]}>
                            {r.values[h.key]}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

export default function DataStep() {
    const { state, dispatch, services } = useApp();
    const { t } = useI18n();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const data = state.data;

    const load = (picked, sheetName, headerRow) => {
        const table = services.readSheet(picked.workbook, sheetName, headerRow);
        dispatch({ type: "data", data: { ...picked, sheetName, headerRow, table } });
    };

    const pick = async () => {
        setBusy(true);
        setError(null);
        try {
            const picked = await services.pickSpreadsheet();
            if (picked) load(picked, picked.sheetNames[0], 1);
        } catch (e) {
            setError(t("error.generic", { message: e.message }));
        } finally {
            setBusy(false);
        }
    };

    const dataRows = data ? data.table.rows.filter((r) => !r.isEmpty).length : 0;
    return (
        <>
            <div className="ez-title">{t("data.title")}</div>
            <div className="ez-subtitle">{t("data.subtitle")}</div>
            {error && <Alert tone="error">{error}</Alert>}
            <Section>
                <FileField
                    name={data && data.fileName}
                    meta={data && t("data.meta", { rows: dataRows, cols: data.table.headers.length })}
                    emptyLabel={t("data.empty")}
                    actionLabel={data ? t("data.change") : t("data.pick")}
                    onPick={pick}
                    busy={busy}
                />
            </Section>
            {data && (
                <>
                    <div className="ez-row">
                        {data.sheetNames.length > 1 && (
                            <div className="ez-grow ez-mr2">
                                <Field label={t("data.sheet")}>
                                    <Select value={data.sheetName} onChange={(v) => load(data, v, data.headerRow)} options={data.sheetNames.map((s) => ({ value: s, label: s }))} />
                                </Field>
                            </div>
                        )}
                        <div style={{ width: "90px" }}>
                            <Field label={t("data.headerRow")}>
                                <NumberInput value={data.headerRow} min={1} max={50} onChange={(n) => n >= 1 && load(data, data.sheetName, Math.round(n))} />
                            </Field>
                        </div>
                    </div>
                    {data.table.issues.map((i, k) => (
                        <Alert key={k} tone={i.severity === "error" ? "error" : "warning"}>
                            {i.message}
                        </Alert>
                    ))}
                    {data.table.headers.length > 0 && (
                        <Section title={t("data.preview")}>
                            <Preview table={data.table} />
                        </Section>
                    )}
                </>
            )}
        </>
    );
}
