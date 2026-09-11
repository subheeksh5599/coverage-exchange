"use client";

// The shell. Two presentations of the same design language:
//
//   /            the landing — full-bleed, no sidebar, its own header
//   everything   the console — sticky sidebar with the live frontier, numbered nav,
//   else         the wallet, and the deployed addresses; main column for the page
//
// Ported from the protocol's original frontend so the marketing surface and the
// application read as one product rather than two.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { useFrontier } from "@/lib/protocol";
import { ADDR, CHAIN_ID, EXPLORER_ADDR_BASE, SOURCE_CHAIN_LABEL } from "@/lib/chain";

const NAV: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/market", label: "Buy coverage" },
  { href: "/underwrite", label: "Provide coverage" },
  { href: "/positions", label: "Positions" },
  { href: "/challenge", label: "Challenge" },
  { href: "/activity", label: "Activity" },
  { href: "/protocol", label: "Protocol" },
  { href: "/docs", label: "Docs" },
];

function AddrLink({ addr, lead = 6 }: { addr: `0x${string}`; lead?: number }) {
  return (
    <a
      className="txlink"
      href={`${EXPLORER_ADDR_BASE}${addr}`}
      target="_blank"
      rel="noreferrer"
      title={addr}
    >
      {addr.slice(0, 2 + lead)}…{addr.slice(-4)}
    </a>
  );
}

/** The attested frontier — the one number that moves while you watch. */
function FrontierPanel() {
  const f = useFrontier();

  return (
    <div className="side-frontier">
      <span className="tag">attested frontier · {SOURCE_CHAIN_LABEL.toLowerCase()}</span>
      {f.loading ? (
        <div className="skel" style={{ height: 26, width: "70%", marginTop: 8 }} />
      ) : f.error ? (
        <div className="side-frontier-num blood" style={{ fontSize: 13 }}>
          unreachable
        </div>
      ) : f.data?.available ? (
        <div className="side-frontier-num mono-tab">
          <span className="flick">●</span> {f.data.height.toLocaleString("en-US")}
        </div>
      ) : (
        <div className="side-frontier-num blood" style={{ fontSize: 13 }}>
          unavailable — fails closed
        </div>
      )}
      <span className="tag" style={{ letterSpacing: "0.14em", fontSize: 8.5 }}>
        chaininfo precompile · attestcoin
      </span>
    </div>
  );
}

/** Wallet, in the sidebar where the app lives. */
function WalletBlock() {
  const { address, connect, connecting, hasProvider, onCorrectChain, switchToCc3, disconnect } =
    useWallet();

  if (!hasProvider) {
    return (
      <button className="wbtn" type="button" disabled title="Install an EIP-1193 wallet (e.g. MetaMask)">
        <span className="dot dot-idle" /> no wallet detected
      </button>
    );
  }

  if (!address) {
    return (
      <button className="wbtn wbtn-solid" onClick={connect} disabled={connecting} type="button">
        {connecting ? "connecting…" : "connect wallet"}
      </button>
    );
  }

  if (!onCorrectChain) {
    return (
      <button className="wbtn wbtn-warn" onClick={switchToCc3} type="button">
        <span className="dot dot-warn" /> switch to cc3
      </button>
    );
  }

  return (
    <>
      <button className="wbtn" onClick={disconnect} type="button" title={`${address} — click to disconnect`}>
        <span className="dot dot-ok" />
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    </>
  );
}

function NetworkBanner() {
  const { address, onCorrectChain, switchToCc3, chainId } = useWallet();
  if (!address || onCorrectChain) return null;
  return (
    <div className="notice n-warn" style={{ marginBottom: 20 }}>
      <div>
        <strong>Wrong network.</strong> Your wallet is on chain {chainId ?? "unknown"}; this protocol
        is deployed on Creditcoin CC3 (chain {CHAIN_ID}). Transactions will fail until you switch.{" "}
        <button
          onClick={switchToCc3}
          type="button"
          style={{
            background: "none",
            border: 0,
            color: "inherit",
            textDecoration: "underline",
            cursor: "pointer",
            padding: 0,
            font: "inherit",
          }}
        >
          Switch now
        </button>
      </div>
    </div>
  );
}

function LandingHeader() {
  const path = usePathname();
  const frontier = useFrontier();
  return (
    <header className="topbar" style={{ display: "flex", position: "sticky" }}>
      <Link href="/" className="wordmark">
        COVERAGE<span className="wm-x">/</span>EXCHANGE
      </Link>
      <span className="tag-tight" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span className={frontier.data?.available ? "flick" : "flick loss"}>●</span> cc3 · {CHAIN_ID}
      </span>
      <nav className="topnav">
        <Link href="/dashboard" className={path === "/dashboard" ? "on" : ""}>
          Console
        </Link>
        <Link href="/market">Market</Link>
        <Link href="/docs">Docs</Link>
        <a href="https://github.com/subheeksh5599/coverage-exchange" target="_blank" rel="noreferrer">
          Source
        </a>
      </nav>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const isLanding = path === "/";

  if (isLanding) {
    return (
      <>
        <LandingHeader />
        {children}
      </>
    );
  }

  return (
    <div className="shell">
      {/* mobile bar */}
      <div className="topbar" style={{ gridColumn: "1 / -1", display: undefined }}>
        <Link href="/" className="wordmark">
          COVERAGE<span className="wm-x">/</span>EXCHANGE
        </Link>
        <nav className="topnav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href ? "on" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
      </div>

      <aside className="shell-side">
        <div className="shell-side-top">
          <Link href="/" className="wordmark">
            COVERAGE<span className="wm-x">/</span>EXCHANGE
            <span className="wordmark-sub">bonded coverage · cc3</span>
          </Link>

          <FrontierPanel />

          <Link
            href="/"
            className="tag"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "2px 0" }}
          >
            ← back to the landing page
          </Link>

          <nav className="side-nav">
            {NAV.map((n, i) => (
              <Link
                key={n.href}
                href={n.href}
                className={`side-link${path === n.href ? " on" : ""}`}
              >
                <span className="side-link-no">{String(i + 1).padStart(2, "0")}</span>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="shell-side-bottom">
          <WalletBlock />
          <span className="tag">deployed · cc3 {CHAIN_ID}</span>
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
                  <AddrLink addr={addr} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="shell-main">
        <NetworkBanner />
        {children}
      </main>
    </div>
  );
}
