// Check step: images from links are downloaded automatically before anything
// can be generated, with progress, a summary of what failed and why, and a retry.
import React, { useEffect, useRef, useState } from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Alert, Button, Card, ProgressBar, Section } from "../../ui/components.jsx";
import { LINK_FOLDER_KEY, linksNeeded } from "../../domain/linkImages.js";
import { effectiveTable } from "../state.js";

export default function LinkDownloads() {
    const { state, dispatch, services } = useApp();
    const { t } = useI18n();
    const table = effectiveTable(state);
    const needed = table ? linksNeeded(table.rows, state.mapping) : [];
    const current = state.folders[LINK_FOLDER_KEY];
    const known = (current && current.downloads) || {};
    const missing = needed.filter((u) => !known[u]);
    const failed = needed.filter((u) => known[u] && known[u].error);
    const [progress, setProgress] = useState(null); // {done, total, failed} while downloading
    const [error, setError] = useState(null);
    const busy = useRef(false);

    const run = async (keep) => {
        if (busy.current) return;
        busy.current = true;
        setError(null);
        try {
            const r = await services.downloadLinks(needed, { known: keep, onProgress: setProgress });
            dispatch({ type: "folder", key: r.key, folder: r.folder });
        } catch (e) {
            setError(e.message);
        } finally {
            busy.current = false;
            setProgress(null);
        }
    };

    // Start by itself when links are missing (new rows, a changed column, a reopened project).
    useEffect(() => {
        if (missing.length && !busy.current && !error) run(known);
    }, [missing.length]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!needed.length) return null;
    const ok = needed.length - failed.length - missing.length;
    return (
        <Section title={t("links.title")}>
            <Card>
                {progress ? (
                    <>
                        <div className="ez-small ez-mb2" data-testid="links-progress">
                            {t("links.downloading", { done: progress.done, total: progress.total })}
                        </div>
                        <ProgressBar value={progress.total ? progress.done / progress.total : 0} />
                    </>
                ) : (
                    <div className="ez-small" data-testid="links-summary">
                        {t("links.summary", { ok, total: needed.length })}
                        {failed.length > 0 && <span className="ez-warn"> · {t("links.failed", { n: failed.length })}</span>}
                    </div>
                )}
                {error && <Alert tone="error">{error}</Alert>}
                {!progress && (failed.length > 0 || error || missing.length > 0) && (
                    <div className="ez-mt2">
                        <Button
                            onClick={() => {
                                // Forget failures (and keep what worked), then try again.
                                const keep = Object.fromEntries(Object.entries(known).filter(([, v]) => v.file));
                                setError(null);
                                run(keep);
                            }}
                        >
                            {t("links.retry")}
                        </Button>
                    </div>
                )}
                <div className="ez-small ez-muted ez-mt2">{t("links.hint")}</div>
            </Card>
        </Section>
    );
}
