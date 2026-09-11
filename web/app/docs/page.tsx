import Link from "next/link";
import { REPO, SOURCE_CHAIN_LABEL, CHAIN_LABEL, ADDR, EXPLORER_ADDR_BASE } from "@/lib/chain";

// The one page allowed to explain. Everything else in this app is meant to be operated
// rather than read, so this stays short on purpose.

export const metadata = {
  title: "Docs — Coverage Exchange",
};

export default function DocsPage() {
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Docs</h1>
          <p>
            The short version. If you want the long one, walk the two-transaction sequence yourself: buy coverage
            in the market, then disprove it on the challenge page.
          </p>
        </div>
        <div className="actions">
          <Link className="btn btn-primary" href="/market">Buy coverage</Link>
          <Link className="btn" href="/challenge">Challenge one</Link>
        </div>
      </div>

      <div className="grid split">
        <div className="grid" style={{ gap: 16 }}>
          <section className="card">
            <header className="card-head"><h2>The problem</h2></header>
            <div className="card-body">
              <p style={{ margin: 0, lineHeight: 1.7, color: "var(--ink-2)" }}>
                Cross-chain credit has a hole in the middle of it. A lender&apos;s collateral and a borrower&apos;s
                behaviour live on one chain; the credit lives on Creditcoin. Today the lender either trusts a
                report — a borrower&apos;s indexer, a risk API, an oracle operator, none of which loses money when
                it is wrong — or lends so little that it does not matter.
              </p>
              <p style={{ margin: "12px 0 0", lineHeight: 1.7, color: "var(--ink-2)" }}>
                The missing piece is not more data. It is a way to make a claim about cross-chain state{" "}
                <strong>cost money when it is false</strong>.
              </p>
            </div>
          </section>

          <section className="card">
            <header className="card-head"><h2>The primitive</h2></header>
            <div className="card-body">
              <p style={{ margin: 0, lineHeight: 1.7, color: "var(--ink-2)" }}>
                A <strong>coverage position</strong> is bonded capital standing behind one claim about a range of{" "}
                {SOURCE_CHAIN_LABEL} blocks:
              </p>
              <blockquote
                style={{
                  margin: "12px 0",
                  padding: "12px 14px",
                  borderLeft: "3px solid var(--accent)",
                  background: "var(--accent-wash)",
                  borderRadius: "0 6px 6px 0",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                  lineHeight: 1.7,
                }}
              >
                this borrower may unlock up to E of exposure only while the attested {SOURCE_CHAIN_LABEL} frontier
                covers [startBlock, endBlock] at the required depth, and no counterexample has been proven against
                it.
              </blockquote>
              <p style={{ margin: 0, lineHeight: 1.7, color: "var(--ink-2)" }}>
                Three roles, each with a reason to be honest. The <strong>borrower</strong> pays a premium and loses
                its coverage the moment it is breached. The <strong>underwriter</strong> takes the premium and loses
                its whole bond to whoever proves the breach. The <strong>challenger</strong> spends gas and needs no
                permission, no stake and no allowlist — the proof is the only credential.
              </p>
            </div>
          </section>

          <section className="card">
            <header className="card-head"><h2>What Attestcoin is doing</h2></header>
            <div className="card-body">
              <p style={{ margin: 0, lineHeight: 1.7, color: "var(--ink-2)" }}>
                The protocol is not decoration here — remove it and the product cannot exist. It is what lets a
                contract on Creditcoin know, without a human or an oracle committee, that a specific transaction
                really happened on {SOURCE_CHAIN_LABEL} at a specific height. The challenge path calls the Block
                Prover precompile inside the adjudicating transaction, so the proof is verified by the chain rather
                than asserted by the submitter.
              </p>
              <div className="mono" style={{ marginTop: 12, fontSize: "0.75rem", lineHeight: 1.8 }}>
                <div>adapter — <a href={`${EXPLORER_ADDR_BASE}${ADDR.adapter}`} target="_blank" rel="noreferrer">{ADDR.adapter.slice(0, 18)}…</a></div>
                <div>source chain — {SOURCE_CHAIN_LABEL} (Attestcoin key 1)</div>
                <div>deployment — {CHAIN_LABEL}, chain 102031</div>
              </div>
            </div>
          </section>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <section className="card">
            <header className="card-head"><h2>Do this, in order</h2></header>
            <div className="card-body">
              <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, color: "var(--ink-2)", fontSize: "0.8125rem" }}>
                <li>Connect a wallet and switch to CC3.</li>
                <li>Get testnet cxTUSD from the faucet on the dashboard.</li>
                <li>
                  <Link href="/underwrite">Provide coverage</Link> — deposit capital, which creates real capacity.
                </li>
                <li>
                  <Link href="/market">Buy coverage</Link>. Use the &ldquo;reproducible counterexample window&rdquo;
                  preset, and buy it from a <em>different</em> wallet if you want to play both sides.
                </li>
                <li>
                  <Link href="/positions">Draw</Link> credit against the position. The money actually moves.
                </li>
                <li>
                  <Link href="/challenge">Challenge it</Link> with the recorded counterexample. The proof is fetched
                  from the public builder and preflighted free before you submit.
                </li>
                <li>Watch the position go BREACHED, the bond move to the challenger, and a further draw revert.</li>
              </ol>
            </div>
          </section>

          <section className="card">
            <header className="card-head"><h2>What is not here</h2></header>
            <div className="card-body">
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, color: "var(--ink-2)", fontSize: "0.8125rem" }}>
                <li>No mock data, no seeded positions, no simulated transactions.</li>
                <li>No TVL, APY, user-count or volume figures — this deployment does not track them.</li>
                <li>The UI is a client of the contracts. It holds no state you cannot read yourself.</li>
                <li>Coverage windows are real {SOURCE_CHAIN_LABEL} heights, so a position only gates credit while the attested frontier still covers it.</li>
              </ul>
            </div>
          </section>

          <section className="card">
            <header className="card-head"><h2>Honest limitations</h2></header>
            <div className="card-body">
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, color: "var(--ink-2)", fontSize: "0.8125rem" }}>
                <li>Testnet only. The demo asset is a faucet token, not a stablecoin, and holds no value.</li>
                <li>Underwriters publish a price per borrower; they do not yet publish a standing offer with fixed windows and depths on chain.</li>
                <li>Pricing is a deterministic, published curve — not an oracle and not a model.</li>
                <li>Challenge discovery is manual: you supply the source transaction. It is not an automated searcher.</li>
              </ul>
              <div className="footnote" style={{ marginTop: 12 }}>
                Source, contracts and the fuller write-up: <a href={REPO} target="_blank" rel="noreferrer">{REPO.replace("https://", "")}</a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
