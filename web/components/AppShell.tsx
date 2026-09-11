"use client";

// The console shell: a sticky sidebar with the wallet at the top, the live attested frontier,
// and the numbered nav; the page renders in the main column.
//
// The landing page (`/`) is deliberately NOT wrapped — it brings its own fixed header and
// full-bleed sections, exactly as the original design had it.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { useFrontier } from "@/lib/protocol";
import { CHAIN_ID, SOURCE_CHAIN_LABEL } from "@/lib/chain";

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

/** Wallet, at the top of the rail where the work starts. */
function WalletBlock() {
  const { address, connect, connecting, hasProvider, onCorrectChain, switchToCc3, disconnect } =
    useWallet();

  if (!hasProvider) {
    return (
      <button
        className="wbtn"
        type="button"
        disabled
        title="Install an EIP-1193 wallet (e.g. MetaMask) and reload"
      >
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
    <button
      className="wbtn"
      onClick={disconnect}
      type="button"
      title={`${address} — click to disconnect`}
    >
      <span className="dot dot-ok" />
      {address.slice(0, 6)}…{address.slice(-4)}
    </button>
  );
}

function NetworkBanner() {
  const { address, onCorrectChain, switchToCc3, chainId } = useWallet();
  if (!address || onCorrectChain) return null;
  return (
    <div className="notice n-warn" style={{ marginBottom: 20 }}>
      <div>
        <strong>wrong network.</strong> Your wallet is on chain {chainId ?? "unknown"}; this
        protocol is deployed on Creditcoin CC3 (chain {CHAIN_ID}). Transactions will fail until you
        switch.{" "}
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  // The landing supplies its own header and layout.
  if (path === "/") return <>{children}</>;

  return (
    <div className="shell">
      {/* mobile bar — the sidebar is hidden below 960px */}
      <div className="console-topbar">
        <Link href="/" className="wordmark">
          COVERAGE<span className="wm-x">/</span>EXCHANGE
        </Link>
        <nav className="header-nav">
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

          <WalletBlock />

          <FrontierPanel />

          <nav className="side-nav">
            {NAV.map((n, i) => (
              <Link key={n.href} href={n.href} className={`side-link${path === n.href ? " on" : ""}`}>
                <span className="side-link-no">{String(i + 1).padStart(2, "0")}</span>
                {n.label}
              </Link>
            ))}
            <Link href="/" className="side-link">
              <span className="side-link-no">←</span> Landing
            </Link>
          </nav>
        </div>
      </aside>

      <main className="shell-main">
        <NetworkBanner />
        {children}
      </main>
    </div>
  );
}
