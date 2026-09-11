"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { useFrontier } from "@/lib/protocol";
import { SOURCE_CHAIN_LABEL, CHAIN_ID } from "@/lib/chain";
import { Pill } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/market", label: "Buy coverage" },
  { href: "/underwrite", label: "Provide coverage" },
  { href: "/positions", label: "Positions" },
  { href: "/challenge", label: "Challenge" },
  { href: "/activity", label: "Activity" },
  { href: "/protocol", label: "Protocol" },
  { href: "/docs", label: "Docs" },
];

function WalletButton() {
  const { address, connect, connecting, hasProvider, onCorrectChain, switchToCc3, chainId } = useWallet();

  if (!hasProvider) {
    return (
      <span className="wbtn" title="Install MetaMask or any EIP-1193 wallet">
        <i className="dot dot-idle" /> No wallet
      </span>
    );
  }

  if (!address) {
    return (
      <button className="wbtn wbtn-solid" onClick={connect} disabled={connecting} type="button">
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  if (!onCorrectChain) {
    return (
      <button className="wbtn wbtn-warn" onClick={switchToCc3} type="button" title={`Wallet is on chain ${chainId}`}>
        <i className="dot dot-warn" /> Switch to CC3
      </button>
    );
  }

  return (
    <span className="wbtn" title={address}>
      <i className="dot dot-ok" />
      {address.slice(0, 6)}…{address.slice(-4)}
    </span>
  );
}

/** The attested frontier, read live. The one number that moves while you watch. */
function FrontierChip() {
  const f = useFrontier();
  if (f.error) {
    return (
      <span className="wbtn" title={f.error}>
        <i className="dot dot-bad" /> frontier unavailable
      </span>
    );
  }
  if (f.loading || !f.data) {
    return (
      <span className="wbtn">
        <i className="dot dot-idle" /> reading…
      </span>
    );
  }
  return (
    <span className="wbtn" title={`Attested ${SOURCE_CHAIN_LABEL} frontier, read from AttestcoinAdapter`}>
      <i className={`dot ${f.data.available ? "dot-ok" : "dot-bad"}`} />
      {SOURCE_CHAIN_LABEL} {f.data.available ? f.data.height.toLocaleString("en-US") : "unavailable"}
    </span>
  );
}

function NetworkBanner() {
  const { address, onCorrectChain, switchToCc3, chainId } = useWallet();
  if (!address || onCorrectChain) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="notice n-warn">
        <div>
          <strong>Wrong network.</strong> Your wallet is on chain {chainId ?? "unknown"}; this protocol is
          deployed on Creditcoin CC3 (chain {CHAIN_ID}). Transactions will fail until you switch.{" "}
          <button
            onClick={switchToCc3}
            type="button"
            style={{ background: "none", border: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", padding: 0, font: "inherit" }}
          >
            Switch now
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="wordmark">
          Coverage Exchange
          <small>bonded cross-chain coverage · CC3</small>
        </Link>
        <nav className="topnav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href ? "on" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="wallet">
          <FrontierChip />
          <WalletButton />
        </div>
      </header>
      <main className="shell-body">
        <NetworkBanner />
        {children}
      </main>
    </div>
  );
}

export { Pill };
