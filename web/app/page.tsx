"use client";

// The landing. Same design language as the console, and honest: every number on it comes
// from a contract read or the generated evidence manifest. No TVL, no APY, no user count —
// this deployment tracks none of those, so inventing them would be the first lie on a page
// about claims that cost money when they are false.

import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { useFrontier, usePositions, useProtocolTotals, money } from "@/lib/protocol";
import { MEASURED, ADDR, REPO, SOURCE_CHAIN_LABEL, EXPLORER_ADDR_BASE } from "@/lib/chain";
import { TOKEN_SYMBOL } from "@/lib/chain";

function short(a: string, lead = 4) {
  return `${a.slice(0, 2 + lead)}…${a.slice(-4)}`;
}

function Marquee() {
  const frontier = useFrontier();
  const totals = useProtocolTotals();
  const positions = usePositions();

  const all = positions.data ?? [];
  const items: [string, string][] = [
    ["contract tests", String(MEASURED.forgeTests)],
    ["attacks refused", `${MEASURED.attacksRefused}/${MEASURED.attackCount}`],
    ["contracts verified", String(MEASURED.contractsVerified)],
    ["live attestcoin checks", `${MEASURED.liveChecks}/${MEASURED.liveChecks}`],
    ["positions on chain", total(positions.data)],
    ["bonded capital", totals.data ? `${money(totals.data.engineBalance, 0)}` : "…"],
    ["covered exposure", expo(all)],
    ["legs outcompressed", `${MEASURED.batchSaving5}% / ${MEASURED.batchSaving10}%`],
    [
      `${SOURCE_CHAIN_LABEL.toLowerCase()} frontier`,
      frontier.data?.available ? frontier.data.height.toLocaleString("en-US") : "unavailable",
    ],
  ];

  return (
    <div className="mq">
      <div className="mq-track">
        {items.map(([k, v]) => (
          <span className="mq-item" key={k}>
            {k} <span className="sep">/</span> <span className="v mono-tab">{v}</span>
          </span>
        ))}
        {items.map(([k, v]) => (
          <span className="mq-item" key={`dup-${k}`} aria-hidden>
            {k} <span className="sep">/</span> <span className="v mono-tab">{v}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function total(rows: { id: bigint }[] | null) {
  return rows ? String(rows.length) : "…";
}

function expo(rows: { status: number; maxExposure: bigint }[]) {
  if (!rows.length) return "0";
  const active = rows.filter((r) => r.status === 0).reduce((a, r) => a + r.maxExposure, 0n);
  return money(active, 0);
}

function ConnectCTA() {
  const { address, connect, connecting, hasProvider } = useWallet();
  if (address) {
    return (
      <Link className="act act-solid" href="/dashboard">
        Open the console →
      </Link>
    );
  }
  return (
    <button
      className="act act-solid"
      onClick={connect}
      disabled={connecting || !hasProvider}
      type="button"
      title={hasProvider ? undefined : "Install an EIP-1193 wallet such as MetaMask"}
    >
      {connecting ? "connecting…" : "Connect wallet"}
    </button>
  );
}

const ROLES: { name: string; outline?: boolean; facts: [string, string][] }[] = [
  {
    name: "Borrower",
    facts: [
      ["wants", "the credit the position unlocks"],
      ["loses", "coverage the moment it is breached — and it paid the premium"],
      ["can", "buy coverage, draw against it, repay, settle"],
    ],
  },
  {
    name: "Underwriter",
    outline: true,
    facts: [
      ["wants", "the premium"],
      ["loses", "the whole bond, to whoever proves the breach"],
      ["can", "deposit capital, price a borrower, withdraw free capacity"],
    ],
  },
  {
    name: "Challenger",
    facts: [
      ["wants", "the bond"],
      ["loses", "only gas"],
      ["can", "breach a position with one proven counterexample — no stake, no allowlist"],
    ],
  },
];

export default function Landing() {
  const frontier = useFrontier();
  const totals = useProtocolTotals();

  return (
    <>
      {/* ----------------------------------------------------------------- hero */}
      <section className="hero">
        <div className="hero-kicker">
          <span className="tag">
            <span className="blood">●</span> live on creditcoin cc3 · attesting{" "}
            {SOURCE_CHAIN_LABEL.toLowerCase()} · {MEASURED.contractsVerified} contracts source-verified
          </span>
          <span className="tag">
            frontier ·{" "}
            {frontier.data?.available
              ? frontier.data.height.toLocaleString("en-US")
              : "unavailable"}
          </span>
        </div>

        <h1 className="dx hero-title">
          <span className="line">Lying about</span>
          <span className="line">
            another chain <span className="outline-blood">costs</span>
          </span>
          <span className="line">the bond.</span>
        </h1>

        <div className="hero-row">
          <p className="hero-sub">
            Every report about another chain is written by someone who loses nothing when it is
            wrong. Coverage Exchange makes <strong>the claim itself carry the money</strong> — an
            underwriter bonds capital behind a window of {SOURCE_CHAIN_LABEL} history, a lender draws
            only while the claim stands, and <strong>one proven counterexample takes the bond</strong>.
          </p>
          <div className="hero-cta">
            <ConnectCTA />
            <Link className="act" href="/docs">
              How it works
            </Link>
          </div>
        </div>
      </section>

      <Marquee />

      {/* ------------------------------------------------------------ statement */}
      <section className="sec">
        <div className="sec-inner">
          <div className="sec-tag">
            <span className="tag">
              <span className="no">01</span> · the problem
            </span>
          </div>
          <h2 className="statement">
            Cross-chain credit has a hole in the middle of it. The collateral lives on one chain,{" "}
            <span className="em">the credit on another</span>, and the lender&apos;s only options are
            to trust a report or to lend so little it does not matter.
          </h2>
          <p className="statement-foot">
            The missing piece is not more data. It is a way to make a claim about cross-chain state{" "}
            <strong>cost money when it is false</strong>. That is the whole product.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------ roles */}
      <section className="sec">
        <div className="sec-inner">
          <div className="sec-tag">
            <span className="tag">
              <span className="no">02</span> · who is in the trade
            </span>
          </div>

          {ROLES.map((r) => (
            <div className="role-row" key={r.name}>
              <span className="role-no">{r.name.slice(0, 2).toUpperCase()}</span>
              <span className={`dx role-name ${r.outline ? "outline" : ""}`}>{r.name}</span>
              <div className="role-facts">
                {r.facts.map(([k, v]) => (
                  <div key={k}>
                    <span className="tag-tight">{k}</span>
                    <div>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ how it works */}
      <section className="sec">
        <div className="sec-inner">
          <div className="sec-tag">
            <span className="tag">
              <span className="no">03</span> · do it yourself
            </span>
          </div>

          <div className="rule-list">
            {(
              [
                [
                  "Create capacity",
                  "Deposit testnet capital. That is what creates coverage capacity — the protocol cannot mint coverage out of nothing.",
                  "/underwrite",
                  "Provide capacity",
                ],
                [
                  "Buy coverage",
                  "Pick an underwriter with free capacity, set a window of source-chain blocks, and the on-chain pricing curve returns the premium. The bond is locked from the underwriter.",
                  "/market",
                  "Buy coverage",
                ],
                [
                  "Draw money",
                  "Release credit from the pool against the position. The lending contract re-checks coverage in the same transaction — the coverage has to actually gate the money.",
                  "/positions",
                  "Draw",
                ],
                [
                  "Prove a counterexample",
                  "Fetch a real Attestcoin inclusion proof for a source-chain transaction inside the window and submit it. The precompile verifies it; if it violates the invariant, the position dies and the bond moves — atomically.",
                  "/challenge",
                  "Challenge",
                ],
                [
                  "Watch the consequence",
                  "BREACHED is terminal. The bond has moved, and a further draw against that position now reverts on chain.",
                  "/positions",
                  "See positions",
                ],
              ] as const
            ).map(([title, body, href, cta], i) => (
              <div className="rule-row" key={title}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                  <div className="act-row" style={{ marginTop: 14 }}>
                    <Link className="act act-sm" href={href}>
                      {cta} →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ attestcoin */}
      <section className="sec">
        <div className="sec-inner">
          <div className="sec-tag">
            <span className="tag">
              <span className="no">04</span> · what is proven, and what is assumed
            </span>
          </div>
          <div className="wide">
            <div>
              <p className="statement-foot" style={{ marginTop: 0 }}>
                The protocol is not decoration here — remove it and the product cannot exist. It is
                what lets a contract on Creditcoin know, without a human or an oracle committee, that
                a specific transaction really happened on {SOURCE_CHAIN_LABEL} at a specific height.
              </p>
              <p className="statement-foot" style={{ maxWidth: "60ch" }}>
                Being precise about the boundary matters more than sounding strong:{" "}
                <strong>the honesty of the attestation set is an assumption</strong>, and we state it
                rather than hide it.
              </p>
            </div>
            <div className="rule-list">
              <div className="rule-row">
                <span className="n" style={{ color: "var(--settle)" }}>
                  ✓
                </span>
                <div>
                  <h3>Attested by the Attestcoin Protocol</h3>
                  <p>block headers, transaction inclusion, ordering</p>
                </div>
              </div>
              <div className="rule-row">
                <span className="n" style={{ color: "var(--settle)" }}>
                  ✓
                </span>
                <div>
                  <h3>Enforced by these contracts</h3>
                  <p>
                    bond ≥ exposure · one draw per window · counterparty check · proof verified by the
                    precompile, in the transaction
                  </p>
                </div>
              </div>
              <div className="rule-row">
                <span className="n">—</span>
                <div>
                  <h3>Assumed</h3>
                  <p>the attestation set is honest</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ closing */}
      <section className="closing">
        <div className="sec-inner">
          <h2 className="dx closing-title">
            <span className="line">Connect a wallet.</span>
            <span className="line outline">Break a claim.</span>
          </h2>
          <div className="hero-row" style={{ paddingBottom: 0 }}>
            <p className="hero-sub">
              {totals.data
                ? `${totals.data.positionCount} positions on this deployment · ${money(totals.data.drawableLiquidity, 0)} ${TOKEN_SYMBOL} drawable.`
                : "Reading protocol state…"}{" "}
              The two-transaction demo is the product itself: buy coverage, then disprove it.
            </p>
            <div className="hero-cta">
              <ConnectCTA />
              <Link className="act" href="/challenge">
                Challenge one
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ footer */}
      <footer className="footer">
        <div className="footer-inner">
          <span className="tag">
            engine {short(ADDR.engine)} ·{" "}
            <a
              className="txlink"
              href={`${EXPLORER_ADDR_BASE}${ADDR.engine}`}
              target="_blank"
              rel="noreferrer"
            >
              verify on explorer
            </a>
          </span>
          <span className="tag">
            <a className="txlink" href={REPO} target="_blank" rel="noreferrer">
              source
            </a>{" "}
            · testnet only, no real value
          </span>
        </div>
      </footer>
    </>
  );
}
