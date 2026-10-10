// Reusable UI components. Visual structure uses plain elements styled by
// theme.css; buttons use Spectrum UXP's <sp-button> so they follow the
// Photoshop theme. React 16 does not attach listeners to web components, so
// events are wired through a ref (the pattern Adobe's React sample uses).
import React, { useEffect, useRef } from "react";

export function useDomEvent(ref, name, handler) {
    const saved = useRef(handler);
    saved.current = handler;
    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const fn = (e) => saved.current && saved.current(e);
        el.addEventListener(name, fn);
        return () => el.removeEventListener(name, fn);
    }, [ref, name]);
}

/** variant: cta | primary | secondary | warning ; quiet for low emphasis */
export function Button({ variant = "secondary", quiet, disabled, onClick, children, title, className }) {
    const ref = useRef(null);
    useDomEvent(ref, "click", (e) => {
        if (!disabled && onClick) onClick(e);
    });
    return (
        <sp-button ref={ref} variant={variant} quiet={quiet ? true : undefined} disabled={disabled ? true : undefined} title={title} class={className}>
            {children}
        </sp-button>
    );
}

export function Section({ title, action, children }) {
    return (
        <div className="ez-section">
            {(title || action) && (
                <div className="ez-section-head">
                    <div className="ez-section-title">{title}</div>
                    {action}
                </div>
            )}
            {children}
        </div>
    );
}

export function Card({ children, className = "" }) {
    return <div className={`ez-card ${className}`}>{children}</div>;
}

export function Field({ label, hint, children }) {
    return (
        <div className="ez-field">
            {label && <div className="ez-label">{label}</div>}
            {children}
            {hint && <div className="ez-small ez-muted ez-mt1">{hint}</div>}
        </div>
    );
}

export function Select({ value, onChange, options, disabled, placeholder }) {
    return (
        <select className="ez-select" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
            {placeholder !== undefined && <option value="">{placeholder}</option>}
            {options.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                    {o.label}
                </option>
            ))}
        </select>
    );
}

export function NumberInput({ value, onChange, min, max, step = 1, suffix }) {
    return (
        <div className="ez-row">
            <input
                className="ez-input"
                type="number"
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) onChange(n);
                }}
            />
            {suffix && <span className="ez-muted ez-ml2">{suffix}</span>}
        </div>
    );
}

export function TextInput({ value, onChange, placeholder, type = "text" }) {
    return <input className="ez-input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function Checkbox({ checked, onChange, label }) {
    return (
        <label className="ez-row ez-mb2">
            <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
            <span className="ez-ml2">{label}</span>
        </label>
    );
}

/** A picked file/folder, or a prompt to pick one. */
export function FileField({ icon, name, meta, emptyLabel, actionLabel, onPick, onClear, busy }) {
    return (
        <div className={`ez-file ${name ? "ez-file-set" : ""}`}>
            {icon && <div className="ez-mr2">{icon}</div>}
            <div className="ez-grow">
                {name ? (
                    <>
                        <div className="ez-file-name ez-ellipsis" title={name}>
                            {name}
                        </div>
                        {meta && <div className="ez-small ez-muted ez-ellipsis">{meta}</div>}
                    </>
                ) : (
                    <div className="ez-muted">{emptyLabel}</div>
                )}
            </div>
            {onClear && name && (
                <Button quiet onClick={onClear}>
                    ✕
                </Button>
            )}
            <Button variant={name ? "secondary" : "primary"} onClick={onPick} disabled={busy}>
                {busy ? "…" : actionLabel}
            </Button>
        </div>
    );
}

export function Badge({ tone, children }) {
    return <span className={`ez-badge ${tone ? `ez-badge-${tone}` : ""}`}>{children}</span>;
}

export function Alert({ tone = "info", title, children, action }) {
    return (
        <div className={`ez-alert ez-alert-${tone}`}>
            <div className="ez-grow">
                {title && <div className="ez-alert-title">{title}</div>}
                {children && <div className="ez-small">{children}</div>}
            </div>
            {action && <div className="ez-ml2">{action}</div>}
        </div>
    );
}

export function EmptyState({ title, children, action }) {
    return (
        <div className="ez-card">
            <div className="ez-strong ez-mb2">{title}</div>
            {children && <div className="ez-muted ez-small ez-mb2">{children}</div>}
            {action}
        </div>
    );
}

export function ProgressBar({ value }) {
    const pct = Math.max(0, Math.min(100, Math.round((value || 0) * 100)));
    return (
        <div className="ez-progress" role="progressbar" aria-valuenow={pct}>
            <div className="ez-progress-fill" style={{ width: `${pct}%` }} />
        </div>
    );
}

export function Stat({ label, value, tone }) {
    return (
        <div className="ez-stat">
            <div className={`ez-stat-value ${tone ? `ez-badge-${tone}` : ""}`} style={{ border: "none" }}>
                {value}
            </div>
            <div className="ez-small ez-muted">{label}</div>
        </div>
    );
}

export const KIND_LETTER = { text: "T", smartObject: "S", pixel: "P", fill: "■", group: "G", other: "·" };
export function KindIcon({ kind }) {
    return (
        <div className="ez-kind" title={kind}>
            {KIND_LETTER[kind] || "·"}
        </div>
    );
}
