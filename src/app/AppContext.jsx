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
    // Update and device status from the server (features 1 and 2); null until checked.
    const [gate, setGate] = useState(null);

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

    const recheck = useCallback(async () => {
        if (!services.checkIn || session.dev) return null;
        try {
            const g = await services.checkIn();
            setGate(g);
            return g;
        } catch (e) {
            return null; // offline: the server still checks when a job starts
        }
    }, [services, session.dev]);

    useEffect(() => {
        if (session.status === "signedIn") recheck();
        else setGate(null);
    }, [session.status, recheck]);

    const value = useMemo(
        () => ({
            state,
            dispatch,
            services,
            session,
            account,
            pricing,
            refreshAccount,
            gate,
            recheck,
            async switchDevice() {
                const r = await services.switchDevice();
                await recheck();
                return r;
            },
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
        [state, services, session, account, pricing, refreshAccount, gate, recheck]
    );
    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
