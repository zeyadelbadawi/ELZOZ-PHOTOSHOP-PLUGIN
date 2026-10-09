import React, { useState } from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Alert, Button, Field, TextInput } from "../../ui/components.jsx";
import { websiteUrl } from "../../config/supabase-config.js";

export default function SignIn() {
    const { services, signIn, enterDevMode, session } = useApp();
    const { t, lang, setLang } = useI18n();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(session.error);
    const [notice, setNotice] = useState(null);

    const submit = async () => {
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            await signIn(email, password);
        } catch (e) {
            setError(e.message);
            setBusy(false);
        }
    };

    const reset = async () => {
        if (!email) {
            setError(t("signin.email"));
            return;
        }
        try {
            await services.auth.requestPasswordReset(email);
            setNotice(t("signin.resetSent", { email }));
        } catch (e) {
            setError(e.message);
        }
    };

    return (
        <div className="ez-content">
            <div className="ez-center">
                <div className="ez-row ez-mb2">
                    <div className="ez-brand ez-grow">
                        Elzoz<span className="ez-brand-dot">.</span>
                    </div>
                    <Button quiet onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
                        {lang === "ar" ? "English" : "العربية"}
                    </Button>
                </div>
                <div className="ez-title">{t("signin.title")}</div>
                <div className="ez-subtitle">{t("signin.subtitle")}</div>

                {!services.configured ? (
                    <>
                        <Alert tone="warning" title={t("signin.notConfigured")} />
                        {services.devAvailable && (
                            <>
                                <Button variant="primary" onClick={enterDevMode}>
                                    {t("signin.devContinue")}
                                </Button>
                                <div className="ez-small ez-muted ez-mt2">{t("app.devMode")}</div>
                            </>
                        )}
                    </>
                ) : (
                    <>
                        {error && <Alert tone="error">{error}</Alert>}
                        {notice && <Alert tone="success">{notice}</Alert>}
                        <Field label={t("signin.email")}>
                            <TextInput value={email} onChange={setEmail} placeholder="name@company.com" />
                        </Field>
                        <Field label={t("signin.password")}>
                            <TextInput type="password" value={password} onChange={setPassword} />
                        </Field>
                        <Button variant="cta" onClick={submit} disabled={busy || !email || !password}>
                            {busy ? t("signin.working") : t("signin.submit")}
                        </Button>
                        <div className="ez-mt3">
                            <Button quiet onClick={reset}>
                                {t("signin.forgot")}
                            </Button>
                        </div>
                        <div className="ez-small ez-muted ez-mt3">
                            {websiteUrl ? (
                                <span className="ez-link" onClick={() => services.openExternal(websiteUrl)}>
                                    {t("signin.noAccount")}
                                </span>
                            ) : (
                                t("signin.noAccount")
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
