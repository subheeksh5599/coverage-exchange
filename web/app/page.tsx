import Link from "next/link";
import { Nav, Footer, Section, Eyebrow, Reveal, Shot, StatStrip, Arrow } from "@/components/Site";
import { FlowDiagram, WindowDiagram, TrustDiagram } from "@/components/Diagrams";
import { ADDR, EXPLORER, DEMO_TXS, MEASURED, REPO, CHAIN_LABEL, short } from "@/lib/chain";

export default function Home() {
  return (
    <>
      <Nav />

      <main id="main">
        {/* ------------------------------------------------------------ hero */}
        <section className="hero">
          <div className="wrap">
            <Reveal>
              <span className="chip">
                <span className="dot dot-live" />
                Live on {CHAIN_LABEL} · {MEASURED.contractsVerified} contracts source-verified
              </span>
            </Reveal>

            <Reveal delay={60}>
              <h1 className="hero-h1">
                Credit decisions should not
                <br />
                depend on trust.
              </h1>
            </Reveal>

            <Reveal delay={120}>
              <p className="hero-p">
                Coverage Exchange turns a claim about on-chain behaviour into a bonded, falsifiable
                position. An underwriter puts capital behind &ldquo;this wallet will not do X in this
                window&rdquo;. Anyone who finds a single counterexample proves it against the Attestcoin
                Protocol and takes the bond. Lenders read one function before releasing credit.
              </p>
            </Reveal>

            <Reveal delay={180}>
              <div className="hero-cta">
                <Link className="btn" href="/dashboard">
                  Open the live console <Arrow />
                </Link>
                <a className="btn btn-ghost" href={REPO} target="_blank" rel="noreferrer">
                  Read the contracts
                </a>
              </div>
            </Reveal>

            <Reveal delay={240}>
              <StatStrip />
            </Reveal>
          </div>
        </section>

        {/* --------------------------------------------------- product shot */}
        <section className="shot-hero">
          <div className="wrap">
            <Reveal>
              <Shot
                src="/product/console-overview.png"
                w={2880}
                h={2574}
                alt="Coverage Exchange console: bond locked, covered exposure, drawn credit, status mix and covered windows read live from Creditcoin CC3"
                caption="The console, reading the deployed engine directly. No server, no database, no fixtures — if the RPC is down it says so rather than showing a stale number."
                priority
              />
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------- problem */}
        <Section id="problem">
          <div className="two">
            <Reveal>
              <div>
                <Eyebrow>The gap</Eyebrow>
                <h2>
                  Every undercollateralised loan on chain rests on somebody&apos;s opinion.
                </h2>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="prose">
                <p>
                  A score says a wallet is trustworthy. A committee signs off. An off-chain model emits
                  a number. When the borrower defaults, the party that made the claim loses nothing —
                  the lender absorbs it. The claim was never a liability, so it was never really a
                  claim.
                </p>
                <p>
                  The missing piece is not better prediction. It is <strong>consequence</strong>: a way
                  to state a claim so precisely that a single counterexample settles it, and to back it
                  with capital that moves automatically when that counterexample appears.
                </p>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ------------------------------------------------------- mechanism */}
        <Section id="how" tone="tint">
          <Reveal>
            <div className="sec-head">
              <Eyebrow>How it works</Eyebrow>
              <h2>A claim, a bond, and a way to be proven wrong.</h2>
              <p className="sec-sub">
                Four moves. Each one is a contract call on Creditcoin, and each is visible in the
                console.
              </p>
            </div>
          </Reveal>

          <Reveal delay={60}>
            <div className="figure">
              <FlowDiagram />
            </div>
          </Reveal>

          <div className="steps">
            {[
              {
                n: "01",
                t: "State a falsifiable claim",
                d: "A predicate contract defines exactly what must not happen — a prohibited recipient, an amount above a ceiling, an amount below a floor — over an explicit block window on the source chain.",
              },
              {
                n: "02",
                t: "Bond it",
                d: `The underwriter locks capital in the engine. The contract refuses any position where the bond is smaller than the exposure it backs: BondBelowExposure reverts before the position exists.`,
              },
              {
                n: "03",
                t: "Lend against it",
                d: "The lending adapter calls isValid() at the moment of the draw. Coverage that is breached, expired, out of window or not yours does not gate anything — the draw reverts on chain.",
              },
              {
                n: "04",
                t: "Falsify it, or settle",
                d: `A challenger submits one transaction proof through the Attestcoin adapter. If it satisfies the predicate inside the window, the bond moves to the challenger and the coverage dies. If the window closes clean, the underwriter takes the premium.`,
              },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 60}>
                <article className="step">
                  <span className="step-n">{s.n}</span>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* -------------------------------------------------- window + proof */}
        <Section id="window">
          <div className="two">
            <Reveal>
              <div>
                <Eyebrow>The hard part</Eyebrow>
                <h2>Windows, not vibes.</h2>
                <div className="prose">
                  <p>
                    A claim without a boundary cannot be falsified. Every position names a start block,
                    an end block and a required confirmation depth on the source chain. The Attestcoin
                    Protocol supplies the frontier — the height it has attested to — and the engine
                    refuses anything beyond it.
                  </p>
                  <p>
                    That single rule kills a whole class of attacks: proofs from the wrong chain,
                    proofs from outside the window, proofs shallower than the agreed depth, and
                    settlements attempted before the evidence period is genuinely over.
                  </p>
                </div>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="figure figure-flush">
                <WindowDiagram />
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ------------------------------------------------------ adversarial */}
        <Section id="adversarial" tone="ink">
          <Reveal>
            <div className="sec-head">
              <Eyebrow tone="on-ink">Adversarial evidence</Eyebrow>
              <h2>
                We attacked it {MEASURED.attackCount} ways. It refused {MEASURED.attacksRefused}.
              </h2>
              <p className="sec-sub">
                Not in a unit test — against the deployed contracts on Creditcoin CC3. Two refusals were
                broadcast so you can open a real failed transaction instead of trusting a claim.
              </p>
            </div>
          </Reveal>

          <Reveal delay={60}>
            <Shot
              src="/product/console-attacks.png"
              w={2880}
              h={3082}
              alt={`Attack matrix in the console: ${MEASURED.attackCount} attacks attempted, ${MEASURED.attacksRefused} refused, zero value leaked, each with its named revert reason`}
              caption="The same table the console renders, generated from the run log — not typed by hand."
              dark
            />
          </Reveal>

          <div className="proof-grid">
            {[
              { k: "Draw after breach", v: `${MEASURED.refusedDrawGas.toLocaleString("en-US")} gas`, h: DEMO_TXS.failedDrawAfterBreach, d: "burned gas, moved nothing" },
              { k: "Replayed challenge", v: `${MEASURED.refusedReplayGas.toLocaleString("en-US")} gas`, h: DEMO_TXS.failedReplay, d: "second attempt on a spent proof" },
            ].map((p) => (
              <Reveal key={p.k}>
                <a className="proof" href={`${EXPLORER}/tx/${p.h}`} target="_blank" rel="noreferrer">
                  <div className="proof-k">{p.k}</div>
                  <div className="proof-v">{p.v}</div>
                  <div className="proof-d">{p.d}</div>
                  <div className="proof-h">{short(p.h, 14, 8)} ↗</div>
                </a>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* ----------------------------------------------------- attestcoin */}
        <Section id="attestcoin">
          <div className="two">
            <Reveal>
              <div>
                <Eyebrow>Attestcoin Protocol</Eyebrow>
                <h2>What is proven, and what we still assume.</h2>
                <div className="prose">
                  <p>
                    The protocol is not decoration here — remove it and the product cannot exist. It is
                    what lets a contract on Creditcoin know, without a human or an oracle committee,
                    that a specific transaction really happened on another chain at a specific height.
                  </p>
                  <p>
                    Being precise about the boundary matters more than sounding strong: the honesty of
                    the attestation set is an assumption, and we state it rather than hide it.
                  </p>
                </div>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="figure figure-flush">
                <TrustDiagram />
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ------------------------------------------------------- console 2 */}
        <Section id="positions" tone="tint">
          <Reveal>
            <div className="sec-head">
              <Eyebrow>The console</Eyebrow>
              <h2>Every position, with the reason it is or is not valid.</h2>
              <p className="sec-sub">
                A breached position shows the challenge that killed it and the draw that was refused
                afterwards. Both link to the explorer.
              </p>
            </div>
          </Reveal>
          <Reveal delay={60}>
            <Shot
              src="/product/console-positions.png"
              w={2880}
              h={2024}
              alt="Positions view: each coverage position with status, bond, exposure, drawn amount, block window and the live isValid reason"
              caption="Breached, settled and active positions side by side — the states a demo usually hides."
            />
          </Reveal>
        </Section>

        {/* -------------------------------------------------------- verify */}
        <Section id="verify">
          <Reveal>
            <div className="sec-head">
              <Eyebrow>Verify it yourself</Eyebrow>
              <h2>Nothing here asks to be believed.</h2>
            </div>
          </Reveal>

          <div className="verify">
            {[
              { t: "Open the console", d: "Live reads from the deployed engine, in a browser, no wallet needed.", a: "/dashboard", c: "Open console" },
              { t: "Re-run the attacks", d: "node worker/scripts/attack-matrix.mjs --onchain reproduces the matrix against the same contracts.", a: REPO, c: "Repository" },
              { t: "Read the source", d: `${MEASURED.contractsVerified} contracts verified on Blockscout — the bytecode matches the repository.`, a: `${EXPLORER}/address/${ADDR.engine}`, c: "Engine on explorer" },
              { t: "Check the numbers", d: "Every figure on this site is generated from the evidence manifest; CI fails if the UI drifts from it.", a: `${REPO}/blob/main/evidence.json`, c: "evidence.json" },
            ].map((v, i) => (
              <Reveal key={v.t} delay={i * 50}>
                <a className="vcard" href={v.a} target={v.a.startsWith("/") ? undefined : "_blank"} rel="noreferrer">
                  <h3>{v.t}</h3>
                  <p>{v.d}</p>
                  <span className="vcard-c">
                    {v.c} <Arrow />
                  </span>
                </a>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* ----------------------------------------------------------- cta */}
        <section className="cta">
          <div className="wrap">
            <Reveal>
              <h2>See a bond move because someone was wrong.</h2>
              <p>
                The console is live against Creditcoin CC3 testnet. The breached position in it is real,
                and so is the failed draw that followed.
              </p>
              <div className="hero-cta" style={{ justifyContent: "center" }}>
                <Link className="btn" href="/dashboard">
                  Open the console <Arrow />
                </Link>
                <a className="btn btn-ghost" href={REPO} target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
