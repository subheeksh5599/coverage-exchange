"use client";

// The market. An underwriter's real free capacity is the offer; the borrower picks the terms
// and the on-chain pricing curve returns the premium. Nothing here is estimated locally —
// the premium shown is the exact value `purchase` will re-derive and require, so a quote that
// disagreed with the contract would fail the transaction instead of silently overcharging.

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { useActions, toUnits } from "@/lib/actions";
import { ADDR, SOURCE_CHAIN_KEY, SOURCE_CHAIN_LABEL, TOKEN_DECIMALS } from "@/lib/chain";
import { useFrontier, useProtocolTotals, useQuote, useUnderwriters, money } from "@/lib/protocol";
import { Panel, Field, Notice, TxButton, Loading, ReadError, Addr, Pill } from "@/components/ui";
import { formatUnits, parseUnits } from "viem";

/**
 * How many source-chain blocks past the minimum we keep a replayed position live. The
 * recorded counterexample sits in a historical window, so the required depth has to be
 * chosen large enough that `liveUntilHeight` is still ahead of the attested frontier —
 * otherwise the position is born EXPIRED and can never be challenged.
 */
const LIVE_MARGIN_BLOCKS = 5_000;

// The real Sepolia evidence target used by the recorded run: an ERC-20 Transfer log from a
// contract whose emitter is gated by the predicate. A borrower may point at any contract.
const DEFAULT_SOURCE_CONTRACT = "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238" as const;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

// The covered window and prohibited recipient used by the recorded run, so the
// buy -> challenge -> breach sequence can be reproduced from scratch in two transactions.
const RECORDED = {
  startBlock: "11671130",
  windowBlocks: "100",
  depth: "32",
  prohibited: "0xfe3A58A4fBd2755630E341A28006989aD08CD01d",
  sourceContract: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
};

type Kind = "prohibited" | "above" | "below";

const KINDS: { id: Kind; label: string; blurb: string }[] = [
  { id: "prohibited", label: "Prohibited recipient", blurb: "Violated if a transfer's recipient is a named address inside the window." },
  { id: "above", label: "Amount above limit", blurb: "Violated if a transfer exceeds a ceiling inside the window." },
  { id: "below", label: "Amount below floor", blurb: "Violated if a transfer falls below a floor inside the window." },
];

const UNITS = 10n ** BigInt(TOKEN_DECIMALS);

export default function MarketPage() {
  const { address } = useWallet();
  const actions = useActions();
  const uw = useUnderwriters();
  const totals = useProtocolTotals();
  const frontier = useFrontier();

  const [underwriter, setUnderwriter] = useState<`0x${string}` | null>(null);
  const [exposure, setExposure] = useState("1000");
  const [windowBlocks, setWindowBlocks] = useState("100");
  const [startBlock, setStartBlock] = useState("");
  const [depth, setDepth] = useState("32");
  const [kind, setKind] = useState<Kind>("prohibited");
  const [param, setParam] = useState("0xfe3A58A4fBd2755630E341A28006989aD08CD01d");
  const [sourceContract, setSourceContract] = useState<string>(DEFAULT_SOURCE_CONTRACT);
  const [msg, setMsg] = useState<string | null>(null);

  // Default the covered window to begin at the live attested frontier — a window in the
  // current attested past is what a lender can actually rely on.
  useEffect(() => {
    if (!startBlock && frontier.data?.available && frontier.data.height) {
      setStartBlock(String(frontier.data.height));
    }
  }, [frontier.data, startBlock]);

  const exposureU = useMemo(() => {
    try { return parseUnits(exposure || "0", TOKEN_DECIMALS); } catch { return 0n; }
  }, [exposure]);

  const windowBig = useMemo(() => {
    try { return BigInt(windowBlocks || "0"); } catch { return 0n; }
  }, [windowBlocks]);

  const depthBig = useMemo(() => {
    try { return BigInt(depth || "0"); } catch { return 0n; }
  }, [depth]);

  const startBig = useMemo(() => {
    try { return BigInt(startBlock || "0"); } catch { return 0n; }
  }, [startBlock]);
  const endBig = startBig + windowBig;

  const quote = useQuote(exposureU, windowBig, depthBig, underwriter, address);

  // bond must be >= exposure * coverageRatioBps / 10000
  const ratio = BigInt(totals.data?.ratioBps ?? 10_000);
  const requiredBond = (exposureU * ratio) / 10_000n;

  const chosen = uw.data?.find((u) => u.address === underwriter) ?? null;
  const capacityOk = chosen ? chosen.free >= requiredBond : false;
  const bondCoversExposure = requiredBond >= exposureU;

  const predicateAddr = useMemo(() => {
    if (kind === "prohibited") return ADDR.predicates.prohibitedRecipient;
    if (kind === "above") return ADDR.predicates.amountAboveLimit;
    return ADDR.predicates.amountBelowFloor;
  }, [kind]);

  // ProhibitedRecipient packs the address; the amount predicates pack a uint256 limit.
  const predicateParams = useMemo(() => {
    try {
      if (kind === "prohibited") {
        return `0x${BigInt(param).toString(16).padStart(64, "0")}` as `0x${string}`;
      }
      return `0x${parseUnits(param || "0", TOKEN_DECIMALS).toString(16).padStart(64, "0")}` as `0x${string}`;
    } catch {
      return `0x${"0".repeat(64)}` as `0x${string}`;
    }
  }, [kind, param]);

  const canBuy =
    Boolean(address) && Boolean(underwriter) && exposureU > 0n && windowBig > 1n && endBig > startBig &&
    Boolean(quote.data) && capacityOk && bondCoversExposure && startBig > 0n;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Buy coverage</h1>
          <p>
            Pick an underwriter with capital available, set the window you want covered on {SOURCE_CHAIN_LABEL},
            and the protocol prices it. On purchase the premium leaves your wallet and the bond is locked from
            the underwriter&apos;s capital — you receive a real position that a lender can read.
          </p>
        </div>
      </div>

      {!address ? (
        <Notice tone="info">
          <div><strong>Connect your wallet to buy.</strong> The capacity and pricing below are live and readable without one.</div>
        </Notice>
      ) : null}

      <div className="split">
        {/* ------------------------------------------------------------------ terms */}
        <Panel title="Terms" hint="all values are protocol inputs, not preferences">
          <div className="cols-2" >
            <Field label="Underwriter" hint="must hold free capacity">
              {uw.error ? (
                <ReadError error={uw.error} what="underwriters" />
              ) : uw.loading ? (
                <Loading what="Finding underwriters…" />
              ) : (uw.data ?? []).length === 0 ? (
                <Notice tone="warn">
                  <div>
                    <strong>No underwriter has deposited yet.</strong> Coverage capacity is created by depositing
                    capital — go to <a href="/underwrite">Provide coverage</a> and supply some first.
                  </div>
                </Notice>
              ) : (
                <select
                  value={underwriter ?? ""}
                  onChange={(e) => setUnderwriter((e.target.value || null) as `0x${string}` | null)}
                >
                  <option value="">Select an underwriter…</option>
                  {(uw.data ?? []).map((u) => (
                    <option key={u.address} value={u.address}>
                      {u.address.slice(0, 10)}…{u.address.slice(-6)} — {money(u.free)} free
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Covered exposure (cxTUSD)" hint="the largest amount a lender may release">
              <input value={exposure} onChange={(e) => setExposure(e.target.value)} inputMode="decimal" />
            </Field>

            <Field label={`Window start block (${SOURCE_CHAIN_LABEL})`} hint="defaulted to the attested frontier">
              <input value={startBlock} onChange={(e) => setStartBlock(e.target.value)} inputMode="numeric" />
            </Field>

            <Field label="Window length (blocks)" hint={`covers ${Number(startBig).toLocaleString("en-US")} → ${Number(endBig).toLocaleString("en-US")}`}>
              <input value={windowBlocks} onChange={(e) => setWindowBlocks(e.target.value)} inputMode="numeric" />
            </Field>

            <Field label="Required attestation depth" hint="blocks the frontier must pass endBlock by">
              <input value={depth} onChange={(e) => setDepth(e.target.value)} inputMode="numeric" />
            </Field>

            <Field label="Source contract" hint="the only emitter accepted as evidence">
              <input value={sourceContract} onChange={(e) => setSourceContract(e.target.value)} />
            </Field>
          </div>

          <div className="actions" style={{ marginTop: 16 }}>
            <button
              className="act act-sm"
              type="button"
              onClick={() => {
                setStartBlock(RECORDED.startBlock);
                setWindowBlocks(RECORDED.windowBlocks);
                setKind("prohibited");
                setParam(RECORDED.prohibited);
                setSourceContract(RECORDED.sourceContract);
                // The recorded window is historical, so its liveUntilHeight
                // (endBlock + requiredDepth + grace) may already be behind the attested
                // frontier — and an expired position can no longer be challenged. Pick a
                // depth that keeps the position live for roughly another day, which is what
                // makes it immediately falsifiable.
                const frontierNow = frontier.data?.available ? Number(frontier.data.height) : 0;
                const endB = Number(RECORDED.startBlock) + Number(RECORDED.windowBlocks);
                const grace = totals.data?.graceBlocks ?? 10_000;
                if (frontierNow > 0) {
                  const needed = frontierNow - endB - grace + LIVE_MARGIN_BLOCKS;
                  setDepth(String(Math.max(32, needed)));
                } else {
                  setDepth(RECORDED.depth);
                }
                setMsg(null);
              }}
              title="Fill the window and recipient the recorded counterexample violates, with a depth that keeps the position live so it can be disproved immediately"
            >
              Use the reproducible counterexample window
            </button>
            <span className="footnote">
              Fills the window and prohibited recipient that the recorded {SOURCE_CHAIN_LABEL} transaction already
              violates, so the position can be challenged the moment it is bought.
            </span>
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="stat-k" style={{ marginBottom: 8 }}>Invariant the coverage enforces</div>
            <div className="tabs">
              {KINDS.map((k) => (
                <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
                  {k.label}
                </button>
              ))}
            </div>
            <div className="footnote" style={{ marginTop: 8 }}>{KINDS.find((k) => k.id === kind)?.blurb}</div>
            <div style={{ marginTop: 12 }}>
              <Field
                label={kind === "prohibited" ? "Prohibited address" : kind === "above" ? "Ceiling (cxTUSD)" : "Floor (cxTUSD)"}
                hint={kind === "prohibited" ? "matched on the transfer's recipient topic" : "matched against the transfer amount"}
              >
                <input value={param} onChange={(e) => setParam(e.target.value)} />
              </Field>
            </div>
          </div>
        </Panel>

        {/* ------------------------------------------------------------------ quote */}
        <div className="stack" style={{ gap: 16 }}>
          <Panel title="Quote" hint={quote.error ? "read failed" : "computed on chain"}>
            {quote.error ? (
              <ReadError error={quote.error} what="the quote" />
            ) : (
              <div className="stack" >
                <div>
                  <div className="stat-k">Premium (paid now)</div>
                  <div className="stat-v">{quote.data ? money(quote.data.premium) : "—"}</div>
                  <div className="kpi-n">to the underwriter, immediately</div>
                </div>
                <div>
                  <div className="stat-k">Bond locked (by the underwriter)</div>
                  <div className="stat-v">{money(requiredBond)}</div>
                  <div className="kpi-n">
                    {totals.data ? `${totals.data.ratioBps / 100}% of exposure — the protocol floor` : "reading floor…"}
                  </div>
                </div>
                <div>
                  <div className="stat-k">Price decomposition</div>
                  <div className="mono" style={{ fontSize: "0.75rem", lineHeight: 1.7 }}>
                    {quote.data ? (
                      <>
                        <div>duration ×{(quote.data.durationBps / 10_000).toFixed(3)}</div>
                        <div>depth    ×{(quote.data.depthBps / 10_000).toFixed(3)}</div>
                        <div>counterparty ×{(quote.data.counterpartyBps / 10_000).toFixed(3)}</div>
                      </>
                    ) : (
                      <span style={{ color: "var(--ink-3)" }}>select an underwriter</span>
                    )}
                  </div>
                </div>
                {!capacityOk && chosen ? (
                  <Notice tone="bad">
                    <div>
                      <strong>Not enough free capacity.</strong> That underwriter has {money(chosen.free)} free;
                      this position needs a {money(requiredBond)} bond.
                    </div>
                  </Notice>
                ) : null}
                {!bondCoversExposure ? (
                  <Notice tone="bad">
                    <div><strong>Bond would not cover exposure.</strong> The protocol refuses a bond below the exposure it backs.</div>
                  </Notice>
                ) : null}
                {msg ? <Notice tone="bad">{msg}</Notice> : null}
                <TxButton
                  solid
                  block
                  disabled={!canBuy}
                  onRun={() => {
                    if (!underwriter || !quote.data) {
                      setMsg("Select an underwriter with enough capacity first.");
                      return Promise.resolve({ ok: false as const, message: "incomplete terms" });
                    }
                    setMsg(null);
                    return actions.buyCoverage({
                      underwriter,
                      chainKey: BigInt(SOURCE_CHAIN_KEY),
                      startBlock: startBig,
                      endBlock: endBig,
                      requiredDepth: depthBig,
                      maxExposure: exposureU,
                      capacity: exposureU,
                      bond: requiredBond,
                      premium: quote.data.premium,
                      predicate: predicateAddr,
                      predicateParams,
                      sourceContract: sourceContract as `0x${string}`,
                      eventSignature: TRANSFER_TOPIC,
                    });
                  }}
                  confirmNote={<>Coverage purchased. The underwriter&apos;s bond is now locked against it.</>}
                >
                  {canBuy ? "Buy coverage" : "Set valid terms to buy"}
                </TxButton>
                <div className="footnote">
                  The premium the contract requires is exactly the quote shown here — the market re-derives it and
                  rejects the transaction if it disagrees.
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Capacity available" hint="real, and it can run out" flush>
            {uw.error ? (
              <div style={{ padding: 16 }}><ReadError error={uw.error} what="underwriters" /></div>
            ) : uw.loading ? (
              <Loading />
            ) : (uw.data ?? []).length === 0 ? (
              <div className="empty-state">No underwriter has deposited capital yet.</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Underwriter</th>
                    <th className="num">Free</th>
                    <th className="num">Locked</th>
                    <th className="num">Deposited</th>
                  </tr>
                </thead>
                <tbody>
                  {(uw.data ?? []).map((u) => (
                    <tr key={u.address}>
                      <td><Addr value={u.address} chars={5} /></td>
                      <td className="num">{money(u.free)}</td>
                      <td className="num">{money(u.locked)}</td>
                      <td className="num">{money(u.deposited)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ padding: "12px 16px" }} className="footnote">
              Capacity is a real balance. Buying coverage consumes it by locking a bond, so a second borrower
              cannot spend capacity the first one already used.
            </div>
          </Panel>
        </div>
      </div>

      {frontier.data?.available ? (() => {
        const f = Number(frontier.data!.height);
        const live = endBig + depthBig + BigInt(totals.data?.graceBlocks ?? 10_000);
        const stillLive = BigInt(f) < live;
        return (
        <Panel title="Attestation context" hint={`${SOURCE_CHAIN_LABEL} live`}>
          <div style={{ marginBottom: 14 }}>
            <Notice tone={stillLive ? "ok" : "bad"}>
              <div>
                {stillLive ? (
                  <>
                    <strong>This position would be live.</strong> It stays valid until source block{" "}
                    <span className="mono">{live.toLocaleString("en-US")}</span>, and the frontier is at{" "}
                    <span className="mono">{f.toLocaleString("en-US")}</span> — so a counterexample proven inside
                    the window can still breach it.
                  </>
                ) : (
                  <>
                    <strong>This position would be born expired.</strong> Its live-until height{" "}
                    <span className="mono">{live.toLocaleString("en-US")}</span> is already behind the attested
                    frontier (<span className="mono">{f.toLocaleString("en-US")}</span>), so it would gate no credit
                    and could not be challenged. Raise the required depth, or move the window.
                  </>
                )}
              </div>
            </Notice>
          </div>
          <div className="cols-4">
            <div>
              <div className="stat-k">Attested frontier</div>
              <div className="stat-v" style={{ fontSize: "1rem" }}>{frontier.data.height.toLocaleString("en-US")}</div>
            </div>
            <div>
              <div className="stat-k">Your window start</div>
              <div className="stat-v" style={{ fontSize: "1rem" }}>{Number(startBig).toLocaleString("en-US")}</div>
            </div>
            <div>
              <div className="stat-k">Window end + depth</div>
              <div className="stat-v" style={{ fontSize: "1rem" }}>{(endBig + depthBig).toLocaleString("en-US")}</div>
            </div>
            <div>
              <div className="stat-k">Expires when</div>
              <div className="stat-v" style={{ fontSize: "0.875rem" }}>
                <Pill tone={stillLive ? "accent" : "bad"}>
                  frontier &gt; {(endBig + depthBig + BigInt(totals.data?.graceBlocks ?? 10_000)).toLocaleString("en-US")}
                </Pill>
              </div>
            </div>
          </div>
        </Panel>
        );
      })() : null}
    </div>
  );
}
