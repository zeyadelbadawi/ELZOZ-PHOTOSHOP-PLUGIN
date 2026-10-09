import React, { Component } from "react";
import { AppProvider, useApp } from "./AppContext.jsx";
import { I18nProvider, useI18n } from "./i18n.jsx";
import SignIn from "./screens/SignIn.jsx";
import Shell from "./screens/Shell.jsx";
import "../ui/theme.css";

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
        return { error };
    }
    render() {
        if (this.state.error) {
            return (
                <div className="ez-content">
                    <div className="ez-alert ez-alert-error">
                        <div className="ez-grow">
                            <div className="ez-alert-title">Elzoz hit an unexpected error.</div>
                            <div className="ez-small">{String(this.state.error.message || this.state.error)}</div>
                            <div className="ez-small ez-mt2">Reload the plugin from the panel menu. Your template file was not modified.</div>
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

function Root() {
    const { session } = useApp();
    const { rtl } = useI18n();
    return (
        <div className={`ez-app ${rtl ? "ez-rtl" : ""}`} dir={rtl ? "rtl" : "ltr"} lang={rtl ? "ar" : "en"}>
            {session.status === "loading" ? <div className="ez-content ez-muted">…</div> : session.status === "signedIn" ? <Shell /> : <SignIn />}
        </div>
    );
}

export default function App({ services }) {
    return (
        <ErrorBoundary>
            <I18nProvider>
                <AppProvider services={services}>
                    <Root />
                </AppProvider>
            </I18nProvider>
        </ErrorBoundary>
    );
}
