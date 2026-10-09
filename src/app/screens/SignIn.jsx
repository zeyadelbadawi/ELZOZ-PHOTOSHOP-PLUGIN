import React, { useState } from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Alert, Button, Field, TextInput } from "../../ui/components.jsx";
import { contactUrl } from "../../config/supabase-config.js";

export default function SignIn() {
    const { services, signIn, enterDevMode, session } = useApp();
    const { t, lang, setLang } = useI18n();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(session.error);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            await signIn(email, password);
        } catch (e) {
            setError(e.message);
            setBusy(false);
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
                        <Field label={t("signin.email")}>
                            <TextInput value={email} onChange={setEmail} placeholder="name@company.com" />
                        </Field>
                        <Field label={t("signin.password")}>
                            <TextInput type="password" value={password} onChange={setPassword} />
                        </Field>
                        <Button variant="cta" onClick={submit} disabled={busy || !email || !password}>
                            {busy ? t("signin.working") : t("signin.submit")}
                        </Button>
                        {/* Accounts, top-ups and new passwords come from the seller (admin dashboard). */}
                        <div className="ez-small ez-muted ez-mt3">{t("signin.noAccount")}</div>
                        <div className="ez-small ez-muted ez-mt1">{t("signin.forgot")}</div>
                        {contactUrl && (
                            <div className="ez-mt2">
                                <Button quiet onClick={() => services.openExternal(contactUrl)}>
                                    {t("signin.contact")}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
