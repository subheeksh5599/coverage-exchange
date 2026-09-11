"use client";

// Shared UI atoms. `TxButton` is the important one: it is the only way this app submits a
// transaction, and it surfaces all four states a user needs (simulating, awaiting wallet,
// confirming, confirmed/failed) with the explorer link on success and the decoded revert on
// failure. A button that silently does nothing is the bug this component exists to prevent.

import { useState, type ReactNode } from "react";
import { EXPLORER, EXPLORER_ADDR_BASE, EXPLORER_TX_BASE, STATUS_NAMES, REASON_NAMES } from "@/lib/chain";
import type { SendResult } from "@/lib/tx";

export function Card({
  title,
  hint,
  children,
  actions,
  flush,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-head">
          <div>
            <h2>{title}</h2>
            {hint ? <div className="hint">{hint}</div> : null}
          </div>
          {actions}
        </header>
      )}
      <div className={flush ? "card-body tight" : "card-body"}>{children}</div>
    </section>
  );
}

export function Stat({
  k,
  v,
  n,
  tone,
}: {
  k: ReactNode;
  v: ReactNode;
  n?: ReactNode;
  tone?: "ok" | "bad" | "warn";
}) {
  return (
    <div className="card stat">
      <div className="stat-k">{k}</div>
      <div className={`stat-v${tone ? " " + tone : ""}`}>{v}</div>
      {n ? <div className="stat-n">{n}</div> : null}
    </div>
  );
}

export function Pill({ tone = "neutral", children }: { tone?: string; children: ReactNode }) {
  return <span className={`pill p-${tone}`}>{children}</span>;
}

/** Coverage status with the protocol's own vocabulary and colour contract. */
export function StatusPill({ status }: { status: number }) {
  const name = STATUS_NAMES[status] ?? "UNKNOWN";
  const tone = name === "ACTIVE" ? "ok" : name === "BREACHED" ? "bad" : name === "EXPIRED" ? "warn" : "accent";
  const dot = name === "ACTIVE" ? "dot-ok" : name === "BREACHED" ? "dot-bad" : "dot-idle";
  return (
    <span className={`pill p-${tone}`}>
      <i className={`dot ${dot}`} />
      {name}
    </span>
  );
}

/** The engine's isValid reason, spelled out rather than shown as a number. */
export function ReasonPill({ valid, reason }: { valid: boolean; reason: number }) {
  const name = REASON_NAMES[reason] ?? "UNKNOWN";
  return (
    <span className={`pill p-${valid ? "ok" : "bad"}`}>
      {valid ? "isValid → VALID" : `isValid → ${name}`}
    </span>
  );
}

export function Addr({ value, chars = 4 }: { value: `0x${string}`; chars?: number }) {
  const short = `${value.slice(0, 2 + chars)}…${value.slice(-chars)}`;
  return (
    <a href={`${EXPLORER_ADDR_BASE}${value}`} target="_blank" rel="noreferrer" className="mono" title={value}>
      {short}
    </a>
  );
}

export function TxLink({ hash, label }: { hash: `0x${string}`; label?: string }) {
  return (
    <a href={`${EXPLORER_TX_BASE}${hash}`} target="_blank" rel="noreferrer" className="mono">
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
  return <div className="empty">{children}</div>;
}

export function Loading({ what = "Reading the chain…" }: { what?: string }) {
  return <div className="loading">{what}</div>;
}

/** A read that failed says so; it never falls back to a number that might be wrong. */
export function ReadError({ error, what }: { error: string; what: string }) {
  return (
    <Notice tone="bad">
      <div>
        <strong>Could not read {what}.</strong>
        <div className="mono" style={{ marginTop: 4 }}>{error}</div>
        <div style={{ marginTop: 6, fontSize: "0.75rem" }}>
          The RPC or the deployment is unreachable. This app shows nothing rather than a stale value.
        </div>
      </div>
    </Notice>
  );
}

type TxState =
  | { s: "idle" }
  | { s: "running" }
  | { s: "waiting" }
  | { s: "done"; hash: `0x${string}` }
  | { s: "error"; message: string };

/**
 * Submit a transaction and report every state. `onRun` must return a SendResult from
 * lib/actions — the component never invents a success.
 */
export function TxButton({
  onRun,
  children,
  variant,
  disabled,
  block,
  confirmNote,
  onDone,
}: {
  onRun: () => Promise<SendResult>;
  children: ReactNode;
  variant?: "primary" | "danger";
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
      // A zero hash means "already satisfied, nothing to send" (an allowance that was
      // already sufficient). Report it as done without claiming a transaction happened.
      setSt({ s: "done", hash: res.hash });
      onDone?.();
    } else {
      setSt({ s: "error", message: res.message });
    }
  }

  const label =
    st.s === "running" ? "Confirm in wallet…" : st.s === "waiting" ? "Pending…" : st.s === "done" ? "Done" : null;

  return (
    <div className={block ? "field" : undefined} style={block ? undefined : { display: "inline-flex", flexDirection: "column", gap: 6 }}>
      <button
        className={`btn${variant === "primary" ? " btn-primary" : variant === "danger" ? " btn-danger" : ""}${block ? " btn-block" : ""}`}
        onClick={go}
        disabled={disabled || st.s === "running"}
        type="button"
      >
        {label ?? children}
      </button>
      {st.s === "done" && st.hash !== "0x" ? (
        <Notice tone="ok">
          <div>
            <strong>Confirmed.</strong> {confirmNote}
            <div style={{ marginTop: 4 }}>
              <TxLink hash={st.hash} />
            </div>
          </div>
        </Notice>
      ) : null}
      {st.s === "done" && st.hash === "0x" ? <Notice tone="ok">Already satisfied — no transaction was needed.</Notice> : null}
      {st.s === "error" ? (
        <Notice tone="bad">
          <div>
            <strong>Refused.</strong>
            <div className="mono" style={{ marginTop: 4 }}>{st.message}</div>
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

export { EXPLORER, EXPLORER_TX_BASE, EXPLORER_ADDR_BASE };
