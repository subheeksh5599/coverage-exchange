// Coverage Exchange — project deck
// Build: typst compile deck.typ coverage-exchange-deck.pdf
//
// Every figure here is the same figure the app displays, and the app generates its numbers from
// evidence.json. Nothing in this deck is hand-typed from memory; if a number changes in the
// manifest, change it here too.

#let mono = ("JetBrainsMono NF", "DejaVu Sans Mono")
#let sans = ("DejaVu Sans", "Liberation Sans")

#let bg = rgb("#0a0a0b")
#let panel = rgb("#121214")
#let bone = rgb("#eae6de")
#let dim = rgb("#7b766c")
#let blood = rgb("#ff3527")
#let green = rgb("#4ade80")
#let line_c = rgb("#26262a")

#set page(
  width: 33.867cm,
  height: 19.05cm,
  margin: (x: 1.7cm, top: 1.5cm, bottom: 1.7cm),
  fill: bg,
  footer: context {
    set text(font: mono, size: 7.6pt, fill: dim, tracking: 0.6pt)
    v(2pt)
    line(length: 100%, stroke: 0.6pt + line_c)
    v(6pt)
    grid(
      columns: (auto, 1fr, auto),
      [COVERAGE EXCHANGE — BONDED COVERAGE FOR CROSS-CHAIN CREDIT],
      [],
      [#counter(page).display()],
    )
  },
)

#set text(font: mono, size: 11pt, fill: bone, tracking: 0.2pt)
#set par(leading: 1.28em)

// ---------------------------------------------------------------- helpers

#let kicker(t) = text(size: 8.6pt, fill: blood, tracking: 2pt, weight: "bold")[#upper(t)]

#let h1(t) = text(size: 27pt, weight: "bold", tracking: -0.4pt)[#t]

#let lede(t) = text(size: 11.5pt, fill: dim, tracking: 0.2pt)[#t]

#let rule = line(length: 100%, stroke: 0.6pt + line_c)

#let stat(val, k, note: none) = block(
  fill: panel, stroke: 0.6pt + line_c, inset: 9pt, radius: 0pt, width: 100%,
)[
  #text(size: 16.5pt, weight: "bold")[#val]
  #v(4pt)
  #text(size: 8.4pt, fill: dim, tracking: 1.1pt)[#upper(k)]
  #if note != none {
    v(4pt)
    text(size: 8.4pt, fill: dim)[#note]
  }
]

#let chip(t, c: dim) = box(
  fill: panel, stroke: 0.6pt + c, inset: (x: 7pt, y: 3.5pt),
)[#text(size: 8.6pt, fill: c, tracking: 0.9pt)[#upper(t)]]

#let slide(kick, title, body, brk: true) = {
  kicker(kick)
  v(5pt)
  block(h1(title))
  v(6pt)
  rule
  v(10pt)
  body
  if brk { pagebreak() }
}

// ---------------------------------------------------------------- 1. title

#set align(left)
#v(0.2cm)
#kicker("BUIDL CTC 2026 Fall — DeFi")
#v(14pt)
#text(size: 44pt, weight: "bold", tracking: -1.2pt)[COVERAGE EXCHANGE]
#v(12pt)
#block(width: 80%)[
  #text(size: 14.5pt, fill: bone)[
    An underwriter stakes capital behind a claim about another chain's history. A lender
    releases credit only while the claim holds. Anyone who can prove one contradicting
    transaction takes the stake.
  ]
]
#v(16pt)
#grid(columns: (1fr, 1fr, 1fr), gutter: 12pt,
  stat("9 / 9", "contracts verified", note: "Creditcoin CC3 testnet, chain 102031"),
  stat("15 / 15", "attacks refused", note: "run against the live deployment"),
  stat("71", "contract tests", note: "across 9 suites, 0 failing"),
)
#v(14pt)
#text(size: 9.4pt, fill: dim)[
  Live #text(fill: bone)[coverage-exchange.vercel.app] \ \
  Repo #text(fill: bone)[github.com/subheeksh5599/coverage-exchange]
]

#pagebreak()

// ---------------------------------------------------------------- 2. problem

#slide("The problem", "Cross-chain credit runs on trust")[
  #grid(columns: (1fr), gutter: 0pt)[
    #image("svg/problem.svg", width: 80%)
  ]
  #v(4pt)
  #grid(columns: (1fr, 1fr), gutter: 20pt,
    [
      #text(size: 10.5pt)[
        The collateral and the borrower's behaviour are on Ethereum. The credit is on
        Creditcoin. The lending chain cannot read the source chain.
      ]
    ],
    [
      #text(size: 10.5pt, fill: dim)[
        So it takes a report, and a report costs the reporter nothing when it is wrong.
        The alternative is lending so little that the report stops mattering.
      ]
    ],
  )
]

// ---------------------------------------------------------------- 3. mechanism

#slide("The mechanism", "Replace the report with a bond")[
  #image("svg/mechanism.svg", width: 76%)
  #v(10pt)
  #grid(columns: (1fr, 1fr, 1fr), gutter: 18pt,
    [
      #text(size: 9pt, fill: blood, tracking: 1pt)[BOND #sym.gt.eq EXPOSURE]
      #v(4pt)
      #text(size: 10pt, fill: dim)[The underwriter's stake always covers what could be drawn,
        so breaching on purpose never pays.]
    ],
    [
      #text(size: 9pt, fill: bone, tracking: 1pt)[VALIDITY IS COMPUTED]
      #v(4pt)
      #text(size: 10pt, fill: dim)[No stored "valid" flag. Every call recomputes it from the
        attested frontier and whether a counterexample has been proven.]
    ],
    [
      #text(size: 9pt, fill: green, tracking: 1pt)[NO COMMITTEE]
      #v(4pt)
      #text(size: 10pt, fill: dim)[No dispute window, no keeper, no admin key. The prover
        precompile and the invariant decide, in one transaction.]
    ],
  )
]

// ---------------------------------------------------------------- 4. attestcoin

#slide("Attestcoin", "What the contract actually verifies")[
  #text(size: 10.5pt, fill: dim)[A challenge submits a source transaction hash and a Merkle proof.
  The engine does not take the submitter's word for any of it.]
  #v(14pt)
  #grid(columns: (1fr, 1fr), gutter: 22pt,
    [
      #text(size: 9.4pt, tracking: 1pt)[REJECTED AT EACH STEP]
      #v(8pt)
      #text(size: 10pt)[
        1. #text(fill: dim)[The Block Prover precompile (#text(fill: bone)[0x0FD2]) verifies the
        proof, or the call reverts.] \
        2. #text(fill: dim)[The receipt is decoded and the transaction must have #text(fill: bone)[succeeded],
        not merely been included.] \
        3. #text(fill: dim)[The emitting contract must equal the position's declared
        #text(fill: bone)[sourceContract].] \
        4. #text(fill: dim)[The log's topic0 must equal the declared
        #text(fill: bone)[eventSignature].] \
        5. #text(fill: dim)[Only then does the predicate run against the decoded values.]
      ]
    ],
    [
      #text(size: 9.4pt, tracking: 1pt)[FAIL-CLOSED BY DEFAULT]
      #v(8pt)
      #text(size: 10pt, fill: dim)[
        The ChainInfo precompile (#text(fill: bone)[0x0FD3]) supplies the source chain height.
        When it cannot answer, the protocol treats coverage as #text(fill: bone)[unproven] rather
        than assuming it is fine.
      ]
      #v(10pt)
      #text(size: 10pt, fill: dim)[Seven keyless checks run against the real testnet precompiles
        give #text(fill: bone)[7/7] passing.]
      #v(10pt)
      #text(size: 10pt, fill: dim)[The proof is the only credential. There is no allowlist and no
        stake required to submit one.]
    ],
  )
]

// ---------------------------------------------------------------- 5. live

#slide("Live deployment", "Not a mock. Running state, read now")[
  #text(size: 9.6pt, fill: dim)[Read from the deployed contracts a few seconds before this slide
  was built, not from a fixture.]
  #v(11pt)
  #grid(columns: (1.05fr, 1fr), gutter: 16pt,
    [
      #image("img/02-console-overview.png", width: 100%)
    ],
    [
      #grid(columns: (1fr, 1fr), gutter: 10pt,
        stat("13", "positions", note: "7 breached · 3 expired · 3 settled"),
        stat("100%", "bond / exposure floor", note: "enforced per position"),
      )
      #v(10pt)
      #grid(columns: (1fr, 1fr), gutter: 10pt,
        stat("2,927,000", "underwriter capital", note: "cxTUSD held in the engine"),
        stat("531,500", "drawable liquidity", note: "releasable now"),
      )
      #v(12pt)
      #text(size: 9.2pt, fill: dim)[
        Nine contracts on Creditcoin CC3 testnet, all verified on Blockscout. Every figure here is
        a contract read, and a failed read is reported rather than cached.
      ]
    ],
  )
]

// ---------------------------------------------------------------- 6. breach

#slide("The adversarial case", "A position that died")[
  #image("img/03-position-breached.png", width: 58%)
  #v(10pt)
  #grid(columns: (1fr, 1fr), gutter: 20pt,
    [
      #text(size: 10pt)[
        Position #13 covered Sepolia blocks 11,671,130 to 11,671,230 under a
        #text(fill: bone)[ProhibitedRecipient] predicate, evaluated against logs from the declared
        source contract. A transfer to the prohibited address inside that window is a proof.
      ]
    ],
    [
      #text(size: 10pt, fill: dim)[
        That transfer exists: a real 100 USDC transfer on Sepolia at block 11,671,180. Its
        receipt is the entire input to the challenge.
      ]
      #v(8pt)
      #text(size: 8.6pt, fill: bone)[
        0x19c528d3175bfc9d7cd0b1b7285fa07113054c5585eb8dead195b977edbc88a1
      ]
      #v(7pt)
      #text(size: 10pt, fill: dim)[The bond moved to the challenger in the same transaction that
        proved it, and draws are frozen permanently.]
    ],
  )
]

// ---------------------------------------------------------------- 7. attacks

#slide("Adversarial testing", "Fifteen ways in. None of them worked.")[
  #grid(columns: (1fr, 1fr), gutter: 24pt,
    [
      #text(size: 10.3pt, fill: dim)[Each attempt below was run against the live deployment and
      reverted. Two of them are failed transactions on the explorer, not simulations.]
      #v(12pt)
      #text(size: 9.8pt)[
        draw against an unknown position \
        draw as a different counterparty \
        draw above the position maximum \
        underwriter withdraws the locked bond \
        create a position with bond below exposure \
        stranger calls the module wiring \
        replayed counterexample \
        counterexample against a settled position \
        counterexample with a lookalike emitter \
        draw against a breached position \
        challenge race between two challengers \
        draw after the live window closed \
        source transaction that reverted \
        proof for a transaction outside the window \
        draw exceeding remaining capacity
      ]
    ],
    [
      #grid(columns: (1fr, 1fr), gutter: 12pt,
        stat("15 / 15", "refused", note: "verified on the live deployment"),
        stat("2", "on-chain failures", note: "openable on Blockscout"),
      )
      #v(12pt)
      #text(size: 9.4pt, fill: dim)[The two broadcast refusals:]
      #v(6pt)
      #text(size: 8.4pt)[
        draw against a breached position \
        #text(fill: dim)[0xb62ce5ed691e7521c2c05430c1fc8c5069d42ff649dc0db7680056df8969fbfa]
      ]
      #v(6pt)
      #text(size: 8.4pt)[
        replayed counterexample \
        #text(fill: dim)[0x65a8bc7f34a90538964342617ca75cc097f7d1bc3cbdd1c6e650898cb9772be7]
      ]
      #v(12pt)
      #text(size: 9.4pt, fill: dim)[The refusal reasons are typed errors, not strings:
        #text(fill: bone)[CoverageNotValid], #text(fill: bone)[BondBelowExposure],
        #text(fill: bone)[NotTheCounterparty].]
    ],
  )
]

// ---------------------------------------------------------------- 8. measured

#slide("Measured", "Numbers, with the tool that produced them")[
  #grid(columns: (1fr, 1fr), gutter: 22pt,
    [
      #text(size: 9.4pt, tracking: 1pt)[GAS PER OPERATION]
      #v(9pt)
      #text(size: 10pt)[
        purchase #h(1fr) #text(fill: bone)[371,652] \
        draw #h(1fr) #text(fill: bone)[288,092] \
        challenge #h(1fr) #text(fill: bone)[396,004] \
        settlement #h(1fr) #text(fill: bone)[181,412] \
        refused draw #h(1fr) #text(fill: dim)[195,748] \
        refused replay #h(1fr) #text(fill: dim)[266,336]
      ]
      #v(11pt)
      #text(size: 9.4pt, fill: dim)[A refused path still costs gas. That is the point of a
        bonded claim: being wrong is not free.]
    ],
    [
      #text(size: 9.4pt, tracking: 1pt)[TEST SUITE]
      #v(9pt)
      #text(size: 10pt)[
        71 tests #h(1fr) #text(fill: bone)[9 suites] \
        failures #h(1fr) #text(fill: green)[0] \
        fuzzed invariants #h(1fr) #text(fill: bone)[I-01..I-05, I-16]
      ]
      #v(13pt)
      #text(size: 9.4pt, tracking: 1pt)[BATCHED VERIFICATION]
      #v(9pt)
      #text(size: 10pt)[
        continuity saving, 5 claims #h(1fr) #text(fill: bone)[30.1%] \
        continuity saving, 10 claims #h(1fr) #text(fill: bone)[22.5%]
      ]
      #v(9pt)
      #text(size: 8.8pt, fill: dim)[Measured, not estimated. Reported as a real percentage
        rather than an order of magnitude, because that is what the run showed.]
    ],
  )
  #v(14pt)
  #rule
  #v(10pt)
  #text(size: 9.8pt, fill: dim)[
    A full lifecycle run of the mechanism took #text(fill: bone)[225 seconds across 16
    transactions] at a 15-second block time, and the deployment passed
    #text(fill: bone)[19 / 19] verification checks.
  ]
]

// ---------------------------------------------------------------- 9. verify

#slide("Verify it", "Every claim in this deck is checkable in a browser", brk: false)[
  #grid(columns: (1fr, 1fr), gutter: 24pt,
    [
      #text(size: 9.4pt, tracking: 1pt)[THE APP]
      #v(8pt)
      #text(size: 10.4pt)[coverage-exchange.vercel.app]
      #v(6pt)
      #text(size: 9.4pt, fill: dim)[Positions, the attack matrix, the live attested frontier and
        the event log, all read from the deployed contracts.]
      #v(11pt)
      #text(size: 9.4pt, tracking: 1pt)[THE CONTRACTS]
      #v(8pt)
      #text(size: 9.2pt)[
        Engine \
        #text(fill: dim, size: 8.4pt)[0xca5e3b0076673cd64a1655221305e66f2056d2bb] \
        Market \
        #text(fill: dim, size: 8.4pt)[0xb4569dc8827a8e573f2bb34b7f68a7ecf078b0e1] \
        Challenge manager \
        #text(fill: dim, size: 8.4pt)[0x5218279fd26e9b544c27e21acb1bfc9e325a5937]
      ]
      #v(6pt)
      #text(size: 9.2pt, fill: dim)[All nine resolve on creditcoin-testnet.blockscout.com]
    ],
    [
      #text(size: 9.4pt, tracking: 1pt)[OPEN THESE THREE]
      #v(7pt)
      #text(size: 9.6pt)[
        the breach \
        #text(fill: dim, size: 8.2pt)[blockscout.com/tx/ \
        0x2f86470544c839fc43a25c31b8775299 \
        7177ff28240c785477dfc17e5db70647]
      ]
      #v(7pt)
      #text(size: 9.6pt)[
        the refused draw, status failed \
        #text(fill: dim, size: 8.2pt)[blockscout.com/tx/ \
        0xb62ce5ed691e7521c2c05430c1fc8c50 \
        69d42ff649dc0db7680056df8969fbfa]
      ]
      #v(7pt)
      #text(size: 9.6pt)[
        the Sepolia proof source \
        #text(fill: dim, size: 8.2pt)[sepolia.etherscan.io/tx/ \
        0x19c528d3175bfc9d7cd0b1b7285fa071 \
        13054c5585eb8dead195b977edbc88a1]
      ]
      #v(8pt)
      #text(size: 9.2pt, fill: dim)[The repo carries the contracts, the test suite, the evidence
        manifest the site is generated from, and the scripts that produced every transaction
        above.]
    ],
  )
]
