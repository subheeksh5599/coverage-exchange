"use client";

// Supply side. Depositing capital is what creates coverage capacity — the protocol cannot
// mint coverage out of nothing, and a bond that secures live exposure cannot be withdrawn.
// The counterparty multiplier is the only price signal an underwriter publishes on chain.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { useActions } from "@/lib/actions";
import { useAccountState, usePositions, money } from "@/lib/protocol";
import { Card, Field, Notice, TxButton, Loading, ReadError, Addr, Pill } from "@/components/ui";
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

  const mine = useMemo(
    () => (positions.data ?? []).filter((c) => address && c.underwriter.toLowerCase() === address.toLowerCase()),
    [positions.data, address]
  );

  const fh = frontier.data?.available ? frontier.data.height : null;
  const myBookBond = mine.reduce((a, c) => a + (c.status === 0 ? c.bond : 0n), 0n);
  const premiumsEarned = mine.reduce((a, c) => a + c.premium, 0n);

  if (!address) {
    return (
      <div className="grid" style={{ gap: 16 }}>
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
    <div className="grid" style={{ gap: 16 }}>
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
          <Link className="btn" href="/market">See the market</Link>
        </div>
      </div>

      {/* ------------------------------------------------------------------- capacity */}
      <div className="grid cols-4">
        <Card title="Free capacity" hint="backing new coverage">
          {acct.error ? <ReadError error={acct.error} what="your capacity" /> : acct.loading || !acct.data ? <Loading /> : (
            <div>
              <div className="stat-v ok">{money(acct.data.freeCapacity)}</div>
              <div className="stat-n">a borrower can buy against this right now</div>
            </div>
          )}
        </Card>
        <Card title="Bond locked" hint="securing live exposure">
          {acct.loading || !acct.data ? <Loading /> : (
            <div>
              <div className="stat-v bad">{money(acct.data.lockedBond)}</div>
              <div className="stat-n">lost if any position of yours is breached</div>
            </div>
          )}
        </Card>
        <Card title="Total deposited" hint="your whole book">
          {acct.loading || !acct.data ? <Loading /> : (
            <div>
              <div className="stat-v">{money(acct.data.bondCapital)}</div>
              <div className="stat-n">free + locked</div>
            </div>
          )}
        </Card>
        <Card title="Premium earned" hint="from positions you back">
          {positions.loading ? <Loading /> : (
            <div>
              <div className="stat-v">{money(premiumsEarned)}</div>
              <div className="stat-n">{mine.length} position{mine.length === 1 ? "" : "s"} you underwrite</div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid cols-3">
        {/* -------------------------------------------------------------------- deposit */}
        <Card title="Deposit capital" hint="creates coverage capacity">
          <div className="grid" style={{ gap: 12 }}>
            <Field label="Amount (cxTUSD)" hint={acct.data ? `wallet holds ${money(acct.data.balance)}` : "reading balance…"}>
              <input value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} inputMode="decimal" />
            </Field>
            <div className="actions">
              <button className="btn btn-sm" type="button" onClick={() => setDepositAmt("1000")}>1,000</button>
              <button className="btn btn-sm" type="button" onClick={() => setDepositAmt("5000")}>5,000</button>
              <button className="btn btn-sm" type="button" onClick={() => setDepositAmt("25000")}>25,000</button>
              {acct.data ? (
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => {
                    if (acct.data) setDepositAmt(money(acct.data.balance, 0).replace(/,/g, ""));
                  }}
                >
                  Max
                </button>
              ) : null}
            </div>
            <TxButton
              variant="primary"
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
        </Card>

        {/* ------------------------------------------------------------------- withdraw */}
        <Card title="Withdraw free capital" hint="reverts if it touches a bond">
          <div className="grid" style={{ gap: 12 }}>
            <Field label="Amount (cxTUSD)" hint={acct.data ? `${money(acct.data.freeCapacity)} is free to withdraw` : "reading…"}>
              <input value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} inputMode="decimal" />
            </Field>
            <div className="actions">
              {acct.data ? (
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => {
                    if (acct.data) setWithdrawAmt(money(acct.data.freeCapacity, 0).replace(/,/g, ""));
                  }}
                >
                  Max free
                </button>
              ) : null}
            </div>
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
        </Card>

        {/* ---------------------------------------------------------------------- price */}
        <Card title="Set your price" hint="per borrower, on chain">
          <div className="grid" style={{ gap: 12 }}>
            <Field label="Borrower address" hint="whose risk you are pricing">
              <input value={borrower} onChange={(e) => setBorrower(e.target.value)} placeholder="0x…" />
            </Field>
            <Field label="Multiplier (basis points)" hint="10000 = neutral · 1000 = 0.10× · 50000 = 5.00×">
              <input value={bps} onChange={(e) => setBps(e.target.value)} inputMode="numeric" />
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
        </Card>
      </div>

      {/* --------------------------------------------------------------------- my book */}
      <Card
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
      </Card>

      <Card title="Who you are pricing" hint="real borrowers on this deployment" flush>
        {positions.loading ? <Loading /> : (() => {
          const borrowers = new Map<string, bigint>();
          for (const c of mine) borrowers.set(c.borrower, (borrowers.get(c.borrower) ?? 0n) + c.maxExposure);
          if (borrowers.size === 0) return <div className="empty">No borrowers have bought against your capacity yet.</div>;
          return (
            <table>
              <thead>
                <tr><th>Borrower</th><th className="num">Exposure you back</th><th></th></tr>
              </thead>
              <tbody>
                {[...borrowers.entries()].map(([b, exp]) => (
                  <tr key={b}>
                    <td><Addr value={b as `0x${string}`} chars={5} /></td>
                    <td className="num">{money(exp)}</td>
                    <td className="row-actions">
                      <button className="btn btn-sm" type="button" onClick={() => setBorrower(b)}>Price them</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
      </Card>
    </div>
  );
}
