// Screens shown instead of the app when the plugin must update (feature 2) or
// when this computer is over the account's limit (feature 1), plus the
// "update available" banner.
import React, { useState } from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Alert, Button, Card } from "../../ui/components.jsx";
import { contactUrl } from "../../config/supabase-config.js";

const fmtDate = (iso, lang) => {
    try {
        return new Date(iso).toLocaleString(lang === "ar" ? "ar" : "en", { dateStyle: "medium", timeStyle: "short" });
    } catch (e) {
        return String(iso);
    }
};

function Frame({ title, children }) {
    const { signOut } = useApp();
    const { t } = useI18n();
    return (
        <div className="ez-content ez-gate">
            <div className="ez-brand ez-mb2">
                Elzoz<span className="ez-brand-dot">.</span>
            </div>
            <div className="ez-title">{title}</div>
            {children}
            <div className="ez-mt3">
                <Button quiet onClick={signOut}>
                    {t("account.signOut")}
                </Button>
            </div>
        </div>
    );
}

export function UpdateRequired() {
    const { gate, services } = useApp();
    const { t } = useI18n();
    const u = gate.update;
    const url = u.update_url || contactUrl;
    return (
        <Frame title={t("gate.update.title")}>
            <div className="ez-subtitle">{t("gate.update.body", { min: u.min_version, current: services.pluginVersion || "" })}</div>
            {u.update_message && <Alert tone="info">{u.update_message}</Alert>}
            <Card>
                <ol className="ez-small ez-list">
                    <li>{t("gate.update.step1")}</li>
                    <li>{t("gate.update.step2")}</li>
                    <li>{t("gate.update.step3")}</li>
                </ol>
                {url && (
                    <Button variant="cta" onClick={() => services.openExternal(url)}>
                        {u.update_url ? t("gate.update.download") : t("gate.update.ask")}
                    </Button>
                )}
            </Card>
            <div className="ez-small ez-muted ez-mt2">{t("gate.update.safe")}</div>
        </Frame>
    );
}

export function DeviceLimit() {
    const { gate, switchDevice, services } = useApp();
    const { t, lang } = useI18n();
    const d = gate.device;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const move = async () => {
        setBusy(true);
        setError(null);
        try {
            const r = await switchDevice(); // on success this screen closes
            if (!r || r.status !== "ok") setBusy(false);
        } catch (e) {
            setError(e.message);
            setBusy(false);
        }
    };
    return (
        <Frame title={t("gate.device.title")}>
            <div className="ez-subtitle">{t("gate.device.body", { n: d.limit })}</div>
            <Card>
                <div className="ez-label">{t("gate.device.list")}</div>
                {(d.devices || []).map((x) => (
                    <div key={x.id} className="ez-row ez-mb2" data-testid="gate-device">
                        <div className="ez-grow">
                            <div className="ez-strong ez-ellipsis">{x.name || t("gate.device.unnamed")}</div>
                            <div className="ez-small ez-muted">{t("gate.device.lastSeen", { date: fmtDate(x.last_seen, lang) })}</div>
                        </div>
                    </div>
                ))}
            </Card>
            {error && <Alert tone="error">{error}</Alert>}
            {d.can_switch ? (
                <Card>
                    <div className="ez-small ez-mb2">{t("gate.device.switchInfo")}</div>
                    <Button variant="cta" disabled={busy} onClick={move}>
                        {busy ? "…" : t("gate.device.switch")}
                    </Button>
                </Card>
            ) : (
                <Alert tone="warning">{t("gate.device.wait", { date: fmtDate(d.next_switch_at, lang) })}</Alert>
            )}
            {contactUrl && (
                <div className="ez-mt2">
                    <Button quiet onClick={() => services.openExternal(contactUrl)}>
                        {t("gate.device.contact")}
                    </Button>
                </div>
            )}
        </Frame>
    );
}

/** In the app: a newer version exists (not required yet). */
export function UpdateBanner() {
    const { gate, services } = useApp();
    const { t } = useI18n();
    const [hidden, setHidden] = useState(false);
    if (hidden || !gate || !gate.update || !gate.update.available || gate.update.required) return null;
    const url = gate.update.update_url || contactUrl;
    return (
        <Alert
            tone="info"
            title={t("gate.banner", { v: gate.update.latest_version })}
            action={
                <span className="ez-link" onClick={() => setHidden(true)}>
                    ✕
                </span>
            }
        >
            {gate.update.update_message && <div className="ez-small">{gate.update.update_message}</div>}
            {url && (
                <span className="ez-link" onClick={() => services.openExternal(url)}>
                    {t("gate.update.download")}
                </span>
            )}
        </Alert>
    );
}
