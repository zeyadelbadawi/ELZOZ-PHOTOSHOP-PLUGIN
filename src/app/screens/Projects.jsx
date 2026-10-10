// Saved projects (feature 15): save the current job, reopen it next time (new rows
// in the spreadsheet appear automatically), and generate only the new rows.
import React, { useState } from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Alert, Button, Card, Field, Section, Select, TextInput } from "../../ui/components.jsx";
import { deleteProject, listProjects, putProject } from "../../domain/projects.js";
import { lastRunKeys, openProject, saveProject } from "../projectIO.js";
import { effectiveTable } from "../state.js";

const storage = () => {
    try {
        return window.localStorage;
    } catch (e) {
        return null;
    }
};

const fmt = (ms, lang) => {
    try {
        return new Date(ms).toLocaleDateString(lang === "ar" ? "ar" : "en", { year: "numeric", month: "short", day: "numeric" });
    } catch (e) {
        return "";
    }
};

/** Guess a key column: SKU / code / id / كود columns first. */
export function guessKeyColumn(headers) {
    const h = headers.filter((x) => !x.derived).map((x) => x.key);
    return h.find((k) => /^(sku|key|id|code|barcode|كود|الكود|رقم|مسلسل)$/i.test(k.trim())) || h.find((k) => /sku|code|id\b|كود/i.test(k)) || "";
}

export default function Projects({ onClose }) {
    const { state, dispatch, services } = useApp();
    const { t, lang } = useI18n();
    const [projects, setProjects] = useState(() => (storage() ? listProjects(storage()) : []));
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const table = effectiveTable(state);
    const canSave = !!(state.data && state.template);
    const [name, setName] = useState(() => (state.project ? state.project.name : state.template ? state.template.title.replace(/\.(psd|psb)$/i, "") : ""));
    const [keyColumn, setKeyColumn] = useState(() => (state.project ? state.project.keyColumn : table ? guessKeyColumn(table.headers) : ""));
    const refresh = () => setProjects(listProjects(storage()));

    const save = async () => {
        setBusy("save");
        setError(null);
        try {
            // A first save right after a run counts that run's rows as generated.
            const justGenerated = state.project ? [] : lastRunKeys(state, table, keyColumn);
            const p = await saveProject({ storage: storage(), services, state, name, keyColumn, onlyNew: state.project ? state.project.onlyNew : true, justGenerated });
            if (!p) throw new Error(t("projects.storageFull"));
            dispatch({ type: "project", project: { id: p.id, name: p.name, keyColumn: p.keyColumn, onlyNew: p.onlyNew, done: p.done } });
            refresh();
            setNotice(t("projects.saved", { name: p.name }) + (justGenerated.length ? ` ${t("projects.savedDone", { n: Object.keys(p.done).length })}` : ""));
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(null);
        }
    };

    const open = async (id) => {
        setBusy(id);
        setError(null);
        try {
            const loaded = await openProject({ storage: storage(), services, id });
            dispatch({ type: "project-loaded", loaded });
            onClose(loaded.missing); // unmounts this screen
        } catch (e) {
            setError(t("error.generic", { message: e.message }));
            setBusy(null);
        }
    };

    const forget = (p) => {
        putProject(storage(), { ...p, done: {} });
        if (state.project && state.project.id === p.id) dispatch({ type: "project", project: { done: {} } });
        refresh();
    };

    return (
        <div className="ez-content">
            <div className="ez-row ez-mb2">
                <div className="ez-title ez-grow">{t("projects.title")}</div>
                <Button quiet onClick={() => onClose()}>
                    {t("account.close")}
                </Button>
            </div>
            <div className="ez-subtitle">{t("projects.subtitle")}</div>
            {error && <Alert tone="error">{error}</Alert>}
            {notice && <Alert tone="success">{notice}</Alert>}

            <Section title={state.project ? t("projects.update") : t("projects.saveCurrent")}>
                {canSave ? (
                    <Card>
                        <Field label={t("projects.name")}>
                            <TextInput value={name} placeholder={t("projects.namePlaceholder")} onChange={setName} />
                        </Field>
                        <Field label={t("projects.key")} hint={t("projects.keyHint")}>
                            <Select value={keyColumn} placeholder={t("projects.noKey")} options={(table ? table.headers : []).filter((h) => !h.derived).map((h) => ({ value: h.key, label: h.key }))} onChange={setKeyColumn} />
                        </Field>
                        <Button variant="primary" disabled={!name.trim() || busy === "save"} onClick={save}>
                            {busy === "save" ? "…" : state.project ? t("projects.updateBtn") : t("projects.saveBtn")}
                        </Button>
                    </Card>
                ) : (
                    <div className="ez-small ez-muted">{t("projects.needJob")}</div>
                )}
            </Section>

            <Section title={t("projects.saved.title", { n: projects.length })}>
                {!projects.length && <div className="ez-small ez-muted">{t("projects.empty")}</div>}
                {projects.map((p) => {
                    const done = Object.keys(p.done || {}).length;
                    const active = state.project && state.project.id === p.id;
                    return (
                        <Card key={p.id} className={`ez-project ${active ? "ez-project-active" : ""}`}>
                            <div className="ez-row">
                                <div className="ez-grow">
                                    <div className="ez-strong ez-ellipsis">
                                        {p.name}
                                        {active && <span className="ez-small ez-accent"> · {t("projects.open")}</span>}
                                    </div>
                                    <div className="ez-small ez-muted ez-ellipsis">
                                        {[p.sources && p.sources.data && p.sources.data.fileName, p.sources && p.sources.template && p.sources.template.title].filter(Boolean).join(" · ")}
                                    </div>
                                    <div className="ez-small ez-muted">
                                        {t("projects.meta", { date: fmt(p.updatedAt, lang), n: done })}
                                        {p.keyColumn ? ` · ${t("projects.keyShort", { key: p.keyColumn })}` : ""}
                                    </div>
                                </div>
                            </div>
                            <div className="ez-row ez-mt2">
                                <Button variant="primary" disabled={!!busy} onClick={() => open(p.id)}>
                                    {busy === p.id ? "…" : t("projects.openBtn")}
                                </Button>
                                <div className="ez-grow" />
                                {done > 0 && (
                                    <Button quiet onClick={() => forget(p)}>
                                        {t("projects.forget")}
                                    </Button>
                                )}
                                {confirmDelete === p.id ? (
                                    <Button
                                        quiet
                                        variant="warning"
                                        onClick={() => {
                                            deleteProject(storage(), p.id);
                                            if (active) dispatch({ type: "project", project: null });
                                            setConfirmDelete(null);
                                            refresh();
                                        }}
                                    >
                                        {t("projects.deleteSure")}
                                    </Button>
                                ) : (
                                    <Button quiet onClick={() => setConfirmDelete(p.id)}>
                                        {t("projects.delete")}
                                    </Button>
                                )}
                            </div>
                        </Card>
                    );
                })}
            </Section>
        </div>
    );
}
