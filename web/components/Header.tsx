"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFrontier } from "@/lib/useChainData";

export default function Header() {
  const path = usePathname();
  const frontier = useFrontier();

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="wordmark">
          COVERAGE<span className="wm-x">/</span>EXCHANGE
        </Link>
        <span className="chain-chip">
          <span className={frontier.available ? "flick" : "flick loss"}>●</span>
          cc3 · 102031
          {frontier.available && frontier.height !== null ? (
            <span className="mono-tab" style={{ color: "var(--bone)" }}>
              {frontier.height.toLocaleString("en-US")}
            </span>
          ) : null}
        </span>
        <nav className="header-nav">
          <Link href="/" className={path === "/" ? "on" : ""}>
            Protocol
          </Link>
          <Link href="/dashboard" className={path?.startsWith("/dashboard") ? "on" : ""}>
            Dashboard
          </Link>
          <a
            href="https://github.com/subheeksh5599/coverage-exchange"
            target="_blank"
            rel="noreferrer"
          >
            Source
          </a>
        </nav>
      </div>
    </header>
  );
}
