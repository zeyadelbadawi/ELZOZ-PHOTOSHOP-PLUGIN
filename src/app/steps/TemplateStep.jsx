import React, { useState } from "react";
import { useApp } from "../AppContext.jsx";
import { recallMapping } from "../state.js";

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
                // Offer the mapping last used with this template (folders are picked again).
                const recalled = state.data ? recallMapping(storage(), result, state.data.table.headers) : null;
                if (recalled) dispatch({ type: "mapping", mapping: recalled, restored: true });
            }
            else if (fn === services.useActiveDocument) setError(t("template.noActive"));
        } catch (e) {
            setError(t("error.generic", { message: e.message }));
        } finally {
            setBusy(false);
        }
    };

    const summary = tpl ? summarizeTemplate(tpl.layers) : null;
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
                    {summary.duplicateNames.length > 0 && <Alert tone="warning">{t("template.duplicates", { n: summary.duplicateNames.length })}</Alert>}
                </>
            )}
        </>
    );
}
