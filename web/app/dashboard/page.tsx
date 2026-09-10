"use client";

// Dashboard — sidebar app shell in the landing's design language.
// Every number is read live from the CoverageEngine on CC3 testnet.
// Charts are custom SVG (components/Charts.tsx) fed by the same live reads.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useFrontier, usePositions, type Position } from "@/lib/useChainData";
import { StatusDonut, CapitalBars, WindowChart, statusColor } from "@/components/Charts";
import {
  ADDR,
  EXPLORER,
  DEMO_TXS,
  MEASURED,
  TOKEN_SYMBOL,
  fmtToken,
  short,
} from "@/lib/chain";

type Filter = "ALL" | "ACTIVE" | "BREACHED" | "EXPIRED" | "SETTLED";
const FILTERS: Filter[] = ["ALL", "ACTIVE", "BREACHED", "EXPIRED", "SETTLED"];

function badgeClass(status: Position["status"]): string {
  switch (status) {
    case "ACTIVE":
      return "badge badge-active";
    case "BREACHED":
      return "badge badge-breached";
    case "SETTLED":
      return "badge badge-settled";
    default:
      return "badge badge-expired";
  }
}

function AddrLink({ addr, lead = 8 }: { addr: string; lead?: number }) {
  return (
    <a className="txlink" href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noreferrer">
      {short(addr, lead, 4)}
    </a>
  );
}

function PositionCard({ p }: { p: Position }) {
  const drawnPct =
    p.maxExposure > 0n ? Number((p.drawn * 10000n) / p.maxExposure) / 100 : 0;

  return (
    <article className="pos-card" id={`pos-${p.id}`}>
      <div className="pos-head">
        <span className="pos-id">#{p.id}</span>
        <span className={badgeClass(p.status)}>{p.status}</span>
        {p.status === "ACTIVE" && p.valid ? (
          <span className="badge badge-active">
            <span className="flick">●</span>&nbsp;gating exposure
          </span>
        ) : null}
        <span className="pos-reason">{p.valid ? "isValid: true" : p.reason}</span>
      </div>

      <div className="pos-grid">
        <div>
          <div className="pos-k">max exposure</div>
          <div className="pos-v">
            {fmtToken(p.maxExposure)} {TOKEN_SYMBOL}
          </div>
        </div>
        <div>
          <div className="pos-k">bond locked</div>
          <div className="pos-v">
            {fmtToken(p.bond)} {TOKEN_SYMBOL}
          </div>
        </div>
        <div>
          <div className="pos-k">premium paid</div>
          <div className="pos-v">
            {fmtToken(p.premium)} {TOKEN_SYMBOL}
          </div>
        </div>
        <div>
          <div className="pos-k">drawn</div>
          <div className="pos-v">
            {fmtToken(p.drawn)} {TOKEN_SYMBOL}
          </div>
        </div>
        <div>
          <div className="pos-k">covered window · sepolia</div>
          <div className="pos-v">
            {p.startBlock.toLocaleString("en-US")} → {p.endBlock.toLocaleString("en-US")}
          </div>
        </div>
        <div>
          <div className="pos-k">live until height</div>
          <div className="pos-v">{p.liveUntilHeight.toLocaleString("en-US")}</div>
        </div>
        <div>
          <div className="pos-k">borrower</div>
          <div className="pos-v">
            <AddrLink addr={p.borrower} />
          </div>
        </div>
        <div>
          <div className="pos-k">underwriter</div>
          <div className="pos-v">
            <AddrLink addr={p.underwriter} />
          </div>
        </div>
      </div>

      <div className="drawbar" title={`${drawnPct}% of max exposure drawn`}>
        <div
          className={`drawbar-fill${p.status === "BREACHED" ? " loss-bg" : ""}`}
          style={{ width: `${Math.min(drawnPct, 100)}%` }}
        />
      </div>

      {p.status === "BREACHED" ? (
        <div style={{ marginTop: 14, fontSize: 11, color: "var(--blood)" }}>
          breached by counterexample · challenge key {short(p.challengeKey, 10, 6)} · bond
          paid to challenger, draws frozen forever
        </div>
      ) : null}
    </article>
  );
}

export default function Dashboard() {
  const frontier = useFrontier();
  const chain = usePositions();
  const [filter, setFilter] = useState<Filter>("ALL");

  const filtered = useMemo(
    () =>
      filter === "ALL"
        ? chain.positions
        : chain.positions.filter((p) => p.status === filter),
    [chain.positions, filter]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: chain.positions.length };
    for (const f of FILTERS.slice(1)) {
      c[f] = chain.positions.filter((p) => p.status === f).length;
    }
    return c;
  }, [chain.positions]);

  const totals = useMemo(() => {
    let bonded = 0n;
    let drawn = 0n;
    let slashed = 0n;
    let premiums = 0n;
    for (const p of chain.positions) {
      premiums += p.premium;
      if (p.status === "ACTIVE") {
        bonded += p.bond;
        drawn += p.drawn;
      }
      if (p.status === "BREACHED") slashed += p.bond;
    }
    return { bonded, drawn, slashed, premiums };
  }, [chain.positions]);

  return (
    <div className="shell">
      {/* ================================================== sidebar */}
      <aside className="shell-side">
        <div className="shell-side-top">
          <Link href="/" className="wordmark">
            COVERAGE<span className="wm-x">/</span>EXCHANGE
          </Link>

          <div className="side-frontier">
            <span className="tag">attested frontier · sepolia</span>
            {frontier.loading ? (
              <div className="skel" style={{ height: 26, width: "70%", marginTop: 8 }} />
            ) : frontier.available && frontier.height !== null ? (
              <div className="side-frontier-num mono-tab">
                <span className="flick">●</span> {frontier.height.toLocaleString("en-US")}
              </div>
            ) : (
              <div className="side-frontier-num" style={{ color: "var(--blood)", fontSize: 13 }}>
                unreachable — fails closed
              </div>
            )}
            <span className="tag" style={{ letterSpacing: "0.14em", fontSize: 8.5 }}>
              via the real ChainInfo precompile · 15s poll
            </span>
          </div>

          <nav className="side-nav">
            <a href="#overview" className="side-link on">
              <span className="side-link-no">01</span> Overview
            </a>
            <a href="#windows" className="side-link">
              <span className="side-link-no">02</span> Windows vs frontier
            </a>
            <a href="#capital" className="side-link">
              <span className="side-link-no">03</span> Capital at risk
            </a>
            <a href="#positions" className="side-link">
              <span className="side-link-no">04</span> Positions
            </a>
            <Link href="/" className="side-link">
              <span className="side-link-no">←</span> Protocol
            </Link>
          </nav>
        </div>

        <div className="shell-side-bottom">
          <span className="tag">deployed · cc3 102031</span>
          <div className="side-contracts">
            {(
              [
                ["engine", ADDR.engine],
                ["market", ADDR.market],
                ["challenges", ADDR.challengeManager],
                ["lending", ADDR.lendingAdapter],
                ["adapter", ADDR.adapter],
              ] as const
            ).map(([name, addr]) => (
              <div className="stat-row" key={addr}>
                <span className="stat-k">{name}</span>
                <span className="stat-v">
                  <AddrLink addr={addr} lead={6} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ================================================== main */}
      <main className="shell-main">
        {/* ---------------------------------------------- KPI strip */}
        <section id="overview" className="kpi-strip">
          <div className="kpi">
            <span className="kpi-k">tvl held by engine</span>
            {chain.loading ? (
              <div className="skel" style={{ height: 34, width: "80%" }} />
            ) : (
              <span className="kpi-v">
                {chain.engineTvl !== null ? fmtToken(chain.engineTvl) : "—"}
                <em>{TOKEN_SYMBOL}</em>
              </span>
            )}
          </div>
          <div className="kpi">
            <span className="kpi-k">bonds gating exposure</span>
            {chain.loading ? (
              <div className="skel" style={{ height: 34, width: "80%" }} />
            ) : (
              <span className="kpi-v" style={{ color: "var(--settle)" }}>
                {fmtToken(totals.bonded)}
                <em>{TOKEN_SYMBOL}</em>
              </span>
            )}
          </div>
          <div className="kpi">
            <span className="kpi-k">slashed to challengers</span>
            {chain.loading ? (
              <div className="skel" style={{ height: 34, width: "80%" }} />
            ) : (
              <span className="kpi-v" style={{ color: "var(--blood)" }}>
                {fmtToken(totals.slashed)}
                <em>{TOKEN_SYMBOL}</em>
              </span>
            )}
          </div>
          <div className="kpi">
            <span className="kpi-k">coverage ratio · grace</span>
            {chain.loading ? (
              <div className="skel" style={{ height: 34, width: "80%" }} />
            ) : (
              <span className="kpi-v">
                {chain.engineParams ? `${chain.engineParams.ratioBps / 100}%` : "—"}
                <em>
                  {chain.engineParams
                    ? `· ${chain.engineParams.graceBlocks.toLocaleString("en-US")} blk`
                    : ""}
                </em>
              </span>
            )}
          </div>
        </section>

        {chain.error ? (
          <div className="empty-state" style={{ marginTop: 26 }}>
            CC3 testnet RPC unreachable from this browser.
            <br />
            The protocol fails closed and so does this page — nothing is fabricated when the
            chain cannot be read.
          </div>
        ) : (
          <>
            {/* ---------------------------------------------- charts row 1 */}
            <section className="chart-row">
              <div className="chart-card">
                <div className="chart-head">
                  <span className="tag" style={{ color: "var(--bone)" }}>
                    book by status
                  </span>
                  <span className="tag">live · engine reads</span>
                </div>
                {chain.loading ? (
                  <div className="skel" style={{ height: 170 }} />
                ) : chain.positions.length === 0 ? (
                  <div className="empty-state">no positions yet</div>
                ) : (
                  <StatusDonut positions={chain.positions} />
                )}
              </div>

              <div className="chart-card">
                <div className="chart-head">
                  <span className="tag" style={{ color: "var(--bone)" }}>
                    open interest · active
                  </span>
                  <span className="tag">bond vs drawn</span>
                </div>
                {chain.loading ? (
                  <div className="skel" style={{ height: 170 }} />
                ) : (
                  <div className="oi-wrap">
                    <div className="oi-row">
                      <span className="oi-k">bonds locked</span>
                      <span className="oi-v mono-tab settle-t">
                        {fmtToken(totals.bonded)} {TOKEN_SYMBOL}
                      </span>
                    </div>
                    <div className="oi-bar">
                      <div className="oi-fill settle-bg" style={{ width: "100%" }} />
                    </div>
                    <div className="oi-row">
                      <span className="oi-k">exposure drawn against them</span>
                      <span className="oi-v mono-tab">
                        {fmtToken(totals.drawn)} {TOKEN_SYMBOL}
                      </span>
                    </div>
                    <div className="oi-bar">
                      <div
                        className="oi-fill"
                        style={{
                          width:
                            totals.bonded > 0n
                              ? `${Number((totals.drawn * 10000n) / totals.bonded) / 100}%`
                              : "0%",
                        }}
                      />
                    </div>
                    <p className="oi-note">
                      the bond always exceeds the exposure it gates — breaching on purpose is
                      never profitable. premiums paid to underwriters so far:{" "}
                      <span className="mono-tab" style={{ color: "var(--bone)" }}>
                        {fmtToken(totals.premiums)} {TOKEN_SYMBOL}
                      </span>
                    </p>
                    <div className="oi-links">
                      <a
                        className="txlink"
                        href={`${EXPLORER}/tx/${DEMO_TXS.counterexample}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        breach paid {MEASURED.bondPaid} {TOKEN_SYMBOL} →
                      </a>
                      <a
                        className="txlink"
                        href={`${EXPLORER}/tx/${DEMO_TXS.settlement}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        clean settle, bond returned →
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ---------------------------------------------- windows chart */}
            <section id="windows" className="chart-card chart-wide">
              <div className="chart-head">
                <span className="tag" style={{ color: "var(--bone)" }}>
                  coverage windows vs the attested frontier
                </span>
                <span className="tag">the protocol&apos;s clock — expiry is computed, never scheduled</span>
              </div>
              {chain.loading ? (
                <div className="skel" style={{ height: 300 }} />
              ) : chain.positions.length === 0 ? (
                <div className="empty-state">no positions yet</div>
              ) : (
                <WindowChart positions={chain.positions} frontier={frontier.height} />
              )}
            </section>

            {/* ---------------------------------------------- capital bars */}
            <section id="capital" className="chart-card chart-wide">
              <div className="chart-head">
                <span className="tag" style={{ color: "var(--bone)" }}>
                  capital at risk per position
                </span>
                <span className="tag">faint = bond · solid = drawn · color = status</span>
              </div>
              {chain.loading ? (
                <div className="skel" style={{ height: 220 }} />
              ) : chain.positions.length === 0 ? (
                <div className="empty-state">no positions yet</div>
              ) : (
                <CapitalBars positions={chain.positions} />
              )}
              {!chain.loading && chain.positions.length > 0 ? (
                <div className="bars-legend">
                  {(["ACTIVE", "BREACHED", "SETTLED", "EXPIRED"] as const).map((s) => (
                    <span key={s} className="legend-row">
                      <span className="legend-dot" style={{ background: statusColor(s) }} />
                      <span className="legend-k">{s}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </section>

            {/* ---------------------------------------------- positions feed */}
            <section id="positions" style={{ marginTop: 40 }}>
              <div className="chart-head" style={{ marginBottom: 18 }}>
                <span className="tag" style={{ color: "var(--bone)" }}>
                  all positions · read from the engine on every poll
                </span>
                <span className="tag">nothing stored · nothing mocked</span>
              </div>

              <div className="filter-pills">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    className={`filter-pill${filter === f ? " filter-on" : ""}`}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                    {counts[f] !== undefined ? ` · ${counts[f]}` : ""}
                  </button>
                ))}
              </div>

              {chain.loading ? (
                <>
                  <div className="skel" style={{ height: 180, marginBottom: 14 }} />
                  <div className="skel" style={{ height: 180 }} />
                </>
              ) : filtered.length === 0 ? (
                <div className="empty-state">
                  {chain.total === 0
                    ? "No coverage positions exist on this deployment yet."
                    : `No ${filter} positions right now.`}
                  <br />
                  Positions appear here the moment they are purchased on-chain.
                </div>
              ) : (
                filtered.map((p) => <PositionCard key={p.id} p={p} />)
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
