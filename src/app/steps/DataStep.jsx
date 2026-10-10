import React, { useState } from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Alert, Button, Card, Field, FileField, NumberInput, Section, Select, TextInput } from "../../ui/components.jsx";
import { parseSheetLink } from "../../domain/googleSheets.js";
import { detectStore, prepareStoreTable } from "../../domain/stores.js";
import { effectiveTable } from "../state.js";
import SmartColumns from "./SmartColumns.jsx";

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
            setError(e.code === "unreadable_workbook" ? t("data.unreadable") : t("error.generic", { message: e.message }));
        } finally {
            setBusy(false);
        }
    };

    const [sheetUrl, setSheetUrl] = useState("");
    const sheetLinkOk = !sheetUrl.trim() || !!parseSheetLink(sheetUrl);
    const loadSheet = async (url, keep = null) => {
        setBusy(true);
        setError(null);
        try {
            const picked = await services.loadGoogleSheet(url);
            if (keep && picked.sheetNames.includes(keep.sheetName)) {
                // Reload: same tab and header row; a prepared store export is prepared again.
                let table = services.readSheet(picked.workbook, keep.sheetName, keep.headerRow);
                let extra = {};
                const store = keep.store ? detectStore(table.headers) : null;
                if (store && store.id === keep.store) {
                    const prepared = prepareStoreTable(table, store);
                    extra = { rawTable: table, store: store.id, storeNote: prepared.note };
                    table = prepared.table;
                }
                dispatch({ type: "data", data: { ...picked, sheetName: keep.sheetName, headerRow: keep.headerRow, table, ...extra } });
            } else load(picked, picked.sheetNames[0], 1);
            setSheetUrl("");
        } catch (e) {
            setError(e.code === "unreadable_workbook" ? t("data.unreadable") : e.message);
        } finally {
            setBusy(false);
        }
    };
    const fromSheet = data && data.source && data.source.kind === "gsheet";

    const dataRows = data ? data.table.rows.filter((r) => !r.isEmpty).length : 0;
    return (
        <>
            <div className="ez-title">{t("data.title")}</div>
            <div className="ez-subtitle">{t("data.subtitle")}</div>
            {error && <Alert tone="error">{error}</Alert>}
            <Section>
                <FileField
                    name={data && data.fileName}
                    meta={data && (fromSheet ? t("gsheet.meta", { rows: dataRows, cols: data.table.headers.length }) : t("data.meta", { rows: dataRows, cols: data.table.headers.length }))}
                    emptyLabel={t("data.empty")}
                    actionLabel={data ? t("data.change") : t("data.pick")}
                    onPick={pick}
                    busy={busy}
                />
                {fromSheet && (
                    <div className="ez-row ez-mt2">
                        <Button quiet disabled={busy} onClick={() => loadSheet(data.source.url, data)}>
                            {t("gsheet.reload")}
                        </Button>
                        <div className="ez-small ez-muted ez-ml2">{t("gsheet.reloadHint")}</div>
                    </div>
                )}
                <div className="ez-gsheet" data-testid="gsheet">
                    <Field label={t("gsheet.label")} hint={sheetLinkOk ? t("gsheet.hint") : t("gsheet.notLink")}>
                        <div className="ez-row">
                            <div className="ez-grow">
                                <TextInput value={sheetUrl} placeholder="https://docs.google.com/spreadsheets/d/…" onChange={setSheetUrl} />
                            </div>
                            <div className="ez-mr2" />
                            <Button disabled={busy || !sheetUrl.trim() || !sheetLinkOk} onClick={() => loadSheet(sheetUrl)}>
                                {t("gsheet.load")}
                            </Button>
                        </div>
                    </Field>
                </div>
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
                    {state.derivedDropped && (
                        <Alert tone="info" action={<span className="ez-link" onClick={() => dispatch({ type: "derived-dropped-seen" })}>✕</span>}>
                            {t("derived.dropped", { list: state.derivedDropped.join(", ") })}
                        </Alert>
                    )}
                    <StoreCard />
                    {data.table.headers.length > 0 && (
                        <Section title={t("data.preview")}>
                            <Preview table={effectiveTable(state)} />
                        </Section>
                    )}
                    {data.table.headers.length > 0 && <SmartColumns />}
                </>
            )}
        </>
    );
}

/** A Shopify / WooCommerce / Salla / Zid product export: one click to make it design-ready. */
function StoreCard() {
    const { state, dispatch } = useApp();
    const { t } = useI18n();
    const data = state.data;
    if (data.store) {
        const n = data.storeNote;
        return (
            <Alert
                tone="success"
                title={t("store.prepared", { store: n.store })}
                action={
                    <Button quiet onClick={() => dispatch({ type: "data", data: { ...data, table: data.rawTable, rawTable: undefined, store: undefined, storeNote: undefined } })}>
                        {t("store.undo")}
                    </Button>
                }
            >
                <div data-testid="store-note">
                    {t("store.preparedInfo", { products: n.products })}
                    {n.merged > 0 && ` ${t("store.merged", { n: n.merged })}`}
                    {n.sale > 0 && ` ${t("store.sale", { n: n.sale })}`}
                </div>
            </Alert>
        );
    }
    const store = detectStore(data.table.headers);
    if (!store) return null;
    const prepare = () => {
        const { table, note } = prepareStoreTable(data.table, store);
        dispatch({ type: "data", data: { ...data, rawTable: data.table, table, store: store.id, storeNote: note } });
    };
    return (
        <Section title={t("store.title", { store: store.label })}>
            <Card className="ez-kit">
                <div className="ez-small ez-mb2">{t("store.about")}</div>
                <ul className="ez-small ez-muted ez-list">
                    <li>{t("store.one")}</li>
                    <li>{t("store.two")}</li>
                    <li>{t("store.three")}</li>
                    <li>{t("store.four")}</li>
                </ul>
                <Button variant="primary" onClick={prepare}>
                    {t("store.prepare")}
                </Button>
            </Card>
        </Section>
    );
}
