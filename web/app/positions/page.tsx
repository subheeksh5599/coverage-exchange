"use client";

// Your positions, and the money path. A draw is the moment coverage has to be load-bearing:
// the lending pool calls the engine inside the same transaction, so a badge on this page can
// never substitute for the check. Try drawing on a breached position and the chain refuses.

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { useActions } from "@/lib/actions";
import { ADDR, LENDING_ABI, SOURCE_CHAIN_LABEL } from "@/lib/chain";
import { useAccountState, useFrontier, usePositions, money, type Coverage } from "@/lib/protocol";
import { publicClient } from "@/lib/wallet";
import { Panel, Field, Notice, TxButton, Loading, ReadError, Empty, Pill, Addr } from "@/components/ui";
import { PositionsTable, predicateName } from "@/components/PositionsTable";

/** Read-only preflight, exactly the checks the money path repeats. */
function useDrawPreview(coverageId: bigint | null, borrower: `0x${string}` | null, amount: string) {
  const [state, setState] = useState<{ ok: boolean; reason: number } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!coverageId || !borrower || !amount || Number(amount) <= 0) {
        if (alive) setState(null);
        return;
      }
      try {
        const [ok, reason] = (await publicClient.readContract({
          address: ADDR.lendingAdapter,
          abi: LENDING_ABI,
          functionName: "previewDraw",
          args: [coverageId, borrower, BigInt(Math.round(Number(amount) * 1e6))],
        })) as [boolean, number];
        if (alive) setState({ ok, reason });
      } catch {
        if (alive) setState({ ok: false, reason: 0 });
      }
    })();
    return () => {
      alive = false;
    };
  }, [coverageId, borrower, amount]);
  return state;
}

function PositionsInner() {
  const { address } = useWallet();
  const actions = useActions();
  const positions = usePositions();
  const frontier = useFrontier();
  const acct = useAccountState(address);
  const params = useSearchParams();

  const [query, setQuery] = useState(params.get("id") ?? "");
  const [tab, setTab] = useState<"all" | "mine" | "borrowed" | "underwritten">("all");
  const [drawId, setDrawId] = useState<string>(params.get("id") ?? "");
  const [drawAmt, setDrawAmt] = useState("1000");
  const [repayId, setRepayId] = useState("");
  const [repayAmt, setRepayAmt] = useState("");

  const all = positions.data ?? [];
  const fh = frontier.data?.available ? frontier.data.height : null;

  const rows = useMemo(() => {
    if (!address) return all;
    if (tab === "mine") return all.filter((c) => c.borrower.toLowerCase() === address.toLowerCase());
    if (tab === "borrowed") return all.filter((c) => c.borrower.toLowerCase() === address.toLowerCase());
    if (tab === "underwritten") return all.filter((c) => c.underwriter.toLowerCase() === address.toLowerCase());
    return all;
  }, [all, tab, address]);

  /** Explorer lookup: a coverage id typed by anyone, including a judge with no wallet. */
  const looked = useMemo(() => {
    const t = query.trim().replace(/^#/, "");
    if (!t) return null;
    const n = Number(t);
    if (!Number.isInteger(n) || n <= 0) return null;
    return all.find((c) => c.id === BigInt(n)) ?? "missing";
  }, [query, all]);

  const myDrawable = useMemo(
    () => all.filter((c) => address && c.borrower.toLowerCase() === address.toLowerCase() && c.status === 0 && c.valid),
    [all, address]
  );

  const drawPreview = useDrawPreview(
    drawId ? BigInt(Number(drawId)) : null,
    address,
    drawAmt
  );

  const drawCoverage = drawId ? all.find((c) => c.id === BigInt(Number(drawId))) : null;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Positions</h1>
          <p>
            Every coverage position on this deployment, live. Draw against one to release credit from the pool,
            repay to free the capacity inside it, or settle it once the attested frontier has closed the covered
            window. Anyone can inspect any position — type an id below.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ draw money */}
      {address ? (
        <div className="split">
          <Panel title="Draw against coverage" hint="coverage must gate this or the transaction reverts">
            {positions.loading ? (
              <Loading />
            ) : (
              <div className="cols-2" >
                <Field label="Position" hint={`${myDrawable.length} valid position${myDrawable.length === 1 ? "" : "s"} you may draw on`}>
                  <select value={drawId} onChange={(e) => setDrawId(e.target.value)}>
                    <option value="">Select a position…</option>
                    {myDrawable.map((c) => (
                      <option key={String(c.id)} value={String(c.id)}>
                        #{String(c.id)} — {money(c.maxExposure - c.drawn)} available
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Amount (cxTUSD)" hint={drawCoverage ? `${money(drawCoverage.maxExposure - drawCoverage.drawn)} remaining on this position` : "choose a position first"}>
                  <input value={drawAmt} onChange={(e) => setDrawAmt(e.target.value)} inputMode="decimal" />
                </Field>

                <div style={{ gridColumn: "1 / -1" }}>
                  {drawPreview && !drawPreview.ok ? (
                    <Notice tone="bad">
                      <div>
                        <strong>This draw would be refused.</strong> The pool reports reason{" "}
                        <span className="mono">{drawPreview.reason}</span>. The transaction is blocked before you
                        spend gas — and the same check runs on chain if you submit anyway.
                      </div>
                    </Notice>
                  ) : null}
                  {drawPreview?.ok ? (
                    <Notice tone="ok">
                      <div><strong>Preflight passes.</strong> The pool would release this against the coverage right now.</div>
                    </Notice>
                  ) : null}
                  {!drawPreview && drawId ? (
                    <Notice tone="neutral"><div>Enter an amount to run the pool&apos;s own preflight.</div></Notice>
                  ) : null}
                </div>

                <div style={{ gridColumn: "1 / -1" }} className="actions">
                  <TxButton
                    solid
                    disabled={!drawId || Number(drawAmt) <= 0 || !drawPreview?.ok}
                    onRun={() => actions.draw(BigInt(Number(drawId)), drawAmt)}
                    confirmNote={<>Credit released from the pool and recorded as exposure on that position.</>}
                  >
                    Draw
                  </TxButton>
                  {drawCoverage && drawCoverage.status === 1 ? (
                    <Pill tone="bad">this position is breached — a draw will revert</Pill>
                  ) : null}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Repay exposure" hint="frees capacity inside the position">
            <div className="stack" >
              <Field label="Position">
                <select value={repayId} onChange={(e) => setRepayId(e.target.value)}>
                  <option value="">Select a position…</option>
                  {all
                    .filter((c) => address && c.borrower.toLowerCase() === address.toLowerCase() && c.drawn > 0n)
                    .map((c) => (
                      <option key={String(c.id)} value={String(c.id)}>
                        #{String(c.id)} — {money(c.drawn)} outstanding
                      </option>
                    ))}
                </select>
              </Field>
              <Field
                label="Amount (cxTUSD)"
                hint={
                  repayId
                    ? (() => {
                        const c = all.find((x) => x.id === BigInt(Number(repayId)));
                        return c ? `${money(c.drawn)} outstanding` : "";
                      })()
                    : "choose a position first"
                }
              >
                <input value={repayAmt} onChange={(e) => setRepayAmt(e.target.value)} inputMode="decimal" />
              </Field>
              <TxButton
                block
                disabled={!repayId || Number(repayAmt) <= 0}
                onRun={() => actions.repay(BigInt(Number(repayId)), repayAmt)}
                confirmNote={<>Exposure reduced. The position can now back another draw.</>}
              >
                Repay
              </TxButton>
              {acct.data ? (
                <div className="footnote">
                  Your wallet holds {money(acct.data.balance)} cxTUSD. Repayment needs an approval the first time.
                </div>
              ) : null}
            </div>
          </Panel>
        </div>
      ) : (
        <Notice tone="info">
          <div>
            <strong>Connect a wallet to draw or repay.</strong> Every position, its bond and its live validity are
            readable below without one.
          </div>
        </Notice>
      )}

      {/* ------------------------------------------------------------------- explorer */}
      <Panel title="Coverage explorer" hint="inspect any position by id">
        <div className="stack" >
          <Field label="Coverage id" hint="the id minted at purchase — any position, not just yours">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. 10" inputMode="numeric" />
          </Field>
          {looked === "missing" ? (
            <Notice tone="warn">
              <div>No position with that id exists on this deployment yet.</div>
            </Notice>
          ) : null}
          {looked && looked !== "missing" ? (
            <div className="cols-3" style={{ alignItems: "start" }}>
              <div>
                <div className="stat-k" style={{ marginBottom: 8 }}>Record</div>
                <dl className="kv">
                  <dt>Id</dt><dd>#{String(looked.id)}</dd>
                  <dt>Status</dt><dd>{["ACTIVE", "BREACHED", "EXPIRED", "SETTLED"][looked.status]}</dd>
                  <dt>Validity</dt><dd>{looked.valid ? "isValid" : "invalid"}</dd>
                  <dt>Borrower</dt><dd><Addr value={looked.borrower} chars={6} /></dd>
                  <dt>Underwriter</dt><dd><Addr value={looked.underwriter} chars={6} /></dd>
                </dl>
              </div>
              <div>
                <div className="stat-k" style={{ marginBottom: 8 }}>Economics</div>
                <dl className="kv">
                  <dt>Max exposure</dt><dd>{money(looked.maxExposure)}</dd>
                  <dt>Drawn</dt><dd>{money(looked.drawn)}</dd>
                  <dt>Bond</dt><dd>{money(looked.bond)}</dd>
                  <dt>Premium</dt><dd>{money(looked.premium)}</dd>
                  <dt>Capacity</dt><dd>{money(looked.capacity)}</dd>
                </dl>
              </div>
              <div>
                <div className="stat-k" style={{ marginBottom: 8 }}>Invariant</div>
                <dl className="kv">
                  <dt>Predicate</dt><dd>{predicateName(looked.predicate)}</dd>
                  <dt>Window</dt><dd>{looked.startBlock.toLocaleString("en-US")}→{looked.endBlock.toLocaleString("en-US")}</dd>
                  <dt>Depth</dt><dd>{String(looked.requiredDepth)}</dd>
                  <dt>Chain</dt><dd>{String(looked.chainKey)}</dd>
                  <dt>Live until</dt><dd>{looked.liveUntilHeight.toLocaleString("en-US")}</dd>
                </dl>
              </div>
            </div>
          ) : null}
          {!query ? <div className="footnote">On {SOURCE_CHAIN_LABEL} windows are source-chain heights; a position only gates credit while the attested frontier still covers them.</div> : null}
        </div>
      </Panel>

      {/* ---------------------------------------------------------------------- table */}
      <Panel
        title="All positions"
        hint={positions.error ? "read failed" : `${all.length} on this deployment`}
        flush
        actions={
          <div className="tabs">
            {(["all", "borrowed", "underwritten"] as const).map((t) => (
              <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t === "all" ? "All" : t === "borrowed" ? "As borrower" : "As underwriter"}
              </button>
            ))}
          </div>
        }
      >
        {positions.error ? (
          <div style={{ padding: 16 }}><ReadError error={positions.error} what="positions" /></div>
        ) : positions.loading ? (
          <Loading what="Reading positions from the engine…" />
        ) : !address ? (
          <PositionsTable rows={all} frontier={fh} empty="No coverage positions on this deployment yet." />
        ) : (
          <PositionsTable
            rows={rows}
            frontier={fh}
            empty={
              tab === "all"
                ? "No coverage positions on this deployment yet."
                : "Nothing in this view. Try the other tab, or buy coverage in the market."
            }
            actions={(c: Coverage) => (
              <>
                <button className="act act-sm" type="button" onClick={() => { setDrawId(String(c.id)); setQuery(String(c.id)); }}>
                  Inspect
                </button>
                {c.status === 0 && c.drawn === 0n ? (
                  <TxButton onRun={() => actions.settle(c.id)} confirmNote={<>Bond released.</>}>Settle</TxButton>
                ) : null}
              </>
            )}
          />
        )}
      </Panel>

      <Panel title="Nothing here is simulated" hint="the contract of this page">
        <div className="footnote" style={{ lineHeight: 1.7 }}>
          Every figure on this page is a contract read on Creditcoin CC3, refreshed every 12 seconds, and every
          button signs a transaction. If the RPC stops answering, the page reports the failure rather than
          rendering a cached number. There is no fixture file in this application.
          <div style={{ marginTop: 8 }}>
            <Link href="/challenge">Challenge a position</Link> · <Link href="/activity">See protocol activity</Link>
          </div>
        </div>
      </Panel>

      {!positions.error && !positions.loading && all.length === 0 ? <Empty>—</Empty> : null}
    </div>
  );
}

/**
 * useSearchParams() suspends during static prerender, so the page that reads `?id=` is
 * wrapped in a boundary. The fallback is the same shell, minus the reader.
 */
export default function PositionsPage() {
  return (
    <Suspense fallback={<div className="loading">Loading positions…</div>}>
      <PositionsInner />
    </Suspense>
  );
}
