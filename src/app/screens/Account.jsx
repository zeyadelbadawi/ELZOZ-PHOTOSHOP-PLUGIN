import React, { useEffect, useState } from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Alert, Button, Card, Section, Stat } from "../../ui/components.jsx";
import { websiteUrl } from "../../config/supabase-config.js";

const fmtDate = (s, lang) => {
    try {
        return new Date(s).toLocaleString(lang === "ar" ? "ar" : "en");
    } catch (e) {
        return s;
    }
};

export default function Account({ onClose }) {
    const { services, session, account, refreshAccount, signOut } = useApp();
    const { t, lang, setLang } = useI18n();
    const [ledger, setLedger] = useState(null);
    const [jobs, setJobs] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (session.dev || !services.credits) return;
        refreshAccount();
        Promise.all([services.credits.getLedger(30), services.credits.getJobs(10)])
            .then(([l, j]) => {
                setLedger(l);
                setJobs(j);
            })
            .catch((e) => setError(e.message));
    }, [services, session.dev, refreshAccount]);

    return (
        <div className="ez-content">
            <div className="ez-row ez-mb2">
                <div className="ez-title ez-grow">{t("account.title")}</div>
                <Button quiet onClick={onClose}>
                    {t("account.close")}
                </Button>
            </div>
            <div className="ez-muted ez-mb2">{session.user && session.user.email}</div>
            {session.dev && <Alert tone="warning">{t("app.devMode")}</Alert>}
            {error && <Alert tone="error">{error}</Alert>}

            {account && (
                <div className="ez-stats">
                    <Stat label={t("account.available")} value={account.available} />
                    <Stat label={t("account.reserved")} value={account.reserved} />
                </div>
            )}
            {websiteUrl && !session.dev && (
                <div className="ez-mb3">
                    <Button variant="primary" onClick={() => services.openExternal(websiteUrl)}>
                        {t("account.buy")}
                    </Button>
                </div>
            )}

            {!session.dev && (
                <>
                    <Section title={t("account.history")}>
                        <Card>
                            {ledger && ledger.length === 0 && <div className="ez-muted">{t("account.none")}</div>}
                            {(ledger || []).map((e) => (
                                <div key={e.id} className="ez-result">
                                    <div className="ez-grow">
                                        <div>{t(`ledger.${e.kind}`)}</div>
                                        <div className="ez-small ez-muted">
                                            {fmtDate(e.created_at, lang)}
                                            {e.item_key ? ` · ${e.item_key}` : ""}
                                        </div>
                                    </div>
                                    <div className={Number(e.amount) < 0 ? "" : "ez-badge-success"} style={{ border: "none" }}>
                                        {Number(e.amount) > 0 ? `+${e.amount}` : e.amount}
                                    </div>
                                </div>
                            ))}
                        </Card>
                    </Section>
                    <Section title={t("account.jobs")}>
                        <Card>
                            {jobs && jobs.length === 0 && <div className="ez-muted">{t("account.none")}</div>}
                            {(jobs || []).map((j) => (
                                <div key={j.id} className="ez-result">
                                    <div className="ez-grow">
                                        <div>
                                            {j.kind === "video" ? t("app.video") : t("app.designs")} · {j.planned_items}
                                        </div>
                                        <div className="ez-small ez-muted">
                                            {fmtDate(j.created_at, lang)} · {j.status}
                                        </div>
                                    </div>
                                    <div>−{j.charged_total}</div>
                                </div>
                            ))}
                        </Card>
                    </Section>
                </>
            )}

            <div className="ez-row ez-mt3">
                <Button quiet onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
                    {t("account.language")}
                </Button>
                <div className="ez-grow" />
                <Button variant="warning" onClick={signOut}>
                    {t("account.signOut")}
                </Button>
            </div>
        </div>
    );
}
