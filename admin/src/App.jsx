import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, configured, currentEmail, restore, signIn, signOut } from "./api.js";
import { errorText, translate } from "./i18n.js";
import { Ctx, ErrorBox, PAGE, daysUntil, fmtDate, num, useAsync, useT } from "./ui.jsx";
import Sales from "./Sales.jsx";

function CopyButton({ text, label }) {
    const { t } = useT();
    const [done, setDone] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            const ta = document.createElement("textarea");
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 2000);
    };
    return (
        <button type="button" className="btn btn-primary" onClick={copy}>
            {done ? t("copied") : label}
        </button>
    );
}

/** Shown once after creating a client or resetting a password. */
function CredentialsCard({ email, password, credits, until, onClose }) {
    const { t } = useT();
    const message = t("message", { email, password, credits: credits ?? "—", until: until || "—" });
    return (
        <div className="card card-success" data-testid="credentials">
            <h3>{t("credentials")}</h3>
            <dl className="creds">
                <dt>{t("email")}</dt>
                <dd dir="ltr">{email}</dd>
                <dt>{t("password")}</dt>
                <dd dir="ltr" className="mono" data-testid="new-password">
                    {password}
                </dd>
            </dl>
            <pre className="message" dir="auto">
                {message}
            </pre>
            <div className="row gap">
                <CopyButton text={message} label={t("copyMessage")} />
                <button type="button" className="btn" onClick={onClose}>
                    {t("close")}
                </button>
            </div>
        </div>
    );
}

// ------------------------------------------------------------------ sign in

function SignIn({ onSignedIn }) {
    const { t, lang } = useT();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            onSignedIn(await signIn(email, password));
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="center">
            <form className="card narrow" onSubmit={submit}>
                <h1 className="brand">{t("appName")}</h1>
                {!configured && <div className="alert alert-error">{t("notConfigured")}</div>}
                {error && <div className="alert alert-error">{errorText(lang, error)}</div>}
                <label>
                    {t("email")}
                    <input type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </label>
                <label>
                    {t("password")}
                    <input type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </label>
                <button className="btn btn-primary wide" disabled={busy || !configured}>
                    {busy ? t("signingIn") : t("signIn")}
                </button>
            </form>
        </div>
    );
}

// ------------------------------------------------------------------ overview

function Overview() {
    const { t } = useT();
    const [{ loading, data, error }] = useAsync(() => api.stats(), []);
    const cards = data && [
        ["statClients", data.users],
        ["statActive", data.active_users_30d],
        ["statOutstanding", data.credits_outstanding],
        ["statExpiring", data.expiring_7d],
        ["statSold", data.credits_sold_30d],
        ["statUsed", data.credits_used_30d],
        ["statExpired", data.credits_expired_30d],
        ["statJobs", data.jobs_30d]
    ];
    return (
        <section>
            <h2>{t("overview")}</h2>
            <ErrorBox error={error} />
            {loading && !data && <div className="muted">…</div>}
            {cards && (
                <div className="stats">
                    {cards.map(([k, v]) => (
                        <div key={k} className="stat">
                            <div className="stat-value">{num(v)}</div>
                            <div className="stat-label">{t(k)}</div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

// ------------------------------------------------------------------ clients list

function NewClient({ onDone, onCancel }) {
    const { t, lang } = useT();
    const [form, setForm] = useState({ email: "", credits: 100, days: 30, note: "", auto: true, password: "" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [created, setCreated] = useState(null);
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const r = await api.createUser({
                email: form.email,
                credits: Number(form.credits),
                valid_days: Number(form.days),
                note: form.note || undefined,
                ...(form.auto ? {} : { password: form.password })
            });
            setCreated({ ...r, credits: Number(form.credits), until: Number(form.credits) > 0 ? fmtDate(r.grant && r.grant.expires_at, lang) : null });
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    };
    if (created) {
        return <CredentialsCard email={created.user.email} password={created.password} credits={created.credits} until={created.until} onClose={() => onDone(created.user.id)} />;
    }
    return (
        <form className="card" onSubmit={submit} data-testid="new-client-form">
            <h3>{t("createTitle")}</h3>
            {error && <div className="alert alert-error">{errorText(lang, error)}</div>}
            <label>
                {t("email")}
                <input type="email" dir="ltr" value={form.email} onChange={set("email")} required />
            </label>
            <div className="row gap wrap">
                <label className="grow">
                    {t("credits")}
                    <input type="number" min="0" step="1" value={form.credits} onChange={set("credits")} required />
                </label>
                <label className="grow">
                    {t("validDays")}
                    <input type="number" min="1" max="3660" step="1" value={form.days} onChange={set("days")} required />
                </label>
            </div>
            <label>
                {t("note")}
                <input value={form.note} onChange={set("note")} />
            </label>
            <label className="check">
                <input type="checkbox" checked={form.auto} onChange={set("auto")} /> {t("autoPassword")}
            </label>
            {!form.auto && (
                <label>
                    {t("manualPassword")}
                    <input dir="ltr" value={form.password} onChange={set("password")} minLength={8} required />
                </label>
            )}
            <div className="row gap">
                <button className="btn btn-primary" disabled={busy}>
                    {busy ? t("creating") : t("create")}
                </button>
                <button type="button" className="btn" onClick={onCancel}>
                    {t("cancel")}
                </button>
            </div>
        </form>
    );
}

function ExpiryCell({ iso }) {
    const { t, lang } = useT();
    if (!iso) return <span className="muted">{t("none")}</span>;
    const d = daysUntil(iso);
    return (
        <span className={d <= 3 ? "warn" : ""}>
            {fmtDate(iso, lang)} <span className="muted small">({t("daysLeft", { n: d })})</span>
        </span>
    );
}

function Clients({ open }) {
    const { t, lang } = useT();
    const [search, setSearch] = useState("");
    const [q, setQ] = useState("");
    const [page, setPage] = useState(0);
    const [adding, setAdding] = useState(false);
    const [{ loading, data, error }, reload] = useAsync(() => api.listUsers(q, PAGE, page * PAGE), [q, page]);
    useEffect(() => {
        const id = setTimeout(() => {
            setPage(0);
            setQ(search.trim());
        }, 250);
        return () => clearTimeout(id);
    }, [search]);
    return (
        <section>
            <div className="row gap wrap between">
                <h2>{t("clients")}</h2>
                {!adding && (
                    <button className="btn btn-primary" onClick={() => setAdding(true)}>
                        + {t("newClient")}
                    </button>
                )}
            </div>
            {adding && (
                <NewClient
                    onCancel={() => setAdding(false)}
                    onDone={(id) => {
                        setAdding(false);
                        reload();
                        open(id);
                    }}
                />
            )}
            <input className="search" type="search" placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} dir="auto" />
            <ErrorBox error={error} />
            {data && data.users.length === 0 && <div className="empty">{t("noClients")}</div>}
            {data && data.users.length > 0 && (
                <div className="table-wrap">
                    <table className="table clients">
                        <thead>
                            <tr>
                                <th>{t("colEmail")}</th>
                                <th className="num">{t("colAvailable")}</th>
                                <th>{t("colExpires")}</th>
                                <th className="num hide-sm">{t("colUsed")}</th>
                                <th>{t("colStatus")}</th>
                                <th className="hide-sm">{t("colLast")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.users.map((u) => (
                                <tr key={u.id} className="clickable" onClick={() => open(u.id)}>
                                    <td dir="ltr" className="email">
                                        {u.email}
                                        {u.is_admin && <span className="badge">{t("admin")}</span>}
                                    </td>
                                    <td className="num strong">{num(u.available)}</td>
                                    <td>
                                        <ExpiryCell iso={u.next_expiry} />
                                    </td>
                                    <td className="num hide-sm">{num(u.used_30d)}</td>
                                    <td>
                                        <span className={`badge ${u.disabled ? "badge-off" : "badge-on"}`}>{u.disabled ? t("disabled") : t("active")}</span>
                                    </td>
                                    <td className="hide-sm muted">{fmtDate(u.last_job_at, lang)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {data && data.total > PAGE && (
                <div className="row gap center-row">
                    <button className="btn" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>
                        {t("prev")}
                    </button>
                    <span className="muted">
                        {page * PAGE + 1}–{Math.min(data.total, (page + 1) * PAGE)} / {data.total}
                    </span>
                    <button className="btn" disabled={(page + 1) * PAGE >= data.total || loading} onClick={() => setPage(page + 1)}>
                        {t("next")}
                    </button>
                </div>
            )}
        </section>
    );
}

// ------------------------------------------------------------------ client detail

function ActionForm({ title, button, confirmText, fields, onSubmit, danger }) {
    const { lang } = useT();
    const [values, setValues] = useState(Object.fromEntries(fields.map((f) => [f.name, f.initial ?? ""])));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    // One idempotency key per filled-in form: retries or double submits don't repeat the action.
    const [idem, setIdem] = useState(api.newKey());
    const submit = async (e) => {
        e.preventDefault();
        if (!window.confirm(confirmText(values))) return;
        setBusy(true);
        setError(null);
        try {
            await onSubmit(values, idem);
            setValues(Object.fromEntries(fields.map((f) => [f.name, f.initial ?? ""])));
            setIdem(api.newKey());
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    };
    return (
        <form className="card" onSubmit={submit}>
            <h3>{title}</h3>
            {error && <div className="alert alert-error">{errorText(lang, error)}</div>}
            <div className="row gap wrap">
                {fields.map((f) => (
                    <label key={f.name} className={f.grow ? "grow" : ""}>
                        {f.label}
                        <input
                            type={f.type || "text"}
                            min={f.min}
                            max={f.max}
                            step={f.type === "number" ? 1 : undefined}
                            required={f.required}
                            value={values[f.name]}
                            onChange={(e) => {
                                setValues({ ...values, [f.name]: e.target.value });
                                setIdem(api.newKey());
                            }}
                        />
                    </label>
                ))}
            </div>
            <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={busy}>
                {button}
            </button>
        </form>
    );
}

function ClientDetail({ id, back }) {
    const { t, lang } = useT();
    const [{ data, error }, reload] = useAsync(() => api.userDetail(id), [id]);
    const [secret, setSecret] = useState(null);
    const [actionError, setActionError] = useState(null);
    if (error) return <ErrorBox error={error} />;
    if (!data) return <div className="muted">…</div>;
    const a = data.account || {};
    const nextLot = data.lots.filter((l) => Number(l.remaining) > 0 && new Date(l.expires_at) > new Date()).sort((x, y) => new Date(x.expires_at) - new Date(y.expires_at))[0];
    const act = async (fn) => {
        setActionError(null);
        try {
            await fn();
            await reload();
        } catch (e) {
            setActionError(e);
        }
    };
    const lotState = (l) => (Number(l.remaining) === 0 ? (new Date(l.expires_at) <= new Date() ? "lotExpired" : "lotUsed") : new Date(l.expires_at) <= new Date() ? "lotExpired" : "lotActive");
    return (
        <section data-testid="client-detail">
            <button className="btn btn-link" onClick={back}>
                ← {t("back")}
            </button>
            <div className="row gap wrap between">
                <h2 dir="ltr" className="email-title">
                    {data.user.email}
                </h2>
                <span className={`badge ${a.disabled ? "badge-off" : "badge-on"}`}>{a.disabled ? t("disabled") : t("active")}</span>
            </div>
            <ErrorBox error={actionError} />
            {secret && <CredentialsCard email={data.user.email} password={secret} onClose={() => setSecret(null)} />}
            <div className="stats">
                <div className="stat">
                    <div className="stat-value" data-testid="available">
                        {num(a.available)}
                    </div>
                    <div className="stat-label">{t("available")}</div>
                </div>
                <div className="stat">
                    <div className="stat-value">{num(a.reserved)}</div>
                    <div className="stat-label">{t("reserved")}</div>
                </div>
                <div className="stat">
                    <div className="stat-value small-value">{nextLot ? <ExpiryCell iso={nextLot.expires_at} /> : t("none")}</div>
                    <div className="stat-label">{t("nextExpiry")}</div>
                </div>
            </div>

            <div className="grid2">
                <ActionForm
                    title={t("topUp")}
                    button={t("topUpBtn")}
                    fields={[
                        { name: "amount", label: t("credits"), type: "number", min: 1, required: true, initial: 100, grow: true },
                        { name: "days", label: t("validDays"), type: "number", min: 1, max: 3660, required: true, initial: 30, grow: true },
                        { name: "note", label: t("note"), grow: true }
                    ]}
                    confirmText={(v) => t("topUpConfirm", { n: v.amount, d: v.days })}
                    onSubmit={async (v, idem) => {
                        await api.grant(id, Number(v.amount), Number(v.days), v.note, idem);
                        await reload();
                    }}
                />
                <ActionForm
                    danger
                    title={t("removeTitle")}
                    button={t("removeBtn")}
                    fields={[
                        { name: "amount", label: t("credits"), type: "number", min: 1, required: true, initial: "", grow: true },
                        { name: "note", label: t("noteRequired"), required: true, grow: true }
                    ]}
                    confirmText={(v) => t("removeConfirm", { n: v.amount })}
                    onSubmit={async (v, idem) => {
                        await api.remove(id, Number(v.amount), v.note, idem);
                        await reload();
                    }}
                />
            </div>

            <div className="row gap wrap">
                <button className="btn" onClick={() => window.confirm(t("resetConfirm")) && act(async () => setSecret((await api.resetPassword(id)).password))}>
                    {t("resetPassword")}
                </button>
                {a.disabled ? (
                    <button className="btn" onClick={() => act(() => api.setDisabled(id, false))}>
                        {t("enable")}
                    </button>
                ) : (
                    <button className="btn btn-danger" onClick={() => window.confirm(t("disableConfirm")) && act(() => api.setDisabled(id, true))}>
                        {t("disable")}
                    </button>
                )}
            </div>

            <h3>{t("lots")}</h3>
            <div className="table-wrap">
                <table className="table">
                    <thead>
                        <tr>
                            <th className="num">{t("lotAmount")}</th>
                            <th className="num">{t("lotRemaining")}</th>
                            <th>{t("lotExpires")}</th>
                            <th>{t("lotState")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.lots.map((l) => (
                            <tr key={l.id}>
                                <td className="num">{num(l.amount)}</td>
                                <td className="num strong">{num(l.remaining)}</td>
                                <td>{fmtDate(l.expires_at, lang)}</td>
                                <td>
                                    <span className={`badge ${lotState(l) === "lotActive" ? "badge-on" : "badge-muted"}`}>{t(lotState(l))}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <h3>{t("history")}</h3>
            <div className="table-wrap">
                <table className="table" data-testid="ledger">
                    <thead>
                        <tr>
                            <th>{t("colDate")}</th>
                            <th>{t("colKind")}</th>
                            <th className="num">{t("colAmount")}</th>
                            <th className="num hide-sm">{t("colAfter")}</th>
                            <th>{t("colNote")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.ledger.map((e) => (
                            <tr key={e.id}>
                                <td className="nowrap">{fmtDate(e.created_at, lang, true)}</td>
                                <td>{t(`kind_${e.kind}`)}</td>
                                <td className={`num strong ${Number(e.amount) > 0 ? "pos" : "neg"}`} dir="ltr">
                                    {Number(e.amount) > 0 ? "+" : ""}
                                    {num(e.amount)}
                                </td>
                                <td className="num hide-sm">{num(e.balance_after)}</td>
                                <td className="small">
                                    <span dir="auto">{e.kind === "expiry" ? "" : e.note || e.item_key || ""}</span>
                                    {e.actor && e.actor !== "system" && <span className="muted"> · {e.actor.replace(/^admin:/, "")}</span>}
                                    {e.kind === "charge" && (
                                        <button className="btn btn-link small" onClick={() => window.confirm(t("refundConfirm")) && act(() => api.refund(e.id, "refund"))}>
                                            {t("refund")}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {data.jobs.length > 0 && (
                <>
                    <h3>{t("jobs")}</h3>
                    <div className="table-wrap">
                        <table className="table">
                            <tbody>
                                {data.jobs.map((j) => (
                                    <tr key={j.id}>
                                        <td className="nowrap">{fmtDate(j.created_at, lang, true)}</td>
                                        <td>{t(`job_${j.kind}`)}</td>
                                        <td className="num">
                                            {num(j.charged_total)} / {num(j.reserved_total)}
                                        </td>
                                        <td className="muted">{t(`status_${j.status}`)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </section>
    );
}

// ------------------------------------------------------------------ settings

function Settings() {
    const { t, lang } = useT();
    const [{ data, error }, reload] = useAsync(() => api.stats(), []);
    const [prices, setPrices] = useState(null);
    const [msg, setMsg] = useState(null);
    const [err, setErr] = useState(null);
    useEffect(() => {
        if (data) setPrices(Object.fromEntries(data.pricing.map((p) => [p.unit, p.price])));
    }, [data]);
    if (error) return <ErrorBox error={error} />;
    if (!data || !prices) return <div className="muted">…</div>;
    const video = data.pricing.find((p) => p.unit === "video_5s");
    const save = async (e) => {
        e.preventDefault();
        setMsg(null);
        setErr(null);
        try {
            await api.setPrice("design", Number(prices.design));
            await api.setPrice("video_5s", Number(prices.video_5s));
            setMsg(t("saved"));
            reload();
        } catch (x) {
            setErr(x);
        }
    };
    return (
        <section>
            <h2>{t("settings")}</h2>
            <form className="card narrow-wide" onSubmit={save}>
                <h3>{t("pricing")}</h3>
                {err && <div className="alert alert-error">{errorText(lang, err)}</div>}
                {msg && <div className="alert alert-success">{msg}</div>}
                <label>
                    {t("priceDesign")}
                    <input type="number" min="0" step="1" value={prices.design} onChange={(e) => setPrices({ ...prices, design: e.target.value })} />
                </label>
                <label>
                    {t("priceVideo")}
                    <input type="number" min="0" step="1" value={prices.video_5s} onChange={(e) => setPrices({ ...prices, video_5s: e.target.value })} />
                </label>
                <div className="muted small">{t("hdNote", { edge: video.hd_long_edge, mult: video.hd_multiplier })}</div>
                <button className="btn btn-primary">{t("save")}</button>
            </form>
        </section>
    );
}

// ------------------------------------------------------------------ shell

function parseHash() {
    const m = window.location.hash.match(/^#\/(overview|clients|sales|settings)(?:\/([0-9a-f-]{36}|[a-z]+))?$/);
    if (!m) return { tab: "clients", client: null, sub: null };
    const isClient = m[1] === "clients" && /^[0-9a-f-]{36}$/.test(m[2] || "");
    return { tab: m[1], client: isClient ? m[2] : null, sub: m[1] === "sales" ? m[2] || null : null };
}

export default function App() {
    const [lang, setLang] = useState(() => {
        try {
            return localStorage.getItem("elzoz-admin-lang") || "ar";
        } catch (e) {
            return "ar";
        }
    });
    const [email, setEmail] = useState(currentEmail());
    const [checking, setChecking] = useState(!!currentEmail());
    // The current page lives in the URL hash (#/clients, #/clients/<id>, #/overview, #/settings)
    // so refresh, the back button and bookmarks keep the admin where they were.
    const [view, setViewState] = useState(parseHash);
    const setView = useCallback((v) => {
        const hash = v.client ? `#/clients/${v.client}` : v.sub ? `#/${v.tab}/${v.sub}` : `#/${v.tab}`;
        if (window.location.hash !== hash) window.location.hash = hash;
        setViewState(v);
    }, []);
    useEffect(() => {
        const onHash = () => setViewState(parseHash());
        window.addEventListener("hashchange", onHash);
        return () => window.removeEventListener("hashchange", onHash);
    }, []);
    useEffect(() => {
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
        try {
            localStorage.setItem("elzoz-admin-lang", lang);
        } catch (e) {
            /* ignore */
        }
    }, [lang]);
    useEffect(() => {
        if (!checking) return;
        restore().then((e) => {
            setEmail(e);
            setChecking(false);
        });
    }, [checking]);
    const onSignedOut = useCallback(() => setEmail(null), []);
    const ctx = useMemo(() => ({ lang, t: (k, v) => translate(lang, k, v), onSignedOut }), [lang, onSignedOut]);
    const toggle = (
        <button className="btn btn-link" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
            {translate(lang, "language")}
        </button>
    );

    if (checking) return null;
    return (
        <Ctx.Provider value={ctx}>
            {!email ? (
                <>
                    <div className="topbar">
                        <span />
                        {toggle}
                    </div>
                    <SignIn onSignedIn={setEmail} />
                </>
            ) : (
                <>
                    <header className="topbar">
                        <div className="brand">{ctx.t("appName")}</div>
                        <nav className="tabs">
                            {["overview", "clients", "sales", "settings"].map((tab) => (
                                <button key={tab} className={`tab ${view.tab === tab && !view.client ? "tab-on" : ""}`} onClick={() => setView({ tab, client: null })}>
                                    {ctx.t(tab)}
                                </button>
                            ))}
                        </nav>
                        <div className="row gap">
                            {toggle}
                            <span className="muted small hide-sm" dir="ltr">
                                {email}
                            </span>
                            <button
                                className="btn"
                                onClick={async () => {
                                    await signOut();
                                    setEmail(null);
                                }}
                            >
                                {ctx.t("signOut")}
                            </button>
                        </div>
                    </header>
                    <main className="main">
                        {view.client ? (
                            <ClientDetail id={view.client} back={() => setView({ tab: "clients", client: null })} />
                        ) : view.tab === "overview" ? (
                            <Overview />
                        ) : view.tab === "sales" ? (
                            <Sales sub={view.sub} go={(sub) => setView({ tab: "sales", client: null, sub })} />
                        ) : view.tab === "settings" ? (
                            <Settings />
                        ) : (
                            <Clients open={(id) => setView({ tab: "clients", client: id })} />
                        )}
                    </main>
                </>
            )}
        </Ctx.Provider>
    );
}
