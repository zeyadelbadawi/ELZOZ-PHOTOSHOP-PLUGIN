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

