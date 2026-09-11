"use client";

// Position table. One row per on-chain coverage position, every value read from the
// engine. `actions` lets a page attach the operations it is allowed to expose — the table
// itself never invents a button that the contracts would reject for that viewer.

import { Fragment, useState, type ReactNode } from "react";
import { ADDR, EXPLORER_ADDR_BASE, EXPLORER_TX_BASE, SOURCE_CHAIN_LABEL } from "@/lib/chain";
import { money, type Coverage } from "@/lib/protocol";
import { Addr, Pill, ReasonPill, StatusPill } from "./ui";

const PREDICATE_LABELS: Record<string, string> = {
  [ADDR.predicates.prohibitedRecipient.toLowerCase()]: "ProhibitedRecipient",
  [ADDR.predicates.amountAboveLimit.toLowerCase()]: "AmountAboveLimit",
  [ADDR.predicates.amountBelowFloor.toLowerCase()]: "AmountBelowFloor",
};

export function predicateName(addr: string): string {
  return PREDICATE_LABELS[addr.toLowerCase()] ?? "Custom predicate";
}

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

  if (rows.length === 0) {
    return <div className="empty">{empty}</div>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Status</th>
          <th>Validity</th>
          <th className="num">Exposure</th>
          <th className="num">Bond</th>
          <th className="num">Drawn</th>
          <th>Window ({SOURCE_CHAIN_LABEL})</th>
          <th className="num">Depth</th>
          <th>Counterparty</th>
          {actions ? <th className="num">Actions</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => {
          const remaining = c.maxExposure - c.drawn;
          const settledByFrontier = frontier !== null && frontier > c.liveUntilHeight;
          return (
            <Fragment key={String(c.id)}>
              <tr>
                <td className="mono">
                  <button
                    onClick={() => setOpen(open === c.id ? null : c.id)}
                    type="button"
                    style={{ background: "none", border: 0, color: "var(--accent)", cursor: "pointer", font: "inherit", padding: 0 }}
                    title="Show the full position record"
                  >
                    #{String(c.id)}
                  </button>
                </td>
                <td><StatusPill status={c.status} /></td>
                <td><ReasonPill valid={c.valid} reason={c.reason} /></td>
                <td className="num">{money(c.maxExposure)}</td>
                <td className="num">{money(c.bond)}</td>
                <td className="num">
                  {money(c.drawn)}
                  {c.drawn > 0n ? (
                    <div style={{ height: 4, marginTop: 4 }}>
                      <div className="bar">
                        <i
                          className="ok"
                          style={{ width: `${Number((c.drawn * 100n) / (c.maxExposure || 1n))}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </td>
                <td className="mono">
                  {c.startBlock.toLocaleString("en-US")} → {c.endBlock.toLocaleString("en-US")}
                </td>
                <td className="num">
                  {String(c.requiredDepth)}
                  {settledByFrontier ? <div className="footnote">frontier passed</div> : null}
                </td>
                <td>
                  <div className="mono" style={{ fontSize: "0.6875rem", lineHeight: 1.6 }}>
                    <div>B <Addr value={c.borrower} /></div>
                    <div>U <Addr value={c.underwriter} /></div>
                  </div>
                </td>
                {actions ? <td><div className="row-actions">{actions(c)}</div></td> : null}
              </tr>
              {open === c.id ? (
                <tr>
                  <td colSpan={actions ? 10 : 9} style={{ background: "var(--surface-2)" }}>
                    <div className="grid cols-3" style={{ alignItems: "start" }}>
                      <div>
                        <div className="stat-k" style={{ marginBottom: 8 }}>Position record</div>
                        <dl className="kv">
                          <dt>Coverage id</dt><dd>#{String(c.id)}</dd>
                          <dt>Borrower</dt><dd><Addr value={c.borrower} chars={6} /></dd>
                          <dt>Underwriter</dt><dd><Addr value={c.underwriter} chars={6} /></dd>
                          <dt>Capacity</dt><dd>{money(c.capacity)}</dd>
                          <dt>Max exposure</dt><dd>{money(c.maxExposure)}</dd>
                          <dt>Drawn</dt><dd>{money(c.drawn)}</dd>
                          <dt>Remaining</dt><dd>{money(remaining)}</dd>
                          <dt>Bond locked</dt><dd>{money(c.bond)}</dd>
                          <dt>Premium paid</dt><dd>{money(c.premium)}</dd>
                        </dl>
                      </div>
                      <div>
                        <div className="stat-k" style={{ marginBottom: 8 }}>Covered window</div>
                        <dl className="kv">
                          <dt>Chain key</dt><dd>{String(c.chainKey)}</dd>
                          <dt>Start block</dt><dd>{c.startBlock.toLocaleString("en-US")}</dd>
                          <dt>End block</dt><dd>{c.endBlock.toLocaleString("en-US")}</dd>
                          <dt>Required depth</dt><dd>{String(c.requiredDepth)}</dd>
                          <dt>Live until</dt><dd>{c.liveUntilHeight.toLocaleString("en-US")}</dd>
                          <dt>Frontier now</dt><dd>{frontier !== null ? frontier.toLocaleString("en-US") : "unavailable"}</dd>
                          <dt>Created at</dt><dd>Creditcoin block {c.createdAtBlock.toLocaleString("en-US")}</dd>
                        </dl>
                      </div>
                      <div>
                        <div className="stat-k" style={{ marginBottom: 8 }}>Invariant &amp; evidence</div>
                        <dl className="kv">
                          <dt>Predicate</dt><dd>{predicateName(c.predicate)}</dd>
                          <dt>Predicate addr</dt><dd><Addr value={c.predicate} /></dd>
                          <dt>Params</dt><dd style={{ wordBreak: "break-all" }}>{c.predicateParams.slice(0, 22)}…</dd>
                          <dt>Source contract</dt><dd><Addr value={c.sourceContract} /></dd>
                          <dt>Event topic0</dt><dd>{c.eventSignature.slice(0, 12)}…</dd>
                        </dl>
                        <div className="actions" style={{ marginTop: 12 }}>
                          <a className="btn btn-sm" href={`${EXPLORER_ADDR_BASE}${ADDR.engine}`} target="_blank" rel="noreferrer">
                            Engine on explorer
                          </a>
                          {c.status === 1 && c.challengeKey !== `0x${"0".repeat(64)}` ? (
                            <Pill tone="bad">breached by {c.challengeKey.slice(0, 10)}…</Pill>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export { EXPLORER_TX_BASE, EXPLORER_ADDR_BASE };
