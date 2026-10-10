// "Sales" page: the WhatsApp sales bot. Orders (approve/reject), conversations, payment
// notifications, packages and bot settings. All actions go through admin_bot_* RPCs.
import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { errorText } from "./i18n.js";
import { ErrorBox, fmtDate, num, useAsync, useConfirm, useT } from "./ui.jsx";

export const SALES_TABS = ["orders", "contacts", "payments", "packages", "bot"];

const STATUS_CLASS = { awaiting_payment: "badge-muted", paid: "badge-on", fulfilling: "badge-on", fulfilled: "badge-on", rejected: "badge-off", expired: "badge-off", cancelled: "badge-off" };

function useDebounced(value, ms = 250) {
    const [v, setV] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setV(value), ms);
        return () => clearTimeout(id);
    }, [value, ms]);
    return v;
}

function BotStatus() {
    const { t } = useT();
    const [{ data, error }, reload] = useAsync(() => api.botOverview(), []);
    const [busy, setBusy] = useState(false);
    if (error) return <ErrorBox error={error} />;
    if (!data) return <div className="muted">…</div>;
    const paused = data.paused === true;
    const toggle = async () => {
        setBusy(true);
        try {
            await api.botSetSetting("paused", !paused);
            await reload();
        } finally {
            setBusy(false);
        }
    };
    const cards = [
        ["botNewContacts", data.new_contacts],
        ["botOrders", data.orders_created],
        ["botSales", data.sales],
        ["botRevenue", data.revenue],
        ["botOpen", data.open_orders],
        ["botUnmatched", data.unmatched_payments]
    ];
    return (
        <div className="card">
            <div className="row gap wrap between">
                <div>
                    <span className={`badge ${paused ? "badge-off" : "badge-on"}`}>{paused ? t("botPaused") : t("botRunning")}</span>
                    <span className="muted small"> {t("botLast24")}</span>
                </div>
                <button className={`btn ${paused ? "btn-primary" : "btn-danger"}`} disabled={busy} onClick={toggle}>
                    {paused ? t("botResume") : t("botPause")}
                </button>
            </div>
            <div className="stats stats-compact">
                {cards.map(([k, v]) => (
                    <div key={k} className="stat">
                        <div className="stat-value">{num(v)}</div>
                        <div className="stat-label">{t(k)}</div>
                    </div>
                ))}
            </div>
            {(data.waiting_owner || []).length > 0 && <div className="alert alert-error">{t("botWaiting", { list: data.waiting_owner.join(", ") })}</div>}
        </div>
    );
}

function Orders() {
    const { t, lang } = useT();
    const [status, setStatus] = useState("");
    const [search, setSearch] = useState("");
    const q = useDebounced(search);
    const [{ data, error }, reload] = useAsync(() => api.botOrders(status || null, q || null), [status, q]);
    const [actionErr, setActionErr] = useState(null);
    const [dialog, ask] = useConfirm();
    // withNotify: show the "tell the client on WhatsApp" checkbox; fn receives the choice.
    const act = async (fn, msg, withNotify = false) => {
        const ok = await ask(msg, { notify: withNotify, danger: withNotify });
        if (!ok) return;
        setActionErr(null);
        try {
            await fn(ok.notify);
            reload();
        } catch (e) {
            setActionErr(e);
        }
    };
    return (
        <>
            <div className="row gap wrap">
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="">{t("allStatuses")}</option>
                    {Object.keys(STATUS_CLASS).map((s) => (
                        <option key={s} value={s}>
                            {t(`st_${s}`)}
                        </option>
                    ))}
                </select>
                <input className="search grow" type="search" placeholder={t("ordersSearch")} value={search} onChange={(e) => setSearch(e.target.value)} dir="auto" />
            </div>
            <ErrorBox error={error} />
            {dialog}
            {actionErr && <div className="alert alert-error">{errorText(lang, actionErr)}</div>}
            {data && data.length === 0 && <div className="empty">{t("noOrders")}</div>}
            {data && data.length > 0 && (
                <div className="table-wrap">
                    <table className="table cards">
                        <thead>
                            <tr>
                                <th>{t("colOrder")}</th>
                                <th>{t("colEmail")}</th>
                                <th className="num">{t("colAmount")}</th>
                                <th>{t("colStatus")}</th>
                                <th className="hide-sm">{t("colCreated")}</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((o) => (
                                <tr key={o.id}>
                                    <td className="mono nowrap">
                                        {o.code}
                                        <div className="muted small">{o.package_name}</div>
                                    </td>
                                    <td dir="ltr" className="email">
                                        {o.email}
                                        <div className="muted small">+{o.wa_id}</div>
                                    </td>
                                    <td className="num strong">{Number(o.amount_due)}</td>
                                    <td>
                                        <span className={`badge ${STATUS_CLASS[o.status] || ""}`}>{t(`st_${o.status}`)}</span>
                                        {o.claimed_at && o.status === "awaiting_payment" && <div className="small warn">{t("receiptSent")}</div>}
                                        {o.approved_by && <div className="muted small">{o.approved_by}</div>}
                                        {o.status === "fulfilled" && !o.credentials_sent && <div className="small warn">{t("notDelivered")}</div>}
                                    </td>
                                    <td className="hide-sm muted">{fmtDate(o.created_at, lang, true)}</td>
                                    <td className="nowrap">
                                        {(o.status === "awaiting_payment" || o.status === "expired") && (
                                            <>
                                                <button className="btn btn-primary" onClick={() => act(() => api.botApprove(o.code), t("confirmApprove", { code: o.code, amount: Number(o.amount_due) }))}>
                                                    {t("approve")}
                                                </button>{" "}
                                                <button className="btn btn-danger" onClick={() => act((notify) => api.botReject(o.code, "rejected from dashboard", notify), t("confirmReject", { code: o.code }), true)}>
                                                    {t("reject")}
                                                </button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="muted small">{t("approveNote")}</div>
        </>
    );
}

function Contacts() {
    const { t, lang } = useT();
    const [search, setSearch] = useState("");
    const q = useDebounced(search);
    const [{ data, error }, reload] = useAsync(() => api.botContacts(q || null), [q]);
    const update = async (id, blocked, release) => {
        await api.botContactUpdate(id, blocked, release);
        reload();
    };
    return (
        <>
            <input className="search" type="search" placeholder={t("contactsSearch")} value={search} onChange={(e) => setSearch(e.target.value)} dir="auto" />
            <ErrorBox error={error} />
            {data && data.length === 0 && <div className="empty">{t("noContacts")}</div>}
            {data && data.length > 0 && (
                <div className="table-wrap">
                    <table className="table cards">
                        <thead>
                            <tr>
                                <th>{t("colContact")}</th>
                                <th className="hide-sm">{t("colSource")}</th>
                                <th>{t("colLastMessage")}</th>
                                <th className="num">{t("colPaid")}</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((c) => {
                                const human = c.human_until && new Date(c.human_until) > new Date();
                                return (
                                    <tr key={c.id}>
                                        <td>
                                            <div className="strong">{c.name || "—"}</div>
                                            <div className="muted small" dir="ltr">
                                                +{c.wa_id} · #C{c.id}
                                            </div>
                                            {c.email && (
                                                <div className="small" dir="ltr">
                                                    {c.email}
                                                </div>
                                            )}
                                        </td>
                                        <td className="hide-sm">
                                            <span className="badge badge-muted">{c.source}</span>
                                        </td>
                                        <td>
                                            <div className="small">{(c.last_message || "").slice(0, 120)}</div>
                                            <div className="muted small">{fmtDate(c.last_inbound_at, lang, true)}</div>
                                            {human && <span className="badge">{t("withHuman")}</span>}
                                            {c.blocked && <span className="badge badge-off">{t("blocked")}</span>}
                                        </td>
                                        <td className="num">{num(c.paid_orders)}</td>
                                        <td className="nowrap">
                                            {human && (
                                                <button className="btn" onClick={() => update(c.id, null, true)}>
                                                    {t("backToBot")}
                                                </button>
                                            )}{" "}
                                            <button className={`btn ${c.blocked ? "" : "btn-danger"}`} onClick={() => update(c.id, !c.blocked, false)}>
                                                {c.blocked ? t("unblock") : t("block")}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}

function Payments() {
    const { t, lang } = useT();
    const [{ data, error }] = useAsync(() => api.botPayments(), []);
    return (
        <>
            <ErrorBox error={error} />
            <div className="muted small">{t("paymentsNote")}</div>
            {data && data.length === 0 && <div className="empty">{t("noPayments")}</div>}
            {data && data.length > 0 && (
                <div className="table-wrap">
                    <table className="table cards">
                        <thead>
                            <tr>
                                <th>{t("colTime")}</th>
                                <th className="num">{t("colAmount")}</th>
                                <th>{t("colChannel")}</th>
                                <th>{t("colOrder")}</th>
                                <th className="hide-sm">{t("colText")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((p) => (
                                <tr key={p.id}>
                                    <td className="muted nowrap">{fmtDate(p.received_at, lang, true)}</td>
                                    <td className="num strong">{p.amount == null ? "—" : Number(p.amount)}</td>
                                    <td>
                                        {p.channel}
                                        <div className="muted small">
                                            {p.sender} {p.trusted ? "✓" : `· ${t("untrusted")}`}
                                        </div>
                                    </td>
                                    <td className="mono">{p.order_code || <span className="warn small">{t("unmatched")}</span>}</td>
                                    <td className="hide-sm small" dir="auto">
                                        {(p.raw_text || "").slice(0, 160)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}

const EMPTY_PKG = { code: "", name: "", credits: 100, valid_days: 30, price_egp: 200, active: true, sort: 9 };

function Packages() {
    const { t, lang } = useT();
    const [{ data, error }, reload] = useAsync(() => api.botPackages(), []);
    const [edit, setEdit] = useState(null);
    const [err, setErr] = useState(null);
    const save = async (e) => {
        e.preventDefault();
        setErr(null);
        try {
            await api.botSavePackage(edit);
            setEdit(null);
            reload();
        } catch (x) {
            setErr(x);
        }
    };
    const field = (k, type = "number", extra = {}) => (
        <label>
            {t(`pkg_${k}`)}
            <input
                type={type}
                value={edit[k]}
                onChange={(e) => setEdit({ ...edit, [k]: type === "number" ? Number(e.target.value) : e.target.value })}
                required
                {...extra}
            />
        </label>
    );
    return (
        <>
            <ErrorBox error={error} />
            {!edit && (
                <button className="btn btn-primary" onClick={() => setEdit(EMPTY_PKG)}>
                    + {t("newPackage")}
                </button>
            )}
            {edit && (
                <form className="card narrow-wide" onSubmit={save}>
                    {err && <div className="alert alert-error">{errorText(lang, err)}</div>}
                    {field("code", "text", { pattern: "[a-z0-9_]{2,32}", dir: "ltr", readOnly: !!edit.id })}
                    {field("name", "text", { maxLength: 24 })}
                    <div className="grid2">
                        {field("price_egp", "number", { min: 1 })}
                        {field("credits", "number", { min: 1 })}
                        {field("valid_days", "number", { min: 1, max: 3660 })}
                        {field("sort", "number")}
                    </div>
                    <label className="row gap">
                        <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> {t("pkg_active")}
                    </label>
                    <div className="row gap">
                        <button className="btn btn-primary">{t("save")}</button>
                        <button type="button" className="btn" onClick={() => setEdit(null)}>
                            {t("cancel")}
                        </button>
                    </div>
                </form>
            )}
            {data && (
                <div className="table-wrap">
                    <table className="table cards">
                        <thead>
                            <tr>
                                <th>{t("pkg_name")}</th>
                                <th className="num">{t("pkg_price_egp")}</th>
                                <th className="num">{t("pkg_credits")}</th>
                                <th className="num">{t("pkg_valid_days")}</th>
                                <th>{t("colStatus")}</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((p) => (
                                <tr key={p.id}>
                                    <td>
                                        {p.name}
                                        <div className="muted small mono">{p.code}</div>
                                    </td>
                                    <td className="num strong">{p.price_egp}</td>
                                    <td className="num">{num(p.credits)}</td>
                                    <td className="num">{p.valid_days}</td>
                                    <td>
                                        <span className={`badge ${p.active ? "badge-on" : "badge-off"}`}>{p.active ? t("active") : t("hidden")}</span>
                                    </td>
                                    <td>
                                        <button className="btn" onClick={() => setEdit(p)}>
                                            {t("edit")}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}

const TEXT_SETTINGS = ["instapay_address", "vodafone_cash_number", "reply_sla", "demo_url", "install_url", "download_url", "ccx_path"];
const NUMBER_SETTINGS = ["order_ttl_hours", "referral_bonus_credits", "report_hour", "max_orders_per_day"];

function BotSettings() {
    const { t, lang } = useT();
    const [{ data, error }, reload] = useAsync(() => api.botSettings(), []);
    const [form, setForm] = useState(null);
    const [msg, setMsg] = useState(null);
    const [err, setErr] = useState(null);
    useEffect(() => {
        if (data) setForm({ ...data, faq: Array.isArray(data.faq) ? data.faq : [], work_hours: data.work_hours || { start: 10, end: 22 } });
    }, [data]);
    if (error) return <ErrorBox error={error} />;
    if (!form) return <div className="muted">…</div>;
    const save = async (e) => {
        e.preventDefault();
        setMsg(null);
        setErr(null);
        try {
            for (const k of TEXT_SETTINGS) if (form[k] !== data[k]) await api.botSetSetting(k, String(form[k] ?? ""));
            for (const k of NUMBER_SETTINGS) if (Number(form[k]) !== Number(data[k])) await api.botSetSetting(k, Number(form[k]));
            if (form.auto_approve !== data.auto_approve) await api.botSetSetting("auto_approve", !!form.auto_approve);
            if (JSON.stringify(form.work_hours) !== JSON.stringify(data.work_hours))
                await api.botSetSetting("work_hours", { start: Number(form.work_hours.start), end: Number(form.work_hours.end) });
            const faq = form.faq.filter((f) => f.q.trim() && f.a.trim());
            if (JSON.stringify(faq) !== JSON.stringify(data.faq)) await api.botSetSetting("faq", faq);
            setMsg(t("saved"));
            reload();
        } catch (x) {
            setErr(x);
        }
    };
    const setFaq = (i, k, v) => setForm({ ...form, faq: form.faq.map((f, j) => (j === i ? { ...f, [k]: v } : f)) });
    return (
        <form className="card narrow-wide" onSubmit={save}>
            {err && <div className="alert alert-error">{errorText(lang, err)}</div>}
            {msg && <div className="alert alert-success">{msg}</div>}
            <label className="row gap">
                <input type="checkbox" checked={form.auto_approve === true} onChange={(e) => setForm({ ...form, auto_approve: e.target.checked })} /> {t("set_auto_approve")}
            </label>
            <div className="muted small">{t("autoApproveNote")}</div>
            {TEXT_SETTINGS.map((k) => (
                <label key={k}>
                    {t(`set_${k}`)}
                    <input type="text" dir="auto" value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </label>
            ))}
            <div className="grid2">
                {NUMBER_SETTINGS.map((k) => (
                    <label key={k}>
                        {t(`set_${k}`)}
                        <input type="number" min="0" value={form[k] ?? 0} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                    </label>
                ))}
                <label>
                    {t("set_work_start")}
                    <input type="number" min="0" max="23" value={form.work_hours.start} onChange={(e) => setForm({ ...form, work_hours: { ...form.work_hours, start: e.target.value } })} />
                </label>
                <label>
                    {t("set_work_end")}
                    <input type="number" min="0" max="24" value={form.work_hours.end} onChange={(e) => setForm({ ...form, work_hours: { ...form.work_hours, end: e.target.value } })} />
                </label>
            </div>
            <h3>{t("faqTitle")}</h3>
            {form.faq.map((f, i) => (
                <div key={i} className="card">
                    <label>
                        {t("faqQ")}
                        <input type="text" value={f.q} onChange={(e) => setFaq(i, "q", e.target.value)} />
                    </label>
                    <label>
                        {t("faqA")}
                        <textarea rows="3" value={f.a} onChange={(e) => setFaq(i, "a", e.target.value)} />
                    </label>
                    <button type="button" className="btn btn-danger" onClick={() => setForm({ ...form, faq: form.faq.filter((_, j) => j !== i) })}>
                        {t("remove")}
                    </button>
                </div>
            ))}
            {form.faq.length < 10 && (
                <button type="button" className="btn" onClick={() => setForm({ ...form, faq: [...form.faq, { q: "", a: "" }] })}>
                    + {t("faqAdd")}
                </button>
            )}
            <button className="btn btn-primary">{t("save")}</button>
        </form>
    );
}

export default function Sales({ sub, go }) {
    const { t } = useT();
    const tab = SALES_TABS.includes(sub) ? sub : "orders";
    return (
        <section>
            <h2>{t("sales")}</h2>
            <BotStatus />
            <nav className="tabs subtabs">
                {SALES_TABS.map((s) => (
                    <button key={s} className={`tab ${tab === s ? "tab-on" : ""}`} onClick={() => go(s)}>
                        {t(`sales_${s}`)}
                    </button>
                ))}
            </nav>
            {tab === "orders" && <Orders />}
            {tab === "contacts" && <Contacts />}
            {tab === "payments" && <Payments />}
            {tab === "packages" && <Packages />}
            {tab === "bot" && <BotSettings />}
        </section>
    );
}
