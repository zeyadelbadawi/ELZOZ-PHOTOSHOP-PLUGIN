// Shared dashboard helpers (context, async loader, error box, formatting).
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { errorText } from "./i18n.js";

export const Ctx = createContext(null);
export const useT = () => useContext(Ctx);
export const PAGE = 25;

export function fmtDate(iso, lang, withTime = false) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { year: "numeric", month: "short", day: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
}
export const daysUntil = (iso) => Math.ceil((new Date(iso) - Date.now()) / 86400000);
export const num = (v) => Number(v || 0).toLocaleString("en-US");

export function useAsync(fn, deps) {
    const [state, setState] = useState({ loading: true, data: null, error: null });
    const run = useCallback(() => {
        setState((s) => ({ ...s, loading: true, error: null }));
        return fn().then(
            (data) => setState({ loading: false, data, error: null }),
            (error) => setState({ loading: false, data: null, error })
        );
    }, deps); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        run();
    }, [run]);
    return [state, run];
}

export function ErrorBox({ error }) {
    const { t, lang, onSignedOut } = useT();
    useEffect(() => {
        if (error && error.code === "signed_out") onSignedOut();
    }, [error, onSignedOut]);
    if (!error) return null;
    return (
        <div className="alert alert-error" role="alert">
            {errorText(lang, error)}
        </div>
    );
}


/**
 * Confirmation dialog with an optional "notify the client on WhatsApp" checkbox (checked by default).
 * const [dialog, ask] = useConfirm();  ...  const r = await ask(text, { notify: true });  // null = cancelled
 * Render {dialog} once in the component.
 */
export function useConfirm() {
    const { t } = useT();
    const [state, setState] = useState(null);
    const ask = useCallback(
        (message, { notify = false, danger = false } = {}) =>
            new Promise((resolve) => setState({ message, withNotify: notify, notify: true, danger, resolve })),
        []
    );
    const close = (result) => {
        state.resolve(result);
        setState(null);
    };
    const dialog = state ? (
        <div className="modal-backdrop" role="presentation" onClick={() => close(null)}>
            <div className="modal card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <p className="modal-text">{state.message}</p>
                {state.withNotify && (
                    <label className="check" data-testid="notify-check">
                        <input type="checkbox" checked={state.notify} onChange={(e) => setState({ ...state, notify: e.target.checked })} />
                        <span>
                            {t("notifyClient")}
                            <span className="muted small block">{state.notify ? t("notifyOn") : t("notifyOff")}</span>
                        </span>
                    </label>
                )}
                <div className="row gap end">
                    <button className="btn" onClick={() => close(null)}>
                        {t("cancel")}
                    </button>
                    <button className={`btn ${state.danger ? "btn-danger" : "btn-primary"}`} autoFocus onClick={() => close({ notify: state.withNotify ? state.notify : true })}>
                        {t("confirm")}
                    </button>
                </div>
            </div>
        </div>
    ) : null;
    return [dialog, ask];
}
