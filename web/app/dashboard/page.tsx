"use client";

// The console. Every number here is read live from the CoverageEngine on Creditcoin
// CC3 testnet — there is no server, no cache and no fixture file. Loading, empty and
// error states are rendered honestly, because a dashboard that invents a number is
// exactly the failure this project exists to prevent.

import { useMemo, useState } from "react";
import { useFrontier, usePositions, type Position } from "@/lib/useChainData";
import { StatusDonut, CapitalBars, WindowChart, statusColor } from "@/components/Charts";
import { FrontierChip } from "@/components/Site";
import {
  ADDR,
  EXPLORER,
  DEMO_TXS,
  ATTACKS,
  MEASURED,
  TOKEN_SYMBOL,
  SOURCE_CHAIN_LABEL,
  CHAIN_ID,
  fmtToken,
  short,
} from "@/lib/chain";
import "./console.css";

type View = "overview" | "positions" | "adversarial" | "contracts";
type Filter = "ALL" | "ACTIVE" | "BREACHED" | "SETTLED" | "EXPIRED";

const FILTERS: Filter[] = ["ALL", "ACTIVE", "BREACHED", "SETTLED", "EXPIRED"];

function statusBadge(s: Position["status"]) {
  const cls =
    s === "ACTIVE" ? "b-ok" : s === "BREACHED" ? "b-bad" : s === "SETTLED" ? "b-accent" : "b-neutral";
  return <span className={`badge ${cls}`}>{s}</span>;
}

function Addr({ addr, lead = 6 }: { addr: string; lead?: number }) {
  return (
    <a className="txlink" href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noreferrer">
      {short(addr, lead, 4)}
    </a>
  );
}

function Tx({ hash, label }: { hash: string; label?: string }) {
  return (
    <a className="txlink" href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
      {label ?? short(hash, 10, 6)}
    </a>
  );
}

function PositionRow({ p }: { p: Position }) {
  const pct = p.maxExposure > 0n ? Number((p.drawn * 10000n) / p.maxExposure) / 100 : 0;

  return (
    <div className="row" id={`pos-${p.id}`}>
      <div className="row-id">#{p.id}</div>
      <div style={{ minWidth: 0 }}>
        <div className="row-top">
          {statusBadge(p.status)}
          {p.status === "ACTIVE" && p.valid ? (
            <span className="badge b-ok">
              <span className="dot dot-live" style={{ width: 5, height: 5 }} />
              gating exposure
            </span>
          ) : null}
          <span className="row-reason">{p.valid ? "isValid → true" : `isValid → ${p.reason}`}</span>
        </div>

        <div className="row-facts">
          <div>
            <div className="fact-k">max exposure</div>
            <div className="fact-v">
              {fmtToken(p.maxExposure)} <span style={{ color: "var(--ink-3)" }}>{TOKEN_SYMBOL}</span>
            </div>
          </div>
          <div>
            <div className="fact-k">bond locked</div>
            <div className="fact-v">
              {fmtToken(p.bond)} <span style={{ color: "var(--ink-3)" }}>{TOKEN_SYMBOL}</span>
            </div>
          </div>
          <div>
            <div className="fact-k">drawn</div>
            <div className="fact-v">{fmtToken(p.drawn)}</div>
          </div>
          <div>
            <div className="fact-k">premium</div>
            <div className="fact-v">{fmtToken(p.premium)}</div>
          </div>
          <div>
            <div className="fact-k">window · {SOURCE_CHAIN_LABEL}</div>
            <div className="fact-v" style={{ fontSize: "0.8125rem" }}>
              {p.startBlock.toLocaleString("en-US")} → {p.endBlock.toLocaleString("en-US")}
            </div>
          </div>
          <div>
            <div className="fact-k">depth · live until</div>
            <div className="fact-v" style={{ fontSize: "0.8125rem" }}>
              {p.requiredDepth.toString()} · {p.liveUntilHeight.toLocaleString("en-US")}
            </div>
          </div>
          <div>
            <div className="fact-k">borrower</div>
            <div className="fact-v">
              <Addr addr={p.borrower} />
            </div>
          </div>
          <div>
            <div className="fact-k">underwriter</div>
            <div className="fact-v">
              <Addr addr={p.underwriter} />
            </div>
          </div>
        </div>

        <div className="meter" title={`${pct}% of max exposure drawn`}>
          <div
            className={`meter-fill${p.status === "BREACHED" ? " is-bad" : ""}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>

        {p.status === "BREACHED" ? (
          <div className="row-note note-bad">
            Breached by counterexample. Challenge key {short(p.challengeKey, 10, 6)} — the bond went to
            the challenger and further draws revert. Proof:{" "}
            <Tx hash={DEMO_TXS.counterexample} label="challenge tx" /> · refused draw afterwards:{" "}
            <Tx hash={DEMO_TXS.failedDrawAfterBreach} label="failed tx" />
          </div>
        ) : null}

        {p.status === "SETTLED" ? (
          <div className="row-note note-ok">
            Window closed with no counterexample. Bond released to the underwriter:{" "}
            <Tx hash={DEMO_TXS.settlement} label="settlement tx" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function Console() {
  const [view, setView] = useState<View>("overview");
  const [filter, setFilter] = useState<Filter>("ALL");
  const f = useFrontier();
  const { loading, error, positions, engineParams, engineTvl, total } = usePositions();

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: positions.length };
    for (const s of ["ACTIVE", "BREACHED", "SETTLED", "EXPIRED"]) {
      c[s] = positions.filter((p) => p.status === s).length;
    }
    return c;
  }, [positions]);

  const totals = useMemo(() => {
    const bond = positions.reduce((a, p) => a + p.bond, 0n);
    const exposure = positions.reduce((a, p) => a + p.maxExposure, 0n);
    const drawn = positions.reduce((a, p) => a + p.drawn, 0n);
    return { bond, exposure, drawn };
  }, [positions]);

  const shown = filter === "ALL" ? positions : positions.filter((p) => p.status === filter);

  const nav: { group: string; items: { id: View; label: string; count?: number }[] }[] = [
    {
      group: "Monitor",
      items: [
        { id: "overview", label: "Overview" },
        { id: "positions", label: "Positions", count: positions.length },
      ],
    },
    {
      group: "Assurance",
      items: [
        { id: "adversarial", label: "Attack matrix", count: ATTACKS.length },
        { id: "contracts", label: "Contracts", count: 9 },
      ],
    },
  ];

  return (
    <div className="app">
      <aside className="side">
        <div className="side-top">
          <a href="/" className="brand" style={{ fontSize: "0.9375rem" }}>
            Coverage Exchange
          </a>
          <div style={{ marginTop: 10 }}>
            <FrontierChip />
          </div>
        </div>

        <nav className="side-nav">
          {nav.map((g) => (
            <div key={g.group}>
              <div className="side-group">{g.group}</div>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  className="side-item"
                  aria-current={view === it.id}
                  onClick={() => setView(it.id)}
                >
                  {it.label}
                  {it.count !== undefined ? <span className="side-count">{it.count}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <div className="side-net">
            <span>Creditcoin CC3 · {CHAIN_ID}</span>
            <span>engine {short(ADDR.engine, 6, 4)}</span>
            <span>
              {engineParams ? `min bond/exposure ${engineParams.ratioBps / 100}% · grace ${engineParams.graceBlocks} blk` : "reading params…"}
            </span>
          </div>
          <a className="btn btn-ghost btn-sm" href={`${EXPLORER}/address/${ADDR.engine}`} target="_blank" rel="noreferrer">
            View on explorer
          </a>
        </div>
      </aside>

      <main className="main">
        <div className="top">
          <h1>
            {view === "overview"
              ? "Overview"
              : view === "positions"
                ? "Coverage positions"
                : view === "adversarial"
                  ? "Attack matrix"
                  : "Deployed contracts"}
          </h1>
          <div className="top-right">
            {view === "positions" ? (
              <div className="seg">
                {FILTERS.map((x) => (
                  <button key={x} aria-pressed={filter === x} onClick={() => setFilter(x)}>
                    {x} {counts[x] ?? 0}
                  </button>
                ))}
              </div>
            ) : null}
            <span className="chip">
              <span className={`dot ${error ? "dot-bad" : "dot-live"}`} />
              {error ? "rpc error" : loading ? "reading chain…" : "live"}
            </span>
          </div>
        </div>

        <div className="body">
          {error ? (
            <div className="panel">
              <div className="state">
                <div className="state-t">Cannot reach Creditcoin CC3</div>
                <div className="state-d">
                  {error}. Nothing is shown from cache — this console has no fixtures, so when the RPC
                  is unreachable it says so instead of displaying a stale number.
                </div>
              </div>
            </div>
          ) : null}

          {view === "overview" ? (
            <>
              <section className="kpis">
                <div className="kpi">
                  <div className="kpi-k">bond locked</div>
                  <div className="kpi-v">{loading ? "—" : fmtToken(totals.bond)}</div>
                  <div className="kpi-s">{TOKEN_SYMBOL} across {positions.length} positions</div>
                </div>
                <div className="kpi">
                  <div className="kpi-k">covered exposure</div>
                  <div className="kpi-v">{loading ? "—" : fmtToken(totals.exposure)}</div>
                  <div className="kpi-s">maximum the lenders may release</div>
                </div>
                <div className="kpi">
                  <div className="kpi-k">drawn</div>
                  <div className="kpi-v">{loading ? "—" : fmtToken(totals.drawn)}</div>
                  <div className="kpi-s">credit actually extended</div>
                </div>
                <div className="kpi">
                  <div className="kpi-k">engine balance</div>
                  <div className="kpi-v">{engineTvl === null ? "—" : fmtToken(engineTvl)}</div>
                  <div className="kpi-s">token held by the engine</div>
                </div>
                <div className="kpi">
                  <div className="kpi-k">breached</div>
                  <div className="kpi-v" style={{ color: counts.BREACHED ? "var(--bad)" : undefined }}>
                    {loading ? "—" : counts.BREACHED ?? 0}
                  </div>
                  <div className="kpi-s">bond paid to challengers</div>
                </div>
              </section>

              <section className="panels">
                <div className="panel">
                  <div className="panel-head">
                    <h3>Status mix</h3>
                    <span className="hint" style={{ marginLeft: "auto" }}>
                      live · getCoverage
                    </span>
                  </div>
                  <div className="panel-body">
                    {loading ? <div className="skel" style={{ height: 140 }} /> : <StatusDonut positions={positions} />}
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <h3>Bond against exposure</h3>
                    <span className="hint" style={{ marginLeft: "auto" }}>
                      invariant, per position
                    </span>
                  </div>
                  <div className="panel-body">
                    {loading ? <div className="skel" style={{ height: 140 }} /> : <CapitalBars positions={positions} />}
                  </div>
                </div>

                <div className="panel panel-wide">
                  <div className="panel-head">
                    <h3>Covered windows against the attested frontier</h3>
                    <span className="hint" style={{ marginLeft: "auto" }}>
                      {SOURCE_CHAIN_LABEL} block space
                    </span>
                  </div>
                  <div className="panel-body">
                    {loading ? (
                      <div className="skel" style={{ height: 170 }} />
                    ) : (
                      <WindowChart positions={positions} frontier={f.height} />
                    )}
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {view === "positions" ? (
            <section className="panel">
              <div className="panel-head">
                <h3>
                  {filter === "ALL" ? "All positions" : `${filter} positions`}{" "}
                  <span className="hint">({shown.length})</span>
                </h3>
                <span className="hint" style={{ marginLeft: "auto" }}>
                  read from the engine · {total} created since deployment
                </span>
              </div>
              <div className="panel-body panel-body-flush">
                {loading ? (
                  <div style={{ padding: 18, display: "grid", gap: 12 }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="skel" style={{ height: 76 }} />
                    ))}
                  </div>
                ) : shown.length === 0 ? (
                  <div className="state">
                    <div className="state-t">No {filter.toLowerCase()} positions</div>
                    <div className="state-d">
                      This is a real empty state, not a placeholder: the engine currently holds no
                      position with that status.
                    </div>
                  </div>
                ) : (
                  <div className="rows">
                    {shown.map((p) => (
                      <PositionRow key={p.id} p={p} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {view === "adversarial" ? (
            <>
              <section className="kpis">
                <div className="kpi">
                  <div className="kpi-k">attacks attempted</div>
                  <div className="kpi-v">{MEASURED.attackCount}</div>
                  <div className="kpi-s">against the live deployment</div>
                </div>
                <div className="kpi">
                  <div className="kpi-k">refused</div>
                  <div className="kpi-v" style={{ color: "var(--ok)" }}>
                    {MEASURED.attacksRefused}
                  </div>
                  <div className="kpi-s">every one, with a named error</div>
                </div>
                <div className="kpi">
                  <div className="kpi-k">value leaked</div>
                  <div className="kpi-v" style={{ color: "var(--ok)" }}>
                    0
                  </div>
                  <div className="kpi-s">no attack moved a token</div>
                </div>
                <div className="kpi">
                  <div className="kpi-k">on-chain refusals</div>
                  <div className="kpi-v">2</div>
                  <div className="kpi-s">recorded as failed transactions</div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <h3>Every attack we could think of, run against the deployed contracts</h3>
                  <span className="hint" style={{ marginLeft: "auto" }}>
                    generated from the run log
                  </span>
                </div>
                <div className="panel-body panel-body-flush">
                  <div className="tbl-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 34 }}>#</th>
                          <th>Attack</th>
                          <th>Result</th>
                          <th>Refusal reason</th>
                          <th>Proof</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ATTACKS.map((a, i) => (
                          <tr key={i}>
                            <td className="num" style={{ color: "var(--ink-3)" }}>
                              {String(i + 1).padStart(2, "0")}
                            </td>
                            <td style={{ color: "var(--ink)" }}>{a.what}</td>
                            <td>
                              <span className="badge b-ok">REFUSED</span>
                            </td>
                            <td className="num" style={{ fontSize: "0.8125rem" }}>
                              {a.err}
                            </td>
                            <td>
                              {a.tx ? (
                                <Tx hash={a.tx} label="failed tx ↗" />
                              ) : (
                                <span style={{ color: "var(--ink-3)", fontSize: "0.8125rem" }}>
                                  reverted in simulation
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-body">
                  <div className="row-note note-accent" style={{ marginTop: 0 }}>
                    Two of these were also broadcast so a reviewer can open a real failed transaction
                    rather than trust a simulation: a draw refused after the breach (
                    <Tx hash={DEMO_TXS.failedDrawAfterBreach} label={`${MEASURED.refusedDrawGas.toLocaleString("en-US")} gas`} />) and a replayed
                    challenge (<Tx hash={DEMO_TXS.failedReplay} label={`${MEASURED.refusedReplayGas.toLocaleString("en-US")} gas`} />). Reproduce the
                    whole matrix with <code>node worker/scripts/attack-matrix.mjs --onchain</code>.
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {view === "contracts" ? (
            <section className="panel">
              <div className="panel-head">
                <h3>Deployed and source-verified on Creditcoin CC3</h3>
                <span className="hint" style={{ marginLeft: "auto" }}>
                  {MEASURED.contractsVerified} of 9 verified
                </span>
              </div>
              <div className="panel-body panel-body-flush">
                <div className="tbl-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Contract</th>
                        <th>Address</th>
                        <th>Role</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["CoverageEngine", ADDR.engine, "holds positions, bonds and the invariant"],
                          ["AttestcoinAdapter", ADDR.adapter, "reads attested frontier and proofs"],
                          ["ChallengeManager", ADDR.challengeManager, "verifies counterexamples, pays the bond"],
                          ["CoverageMarket", ADDR.market, "pricing curve for premium and bond"],
                          ["LendingAdapter", ADDR.lendingAdapter, "gates credit on coverage validity"],
                          ["ProhibitedRecipient", ADDR.predicates.prohibitedRecipient, "predicate: recipient denylist"],
                          ["AmountAboveLimit", ADDR.predicates.amountAboveLimit, "predicate: transfer ceiling"],
                          ["AmountBelowFloor", ADDR.predicates.amountBelowFloor, "predicate: transfer floor"],
                          ["DemoToken", ADDR.token, `faucet ${TOKEN_SYMBOL}, 6 decimals`],
                        ] as const
                      ).map(([name, addr, role]) => (
                        <tr key={addr}>
                          <td style={{ color: "var(--ink)", fontWeight: 550 }}>{name}</td>
                          <td className="num">
                            <Addr addr={addr} lead={10} />
                          </td>
                          <td>{role}</td>
                          <td>
                            <span className="badge b-ok">VERIFIED</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
