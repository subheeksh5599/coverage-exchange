"use client";

// Supply side. Depositing capital is what creates coverage capacity — the protocol cannot
// mint coverage out of nothing, and a bond that secures live exposure cannot be withdrawn.
// The counterparty multiplier is the only price signal an underwriter publishes on chain.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { useActions } from "@/lib/actions";
import { useAccountState, usePositions, offerRegistryDeployed, money } from "@/lib/protocol";
import { ADDR, SOURCE_CHAIN_KEY, TOKEN_SYMBOL, TOKEN_DECIMALS } from "@/lib/chain";
import { parseUnits } from "viem";
import {
  Panel,
  Field,
  Notice,
  TxButton,
  Loading,
  ReadError,
  Addr,
  Pill,
  AmountInput,
  Chips,
} from "@/components/ui";
import { PositionsTable } from "@/components/PositionsTable";
import { useFrontier } from "@/lib/protocol";

export default function UnderwritePage() {
  const { address } = useWallet();
  const actions = useActions();
  const acct = useAccountState(address);
  const positions = usePositions();
  const frontier = useFrontier();

  const [depositAmt, setDepositAmt] = useState("5000");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [borrower, setBorrower] = useState("");
  const [bps, setBps] = useState("10000");

  // Offer form state — the "publish an offer" panel below the price setter.
  const [offerBorrower, setOfferBorrower] = useState("");
  const [offerExposure, setOfferExposure] = useState("10000");
  const [offerBond, setOfferBond] = useState("12000");
  const [offerWindow, setOfferWindow] = useState("100");
  const [offerDepth, setOfferDepth] = useState("32");
  const [offerTranche, setOfferTranche] = useState<0 | 1>(0);
  const [offerExpiryDays, setOfferExpiryDays] = useState("7");

  const registryLive = offerRegistryDeployed();

  const mine = useMemo(
    () => (positions.data ?? []).filter((c) => address && c.underwriter.toLowerCase() === address.toLowerCase()),
    [positions.data, address]
  );

  const fh = frontier.data?.available ? frontier.data.height : null;
  const myBookBond = mine.reduce((a, c) => a + (c.status === 0 ? c.bond : 0n), 0n);
  const premiumsEarned = mine.reduce((a, c) => a + c.premium, 0n);

  if (!address) {
    return (
      <div className="stack" style={{ gap: 16 }}>
        <div className="page-head">
          <div>
            <h1>Provide coverage</h1>
            <p>Deposit capital to create coverage capacity, and earn the premium a borrower pays for it.</p>
          </div>
        </div>
        <Notice tone="info">
          <div>
            <strong>Connect a wallet to provide coverage.</strong> Deposits, withdrawals and pricing are all
            transactions. You can read the protocol state without one on the <Link href="/protocol">Protocol</Link> page.
          </div>
        </Notice>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Provide coverage</h1>
          <p>
            Deposit capital to create capacity. When a borrower buys coverage against your capacity, a bond is
            locked for exactly the exposure it backs, and you receive the premium immediately. Capital that is
            securing live exposure cannot be withdrawn — that is enforced in the engine, not promised here.
          </p>
        </div>
        <div className="actions">
          <Link className="act" href="/market">See the market</Link>
        </div>
      </div>

      {/* ------------------------------------------------------------------- capacity */}
      <div className="cols-4">
        <Panel title="Free capacity" hint="backing new coverage">
          {acct.error ? <ReadError error={acct.error} what="your capacity" /> : acct.loading || !acct.data ? <Loading /> : (
            <div>
              <div className="stat-v settle-t">{money(acct.data.freeCapacity)}</div>
              <div className="kpi-n">a borrower can buy against this right now</div>
            </div>
          )}
        </Panel>
        <Panel title="Bond locked" hint="securing live exposure">
          {acct.loading || !acct.data ? <Loading /> : (
            <div>
              <div className="stat-v blood">{money(acct.data.lockedBond)}</div>
              <div className="kpi-n">lost if any position of yours is breached</div>
            </div>
          )}
        </Panel>
        <Panel title="Total deposited" hint="your whole book">
          {acct.loading || !acct.data ? <Loading /> : (
            <div>
              <div className="stat-v">{money(acct.data.bondCapital)}</div>
              <div className="kpi-n">free + locked</div>
            </div>
          )}
        </Panel>
        <Panel title="Premium earned" hint="from positions you back">
          {positions.loading ? <Loading /> : (
            <div>
              <div className="stat-v">{money(premiumsEarned)}</div>
              <div className="kpi-n">{mine.length} position{mine.length === 1 ? "" : "s"} you underwrite</div>
            </div>
          )}
        </Panel>
      </div>

      <div className="cols-3">
        {/* -------------------------------------------------------------------- deposit */}
        <Panel title="Deposit capital" hint="creates coverage capacity">
          <div className="stack" >
            <Field label="Amount" hint={acct.data ? `wallet holds ${money(acct.data.balance)} ${TOKEN_SYMBOL}` : "reading balance…"}>
              <AmountInput value={depositAmt} onChange={setDepositAmt} unit={TOKEN_SYMBOL} />
              <Chips
                options={[
                  { label: "1,000", value: "1000" },
                  { label: "5,000", value: "5000" },
                  { label: "25,000", value: "25000" },
                  ...(acct.data
                    ? [{ label: "max", value: money(acct.data.balance, 0).replace(/,/g, "") }]
                    : []),
                ]}
                onPick={setDepositAmt}
              />
            </Field>
            <TxButton
              solid
              block
              onRun={() => actions.depositBond(depositAmt)}
              confirmNote={<>Deposited. Your free capacity is now backable by borrowers.</>}
            >
              Deposit &amp; create capacity
            </TxButton>
            <div className="footnote">
              Needs an ERC-20 approval first; this button requests exactly the amount you typed, then deposits.
            </div>
          </div>
        </Panel>

        {/* ------------------------------------------------------------------- withdraw */}
        <Panel title="Withdraw free capital" hint="reverts if it touches a bond">
          <div className="stack" >
            <Field label="Amount" hint={acct.data ? `${money(acct.data.freeCapacity)} ${TOKEN_SYMBOL} is free to withdraw` : "reading…"}>
              <AmountInput value={withdrawAmt} onChange={setWithdrawAmt} unit={TOKEN_SYMBOL} />
              {acct.data ? (
                <Chips
                  options={[
                    {
                      label: "max free",
                      value: money(acct.data.freeCapacity, 0).replace(/,/g, ""),
                    },
                  ]}
                  onPick={setWithdrawAmt}
                />
              ) : null}
            </Field>
            <TxButton
              block
              onRun={() => actions.withdrawBond(withdrawAmt)}
              confirmNote={<>Withdrawn to your wallet.</>}
            >
              Withdraw
            </TxButton>
            <div className="footnote">
              Try withdrawing more than your free balance: the engine refuses with
              <code> InsufficientFreeBalance</code> rather than letting a bond walk away.
            </div>
          </div>
        </Panel>

        {/* ---------------------------------------------------------------------- price */}
        <Panel title="Set your price" hint="per borrower, on chain">
          <div className="stack" >
            <Field label="Borrower address" hint="whose risk you are pricing">
              <input value={borrower} onChange={(e) => setBorrower(e.target.value)} placeholder="0x…" />
            </Field>
            <Field label="Multiplier (basis points)" hint="10000 = neutral · 1000 = 0.10× · 50000 = 5.00×">
              <AmountInput value={bps} onChange={setBps} unit={`${(Number(bps || 0) / 10000).toFixed(3)}×`} />
              <Chips
                options={[
                  { label: "0.50×", value: "5000" },
                  { label: "neutral", value: "10000" },
                  { label: "1.50×", value: "15000" },
                  { label: "3.00×", value: "30000" },
                ]}
                onPick={setBps}
              />
            </Field>
            <TxButton
              block
              disabled={!/^0x[0-9a-fA-F]{40}$/.test(borrower)}
              onRun={() => actions.setCounterpartyMultiplier(borrower as `0x${string}`, Number(bps))}
              confirmNote={<>Your price for that borrower is now on chain, and the market will use it in every quote.</>}
            >
              Set price
            </TxButton>
            <div className="footnote">
              This only affects <em>future</em> quotes. It cannot alter a position that already exists, and it
              cannot make coverage valid.
            </div>
          </div>
        </Panel>
      </div>

      {/* --------------------------------------------------------------------- publish */}
      <Panel
        title="Publish an offer"
        hint={registryLive ? "on the offer registry" : "registry not deployed"}
      >
        {!registryLive ? (
          <Notice tone="warn">
            <div>
              <strong>OfferRegistry is not deployed on this network.</strong> The recorded 2026-09-10 deployment
              predates it — run <code>forge script script/Deploy.s.sol --broadcast</code> and set{" "}
              <code>NEXT_PUBLIC_OFFER_REGISTRY_ADDRESS</code> to enable publishing.
            </div>
          </Notice>
        ) : (
          <div className="cols-3">
            <Field label="Borrower (or blank = open)" hint="targeted, or fillable by anyone">
              <input
                value={offerBorrower}
                onChange={(e) => setOfferBorrower(e.target.value)}
                placeholder="0x…"
              />
            </Field>
            <Field label="Max exposure" hint="what a lender may draw against this coverage">
              <AmountInput value={offerExposure} onChange={setOfferExposure} unit={TOKEN_SYMBOL} />
            </Field>
            <Field label="Bond you lock" hint="must be ≥ exposure — the protocol enforces the floor">
              <AmountInput value={offerBond} onChange={setOfferBond} unit={TOKEN_SYMBOL} />
            </Field>
            <Field label="Window length (blocks)" hint="the range you are covering on Sepolia">
              <AmountInput value={offerWindow} onChange={setOfferWindow} unit="blocks" />
            </Field>
            <Field label="Required attestation depth" hint="blocks past window end the frontier must reach">
              <AmountInput value={offerDepth} onChange={setOfferDepth} unit="blocks" />
            </Field>
            <Field label="Tranche" hint="junior takes losses first in an aggregated basket">
              <div className="tabs">
                <button type="button" aria-pressed={offerTranche === 0} onClick={() => setOfferTranche(0)}>
                  senior
                </button>
                <button type="button" aria-pressed={offerTranche === 1} onClick={() => setOfferTranche(1)}>
                  junior (+50%)
                </button>
              </div>
            </Field>
            <Field label="Offer expires in (days)" hint="on-chain timestamp; the registry refuses fills after">
              <AmountInput value={offerExpiryDays} onChange={setOfferExpiryDays} unit="days" />
            </Field>
            <div style={{ gridColumn: "1 / -1" }}>
              <TxButton
                solid
                block
                disabled={
                  offerBorrower !== "" && !/^0x[0-9a-fA-F]{40}$/.test(offerBorrower)
                }
                onRun={() =>
                  actions.publishOffer({
                    borrower: (offerBorrower || "0x0000000000000000000000000000000000000000") as `0x${string}`,
                    chainKey: BigInt(SOURCE_CHAIN_KEY),
                    requiredDepth: BigInt(offerDepth || "0"),
                    maxExposure: parseUnits(offerExposure || "0", TOKEN_DECIMALS),
                    bond: parseUnits(offerBond || "0", TOKEN_DECIMALS),
                    windowBlocks: BigInt(offerWindow || "0"),
                    expiresAt: BigInt(
                      Math.floor(Date.now() / 1000) + Number(offerExpiryDays || "1") * 86_400
                    ),
                    sourceContract: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
                    eventSignature:
                      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                    predicate: ADDR.predicates.prohibitedRecipient,
                    predicateParams: (`0x${"fe3A58A4fBd2755630E341A28006989aD08CD01d".toLowerCase().padStart(64, "0")}`) as `0x${string}`,
                    tranche: offerTranche,
                  })
                }
                confirmNote={<>Offer published. It shows up on the <Link href="/offers">Offers</Link> page.</>}
              >
                Publish offer
              </TxButton>
              <div className="footnote">
                Defaults use the canonical Sepolia demo evidence (prohibited-recipient predicate on the recorded
                source contract) so the offer can be filled and challenged against the recorded counterexample
                without further configuration.
              </div>
            </div>
          </div>
        )}
      </Panel>

      {/* --------------------------------------------------------------------- my book */}
      <Panel
        title="Positions you underwrite"
        hint={positions.error ? "read failed" : `${mine.length} position${mine.length === 1 ? "" : "s"} · ${money(myBookBond)} bond at risk`}
        flush
      >
        {positions.error ? (
          <div style={{ padding: 16 }}><ReadError error={positions.error} what="positions" /></div>
        ) : positions.loading ? (
          <Loading what="Reading positions…" />
        ) : (
          <PositionsTable
            rows={mine}
            frontier={fh}
            empty="No borrower has bought coverage against your capacity yet."
            actions={(c) => (
              <>
                {c.status === 0 && c.drawn === 0n ? (
                  <TxButton onRun={() => actions.settle(c.id)} confirmNote={<>Bond released back to your free capacity.</>}>
                    Settle
                  </TxButton>
                ) : null}
                {c.status === 0 ? <Pill tone="warn">bond at risk</Pill> : null}
                {c.status === 1 ? <Pill tone="bad">bond paid out</Pill> : null}
                {c.status === 3 ? <Pill tone="ok">bond returned</Pill> : null}
              </>
            )}
          />
        )}
      </Panel>

      <Panel title="Who you are pricing" hint="real borrowers on this deployment" flush>
        {positions.loading ? <Loading /> : (() => {
          const borrowers = new Map<string, bigint>();
          for (const c of mine) borrowers.set(c.borrower, (borrowers.get(c.borrower) ?? 0n) + c.maxExposure);
          if (borrowers.size === 0) return <div className="empty-state">No borrowers have bought against your capacity yet.</div>;
          return (
            <table className="tbl">
              <thead>
                <tr><th>Borrower</th><th className="num">Exposure you back</th><th></th></tr>
              </thead>
              <tbody>
                {[...borrowers.entries()].map(([b, exp]) => (
                  <tr key={b}>
                    <td><Addr value={b as `0x${string}`} chars={5} /></td>
                    <td className="num">{money(exp)}</td>
                    <td className="row-actions">
                      <button className="act act-sm" type="button" onClick={() => setBorrower(b)}>Price them</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
      </Panel>
    </div>
  );
}
