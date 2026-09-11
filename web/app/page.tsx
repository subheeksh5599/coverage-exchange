"use client";

// Dashboard. The first thing the app does is ask for a wallet; everything after that is the
// user's real position in the protocol. Nothing on this page is decorative: each number is a
// contract read and each button signs a transaction.

import Link from "next/link";
import { useMemo } from "react";
import { useAccountState, useFrontier, usePositions, useProtocolTotals, money } from "@/lib/protocol";
import { useWallet } from "@/lib/wallet";
import { useActions } from "@/lib/actions";
import { Card, Stat, Notice, TxButton, Empty, Loading, ReadError, Pill } from "@/components/ui";
import { PositionsTable } from "@/components/PositionsTable";

function ConnectGate() {
  const { connect, connecting, error, hasProvider } = useWallet();
  return (
    <Card title="Connect a wallet" hint="nothing on this site works without one">
      <div className="grid" style={{ gap: 14 }}>
        <p style={{ margin: 0, color: "var(--ink-2)", fontSize: "0.8125rem", lineHeight: 1.6 }}>
          Coverage Exchange is a financial application on Creditcoin CC3. Buy coverage with bonded capital
          behind it, draw credit against that coverage, provide the capital on the other side, or challenge a
          claim you can disprove. Every action is a transaction; there is no demo mode.
        </p>
        {!hasProvider ? (
          <Notice tone="warn">
            <div>
              <strong>No browser wallet detected.</strong> Install MetaMask (or any EIP-1193 wallet), then reload
              this page. The protocol reads below still work without a wallet.
            </div>
          </Notice>
        ) : null}
        {error ? <Notice tone="bad">{error}</Notice> : null}
        <div className="actions">
          <button className="btn btn-primary" onClick={connect} disabled={connecting || !hasProvider} type="button">
            {connecting ? "Connecting…" : "Connect wallet"}
          </button>
          <Link className="btn" href="/docs">What this does</Link>
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { address } = useWallet();
  const acct = useAccountState(address);
  const positions = usePositions();
  const totals = useProtocolTotals();
  const frontier = useFrontier();
  const actions = useActions();

  const mine = useMemo(
    () => (positions.data ?? []).filter((c) => address && c.borrower.toLowerCase() === address.toLowerCase()),
    [positions.data, address]
  );
  const underwriting = useMemo(
    () => (positions.data ?? []).filter((c) => address && c.underwriter.toLowerCase() === address.toLowerCase()),
    [positions.data, address]
  );

  const fh = frontier.data?.available ? frontier.data.height : null;
  const activeCoverage = mine.filter((c) => c.status === 0 && c.valid).length;
  const totalExposure = mine.reduce((a, c) => a + c.maxExposure, 0n);
  const drawnTotal = mine.reduce((a, c) => a + c.drawn, 0n);
  const bondAtRisk = underwriting.reduce((a, c) => a + (c.status === 0 ? c.bond : 0n), 0n);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>
            Your live position in the protocol. Balances, capacity, coverage and bonds are read from the
            deployed contracts on every refresh — if a read fails, this page says so instead of showing a stale
            number.
          </p>
        </div>
        {address ? (
          <div className="actions">
            <Link className="btn btn-primary" href="/market">Buy coverage</Link>
            <Link className="btn" href="/underwrite">Provide coverage</Link>
          </div>
        ) : null}
      </div>

      {!address ? (
        <div className="grid split">
          <ConnectGate />
          <div className="grid" style={{ gap: 16 }}>
            <Card title="Protocol right now" hint={totals.error ? "read failed" : "live"}>
              {totals.error ? (
                <ReadError error={totals.error} what="protocol totals" />
              ) : totals.loading || !totals.data ? (
                <Loading />
              ) : (
                <div className="grid cols-2" style={{ gap: 10 }}>
                  <div>
                    <div className="stat-k">Positions</div>
                    <div className="stat-v">{totals.data.positionCount}</div>
                  </div>
                  <div>
                    <div className="stat-k">Drawable liquidity</div>
                    <div className="stat-v">{money(totals.data.drawableLiquidity)}</div>
                  </div>
                  <div>
                    <div className="stat-k">Bonded capital held</div>
                    <div className="stat-v">{money(totals.data.engineBalance)}</div>
                  </div>
                  <div>
                    <div className="stat-k">Bond / exposure floor</div>
                    <div className="stat-v">{totals.data.ratioBps / 100}%</div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : null}

      {address ? (
        <>
          {/* ---------------------------------------------------------- your balances */}
          <div className="grid cols-4">
            <Card title="Wallet" hint={address.slice(0, 10) + "…"}>
              {acct.error ? (
                <ReadError error={acct.error} what="your balances" />
              ) : acct.loading || !acct.data ? (
                <Loading />
              ) : (
                <div className="grid" style={{ gap: 12 }}>
                  <div>
                    <div className="stat-k">cxTUSD balance</div>
                    <div className="stat-v">{money(acct.data.balance)}</div>
                  </div>
                  <div>
                    <div className="stat-k">CTC (gas)</div>
                    <div className="stat-v" style={{ fontSize: "0.9375rem" }}>
                      {(Number(acct.data.ctc) / 1e18).toFixed(4)}
                    </div>
                  </div>
                  <TxButton
                    onRun={() => actions.faucet("5000")}
                    confirmNote={<>5,000 cxTUSD minted to your address.</>}
                  >
                    Get 5,000 testnet cxTUSD
                  </TxButton>
                  <div className="footnote">
                    The faucet is a public function on the testnet token — a real mint, not an airdrop queue.
                  </div>
                </div>
              )}
            </Card>

            <Card title="As underwriting" hint="capital you supplied">
              {acct.loading || !acct.data ? (
                <Loading />
              ) : (
                <div className="grid" style={{ gap: 10 }}>
                  <div>
                    <div className="stat-k">Capacity available</div>
                    <div className="stat-v ok">{money(acct.data.freeCapacity)}</div>
                    <div className="stat-n">free to back new coverage</div>
                  </div>
                  <div>
                    <div className="stat-k">Bond locked</div>
                    <div className="stat-v">{money(acct.data.lockedBond)}</div>
                    <div className="stat-n">securing live exposure</div>
                  </div>
                  <div>
                    <div className="stat-k">Total deposited</div>
                    <div className="stat-v" style={{ fontSize: "1rem" }}>{money(acct.data.bondCapital)}</div>
                  </div>
                  <Link className="btn btn-sm" href="/underwrite">Manage capacity</Link>
                </div>
              )}
            </Card>

            <Card title="As borrower" hint="coverage you bought">
              <div className="grid" style={{ gap: 10 }}>
                <div>
                  <div className="stat-k">Valid positions</div>
                  <div className="stat-v">{activeCoverage}</div>
                </div>
                <div>
                  <div className="stat-k">Covered exposure</div>
                  <div className="stat-v">{money(totalExposure)}</div>
                </div>
                <div>
                  <div className="stat-k">Drawn</div>
                  <div className="stat-v">{money(drawnTotal)}</div>
                </div>
                <Link className="btn btn-sm" href="/market">Buy coverage</Link>
              </div>
            </Card>

            <Card title="As lender" hint="capital the pool may draw">
              {acct.loading || !acct.data ? (
                <Loading />
              ) : (
                <div className="grid" style={{ gap: 10 }}>
                  <div>
                    <div className="stat-k">Your pool liquidity</div>
                    <div className="stat-v">{money(acct.data.lenderLiquidity)}</div>
                  </div>
                  <div>
                    <div className="stat-k">Bond at risk (your book)</div>
                    <div className="stat-v">{money(bondAtRisk)}</div>
                    <div className="stat-n">bonds you have locked on live positions</div>
                  </div>
                  <Link className="btn btn-sm" href="/protocol">Pool detail</Link>
                </div>
              )}
            </Card>
          </div>

          {/* ----------------------------------------------------------- your positions */}
          <Card
            title="Your coverage positions"
            hint={`${mine.length} as borrower · ${underwriting.length} as underwriter`}
            flush
            actions={
              <div className="actions">
                <Link className="btn btn-sm" href="/positions">Open explorer</Link>
              </div>
            }
          >
            {positions.error ? (
              <div style={{ padding: 16 }}><ReadError error={positions.error} what="positions" /></div>
            ) : positions.loading ? (
              <Loading what="Reading positions from the engine…" />
            ) : (
              <PositionsTable
                rows={[...mine, ...underwriting.filter((u) => !mine.some((m) => m.id === u.id))]}
                frontier={fh}
                empty="You have no coverage positions yet. Buy coverage in the market, or provide capacity so someone else can."
                actions={(c) => {
                  const isBorrower = address && c.borrower.toLowerCase() === address.toLowerCase();
                  return (
                    <>
                      {isBorrower && c.status === 0 && c.valid ? (
                        <Link className="btn btn-sm btn-primary" href={`/positions?id=${String(c.id)}`}>Draw</Link>
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
          </Card>
        </>
      ) : null}

      {/* -------------------------------------------------------------- attestation state */}
      <Card title="Attestation" hint="Attestcoin, live">
        {frontier.error ? (
          <ReadError error={frontier.error} what="the attested frontier" />
        ) : frontier.loading || !frontier.data ? (
          <Loading />
        ) : (
          <div className="grid cols-3">
            <div>
              <div className="stat-k">Source chain</div>
              <div className="stat-v" style={{ fontSize: "1rem" }}>Sepolia (key 1)</div>
            </div>
            <div>
              <div className="stat-k">Attested frontier</div>
              <div className="stat-v">{frontier.data.available ? frontier.data.height.toLocaleString("en-US") : "unavailable"}</div>
            </div>
            <div>
              <div className="stat-k">Reader</div>
              <div className="stat-v" style={{ fontSize: "0.875rem" }}>
                <Pill tone={frontier.data.available ? "ok" : "bad"}>
                  {frontier.data.available ? "precompile responding" : "precompile unreachable"}
                </Pill>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
