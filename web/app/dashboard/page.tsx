"use client";

// Overview. The first thing the console does is ask for a wallet; everything after that is
// the user's real position in the protocol. Nothing here is decorative — each number is a
// contract read and each button signs a transaction.

import Link from "next/link";
import { useMemo } from "react";
import {
  useAccountState,
  useFrontier,
  usePositions,
  useProtocolTotals,
  money,
} from "@/lib/protocol";
import { useWallet } from "@/lib/wallet";
import { useActions } from "@/lib/actions";
import { Stat, Panel, Notice, TxButton, Loading, ReadError, SecTag } from "@/components/ui";
import { PositionsTable } from "@/components/PositionsTable";
import { TOKEN_SYMBOL } from "@/lib/chain";

export default function Dashboard() {
  const { address, connect, connecting, hasProvider } = useWallet();
  const acct = useAccountState(address);
  const positions = usePositions();
  const totals = useProtocolTotals();
  const frontier = useFrontier();
  const actions = useActions();

  const mine = useMemo(
    () =>
      (positions.data ?? []).filter(
        (c) => address && c.borrower.toLowerCase() === address.toLowerCase()
      ),
    [positions.data, address]
  );
  const underwriting = useMemo(
    () =>
      (positions.data ?? []).filter(
        (c) => address && c.underwriter.toLowerCase() === address.toLowerCase()
      ),
    [positions.data, address]
  );

  const fh = frontier.data?.available ? frontier.data.height : null;
  const validMine = mine.filter((c) => c.status === 0 && c.valid).length;
  const coveredExposure = mine.reduce((a, c) => a + c.maxExposure, 0n);
  const drawnTotal = mine.reduce((a, c) => a + c.drawn, 0n);
  const bookBond = underwriting.reduce((a, c) => a + (c.status === 0 ? c.bond : 0n), 0n);
  const all = positions.data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>
            Your live position in the protocol. Balances, capacity, coverage and bonds are read from
            the deployed contracts on every refresh — if a read fails, this page says so instead of
            showing a stale number.
          </p>
        </div>
        {address ? (
          <div className="actions">
            <Link className="act act-solid act-sm" href="/market">
              Buy coverage
            </Link>
            <Link className="act act-sm" href="/underwrite">
              Provide coverage
            </Link>
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ protocol strip */}
      <section className="kpi-strip">
        {totals.error ? (
          <div className="kpi" style={{ gridColumn: "1 / -1" }}>
            <ReadError error={totals.error} what="protocol state" />
          </div>
        ) : totals.loading || !totals.data ? (
          <div className="kpi" style={{ gridColumn: "1 / -1" }}>
            <div className="skel" style={{ height: 34 }} />
          </div>
        ) : (
          <>
            <Stat
              k="positions"
              v={totals.data.positionCount}
              n={(() => {
                const n = (st: number) => all.filter((c) => c.status === st).length;
                return `${n(0)} active · ${n(1)} breached · ${n(2)} expired · ${n(3)} settled`;
              })()}
            />
            <Stat
              k="bonded capacity"
              v={money(totals.data.engineBalance, 0)}
              unit={TOKEN_SYMBOL}
              n="deposited in the engine"
            />
            <Stat
              k="drawable liquidity"
              v={money(totals.data.drawableLiquidity, 0)}
              unit={TOKEN_SYMBOL}
              n="the pool can release now"
            />
            <Stat
              k="bond / exposure floor"
              v={`${totals.data.ratioBps / 100}%`}
              n={`grace ${totals.data.graceBlocks.toLocaleString("en-US")} blocks`}
            />
          </>
        )}
      </section>

      {/* ------------------------------------------------------------ connect gate */}
      {!address ? (
        <Panel
          title="Connect a wallet"
          hint="nothing here transacts without one"
          className="mt"
        >
          <div className="stack-sm">
            <p style={{ color: "var(--dim)", fontSize: 12, lineHeight: 1.85, maxWidth: "80ch" }}>
              Coverage Exchange is a financial application on Creditcoin CC3. Buy coverage with bonded
              capital behind it, draw credit against that coverage, provide the capital on the other
              side, or challenge a claim you can disprove. Every action is a transaction; there is no
              demo mode.
            </p>
            {!hasProvider ? (
              <Notice tone="warn">
                <div>
                  <strong>no browser wallet detected.</strong> Install MetaMask (or any EIP-1193
                  wallet) and reload. The protocol state above still reads without one.
                </div>
              </Notice>
            ) : null}
            <div className="act-row">
              <button
                className="act act-solid"
                onClick={connect}
                disabled={connecting || !hasProvider}
                type="button"
              >
                {connecting ? "connecting…" : "connect wallet"}
              </button>
              <Link className="act" href="/docs">
                How it works
              </Link>
            </div>
          </div>
        </Panel>
      ) : null}

      {/* ------------------------------------------------------------ your book */}
      {address ? (
        <>
          <div className="mt">
            <SecTag no="01">your position</SecTag>
          </div>

          <section className="kpi-strip">
            <Stat
              k="wallet"
              v={acct.data ? money(acct.data.balance, 0) : "—"}
              unit={TOKEN_SYMBOL}
              small
              n={acct.error ? acct.error : "testnet faucet asset"}
            />
            <Stat
              k="free capacity"
              v={acct.data ? money(acct.data.freeCapacity, 0) : "—"}
              unit={TOKEN_SYMBOL}
              small
              tone={acct.data && acct.data.freeCapacity > 0n ? "settle" : undefined}
              n="backing new coverage"
            />
            <Stat
              k="bond locked"
              v={acct.data ? money(acct.data.lockedBond, 0) : "—"}
              unit={TOKEN_SYMBOL}
              small
              n="securing live exposure"
            />
            <Stat
              k="your coverage"
              v={validMine}
              unit={validMine === 1 ? "" : ""}
              n={`${validMine} valid of ${mine.length} bought · ${money(coveredExposure, 0)} max exposure · ${money(drawnTotal, 0)} drawn`}
            />
          </section>

          <section className="kpi-strip mt">
            <Stat
              k="as lender"
              v={acct.data ? money(acct.data.lenderLiquidity, 0) : "—"}
              unit={TOKEN_SYMBOL}
              small
              n="pool liquidity you supplied"
            />
            <Stat
              k="your book at risk"
              v={money(bookBond, 0)}
              unit={TOKEN_SYMBOL}
              small
              n={`${underwriting.length} position${underwriting.length === 1 ? "" : "s"} you underwrite`}
            />
            <Stat
              k="gas"
              v={acct.data ? (Number(acct.data.ctc) / 1e18).toFixed(3) : "—"}
              unit="CTC"
              small
              n="native balance for transactions"
            />
            <div className="kpi">
              <span className="kpi-k">onboard</span>
              <div className="stack-sm">
                <TxButton
                  solid
                  onRun={() => actions.faucet("5000")}
                  confirmNote={<>5,000 {TOKEN_SYMBOL} minted to your address.</>}
                >
                  get 5,000 {TOKEN_SYMBOL}
                </TxButton>
                <span className="kpi-n">
                  a public function on the testnet token — a real mint, not a queue
                </span>
              </div>
            </div>
          </section>

          <section className="mt">
            <SecTag no="02">your coverage positions</SecTag>
            <Panel
              hint={`${mine.length} as borrower · ${underwriting.length} as underwriter`}
              flush
            >
              {positions.error ? (
                <div style={{ padding: 22 }}>
                  <ReadError error={positions.error} what="positions" />
                </div>
              ) : positions.loading ? (
                <Loading what="reading positions from the engine…" />
              ) : (
                <PositionsTable
                  rows={[
                    ...mine,
                    ...underwriting.filter((u) => !mine.some((m) => m.id === u.id)),
                  ]}
                  frontier={fh}
                  empty="No coverage positions yet. Buy coverage in the market, or provide capacity so someone else can."
                  actions={(c) => {
                    const isBorrower =
                      address && c.borrower.toLowerCase() === address.toLowerCase();
                    return (
                      <>
                        {isBorrower && c.status === 0 && c.valid ? (
                          <Link
                            className="act act-solid act-sm"
                            href={`/positions?id=${String(c.id)}`}
                          >
                            Draw
                          </Link>
                        ) : null}
                        {c.status === 0 && c.drawn === 0n ? (
                          <TxButton
                            onRun={() => actions.settle(c.id)}
                            confirmNote={<>Bond returned to the underwriter.</>}
                          >
                            Settle
                          </TxButton>
                        ) : null}
                      </>
                    );
                  }}
                />
              )}
            </Panel>
          </section>
        </>
      ) : null}
    </>
  );
}
