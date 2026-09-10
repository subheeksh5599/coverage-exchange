"use client";

// Coverage Exchange — landing. GSAP scrolltelling:
// masked line reveals, word-scrub statement, pinned breach theatre where
// scrolling plays the slash (bond drains to the challenger, BREACHED stamps in),
// attack wall, measured evidence. All chain numbers real; frontier read live.

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import Header from "@/components/Header";
import { useFrontier } from "@/lib/useChainData";
import {
  ADDR,
  ATTACKS,
  DEMO_TXS,
  EXPLORER,
  MEASURED,
  SEPOLIA_COUNTEREXAMPLE,
  short,
} from "@/lib/chain";

gsap.registerPlugin(ScrollTrigger);

function Tx({ hash, label }: { hash: string; label?: string }) {
  return (
    <a className="txlink" href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
      {label ?? short(hash)}
    </a>
  );
}

const STATEMENT =
  "Every report about another chain is written by someone who loses nothing when it is wrong. Coverage Exchange makes the claim itself carry the money — an underwriter bonds capital behind a window of source-chain history, a lender draws only while the claim stands, and one proven counterexample takes the entire bond.";

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const frontier = useFrontier();

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const lenis = new Lenis({ duration: 1.25, lerp: 0.08, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      if (reduced) {
        gsap.set(".hero-title .line > span, .closing-title .line > span", { yPercent: 0 });
        gsap.set(".statement .w", { color: "var(--bone)" });
        gsap.set(".stamp", { opacity: 1, scale: 1 });
        return;
      }

      // ---------------------------------------------------------- hero lines
      gsap.from(".hero-title .line > span", {
        yPercent: 110,
        duration: 1.3,
        stagger: 0.09,
        ease: "power4.out",
        delay: 0.25,
      });

      gsap.from(".hero-kicker, .hero-sub, .hero-cta", {
        autoAlpha: 0,
        y: 26,
        duration: 1,
        stagger: 0.1,
        delay: 0.9,
        ease: "power3.out",
      });

      // hero sinks + fades as you leave it
      gsap.to(".hero-title", {
        yPercent: 18,
        autoAlpha: 0.25,
        ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
      });

      // ---------------------------------------------------------- statement word scrub
      const words = gsap.utils.toArray<HTMLElement>(".statement .w");
      gsap.to(words, {
        color: "var(--bone)",
        stagger: 0.6,
        ease: "none",
        scrollTrigger: {
          trigger: ".statement",
          start: "top 72%",
          end: "bottom 42%",
          scrub: true,
        },
      });

      // ---------------------------------------------------------- roles slide in
      gsap.utils.toArray<HTMLElement>(".role-row").forEach((row, i) => {
        gsap.from(row.querySelector(".role-name"), {
          xPercent: i % 2 === 0 ? 12 : -8,
          autoAlpha: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: { trigger: row, start: "top 82%" },
        });
      });

      // ---------------------------------------------------------- breach theatre (pinned)
      const BOND = 12000;
      const uw = { v: BOND };
      const ch = { v: 0 };
      const uwEl = document.querySelector(".ledger-uw .ledger-num");
      const chEl = document.querySelector(".ledger-ch .ledger-num");
      const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

      const theatre = gsap.timeline({
        scrollTrigger: {
          trigger: ".theatre",
          start: "top top",
          end: "+=280%",
          scrub: 1,
          pin: ".theatre-stage",
        },
      });

      theatre
        // phase 1: evidence arrives
        .from(".evidence-card", { autoAlpha: 0, y: 60, duration: 0.8, ease: "power2.out" })
        .from(".verify-line span", { autoAlpha: 0, stagger: 0.25, duration: 0.6 }, ">-0.2")
        // phase 2: the slash — bond drains, numbers counter-rotate
        .addLabel("slash", "+=0.3")
        .to(
          uw,
          {
            v: 0,
            duration: 2.4,
            ease: "power2.inOut",
            onUpdate: () => {
              if (uwEl) uwEl.textContent = fmt(uw.v);
            },
          },
          "slash"
        )
        .to(
          ch,
          {
            v: BOND,
            duration: 2.4,
            ease: "power2.inOut",
            onUpdate: () => {
              if (chEl) chEl.textContent = fmt(ch.v);
            },
          },
          "slash"
        )
        .to(".ledger-uw .ledger-num", { color: "var(--dim)", duration: 2.4 }, "slash")
        .to(".ledger-ch .ledger-num", { color: "var(--blood)", duration: 2.4 }, "slash")
        .to(".tp-fill", { scaleX: 1, duration: 2.4, ease: "none" }, "slash")
        // phase 3: status flips, stamp slams
        .add(() => {
          const b = document.querySelector(".stage-badge");
          if (b) {
            b.classList.add("is-breached");
            b.textContent = "BREACHED · TERMINAL";
          }
        }, "slash+=2.0")
        .fromTo(
          ".stamp",
          { autoAlpha: 0, scale: 2.6, rotate: -14 },
          { autoAlpha: 1, scale: 1, rotate: -8, duration: 0.5, ease: "power4.in" },
          "slash+=2.1"
        )
        .from(
          ".aftermath",
          { autoAlpha: 0, y: 30, duration: 0.6, stagger: 0.2 },
          "slash+=2.7"
        )
        .to({}, { duration: 0.6 }); // hold

      // shake on stamp impact
      theatre.to(
        ".stage-inner",
        { x: 6, duration: 0.05, repeat: 5, yoyo: true, ease: "none" },
        "slash+=2.1"
      );

      // ---------------------------------------------------------- generic reveals
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.from(el, {
          autoAlpha: 0,
          y: 44,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 86%" },
        });
      });

      gsap.utils.toArray<HTMLElement>(".attack-row").forEach((row, i) => {
        gsap.from(row, {
          autoAlpha: 0,
          x: -30,
          duration: 0.55,
          delay: (i % 5) * 0.04,
          ease: "power2.out",
          scrollTrigger: { trigger: row, start: "top 92%" },
        });
      });

      // ---------------------------------------------------------- closing
      gsap.from(".closing-title .line > span", {
        yPercent: 110,
        duration: 1.1,
        stagger: 0.12,
        ease: "power4.out",
        scrollTrigger: { trigger: ".closing", start: "top 70%" },
      });
    }, root);

    return () => {
      ctx.revert();
      gsap.ticker.remove((time) => lenis.raf(time * 1000));
      lenis.destroy();
    };
  }, []);

  return (
    <div ref={root}>
      <Header />
      <main>
        {/* ============================================================ HERO */}
        <section className="hero">
          <div className="hero-kicker">
            <span className="tag">Creditcoin CC3 · Attestcoin · BUIDL CTC 2026</span>
            <span className="tag">
              {frontier.available && frontier.height !== null ? (
                <>
                  <span className="flick">●</span>{" "}
                  <span className="mono-tab" style={{ color: "var(--bone)" }}>
                    {frontier.height.toLocaleString("en-US")}
                  </span>{" "}
                  sepolia frontier, attested live
                </>
              ) : frontier.loading ? (
                "reading the attested frontier…"
              ) : (
                <span className="blood">frontier unreachable — fails closed</span>
              )}
            </span>
          </div>

          <h1 className="hero-title dx">
            <span className="line">
              <span>Lying about</span>
            </span>
            <span className="line">
              <span className="outline">another chain</span>
            </span>
            <span className="line">
              <span>
                costs <span className="blood">the bond</span>
              </span>
            </span>
          </h1>

          <div className="hero-row">
            <p className="hero-sub">
              An underwriter bonds capital behind a claim about a range of source-chain
              history. A lender releases exposure only while that claim stands.{" "}
              <strong>
                Anyone who proves one contradictory transaction takes the entire bond
              </strong>{" "}
              — atomically, in one transaction. No committee. No dispute window. No admin.
            </p>
            <div className="hero-cta">
              <Link href="/dashboard" className="act act-solid">
                Live positions →
              </Link>
              <a
                href="https://github.com/subheeksh5599/coverage-exchange"
                target="_blank"
                rel="noreferrer"
                className="act"
              >
                Contracts
              </a>
            </div>
          </div>
        </section>

        {/* marquee of measured facts */}
        <div className="mq" aria-hidden>
          <div className="mq-track">
            {[0, 1].map((k) => (
              <span key={k} style={{ display: "inline-flex" }}>
                <span className="mq-item">
                  <span className="sep">◆</span> attack matrix{" "}
                  <span className="v">15/15 refused</span>
                </span>
                <span className="mq-item">
                  <span className="sep">◆</span> forge tests <span className="v">48 passing</span>
                </span>
                <span className="mq-item">
                  <span className="sep">◆</span> live precompile checks{" "}
                  <span className="v">7/7 keyless</span>
                </span>
                <span className="mq-item">
                  <span className="sep">◆</span> contracts verified on explorer{" "}
                  <span className="v">9/9</span>
                </span>
                <span className="mq-item">
                  <span className="sep">◆</span> batch continuity saving{" "}
                  <span className="v">30.1% measured</span>
                </span>
                <span className="mq-item">
                  <span className="sep">◆</span> full mechanism live{" "}
                  <span className="v">225s · 16 txs</span>
                </span>
                <span className="mq-item">
                  <span className="sep">◆</span> keepers · committees · admins{" "}
                  <span className="v">0</span>
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* ============================================================ STATEMENT */}
        <section className="sec">
          <div className="sec-inner">
            <div className="sec-tag tag">
              <span className="no">01</span> the problem
            </div>
            <p className="statement">
              {STATEMENT.split(" ").map((w, i) =>
                w === "counterexample" || w === "bond." || w === "bond" ? (
                  <span key={i} className="w em blood" style={{ color: undefined }}>
                    {w}{" "}
                  </span>
                ) : (
                  <span key={i} className="w">
                    {w}{" "}
                  </span>
                )
              )}
            </p>
            <p className="statement-foot" data-reveal>
              Cross-chain credit has a hole in the middle of it. The lender&apos;s collateral
              lives on one chain; the credit lives on Creditcoin. Trusting an indexer, a risk
              API or an oracle means trusting someone who <strong>loses nothing by being
              wrong</strong>. The missing piece is not more data — it is a way to make a claim
              about cross-chain state cost money when it is false.
            </p>
          </div>
        </section>

        {/* ============================================================ ROLES */}
        <section className="sec">
          <div className="sec-inner">
            <div className="sec-tag tag">
              <span className="no">02</span> three roles, each with a reason to be honest
            </div>

            <div className="role-row">
              <span className="role-no">/01</span>
              <h3 className="role-name dx">Borrower</h3>
              <div className="role-facts">
                <div className="role-fact">
                  <span className="k">wants</span>the credit the position unlocks
                </div>
                <div className="role-fact">
                  <span className="k">loses if wrong</span>
                  <span className="blood">coverage, the instant it is breached — and the premium it paid</span>
                </div>
              </div>
            </div>

            <div className="role-row">
              <span className="role-no">/02</span>
              <h3 className="role-name dx outline">Underwriter</h3>
              <div className="role-facts">
                <div className="role-fact">
                  <span className="k">wants</span>the premium
                </div>
                <div className="role-fact">
                  <span className="k">loses if wrong</span>
                  <span className="blood">the whole bond, to whoever proves the breach</span>
                </div>
              </div>
            </div>

            <div className="role-row">
              <span className="role-no">/03</span>
              <h3 className="role-name dx blood">Challenger</h3>
              <div className="role-facts">
                <div className="role-fact">
                  <span className="k">wants</span>the bond
                </div>
                <div className="role-fact">
                  <span className="k">needs</span>no permission, no stake, no allowlist — one
                  proven counterexample
                </div>
              </div>
            </div>

            <p className="statement-foot" data-reveal>
              The chain adjudicates. The owner has <strong>no function</strong> that can breach
              a position, declare a draw valid, or release a bond early.
            </p>
          </div>
        </section>

        {/* ============================================================ BREACH THEATRE */}
        <section className="theatre">
          <div className="theatre-stage">
            <div className="stage-inner">
              <div className="stage-status">
                <h2 className="stage-pos">
                  Position <span className="blood">#10</span>
                </h2>
                <span className="stage-badge">ACTIVE · GATING EXPOSURE</span>
                <span className="tag">
                  scroll — this happened on-chain ·{" "}
                  <Tx hash={DEMO_TXS.counterexample} label="open the breach tx" />
                </span>
              </div>

              <div className="ledger">
                <div className="ledger-side ledger-uw">
                  <div className="who">underwriter · bond locked</div>
                  <div className="ledger-num mono-tab">12,000</div>
                  <div className="ledger-unit">cxTUSD standing behind the claim</div>
                </div>
                <div className="ledger-side ledger-ch">
                  <div className="who">challenger · CAROL, a stranger</div>
                  <div className="ledger-num mono-tab">0</div>
                  <div className="ledger-unit">cxTUSD — spends only gas</div>
                </div>
              </div>

              <div className="evidence-card">
                <div>
                  <div className="ev-k">counterexample</div>
                  <div className="ev-v">
                    real Sepolia USDC transfer ·{" "}
                    <a
                      className="txlink"
                      href={`${SEPOLIA_COUNTEREXAMPLE.explorer}${SEPOLIA_COUNTEREXAMPLE.tx}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      block {SEPOLIA_COUNTEREXAMPLE.block.toLocaleString("en-US")}
                    </a>
                  </div>
                </div>
                <div>
                  <div className="ev-k">violation</div>
                  <div className="ev-v">recipient declared prohibited in the coverage terms</div>
                </div>
                <div>
                  <div className="ev-k">proof</div>
                  <div className="ev-v">7 merkle siblings · 21 continuity roots</div>
                </div>
              </div>

              <div className="verify-line">
                <span>
                  block prover precompile <span className="ok">verified inclusion ✓</span>
                </span>
                <span>
                  receipt decoded <span className="ok">status 1 ✓</span>
                </span>
                <span>
                  predicate <span className="blood">violated ✕</span>
                </span>
              </div>

              <div className="verify-line aftermath">
                <span className="blood">bond → challenger, same transaction</span>
                <span>draws frozen forever</span>
                <span>
                  second challenger <Tx hash={DEMO_TXS.failedReplay} label="reverted NotLive()" />
                </span>
              </div>

              <div className="stamp" style={{ opacity: 0, transform: "translate(-50%, -50%)" }}>
                Breached
              </div>
            </div>

            <div className="theatre-progress">
              <span className="tp-label">the slash · atomic · one transaction</span>
              <div className="tp-bar">
                <div className="tp-fill" />
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ INVARIANT */}
        <section className="sec">
          <div className="sec-inner">
            <div className="sec-tag tag">
              <span className="no">03</span> valid means checkable, not asserted
            </div>
            <div className="inv-block" data-reveal>
              <span className="fn">isValid(id)</span>
              {"  iff\n"}
              {"    "}
              <span className="hot">is_height_attested</span>
              {"(endBlock + requiredDepth)   "}
              <span className="cm">← the chain decides, every read</span>
              {"\n    AND frontier ≤ liveUntilHeight\n"}
              {"    AND status ∉ { BREACHED, SETTLED }\n"}
              {"    AND drawn < maxExposure\n\n"}
              <span className="cm">at creation:</span>
              {"\n    "}
              <span className="hot">bond ≥ maxExposure</span>
              {"                        "}
              <span className="cm">← breaching is never profitable</span>
            </div>
            <div className="inv-note">
              <p data-reveal>
                <strong>The frontier condition</strong> makes &quot;the window was actually
                covered&quot; checkable rather than asserted — Attestcoin&apos;s own
                is_height_attested precompile decides it on every read. No stored flag. Expiry
                is computed, never scheduled: there is no keeper to bribe, forget or
                front-run.
              </p>
              <p data-reveal>
                <strong>The bond ratio</strong> is why breaching is never profitable: the
                money behind the promise always exceeds the money the promise unlocks. If the
                frontier is unreachable, everything <strong>fails closed</strong> — coverage
                that cannot be shown live is not live.
              </p>
            </div>
          </div>
        </section>

        {/* ============================================================ ATTACK WALL */}
        <section className="sec">
          <div className="sec-inner">
            <div className="sec-tag tag">
              <span className="no">04</span> the mechanism refusing, on the live deployment
            </div>
            <h2 className="statement" data-reveal style={{ marginBottom: "6vh" }}>
              Fifteen ways to cheat<span className="blood">.</span>{" "}
              <span className="em dim">Fifteen refusals.</span>
            </h2>

            <div>
              {ATTACKS.map((a) => (
                <div className="attack-row" key={a.what}>
                  <span className="attack-verdict">rejected</span>
                  <span>{a.what}</span>
                  <span className="attack-err">
                    {"tx" in a && a.tx ? (
                      <Tx hash={a.tx} label={`${a.err} · real failed tx`} />
                    ) : (
                      a.err
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="attack-tally" data-reveal>
              <span className="big dx">
                15<span className="blood">/</span>15
              </span>
              <p className="statement-foot" style={{ marginTop: 0 }}>
                Two refusals were broadcast as <strong>real transactions and failed
                on-chain</strong> — 195,748 and 266,336 gas paid to be told no. A reviewer can
                open them on the explorer rather than trust this page. A refusal is not free,
                but it cannot change state.
              </p>
            </div>
          </div>
        </section>

        {/* ============================================================ EVIDENCE */}
        <section className="sec">
          <div className="sec-inner">
            <div className="sec-tag tag">
              <span className="no">05</span> measured, not asserted
            </div>
            <div className="ev-grid" data-reveal>
              <div className="ev-cell">
                <div className="ev-num">{MEASURED.forgeTests}</div>
                <div className="ev-cap">forge tests — lifecycle, fuzzed invariants I-01…I-05, attack suite A–H</div>
              </div>
              <div className="ev-cell">
                <div className="ev-num">
                  7<span className="dim">/</span>7
                </div>
                <div className="ev-cap">keyless live checks against the real cc3 precompiles — one flipped bit rejected</div>
              </div>
              <div className="ev-cell">
                <div className="ev-num">9</div>
                <div className="ev-cap">contracts deployed and verified on the cc3 explorer</div>
              </div>
              <div className="ev-cell">
                <div className="ev-num">
                  30<span className="dim">.</span>1%
                </div>
                <div className="ev-cap">gas saved by batch verification — measured, and honestly not 100×</div>
              </div>
              <div className="ev-cell">
                <div className="ev-num">225s</div>
                <div className="ev-cap">full mechanism end to end — 16 real transactions, timed from block timestamps</div>
              </div>
              <div className="ev-cell">
                <div className="ev-num">
                  19<span className="dim">/</span>19
                </div>
                <div className="ev-cap">deployment checks, incl. a live frontier read through the real ChainInfo precompile</div>
              </div>
              <div className="ev-cell">
                <div className="ev-num blood">2</div>
                <div className="ev-cap">refusals recorded as real failed transactions on-chain</div>
              </div>
              <div className="ev-cell">
                <div className="ev-num">0</div>
                <div className="ev-cap">keepers, committees, dispute windows, admin overrides</div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ CLOSING */}
        <section className="closing">
          <h2 className="closing-title dx">
            <span className="line">
              <span>
                Trust<span className="blood">,</span> priced
              </span>
            </span>
            <span className="line">
              <span className="outline">Claims, bonded</span>
            </span>
            <span className="line">
              <span>
                Lies<span className="blood">, slashed</span>
              </span>
            </span>
          </h2>
          <div className="closing-cta">
            <Link href="/dashboard" className="act act-solid">
              See live positions →
            </Link>
            <a
              href={`${EXPLORER}/address/${ADDR.engine}`}
              target="_blank"
              rel="noreferrer"
              className="act"
            >
              Engine on explorer
            </a>
          </div>
        </section>
      </main>

      {/* ============================================================ FOOTER */}
      <footer className="site-footer">
        <div className="footer-grid">
          <div>
            <span className="wordmark">
              COVERAGE<span className="wm-x">/</span>EXCHANGE
            </span>
            <p style={{ marginTop: 16, maxWidth: 400, lineHeight: 1.9 }}>
              Bonded cross-chain coverage over attested state windows. Creditcoin CC3
              testnet, Attestcoin ChainInfo + Block Prover precompiles. BUIDL CTC 2026 Fall.
            </p>
          </div>
          <div className="footer-contracts">
            <span className="tag" style={{ marginBottom: 8 }}>
              deployed contracts · cc3 102031
            </span>
            {(
              [
                ["CoverageEngine", ADDR.engine],
                ["CoverageMarket", ADDR.market],
                ["ChallengeManager", ADDR.challengeManager],
                ["LendingAdapter", ADDR.lendingAdapter],
                ["AttestcoinAdapter", ADDR.adapter],
                ["DemoToken cxTUSD", ADDR.token],
              ] as const
            ).map(([name, addr]) => (
              <a key={addr} href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noreferrer">
                {name} — {short(addr, 10, 6)}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
