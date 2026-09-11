"use client";

// Position feed, in the console's card language: big display id, a status badge, the
// validity reason, a grid of read values, and a draw bar that turns red on a breach.
// Every value is a contract read; `actions` lets a page attach the operations that viewer is
// actually entitled to, so the feed never offers a button the contracts would reject.

import { Fragment, useState, type ReactNode } from "react";
import { ADDR, SOURCE_CHAIN_LABEL } from "@/lib/chain";
import { money, type Coverage } from "@/lib/protocol";
import { Addr, Pill, ReasonPill, TxLink } from "./ui";

const PREDICATE_LABELS: Record<string, string> = {
  [ADDR.predicates.prohibitedRecipient.toLowerCase()]: "ProhibitedRecipient",
  [ADDR.predicates.amountAboveLimit.toLowerCase()]: "AmountAboveLimit",
  [ADDR.predicates.amountBelowFloor.toLowerCase()]: "AmountBelowFloor",
};

export function predicateName(addr: string): string {
  return PREDICATE_LABELS[addr.toLowerCase()] ?? "Custom predicate";
}

function badgeClass(status: number): string {
  switch (status) {
    case 0:
      return "badge badge-active";
    case 1:
      return "badge badge-breached";
    case 3:
      return "badge badge-settled";
    default:
      return "badge badge-expired";
  }
}

const STATUS = ["ACTIVE", "BREACHED", "EXPIRED", "SETTLED"];

export function PositionsTable({
  rows,
  frontier,
  actions,
  empty = "No coverage positions.",
}: {
  rows: Coverage[];
  frontier: bigint | null;
  actions?: (c: Coverage) => ReactNode;
  empty?: string;
}) {
  const [open, setOpen] = useState<bigint | null>(null);

  if (rows.length === 0) return <div className="empty-state">{empty}</div>;

  return (
    <div style={{ padding: 22 }}>
      {rows.map((c) => {
        const drawnPct =
          c.maxExposure > 0n ? Number((c.drawn * 10000n) / c.maxExposure) / 100 : 0;
        const remaining = c.maxExposure - c.drawn;
        const settledByFrontier = frontier !== null && frontier > c.liveUntilHeight;

        return (
          <article className="pos-card" key={String(c.id)}>
            <div className="pos-head">
              <button
                onClick={() => setOpen(open === c.id ? null : c.id)}
                className="pos-id"
                type="button"
                title="show the full position record"
                style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", padding: 0 }}
              >
                #{String(c.id)}
              </button>
              <span className={badgeClass(c.status)}>{STATUS[c.status] ?? "UNKNOWN"}</span>
              {c.status === 0 && c.valid ? (
                <span className="badge badge-active">
                  <span className="flick">●</span>&nbsp;gating exposure
                </span>
              ) : null}
              <span className="pos-reason">
                <ReasonPill valid={c.valid} reason={c.reason} />
              </span>
            </div>

            <div className="pos-grid">
              <div>
                <div className="pos-k">max exposure</div>
                <div className="pos-v">{money(c.maxExposure)}</div>
              </div>
              <div>
                <div className="pos-k">bond locked</div>
                <div className="pos-v">{money(c.bond)}</div>
              </div>
              <div>
                <div className="pos-k">drawn</div>
                <div className="pos-v">
                  {money(c.drawn)}
                  {remaining !== c.maxExposure ? (
                    <span className="dim"> · {money(remaining)} left</span>
                  ) : null}
                </div>
              </div>
              <div>
                <div className="pos-k">premium paid</div>
                <div className="pos-v">{money(c.premium)}</div>
              </div>
              <div>
                <div className="pos-k">covered window · {SOURCE_CHAIN_LABEL.toLowerCase()}</div>
                <div className="pos-v">
                  {c.startBlock.toLocaleString("en-US")} → {c.endBlock.toLocaleString("en-US")}
                </div>
              </div>
              <div>
                <div className="pos-k">required depth</div>
                <div className="pos-v">
                  {String(c.requiredDepth)}
                  {settledByFrontier ? <span className="dim"> · frontier passed</span> : null}
                </div>
              </div>
              <div>
                <div className="pos-k">borrower</div>
                <div className="pos-v">
                  <Addr value={c.borrower} />
                </div>
              </div>
              <div>
                <div className="pos-k">underwriter</div>
                <div className="pos-v">
                  <Addr value={c.underwriter} />
                </div>
              </div>
            </div>

            <div className="drawbar" title={`${drawnPct}% of max exposure drawn`}>
              <div
                className={`drawbar-fill${c.status === 1 ? " loss-bg" : ""}`}
                style={{ width: `${Math.min(drawnPct, 100)}%` }}
              />
            </div>

            {c.status === 1 ? (
              <div style={{ marginTop: 14, fontSize: 11, color: "var(--blood)" }}>
                breached by counterexample · challenge key {c.challengeKey.slice(0, 10)}…
                {c.challengeKey.slice(-6)} · bond paid to the challenger, draws frozen forever
              </div>
            ) : null}

            {actions ? (
              <div className="act-row" style={{ marginTop: 18 }}>
                {actions(c)}
              </div>
            ) : null}

            {open === c.id ? (
              <div className="record" style={{ marginTop: 20 }}>
                <div className="cols-3">
                  <div>
                    <span className="tag">record</span>
                    <dl className="kv" style={{ marginTop: 12 }}>
                      <dt>capacity</dt>
                      <dd>{money(c.capacity)}</dd>
                      <dt>chain key</dt>
                      <dd>{String(c.chainKey)}</dd>
                      <dt>live until</dt>
                      <dd>{c.liveUntilHeight.toLocaleString("en-US")}</dd>
                      <dt>created at</dt>
                      <dd>{c.createdAtBlock.toLocaleString("en-US")}</dd>
                    </dl>
                  </div>
                  <div>
                    <span className="tag">invariant</span>
                    <dl className="kv" style={{ marginTop: 12 }}>
                      <dt>predicate</dt>
                      <dd>{predicateName(c.predicate)}</dd>
                      <dt>predicate addr</dt>
                      <dd>
                        <Addr value={c.predicate} />
                      </dd>
                      <dt>params</dt>
                      <dd>{c.predicateParams.slice(0, 18)}…</dd>
                    </dl>
                  </div>
                  <div>
                    <span className="tag">evidence</span>
                    <dl className="kv" style={{ marginTop: 12 }}>
                      <dt>source contract</dt>
                      <dd>
                        <Addr value={c.sourceContract} />
                      </dd>
                      <dt>topic0</dt>
                      <dd>{c.eventSignature.slice(0, 12)}…</dd>
                      <dt>frontier now</dt>
                      <dd>{frontier !== null ? frontier.toLocaleString("en-US") : "unavailable"}</dd>
                    </dl>
                    {c.status === 1 ? (
                      <div style={{ marginTop: 12 }}>
                        <Pill tone="breached">
                          breached · key {c.challengeKey.slice(0, 10)}…
                        </Pill>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export { Fragment, TxLink };
