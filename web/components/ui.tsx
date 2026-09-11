"use client";

// Shared atoms in the protocol's design language. TxButton is the important one: it is the
// only way this app submits a transaction, and it surfaces all four states a user needs
// (simulating, awaiting wallet, broadcasting, confirmed/failed) with the explorer link on
// success and the decoded revert on failure. A button that silently does nothing is the bug
// this component exists to prevent.

import { useState, type ReactNode } from "react";
import {
  EXPLORER_ADDR_BASE,
  EXPLORER_TX_BASE,
  STATUS_NAMES,
  REASON_NAMES,
} from "@/lib/chain";
import type { SendResult } from "@/lib/tx";

export function Panel({
  title,
  hint,
  children,
  actions,
  flush,
  className = "",
}: {
  title?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title || actions ? (
        <header className="panel-head">
          <div>
            <h2>{title}</h2>
          </div>
          {hint ? <span className="hint">{hint}</span> : null}
          {actions}
        </header>
      ) : null}
      <div className={flush ? "panel-body tight" : "panel-body"}>{children}</div>
    </section>
  );
}

/** One cell of the KPI strip. Render inside `.kpi-strip`. */
export function Stat({
  k,
  v,
  unit,
  n,
  tone,
  small,
}: {
  k: ReactNode;
  v: ReactNode;
  unit?: string;
  n?: ReactNode;
  tone?: "settle" | "blood";
  small?: boolean;
}) {
  return (
    <div className="kpi">
      <span className="kpi-k">{k}</span>
      <span className={`kpi-v${tone ? ` ${tone}-t` : ""}${small ? " kpi-v-sm" : ""}`}>
        {v}
        {unit ? <em>{unit}</em> : null}
      </span>
      {n ? <span className="kpi-n">{n}</span> : null}
    </div>
  );
}

export function Pill({ tone = "", children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge${tone ? ` badge-${tone}` : ""}`}>{children}</span>;
}

/** Coverage status with the protocol's own vocabulary and colour contract. */
export function StatusPill({ status }: { status: number }) {
  const name = STATUS_NAMES[status] ?? "UNKNOWN";
  const tone =
    name === "ACTIVE"
      ? "active"
      : name === "BREACHED"
        ? "breached"
        : name === "EXPIRED"
          ? "expired"
          : "settled";
  return <span className={`badge badge-${tone}`}>{name}</span>;
}

/**
 * The engine's isValid reason, spelled out rather than shown as a number.
 *
 * Colour tracks MEANING, not the boolean: VALID is green, an actual breach is red, a
 * condition that merely blocks a draw is amber, and a normal terminal state (settled or
 * expired) is neutral. Rendering "settled" in red would tell the user something is wrong
 * when nothing is — and red is reserved for the one thing that costs money.
 */
const REASON_TONE: Record<string, "active" | "breached" | "warn" | "expired" | "settled"> = {
  VALID: "active",
  STATUS_BREACHED: "breached",
  STATUS_SETTLED: "settled",
  STATUS_EXPIRED: "expired",
  FRONTIER_PAST_LIVE_WINDOW: "expired",
  FRONTIER_UNAVAILABLE: "warn",
  CAPACITY_EXCEEDED: "warn",
  WRONG_COUNTERPARTY: "warn",
  BOND_BELOW_EXPOSURE: "warn",
  UNKNOWN_COVERAGE: "warn",
};

export function ReasonPill({ valid, reason }: { valid: boolean; reason: number }) {
  const name = REASON_NAMES[reason] ?? "UNKNOWN";
  const tone = valid ? "active" : (REASON_TONE[name] ?? "warn");
  return (
    <span className={`badge badge-${tone}`}>
      {valid ? "isValid → VALID" : `isValid → ${name}`}
    </span>
  );
}

export function Addr({ value, chars = 4 }: { value: `0x${string}`; chars?: number }) {
  return (
    <a
      className="txlink"
      href={`${EXPLORER_ADDR_BASE}${value}`}
      target="_blank"
      rel="noreferrer"
      title={value}
    >
      {value.slice(0, 2 + chars)}…{value.slice(-chars)}
    </a>
  );
}

export function TxLink({ hash, label }: { hash: `0x${string}`; label?: string }) {
  return (
    <a className="txlink" href={`${EXPLORER_TX_BASE}${hash}`} target="_blank" rel="noreferrer">
      {label ?? `${hash.slice(0, 10)}…${hash.slice(-6)}`}
    </a>
  );
}

export function Notice({
  tone = "neutral",
  children,
}: {
  tone?: "ok" | "bad" | "warn" | "info" | "neutral";
  children: ReactNode;
}) {
  return <div className={`notice n-${tone}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function Loading({ what = "reading the chain…" }: { what?: string }) {
  return <div className="loading">{what}</div>;
}

/** A read that failed says so; it never falls back to a number that might be wrong. */
export function ReadError({ error, what }: { error: string; what: string }) {
  return (
    <Notice tone="bad">
      <div>
        <strong>could not read {what}.</strong>
        <div className="mono" style={{ marginTop: 6 }}>
          {error}
        </div>
        <div style={{ marginTop: 6, fontSize: 11 }}>
          The RPC or the deployment is unreachable. This app shows nothing rather than a stale value.
        </div>
      </div>
    </Notice>
  );
}

type TxState =
  | { s: "idle" }
  | { s: "running" }
  | { s: "done"; hash: `0x${string}` }
  | { s: "error"; message: string };

/**
 * Submit a transaction and report every state. `onRun` must return a SendResult from
 * lib/actions — the component never invents a success.
 */
export function TxButton({
  onRun,
  children,
  solid,
  danger,
  disabled,
  block,
  confirmNote,
  onDone,
}: {
  onRun: () => Promise<SendResult>;
  children: ReactNode;
  solid?: boolean;
  danger?: boolean;
  disabled?: boolean;
  block?: boolean;
  confirmNote?: ReactNode;
  onDone?: () => void;
}) {
  const [st, setSt] = useState<TxState>({ s: "idle" });

  async function go() {
    setSt({ s: "running" });
    const res = await onRun();
    if (res.ok) {
      setSt({ s: "done", hash: res.hash });
      onDone?.();
    } else {
      setSt({ s: "error", message: res.message });
    }
  }

  const label =
    st.s === "running" ? "confirm in wallet…" : st.s === "done" ? "done" : null;

  return (
    <div className="stack-sm">
      <button
        className={`act${solid ? " act-solid" : ""}${block ? " act-block" : ""}`}
        onClick={go}
        disabled={disabled || st.s === "running"}
        type="button"
        style={danger ? { borderColor: "var(--blood)", color: "var(--blood)" } : undefined}
      >
        {label ?? children}
      </button>
      {st.s === "done" && st.hash !== "0x" ? (
        <Notice tone="ok">
          <div>
            <strong>confirmed.</strong> {confirmNote}
            <div style={{ marginTop: 6 }}>
              <TxLink hash={st.hash} />
            </div>
          </div>
        </Notice>
      ) : null}
      {st.s === "done" && st.hash === "0x" ? (
        <Notice tone="ok">Already satisfied — no transaction was needed.</Notice>
      ) : null}
      {st.s === "error" ? (
        <Notice tone="bad">
          <div>
            <strong>refused.</strong>
            <div className="mono" style={{ marginTop: 6 }}>
              {st.message}
            </div>
          </div>
        </Notice>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

/** The numbered section rule from the landing, reused for console sections. */
export function SecTag({ no, children }: { no: string; children: ReactNode }) {
  return (
    <div className="sec-tag">
      <span className="tag">
        <span className="no">{no}</span> · {children}
      </span>
    </div>
  );
}

export { EXPLORER_ADDR_BASE, EXPLORER_TX_BASE };

/** An amount field with the unit shown inside the well, so the number is never ambiguous. */
export function AmountInput({
  value,
  onChange,
  unit,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <span className="input-unit">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        disabled={disabled}
      />
      {unit ? <span className="unit">{unit}</span> : null}
    </span>
  );
}

/** Quick-fill chips for an amount field. */
export function Chips({
  options,
  onPick,
  disabled,
}: {
  options: { label: string; value: string }[];
  onPick: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="chip-row">
      {options.map((o) => (
        <button
          key={o.label}
          className="chip"
          type="button"
          disabled={disabled}
          onClick={() => onPick(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
