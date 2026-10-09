// App-wide state: job reducer, session, account and pricing.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from "react";
import { initialState, reducer } from "./state.js";

const AppContext = createContext(null);
const SAVE_KEY = "elzoz.prefs.v1";

function loadPrefs() {
    try {
        return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
    } catch (e) {
        return {};
    }
}

export function AppProvider({ services, children }) {
    const [state, dispatch] = useReducer(reducer, undefined, () => initialState(loadPrefs()));
    const [session, setSession] = useState({ status: "loading", user: null, dev: false, error: null });
    const [account, setAccount] = useState(null);
    const [pricing, setPricing] = useState({});

    // Remember preferences (never files, tokens or data).
    useEffect(() => {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify({ mode: state.mode, settings: { ...state.settings, rowSelection: "" }, video: { ...state.video, tracks: {} } }));
        } catch (e) {
            /* storage unavailable */
        }
    }, [state.mode, state.settings, state.video]);

    const refreshAccount = useCallback(async () => {
        if (!services.credits || session.dev) return null;
        try {
            const [a, p] = await Promise.all([services.credits.getAccount(), services.credits.getPricing()]);
            setAccount(a);
            setPricing(p);
            return a;
        } catch (e) {
            setAccount((prev) => prev && { ...prev, stale: true });
            return null;
        }
    }, [services, session.dev]);

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!services.auth) {
                if (alive) setSession({ status: "signedOut", user: null, dev: false, error: null });
                return;
            }
            try {
                const s = await services.auth.restore();
                if (alive) setSession(s ? { status: "signedIn", user: s.user, dev: false, error: null } : { status: "signedOut", user: null, dev: false, error: null });
            } catch (e) {
                if (alive) setSession({ status: "signedOut", user: null, dev: false, error: e.message });
            }
        })();
        return () => {
            alive = false;
        };
    }, [services]);

    useEffect(() => {
        if (session.status === "signedIn") refreshAccount();
    }, [session.status, refreshAccount]);

    const value = useMemo(
        () => ({
            state,
            dispatch,
            services,
            session,
            account,
            pricing,
            refreshAccount,
            async signIn(email, password) {
                const s = await services.auth.signIn(email, password);
                setSession({ status: "signedIn", user: s.user, dev: false, error: null });
            },
            async signOut() {
                if (services.auth && !session.dev) await services.auth.signOut().catch(() => {});
                setAccount(null);
                setSession({ status: "signedOut", user: null, dev: false, error: null });
            },
            enterDevMode() {
                if (services.devAvailable) setSession({ status: "signedIn", user: { email: "developer" }, dev: true, error: null });
            }
        }),
        [state, services, session, account, pricing, refreshAccount]
    );
    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
