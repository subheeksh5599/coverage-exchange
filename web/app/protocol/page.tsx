"use client";

// Protocol-wide state. Every number is a contract read or an aggregate over positions read
// from the engine. Notably absent: TVL banners, APY, user counts and volume — none of which
// this deployment tracks, and inventing them is how a protocol page starts lying.

import Link from "next/link";
import { useMemo } from "react";
import { ADDR, CHAIN_ID, CC3_RPC, EXPLORER_ADDR_BASE, SOURCE_CHAIN_LABEL, TOKEN_SYMBOL } from "@/lib/chain";
import { useFrontier, usePositions, useProtocolTotals, useUnderwriters, money } from "@/lib/protocol";
import { Card, Stat, Loading, ReadError, Addr, Pill } from "@/components/ui";

export default function ProtocolPage() {
  const totals = useProtocolTotals();
  const positions = usePositions();
  const uw = useUnderwriters();
  const frontier = useFrontier();

  const agg = useMemo(() => {
    const all = positions.data ?? [];
    const active = all.filter((c) => c.status === 0);
    return {
      live: all.length,
      active: active.length,
      breached: all.filter((c) => c.status === 1).length,
      settled: all.filter((c) => c.status === 3).length,
      expired: all.filter((c) => c.status === 2).length,
      coveredExposure: active.reduce((a, c) => a + c.maxExposure, 0n),
      drawn: all.reduce((a, c) => a + c.drawn, 0n),
      bonded: active.reduce((a, c) => a + c.bond, 0n),
      premiums: all.reduce((a, c) => a + c.premium, 0n),
      bondsPaid: all.filter((c) => c.status === 1).reduce((a, c) => a + c.bond, 0n),
      validNow: active.filter((c) => c.valid).length,
    };
  }, [positions.data]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Protocol</h1>
          <p>
            The whole deployment at a glance, computed from contract state rather than from a database. If you
            want to check any figure, every contract address below resolves on Blockscout.
          </p>
        </div>
        <div className="actions">
          <Link className="btn" href="/activity">Activity log</Link>
          <Link className="btn" href="/challenge">Challengeable positions</Link>
        </div>
      </div>

      {totals.error ? (
        <ReadError error={totals.error} what="protocol state" />
      ) : totals.loading || !totals.data ? (
        <Loading what="Reading protocol state…" />
      ) : (
        <>
          <div className="grid cols-4">
            <Stat k="Coverage positions" v={agg.live} n={`${agg.active} active · ${agg.breached} breached · ${agg.settled} settled`} />
            <Stat k="Covered exposure" v={money(agg.coveredExposure)} n={`maximum lenders may release · ${TOKEN_SYMBOL}`} />
            <Stat k="Bonded capital" v={money(agg.bonded)} n="locked behind live positions" />
            <Stat k="Drawn" v={money(agg.drawn)} n="credit actually extended" />
          </div>

          <div className="grid cols-4">
            <Stat k="Underwriter capital held" v={money(totals.data.engineBalance)} n="deposited in the engine" />
            <Stat k="Pool liquidity" v={money(totals.data.drawableLiquidity)} n={`drawable now · accounting total ${money(totals.data.totalLiquidity)}`} />
            <Stat k="Premiums paid" v={money(agg.premiums)} n="borrower → underwriter, lifetime" />
            <Stat
              k="Bonds paid to challengers"
              v={money(agg.bondsPaid)}
              n={agg.breached > 0 ? `${agg.breached} breach${agg.breached === 1 ? "" : "es"}` : "no position has been breached"}
              tone={agg.bondsPaid > 0n ? "bad" : undefined}
            />
          </div>

          <div className="grid split">
            <Card title="Invariant health" hint="the protocol's central claim, measured">
              <div className="grid cols-3" style={{ gap: 14 }}>
                <div>
                  <div className="stat-k">Bond / exposure floor</div>
                  <div className="stat-v">{totals.data.ratioBps / 100}%</div>
                  <div className="stat-n">enforced at purchase, per position</div>
                </div>
                <div>
                  <div className="stat-k">Valid right now</div>
                  <div className="stat-v ok">
                    {agg.validNow}
                    <span style={{ fontSize: "0.875rem", color: "var(--ink-3)" }}> / {agg.active}</span>
                  </div>
                  <div className="stat-n">active positions passing <code>isValid</code></div>
                </div>
                <div>
                  <div className="stat-k">Attestation grace</div>
                  <div className="stat-v">{totals.data.graceBlocks.toLocaleString("en-US")}</div>
                  <div className="stat-n">source blocks after a window closes</div>
                </div>
              </div>
              <div className="footnote" style={{ marginTop: 14, lineHeight: 1.7 }}>
                A position is only ever valid while the attested {SOURCE_CHAIN_LABEL} frontier still covers its
                window at the required depth, and no counterexample has been proven against it. Validity is
                computed on every call — the engine stores no &quot;valid&quot; flag a keeper could expire.
              </div>
            </Card>

            <Card title="Attestation" hint="Attestcoin, live">
              {frontier.error ? (
                <ReadError error={frontier.error} what="the frontier" />
              ) : frontier.loading || !frontier.data ? (
                <Loading />
              ) : (
                <div className="grid" style={{ gap: 12 }}>
                  <div>
                    <div className="stat-k">Source chain</div>
                    <div className="stat-v" style={{ fontSize: "0.9375rem" }}>{SOURCE_CHAIN_LABEL} (key 1)</div>
                  </div>
                  <div>
                    <div className="stat-k">Attested frontier</div>
                    <div className="stat-v">{frontier.data.available ? frontier.data.height.toLocaleString("en-US") : "unavailable"}</div>
                  </div>
                  <div>
                    <div className="stat-k">Precompile</div>
                    <Pill tone={frontier.data.available ? "ok" : "bad"}>
                      {frontier.data.available ? "responding" : "unreachable — reads fail closed"}
                    </Pill>
                  </div>
                  <div className="footnote">
                    Read through the deployed adapter, which calls the Block Prover precompile. When it cannot
                    answer, the protocol treats coverage as unproven rather than assuming it is fine.
                  </div>
                </div>
              )}
            </Card>
          </div>

          <div className="grid split">
            <Card title="Underwriters" hint="discovered from deposit events" flush>
              {uw.error ? (
                <div style={{ padding: 16 }}><ReadError error={uw.error} what="underwriters" /></div>
              ) : uw.loading ? (
                <Loading />
              ) : (uw.data ?? []).length === 0 ? (
                <div className="empty">No capital has been deposited yet.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Underwriter</th>
                      <th className="num">Free</th>
                      <th className="num">Locked</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(uw.data ?? []).map((u) => (
                      <tr key={u.address}>
                        <td><Addr value={u.address} chars={5} /></td>
                        <td className="num">{money(u.free)}</td>
                        <td className="num">{money(u.locked)}</td>
                        <td className="num">{money(u.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="Deployment" hint={`chain ${CHAIN_ID}`} flush>
              <table>
                <tbody>
                  {(
                    [
                      ["Engine", ADDR.engine],
                      ["Market", ADDR.market],
                      ["Challenge manager", ADDR.challengeManager],
                      ["Lending adapter", ADDR.lendingAdapter],
                      ["Attestcoin adapter", ADDR.adapter],
                      ["Token (cxTUSD)", ADDR.token],
                      ["Predicate · prohibited", ADDR.predicates.prohibitedRecipient],
                      ["Predicate · above limit", ADDR.predicates.amountAboveLimit],
                      ["Predicate · below floor", ADDR.predicates.amountBelowFloor],
                    ] as const
                  ).map(([label, addr]) => (
                    <tr key={addr}>
                      <td>{label}</td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        <a href={`${EXPLORER_ADDR_BASE}${addr}`} target="_blank" rel="noreferrer">
                          {addr.slice(0, 10)}…{addr.slice(-6)}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: "12px 16px" }} className="footnote">
                RPC <code>{CC3_RPC.replace("https://", "")}</code>. All nine contracts are source-verified on
                Blockscout.
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
