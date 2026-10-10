import React, { useState } from "react";
import { useApp } from "../AppContext.jsx";
import { effectiveTable, recallMemory } from "../state.js";
import { mappedCount, pruneMapping } from "../../domain/mapping.js";

const storage = () => {
    try {
        return window.localStorage;
    } catch (e) {
        return null;
    }
};
import { useI18n } from "../i18n.jsx";
import { Alert, Button, FileField, Section, Stat } from "../../ui/components.jsx";
import { summarizeTemplate } from "../../domain/layers.js";
import { artboardSize, leadLayers } from "../../domain/artboards.js";

export default function TemplateStep() {
    const { state, dispatch, services } = useApp();
    const { t } = useI18n();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const tpl = state.template;
    const caps = services.caps;

    const run = async (fn) => {
        setBusy(true);
        setError(null);
        try {
            const result = await fn();
            if (result) {
                dispatch({ type: "template", template: result });
                // The current mapping survives when the same template is picked again (e.g. a
                // moved file of an open project): keep it, with its folders. Otherwise offer
                // the mapping last used with this template (folders are picked again).
                const kept = state.data ? pruneMapping(state.mapping, effectiveTable(state).headers, result.layers) : null;
                const recalled = state.data && !(kept && mappedCount(kept) > 0) ? recallMemory(storage(), result, state.data.table) : null;
                if (recalled) {
                    if (recalled.derived.length && !(state.derived || []).length) dispatch({ type: "derived", derived: recalled.derived });
                    dispatch({ type: "mapping", mapping: recalled.mapping, restored: true });
                }
            }
            else if (fn === services.useActiveDocument) setError(t("template.noActive"));
        } catch (e) {
            setError(t("error.generic", { message: e.message }));
        } finally {
            setBusy(false);
        }
    };

    const boards = (tpl && tpl.artboards) || [];
    const summary = tpl ? summarizeTemplate(boards.length ? leadLayers(tpl.layers, boards) : tpl.layers) : null;
    return (
        <>
            <div className="ez-title">{t("template.title")}</div>
            <div className="ez-subtitle">{t("template.subtitle")}</div>
            {!caps.hostSupported && <Alert tone="error">{t("compat.unsupported", { v: caps.photoshopVersion })}</Alert>}
            {caps.hostSupported && !caps.domText && <Alert tone="info">{t("compat.textFallback", { v: caps.photoshopVersion })}</Alert>}
            {error && <Alert tone="error">{error}</Alert>}
            <Section>
                <FileField
                    name={tpl && tpl.title}
                    meta={tpl && t("template.meta", { w: Math.round(tpl.width), h: Math.round(tpl.height), layers: tpl.layers.length })}
                    emptyLabel={t("template.empty")}
                    actionLabel={t("template.pick")}
                    onPick={() => run(services.pickTemplate)}
                    busy={busy}
                />
                <div className="ez-mt2">
                    <Button quiet onClick={() => run(services.useActiveDocument)} disabled={busy}>
                        {t("template.useActive")}
                    </Button>
                </div>
            </Section>
            {summary && (
                <>
                    <div className="ez-stats">
                        <Stat label={t("template.text")} value={summary.text.length} />
                        <Stat label={t("template.images")} value={summary.images.length} />
                        <Stat label={t("template.groups")} value={summary.groups} />
                    </div>
                    {boards.length > 0 && (
                        <Alert tone="info" title={t("artboards.found", { n: boards.length })}>
                            <div data-testid="artboards-list">
                                {boards.map((a) => `${a.name} (${artboardSize(a).width} × ${artboardSize(a).height})`).join(" · ")}
                            </div>
                            <div className="ez-small">{t(boards.length > 1 ? "artboards.howMany" : "artboards.one")}</div>
                        </Alert>
                    )}
                    {summary.duplicateNames.length > 0 && <Alert tone="warning">{t("template.duplicates", { n: summary.duplicateNames.length })}</Alert>}
                </>
            )}
        </>
    );
}
