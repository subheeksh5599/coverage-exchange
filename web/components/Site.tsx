"use client";

import { useEffect, useRef, useState } from "react";
import { useFrontier } from "@/lib/useChainData";
import { SOURCE_CHAIN_LABEL, REPO, CHAIN_LABEL, MEASURED } from "@/lib/chain";

export function Arrow() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M2.5 6.5h8m0 0L7.2 3.2m3.3 3.3L7.2 9.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Ethereum's attested frontier, read live from the adapter. The one number on the
 *  page that is neither generated nor hardcoded — it moves while you watch. */
export function FrontierChip() {
  const f = useFrontier();
  if (f.loading) {
    return (
      <span className="chip">
        <span className="dot dot-idle" />
        reading attested {SOURCE_CHAIN_LABEL} block…
      </span>
    );
  }
  if (f.error || !f.available) {
    return (
      <span className="chip">
        <span className="dot dot-bad" />
        attestation unavailable{f.error ? " · rpc" : ""}
      </span>
    );
  }
  return (
    <span className="chip" title="Read live from AttestcoinAdapter.tryFrontier() on Creditcoin CC3">
      <span className="dot dot-live" />
      attested {SOURCE_CHAIN_LABEL} block{" "}
      <b style={{ fontWeight: 500, color: "var(--ink)" }}>{f.height?.toLocaleString()}</b>
    </span>
  );
}

export function Nav() {
  return (
    <header className="nav">
      <div className="wrap nav-in">
        <a href="/" className="brand">
          Coverage Exchange
          <span className="brand-mark" title="Creditcoin CC3 testnet · chainId 102031">CC3</span>
        </a>
        <nav className="nav-links">
          <a href="/#how">How it works</a>
          <a href="/#positions">Console</a>
          <a href="/#adversarial">Adversarial</a>
          <a href="/#verify">Verify it</a>
        </nav>
        <div className="nav-right">
          <FrontierChip />
          <a className="btn btn-sm" href="/dashboard">
            Open console
          </a>
        </div>
      </div>
    </header>
  );
}

export function Footer({ repo = REPO }: { repo?: string } = {}) {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <div className="brand" style={{ marginBottom: 12 }}>
              Coverage Exchange
            </div>
            <p style={{ color: "var(--ink-3)", fontSize: "0.875rem", maxWidth: "34ch" }}>
              Bonded coverage over attested cross-chain state windows. Deployed to Creditcoin CC3
              testnet.
            </p>
          </div>
          <div>
            <h4>Platform</h4>
            <ul>
              <li><a href="/dashboard">Live console</a></li>
              <li><a href="/#how">How it works</a></li>
              <li><a href="/#adversarial">Attack matrix</a></li>
              <li><a href="/#verify">Verify it</a></li>
            </ul>
          </div>
          <div>
            <h4>Technical</h4>
            <ul>
              <li><a href={`${repo}/blob/master/INVARIANTS.md`}>Invariants</a></li>
              <li><a href={`${repo}/blob/master/docs/ATTESTCOIN.md`}>Attestcoin integration</a></li>
              <li><a href={`${repo}/blob/master/docs/GAS.md`}>Gas &amp; latency</a></li>
              <li><a href={`${repo}/blob/master/SECURITY.md`}>Threat model</a></li>
            </ul>
          </div>
          <div>
            <h4>Source</h4>
            <ul>
              <li><a href={repo}>GitHub repository</a></li>
              <li><a href={`${repo}/blob/master/docs/JUDGE-PACKET.md`}>Reviewer packet</a></li>
              <li><a href={`${repo}/blob/master/docs/ROADMAP.md`}>What is not built</a></li>
              <li><a href="https://docs.attestcoin.org/">Attestcoin docs</a></li>
            </ul>
          </div>
        </div>
        <div className="foot-base">
          <span>Creditcoin CC3 testnet · chainId 102031</span>
          <span>Testnet only. Faucet assets, unaudited.</span>
          <span style={{ marginLeft: "auto" }} className="mono">
            read-only interface
          </span>
        </div>
      </div>
    </footer>
  );
}

/** Frames a real screenshot of the running product like a browser window. */
export function Shot({
  src,
  alt,
  w,
  h,
  url = "coverage-exchange.app/dashboard",
  caption,
  priority = false,
  dark = false,
}: {
  src: string;
  alt: string;
  /** Intrinsic pixel size of the capture. Required: without it the frame collapses
   *  to zero height, the browser never triggers the lazy load, and no image appears. */
  w: number;
  h: number;
  url?: string;
  caption?: React.ReactNode;
  priority?: boolean;
  dark?: boolean;
}) {
  return (
    <figure style={{ margin: 0 }}>
      <div className={`shot${dark ? " shot-on-ink" : ""}`}>
        <div className="shot-bar">
          <span className="dot dot-idle" style={{ background: "#e05c4a" }} />
          <span className="dot dot-idle" style={{ background: "#e8b23a" }} />
          <span className="dot dot-idle" style={{ background: "#3fae63" }} />
          <span className="shot-url mono">{url}</span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          width={w}
          height={h}
          style={{ width: "100%", height: "auto", aspectRatio: `${w} / ${h}` }}
          // Always eager. These are the page's primary content and there are only three of
          // them, and native lazy loading proved unreliable: in a driven browser the
          // below-fold shots were never requested at all, even once scrolled into view, so
          // the page shipped empty frames. For an image that must appear, `eager` is correct
          // and the few hundred KB is the right trade.
          loading="eager"
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
        />
      </div>
      {caption ? <figcaption className="shot-caption">{caption}</figcaption> : null}
    </figure>
  );
}

/** Scroll reveal. Plain IntersectionObserver — no animation library needed for this. */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
  ...rest
}: {
  children: React.ReactNode;
  delay?: number;
  as?: React.ElementType;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    // Anything already in view on mount is shown immediately — waiting for a scroll
    // event that may never come is how a hero ends up blank.
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "-8% 0px -8% 0px" }
    );
    io.observe(el);
    // Failsafe: never leave content invisible because an observer misfired.
    const t = setTimeout(() => setSeen(true), 2000);
    return () => {
      io.disconnect();
      clearTimeout(t);
    };
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal ${seen ? "reveal-in" : ""} ${className}`.trim()}
      style={{ transitionDelay: seen ? `${delay}ms` : undefined }}
      {...rest}
    >
      {children}
    </Tag>
  );
}


/** Section wrapper with the three surface tones used across the page. */
export function Section({
  id,
  tone = "paper",
  children,
}: {
  id?: string;
  tone?: "paper" | "tint" | "ink";
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`sec sec-${tone}`}>
      <div className="wrap">{children}</div>
    </section>
  );
}

export function Eyebrow({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "on-ink";
}) {
  return <div className={`eyebrow${tone === "on-ink" ? " eyebrow-on-ink" : ""}`}>{children}</div>;
}

/** Headline metrics. Values come from the generated evidence module, never typed here. */
export function StatStrip() {
  const items = [
    { v: String(MEASURED.forgeTests), k: "contract tests passing" },
    { v: `${MEASURED.attacksRefused}/${MEASURED.attackCount}`, k: "attacks refused on chain" },
    { v: String(MEASURED.contractsVerified), k: "contracts source-verified" },
    { v: `${MEASURED.liveChecks}`, k: "live Attestcoin checks" },
  ];
  return (
    <dl className="stat-strip">
      {items.map((i) => (
        <div key={i.k} className="stat">
          <dt className="stat-v">{i.v}</dt>
          <dd className="stat-k">{i.k}</dd>
        </div>
      ))}
    </dl>
  );
}
