<div align="center">

# COVERAGE EXCHANGE

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-71%20passing-10b981)](#tests)
[![Contracts](https://img.shields.io/badge/contracts-10%20verified-8957e5)](https://creditcoin-testnet.blockscout.com/address/0x134476ff6d5efb0b422dcd3b92dcd61413880d92)
[![Chain](https://img.shields.io/badge/chain-Creditcoin%20CC3%20testnet-1f6feb)](https://creditcoin.org)
[![Attestcoin](https://img.shields.io/badge/attestation-Attestcoin%20precompiles-f59e0b)](https://docs.attestcoin.org)
![Stack](https://img.shields.io/badge/Solidity%20%C2%B7%20Foundry%20%C2%B7%20Next.js%2016%20%C2%B7%20viem-1f1f23)

### Bonded coverage for cross-chain credit — a claim about another chain that costs the bond when it is false.

A lender on Creditcoin extends credit against collateral that lives on another chain. Today it cannot see that chain, so it either trusts a report or lends so little the report stops mattering. A report costs the person writing it nothing when it is wrong.

This replaces the report with a position that has money behind it. An underwriter locks a bond behind a claim about a range of source-chain blocks. A lender releases exposure only while that claim holds. Anyone who proves one contradicting transaction inside the range takes the whole bond, in the same transaction, with no committee and no dispute window.

The bond is always at least the exposure, so breaching on purpose never pays — that is the invariant the whole thing rests on. Built on **Creditcoin CC3** with the **Attestcoin** block prover, for the **BUIDL CTC 2026 Fall** hackathon.

**[ Live demo ↗ ](https://coverage-exchange.vercel.app)** &nbsp;·&nbsp; **[ The live receipts ↗ ](#the-live-receipts)** &nbsp;·&nbsp; **[ How it works ↗ ](#the-coverage-position-step-by-step)** &nbsp;·&nbsp; **[ Run it locally ↗ ](#run-it-locally)**

</div>

---

## Table of contents

- [The problem I set out to solve](#the-problem-i-set-out-to-solve)
- [What I built](#what-i-built)
- [Architecture](#architecture)
- [The coverage position, step by step](#the-coverage-position-step-by-step)
- [How I integrated Attestcoin](#how-i-integrated-attestcoin)
- [On-chain enforcement (Creditcoin CC3)](#on-chain-enforcement-creditcoin-cc3)
- [Engineering decisions & the hard problems](#engineering-decisions--the-hard-problems)
- [What's real vs mock — the honesty table](#whats-real-vs-mock--the-honesty-table)
- [The live receipts](#the-live-receipts)
- [The app](#the-app)
- [Tech stack](#tech-stack)
- [Project layout](#project-layout)
- [Run it locally](#run-it-locally)
- [How I'd deploy it](#how-id-deploy-it)
- [Tests](#tests)
- [Limitations](#limitations)
- [Non-goals](#non-goals)
- [Licence](#licence)

---

## The problem I set out to solve

Cross-chain lending has a visibility problem that no amount of better reporting fixes. The collateral is on one chain, the credit is on another, and the lending chain has no way to read the other one. So the lender asks someone else what happened, and that someone has no money at stake in the answer.

Two failure modes follow. Either the lender believes the report, which means the loan is only as good as the reporter's honesty — or the lender lends a fraction small enough that being wrong does not hurt, which means the borrower is under-served by design. There is no third option where the lender gets to be wrong-proof and the borrower gets real size.

The insight is that the problem is not *information*, it is **accountability**. A claim about another chain is only worth something if being wrong is expensive. So I made the claim itself the collateral: the design rule for everything here is **a coverage position is a claim with a bond behind it, and the bond is at least the exposure it unlocks.**

That single rule does a lot of work. It caps the loss on a false claim to what the underwriter staked. It makes lying strictly unprofitable, because a successful challenge always pays more than the position was worth. It removes the need for a committee to adjudicate anything, because the payout is arithmetic. And it means the only thing the protocol has to be good at is verifying one transaction, which is a problem Attestcoin already solved.

## What I built

A credit instrument where the right to draw depends on a claim nobody can fake:

1. **Buy** — a borrower picks an underwriter with free capital, sets the exposure, the source-chain window, and how deep the attestation must be, and pays a premium. The premium is priced by the protocol against the real window and depth, not by a table.
2. **Bond** — on purchase the underwriter's capital is locked behind the position, at no less than the full exposure. The bond is the claim's collateral and the reason the claim means anything.
3. **Draw** — a lender releases credit against the position, but only after the contract checks the claim still holds: the attested source-chain frontier still covers the window at the required depth, the window has not lapsed, and no counterexample has been proven.
4. **Challenge** — anyone submits a source transaction hash that the position's predicate forbids. The contract proves it through the Attestcoin block prover, decodes the receipt, checks the emitter and event signature match what the position declared, and runs the predicate. If it passes, the position is breached and the bond moves to the challenger in the same transaction.
5. **Settle** — if the window closes with no counterexample, the bond returns to the underwriter. The same code path decides both outcomes.

The whole thing is **live on testnet, not in a fixture**: ten contracts deployed and verified, real positions bought through the app, a real counterexample that breached a position, and two attack transactions that genuinely failed on chain.

**A note on what is honest about this.** The deployments, the positions, and every transaction hash below are real and resolve on the explorers. The Sepolia transaction used as the counterexample is a real 100 USDC transfer that I did not stage. But the token is a **faucet token, not a stablecoin**, and the contracts are **not audited** — both are in [the honesty table](#whats-real-vs-mock--the-honesty-table) rather than left for a reviewer to discover.

## Architecture

```
                      ┌──────────────────────────────────────┐
   source chain       │  Ethereum Sepolia                     │
   (Sepolia, key 1)   │  collateral · borrower behaviour      │
                      └───────────────┬──────────────────────┘
                                      │  real transactions
                                      │  (never a report)
                      ┌───────────────▼──────────────────────┐
   Creditcoin CC3     │  0x0FD2  Block Prover precompile     │
   (chainId 102031)   │  0x0FD3  ChainInfo precompile        │
                      └───────────────┬──────────────────────┘
                                      │  verified receipt
                      ┌───────────────▼──────────────────────┐
                      │  AttestcoinAdapter                   │
                      │  decode · check emitter · check sig   │
                      └───────────────┬──────────────────────┘
                                      │
        ┌─────────────────────────────┼──────────────────────────────┐
        │                             │                              │
┌───────▼────────┐          ┌─────────▼──────────┐         ┌─────────▼────────┐
│ CoverageMarket │          │  CoverageEngine    │◄────────┤ ChallengeManager │
│ quotes · buys  │─────────►│  positions · bonds │         │ prove · breach   │
└────────────────┘          │  isValid (computed)│         └──────────────────┘
                            └─────────┬──────────┘
                                      │ exposure gated by the claim
                            ┌─────────▼──────────┐
                            │  LendingAdapter    │
                            │  pool · draw · repay│
                            └────────────────────┘
```

I designed this around a few typed contracts. Getting the boundaries right made the rest compose:

| Contract | Role |
|---|---|
| `ICoverage.Coverage` | The position: `borrower`, `underwriter`, `chainKey`, `startBlock`, `endBlock`, `requiredDepth`, `liveUntilHeight`, `maxExposure`, `capacity`, `drawn`, `bond`, `premium`, `predicate`, `predicateParams`, `sourceContract`, `eventSignature`, `status`. |
| `ICoverage.Status` | `ACTIVE`, `BREACHED`, `EXPIRED`, `SETTLED`. Never stored as a mutable flag — `effectiveStatus()` recomputes it on every call. |
| `IPredicate` | `evaluate(params, provenLog)`. A predicate sees **one** proven transaction and nothing else; that limit is deliberate and is documented in `SECURITY.md`. |
| `Reason` | Every reason a draw can be refused, as a typed error rather than a string, so a caller never has to guess. |

The predicate interface is the load-bearing one. The protocol does not try to be clever about what is true — it proves a single transaction and asks a small module whether that transaction violates the claim. Everything downstream is arithmetic.

## The coverage position, step by step

This is what happens from purchase to payout, and every step assumes the challenge is coming:

1. **Quote** — `CoverageMarket.quote(...)` prices the position from the window length, the required depth, and the underwriter's utilisation. The quote is computed on chain every time the terms change; there is no client-side estimate that can drift from what the contract will charge.
2. **Purchase** — the borrower pays the premium and the engine locks the underwriter's bond. The contract refuses to create the position if `bond < maxExposure`, which is the invariant applied at the only moment it can be cheaply enforced.
3. **Validity, recomputed** — `isValid(id)` returns `(bool, Reason)` by recomputing from the attested frontier. The engine stores no "valid" flag that a keeper could quietly expire, because a stored flag is a thing that can go stale or be flipped.
4. **Draw** — `LendingAdapter.draw(id, amount)` asks the engine first. If the claim has lapsed, the window has closed, or a counterexample has been proven, the draw reverts with a typed reason and no money moves.
5. **Challenge** — a challenger submits a source transaction hash. The contract asks the block prover precompile to verify the inclusion proof, decodes the receipt, and requires that the transaction **succeeded** rather than merely being included, that the emitting contract equals the position's declared `sourceContract`, and that the log's topic0 equals the declared `eventSignature`. Only then does the predicate run.
6. **Breach or settle** — one outcome moves the bond to the challenger and freezes draws forever; the other returns it to the underwriter when the window closes. Both are decided by the same code path, which is why I trust the second one.

## How I integrated Attestcoin

Attestcoin is the reason this is possible at all. Without a way to prove a source-chain transaction inside a Creditcoin contract, the claim would have to be attested by a human, which is the problem I was trying to remove.

**The precompiles.** The protocol reads two: the **Block Prover** at `0x0000000000000000000000000000000000000FD2`, which verifies a Merkle proof that a transaction is included in a source block, and **ChainInfo** at `0x0000000000000000000000000000000000000fD3`, which supplies the attested source-chain height. Both are called from `AttestcoinAdapter`, never from the engine directly, so the verification path has one home.

**What the contract refuses at each step.** A proof that does not verify reverts. A receipt that decodes to a failed transaction is rejected, because "included" and "succeeded" are different things and only the second is evidence. A log from a different emitter is rejected even if the proof is perfect. A log with the wrong topic0 is rejected. The predicate runs last, on values the contract has already established are real.

**Fail-closed.** When ChainInfo cannot answer, the protocol treats coverage as **unproven** rather than assuming it is fine. This is the one place where being wrong is asymmetric: assuming a claim holds when the chain cannot be read is exactly the failure this project exists to prevent.

The integration is verified live with seven keyless checks run against the real testnet precompiles — no wallet, no key, just `eth_call` — and the transaction used as the counterexample in the demo is a real Sepolia transfer, not a fixture.

## On-chain enforcement (Creditcoin CC3)

Ten contracts on CC3 testnet, chain ID 102031, every one verified on Blockscout:

| Contract | Address |
|---|---|
| `CoverageEngine` | [`0x134476ff…880d92`](https://creditcoin-testnet.blockscout.com/address/0x134476ff6d5efb0b422dcd3b92dcd61413880d92) |
| `CoverageMarket` | [`0x6e7104ca…81d5a6`](https://creditcoin-testnet.blockscout.com/address/0x6e7104ca5c114dd8b2656a4ae3b138b7ea81d5a6) |
| `ChallengeManager` | [`0xba898a24…98b451`](https://creditcoin-testnet.blockscout.com/address/0xba898a248e478976b2513b6ae1adde2fb498b451) |
| `LendingAdapter` | [`0x0030b013…beadfb`](https://creditcoin-testnet.blockscout.com/address/0x0030b013cc9fa3c49fd62306ce679d1419beadfb) |
| `AttestcoinAdapter` | [`0x85bc11a1…254d25`](https://creditcoin-testnet.blockscout.com/address/0x85bc11a15c2c6387590f16c32683bc92d8254d25) |
| `OfferRegistry` | [`0xe796eab6…bc012b`](https://creditcoin-testnet.blockscout.com/address/0xe796eab609fa01d1c8293d5a8fddfe5a03bc012b) |
| `DemoToken (cxTUSD)` | [`0x52474e7b…387e31`](https://creditcoin-testnet.blockscout.com/address/0x52474e7bf6d210775c1d5051f2141b0242387e31) |
| Predicate · prohibited recipient | [`0xe84561ff…3b1412`](https://creditcoin-testnet.blockscout.com/address/0xe84561ffa91c067823abb8d713c5a41eb13b1412) |
| Predicate · amount above limit | [`0xf4dbf50c…8e38cf`](https://creditcoin-testnet.blockscout.com/address/0xf4dbf50c5d00607a9fb0fb357ca4b8ab558e38cf) |
| Predicate · amount below floor | [`0x954af4f8…f38dcd`](https://creditcoin-testnet.blockscout.com/address/0x954af4f87c623a103d76cab64ece21e808f38dcd) |

This is the state those contracts were in when this README was written, read from the chain rather than from notes:

| Figure | Value |
|---|---|
| Positions created | **13** — 0 active, 7 breached, 3 expired, 3 settled |
| Underwriter capital | **2,927,000 cxTUSD** deposited in the engine |
| Drawable liquidity | **531,500 cxTUSD** the pool can release right now |
| Bond / exposure floor | **100%**, enforced on every purchase |
| Attestation grace | **10,000** source blocks after a window closes |
| Events emitted | **82**, all readable from the contracts' own logs |

## Engineering decisions & the hard problems

**Validity is computed, never stored.** The obvious design is a `valid` boolean on the position, flipped by a keeper when the window closes. I rejected it because a stored flag can be stale, and a stale "valid" flag on a credit position means money leaves against a claim nobody can defend. `isValid()` recomputes from the attested frontier on every call and returns the reason, not just false.

**The bond is capped at the exposure, not the exposure plus fees.** A bond larger than the exposure would make the position uneconomic to underwrite; smaller would make breaching profitable. Equal is the only value where lying is never worth it, so the contract refuses anything else at purchase.

**A predicate sees one transaction.** This is the sharpest limit in the system and I would rather state it than paper over it: a predicate cannot read source-chain state, cannot sum history, and cannot compare two transactions. Every invariant is a statement about one decoded receipt. That is enough for "did this transfer go to a prohibited address", which is the class of claim credit actually needs, and it is not enough for anything that needs a running total. `SECURITY.md` documents it.

**Both outcomes share one code path.** The breach and the settlement are the same evaluation run against different conclusions. If they were separate functions, a bug in one would be invisible until a borrower got lucky, which is the worst possible way to find out.

**Refusal is a typed reason, not a string.** `CoverageNotValid(reason)`, `BondBelowExposure(bond, exposure)`, `NotTheCounterparty()`. A caller that gets refused can tell why without parsing prose, and the tests assert on the code rather than the message.

**The site holds no facts of its own.** Every number in the app is generated from `evidence.json` into `web/lib/evidence.generated.ts`, and two CI guards fail the build if a measurement drifts or if a generated number is typed into a component by hand. This was not theoretical: a stale test count and four hardcoded gas figures both survived a green build before those guards existed.

## What's real vs mock — the honesty table

| Capability | How it's backed |
|---|---|
| **The deployment** | Nine real contracts on Creditcoin CC3 testnet, all verified, addresses above. |
| **Source-chain proofs** | Real Attestcoin block prover precompile calls. The demo's counterexample is a real Sepolia transfer at block 11,671,180. |
| **The positions** | Real state. 13 positions created through the app and the worker scripts; the breach below is a real transaction. |
| **The attack matrix** | 15 attempts, all refused, two of them broadcast to the live network so they are **failed transactions** on the explorer rather than simulations. |
| **Premium pricing** | A protocol pricing curve computed on chain from window and depth. It is **not** AI or market-derived, and I do not describe it as either. |
| **The deployment token** | `DemoToken` is a **faucet token with a permissionless mint**. It is not a stablecoin, is not collateral, and has no value. |
| **Market-layer contracts** | `OfferRegistry` is **deployed and wired**, and the app publishes, lists and fills offers against it. Market supply is one real offer at the time of writing, not a seeded set. |
| **The landing page's breach visual** | A **scroll animation**, not live chain data. The console is where the live numbers are. |
| **Batching compression** | Measured at **30.1% over 5 claims and 22.5% over 10**. Not a fixed multiplier and not an order of magnitude. |
| **Audit status** | **Not audited.** Testnet only. |
| **Test coverage** | 71 contract tests. There is **no JavaScript test suite** — the app is verified by driving it against the live chain, not by unit tests. |

## The live receipts

Rather than a video, here is the evidence, each row checkable in a browser. Every hash below was read from the chain while writing this file, against the current deployment. The refusal cases live in the attack matrix rather than here, because on this deployment they are checked with `previewChallenge` and `staticCall` — a refusal that is simulated is not a transaction, and listing it as one would be dishonest.

| What | Transaction | Where |
|---|---|---|
| A Sepolia transfer occurs inside the covered window | `0xb231b241…626925` | [Sepolia etherscan](https://sepolia.etherscan.io/tx/0xb231b241066865ba30aa0cd21a178a1070b31d0002768f8387625729f8626925) |
| Position bought by filling a published offer | `0xeb179c78…753c9f` | [market](https://creditcoin-testnet.blockscout.com/tx/0xeb179c78ad03810bc80e239ecbda5929d339632258470ee862d5be18cd753c9f) |
| Credit drawn against it | `0xee7a68c5…21ef44` | [lending adapter](https://creditcoin-testnet.blockscout.com/tx/0xee7a68c5f4055832c0c552508ce2c0953dde6bf9c02baa6afdd55cd4a521ef44) |
| **Counterexample proven, bond seized, draws frozen** | `0xe4b23117…56db99` | [challenge manager](https://creditcoin-testnet.blockscout.com/tx/0xe4b2311756815b206d308e4b4c40915c9b53655cf76a53b1a7d0a1adb456db99) |
| A second, honest position settling | `0x93bdf6cb…806d15` | [engine](https://creditcoin-testnet.blockscout.com/tx/0x93bdf6cbbd31ec0353516773ffc316c279c1a756fd87f07e503d416d10806d15) |

You do not have to take the app's word for the position state. Read it directly:

```bash
cast call 0x134476ff6d5efb0b422dcd3b92dcd61413880d92 \
  "getCoverage(uint256)((uint256,address,address,uint64,uint64,uint64,uint64,uint64,uint256,uint256,uint256,uint256,uint256,address,bytes32,address,bytes32,uint8,uint64,bytes32))" \
  13 --rpc-url https://rpc.cc3-testnet.creditcoin.network
```

That returns position #13's full record, including its window, its bond, and its status. The same read is what the app renders — it is not a cached copy.

## The app

Two surfaces sharing one design language, both reading CC3 live:

- **The landing** (`/`) — the mechanism explained with the breach animated as you scroll, and the attested frontier ticking in the header. Its call to action leads into the console.
- **The console** (`/dashboard` and eight more routes) — the working app: connect a wallet, buy coverage, provide coverage, draw and repay, challenge a position with a proof, and read the full protocol state.

The console reads everything from the contracts on an interval and reports a failed read rather than showing a stale number. Every figure is generated from the evidence manifest, so the UI cannot hold a fact the repo does not.

## Tech stack

- **Contracts:** Solidity 0.8.28, Foundry. OpenZeppelin for the token and access primitives.
- **Attestation:** Attestcoin block prover and ChainInfo precompiles on Creditcoin CC3.
- **App:** Next.js 16 (App Router), React 19, TypeScript strict, viem for chain reads and writes.
- **Evidence tooling:** Node scripts in `worker/` that produce `evidence.json`; a generator that turns it into typed constants for the UI.
- **Tests:** Forge — 71 tests across 9 suites, including fuzzed invariants.

## Project layout

```
contracts/                    # Solidity + Foundry
  src/CoverageEngine.sol      # positions, bonds, isValid, effectiveStatus
  src/CoverageMarket.sol      # quotes, purchase, aggregated purchase
  src/ChallengeManager.sol    # proof submission, breach, bond payout
  src/LendingAdapter.sol      # the pool: draw, repay, liquidity
  src/OfferRegistry.sol       # standing offers (written, not yet deployed)
  src/predicates/             # ProhibitedRecipient, AmountAboveLimit, AmountBelowFloor
  src/interfaces/ICoverage.sol# Coverage, Status, Reason, IPredicate
  test/                       # 9 suites incl. AttackMatrix and Invariants
  script/Deploy.s.sol         # the deployment that is live on CC3
worker/
  scripts/demo.mjs            # the end-to-end lifecycle run on live testnet
  scripts/attack-matrix.mjs   # 15 attempts against the live deployment
  scripts/live-precompile-check.mjs  # 7 keyless checks against the real precompiles
  scripts/verify-deployment.mjs      # 19 checks; confirms every contract verifies
  evidence/                   # the raw output those scripts produced
web/                          # Next.js app — landing (/) and the console (/dashboard)
  lib/evidence.generated.ts   # GENERATED from evidence.json; the UI holds no facts of its own
  scripts/gen-evidence.mjs    # regenerates it; runs before dev and build, gated in CI
  scripts/check-no-literals.mjs  # fails if a generated number is typed into a component
docs/                         # ATTESTCOIN, ECONOMICS, COMPARISON, INTEGRATION, GAS,
                              # DEMO, JUDGE-PACKET, SUBMISSION, ROADMAP
docs/deck/                    # the 9-slide project deck, built from deck.typ
evidence.json                 # every measured number the UI and this README quote
INVARIANTS.md SECURITY.md     # the numbered invariants and the threat model
```

## Run it locally

```bash
# 1. contracts
cd contracts
forge install foundry-rs/forge-std@v1.9.4
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0
forge test                       # 71 tests

# 2. the app — reads the live CC3 deployment by default
cd ../web
npm install
npm run dev                      # http://localhost:3000
```

The app needs no keys to read. `web/.env.example` carries only the public RPC and the deployed addresses. Sending a transaction needs a browser wallet funded from the faucet, which the console links to.

To regenerate the evidence the UI is built from:

```bash
cd web
npm run check:evidence           # regenerates from ../evidence.json and diffs the result
```

If that fails, the UI and the manifest have diverged, which is exactly what it is for.

## How I'd deploy it

Import the repo into **Vercel** with the **Root Directory** set to `web`. The framework preset and build command are detected; no environment variables are required to read the live deployment, because the addresses ship in the generated evidence.

To redeploy the contracts, `forge script script/Deploy.s.sol --broadcast` writes a fresh address set, and everything downstream has to be regenerated — the addresses in `evidence.json`, the explorer verification, and the app's generated constants. Any change that touches `CoverageEngine` invalidates the recorded addresses and the demo evidence; `docs/ROADMAP.md` covers the sequencing.

The market layer is part of the live address set, so a redeploy must include `OfferRegistry` and wire it both ways: `engine.wireModules(...)`, `market.setOfferRegistry(...)` and `registry.setMarket(...)`. The first two are easy to lose — on CC3 the RPC omits `mixHash` on blocks, alloy's gas estimation fails on it, and the transactions revert while every contract still deploys. The deployment looks complete and the engine reads zero for its modules. Send those two with an explicit gas limit, then read `engine.market()` back.

## Tests

```bash
cd contracts && forge test        # 71 passing, 9 suites, 0 failing
```

The suite covers the full lifecycle, the attack matrix (A through H plus the later cases), a lookalike-emitter attack, a reverted source transaction, replay scoping, the challenger race, expiry, fail-closed behaviour under an unavailable precompile, offer aggregation, utilisation pricing, and fuzzed invariants `I-01` through `I-05` and `I-16`.

Beyond unit tests, the mechanism is verified against the live network: a 16-transaction lifecycle run took 225 seconds at a 15-second block time, 15 attacks were run against the deployed contracts and all 15 were refused, and the deployment passed 19 verification checks with all ten contracts verifying on the explorer.

## Limitations

Stated here rather than discovered by a reviewer:

- **A predicate sees one proven transaction.** It cannot read source-chain state, cannot sum history, and cannot compare two transactions. Every invariant is a statement about one decoded receipt. See `SECURITY.md` §"What a predicate cannot see".
- **Coverage windows are relative to the attestation frontier.** A position bought over a window the frontier has already passed is expired on arrival. The grace band is configurable and currently 10,000 source blocks.
- **The challenger supplies the counterexample.** The app fetches the inclusion proof from the public prover and simulates the challenge for free, but the source transaction hash comes from the user. Automated counterexample search is out of scope for this deployment.
- **Mainnet is not deployed.** CC3 testnet is the target of this build.
- **The marketplace is thin by construction.** One underwriter publishes offers, so the book is one offer deep; aggregation is exercised by the test suite rather than by a crowded market.
- **The token is a faucet token.** It has no value and is not collateral.

## Non-goals

These are not roadmap items. They are decisions with mechanism-level reasons — building any of them would weaken the invariant rather than extend it, and the reasons live in `SECURITY.md` and `docs/ROADMAP.md`:

- **Transferable coverage** — breaks the counterparty binding at the moment of the draw.
- **A governance token** — adds a second claim on the value the bond already secures.
- **A protocol fee on seized bonds** — reduces the only economic force standing between a false claim and a paid-out loan.

## Licence

MIT. See [`LICENSE`](LICENSE). Vendored files retain their upstream MIT terms and say so in their headers.
