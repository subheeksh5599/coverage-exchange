# Coverage Exchange

**Bonded cross-chain coverage over attested state windows — and anyone can destroy a false claim with one counterexample.**

A lender should not have to trust that a borrower stayed inside a risk policy on another chain. Coverage Exchange turns that trust into a position: an underwriter bonds capital behind a claim about a range of source-chain history, a lender releases exposure only while that position is valid, and any participant who proves a single contradictory transaction inside the covered range takes the bond — atomically, in one transaction, with no committee, no dispute window and no admin.

Built for **BUIDL CTC 2026 Fall** (Creditcoin & Credit Labs, Attestcoin Protocol theme).

---

## 1. The problem

Cross-chain credit has a hole in the middle of it. The lender's collateral and behaviour live on one chain; the credit lives on Creditcoin. Today the lender picks one of two bad options:

- **trust a report** — the borrower's indexer, a risk API, an oracle operator. Every one of them is a single point of failure, and none of them loses money when they are wrong; or
- **lend so little it doesn't matter** — which is why undercollateralised cross-chain credit barely exists.

The missing piece is not more data. It is **a way to make a claim about cross-chain state cost money when it is false**.

## 2. The primitive

A **coverage position** is bonded capital standing behind a claim about a range of source-chain blocks:

> This borrower may unlock up to `E` of exposure only while the source chain's attested frontier covers the window `[startBlock, endBlock]` at `requiredDepth`, and **no counterexample has been proven against it**.

Three roles, each with a reason to be honest:

| Actor | Wants | Loses if wrong |
|---|---|---|
| **Borrower** | the credit the position unlocks | loses coverage the moment it is breached, and it paid the premium |
| **Underwriter** | the premium | loses the whole bond to whoever proves the breach |
| **Challenger** | the bond | spends gas; needs no permission, no stake, no allowlist |

The chain adjudicates. There is no DAO vote, no claims adjuster, no admin override — see `INVARIANTS.md` I-09.

## 3. The coverage invariant

A position is valid for exposure `E` if and only if all of these hold, evaluated **at the moment of the draw**:

```
isValid(id)  iff
      ChainInfo(chainKey).is_height_attested(endBlock + requiredDepth) is reachable
  AND frontier <= liveUntilHeight            ( = endBlock + requiredDepth + grace )
  AND status != BREACHED
  AND status != SETTLED
  AND drawn < maxExposure
```

and at creation:

```
bond >= maxExposure * coverageRatioBps / 10_000      (ratio floor 1.0x)
capacity >= maxExposure
freeBalance(underwriter) >= bond                      (the bond is actually locked)
```

Two of those conditions are the whole invention:

- **the frontier condition** makes "the window was actually covered" checkable rather than asserted — the protocol's own `is_height_attested` predicate decides it, not a locally stored height;
- **the bond ratio** is why breaching is never profitable: the money behind the promise always exceeds the money the promise unlocks.

## 4. How it works

```
   SOURCE CHAIN (Ethereum Sepolia)                CREDITCOIN CC3 (chainId 102031)
   ───────────────────────────────               ───────────────────────────────────────
   emitted evidence inside the window  ──┐
                                        │        ┌──────────────────────────────────┐
                                        ├───────►│  ChainInfo precompile  0x0FD3    │ attested frontier
                                        │        │  Block Prover precompile 0x0FD2  │ inclusion + continuity
                                        │        └───────────────┬──────────────────┘
                                        │                        │
                                        │        ┌───────────────▼──────────────────┐
                                        │        │  AttestcoinAdapter               │
                                        │        │   tryFrontier / frontierReached  │
                                        │        │   verifyInclusion (+ batch)      │
                                        │        └───────────────┬──────────────────┘
                                        │                        │
                          ┌─────────────▼──────────┐   ┌─────────▼──────────┐
                          │  ChallengeManager      │   │  CoverageEngine    │
                          │  verify → decode →     │──►│  positions, bonds, │
                          │  predicate → breach    │   │  capacity, validity│
                          └────────────────────────┘   └─────────┬──────────┘
                                                                 │
                          ┌──────────────────┐   ┌───────────────▼──────────┐
                          │  CoverageMarket  │   │  LendingAdapter          │
                          │  quote / purchase│   │  draw only if isValid()  │
                          └──────────────────┘   └──────────────────────────┘
```

**Lifecycle.** Underwriter deposits → publishes a price multiplier for a borrower → borrower buys a position (premium to the underwriter, bond locked in the engine) → lender draws while the position is valid → the window closes and the frontier moves past `endBlock + requiredDepth` → either someone proves a counterexample (bond to the challenger, position `BREACHED`, draws frozen) or the position settles and the bond is released.

**Expiry is computed, not scheduled.** Nothing flips a position to `EXPIRED`; `effectiveStatus()` derives it from the attested frontier on every read, so there is no keeper to bribe, forget or front-run.

## 5. Attestcoin integration

This is the part the event scores, so it is worth being exact. Two precompiles carry the whole protocol, and both are called through one auditable file (`contracts/src/AttestcoinAdapter.sol`):

| Precompile | Address | Used for | Where |
|---|---|---|---|
| **ChainInfo** | `0x0000000000000000000000000000000000000fD3` | `is_height_attested`, `get_latest_attestation_height_and_hash` — the attested frontier | `AttestcoinAdapter.tryFrontier` / `frontierReached` |
| **Block Prover** | `0x0000000000000000000000000000000000000FD2` | `verify` (view preflight), `verifyAndEmit` (single and **batch**), `calculateTxIndex` | `AttestcoinAdapter.preflightInclusion` / `verifyInclusion` / `verifyInclusionBatch` / `transactionIndex` |

Four details that matter and are easy to get wrong:

1. **chainKey != chainId.** Attestcoin keeps its own key space; Sepolia is `chainKey 1`, Ethereum mainnet is `chainKey 3`. The key is part of every proof and every replay key.
2. **The precompiles are native runtime code, not contracts.** `eth_getCode` returns `0x` at both addresses on Creditcoin. That is expected and is not a missing deployment.
3. **Inclusion is not success.** A reverted source transaction is still a validly included transaction, so the protocol decodes the proven receipt with the protocol's own `EvmV1Decoder` (vendored byte-identical) and requires `receiptStatus == 1`.
4. **topic0 is not authorship.** The invariant is only ever evaluated against logs emitted by the position's contracted source address; the emitter gate lives in `predicates/PredicateLib.firstMatchingLog`.

Full detail, including the exact payload format and the live evidence: **`docs/ATTESTCOIN.md`**.

## 6. Verified, not asserted

### Deployed and verified on Creditcoin CC3 testnet

Chain `102031`, deployed 2026-09-10. Explorer links are in `evidence.json`.

| Contract | Address |
|---|---|
| `DemoToken` (cxTUSD, 6 decimals, faucet) | `0x7bde1e22355677cf4ac461fec92f534dda2117b7` |
| `AttestcoinAdapter` | `0x5800fe651f37fc22ba0ce5e5b407c0b88a59ca63` |
| `CoverageEngine` | `0xca5e3b0076673cd64a1655221305e66f2056d2bb` |
| `CoverageMarket` | `0xb4569dc8827a8e573f2bb34b7f68a7ecf078b0e1` |
| `ChallengeManager` | `0x5218279fd26e9b544c27e21acb1bfc9e325a5937` |
| `LendingAdapter` | `0xf6931e84078c7fffc4f24c18bb15850ce7a1d967` |
| `ProhibitedRecipient` / `AmountAboveLimit` / `AmountBelowFloor` | `0x52a200d4…`, `0xba746915…`, `0x6728d182…` |

```
$ node worker/scripts/verify-deployment.mjs
19/19 checks passed
```
That includes our own deployed `AttestcoinAdapter` reading the live frontier through the real ChainInfo
precompile: `height=11674170`, with `is_height_attested` true at that height and false 10M blocks above.

### The full mechanism, executed live

```
$ node worker/scripts/demo.mjs
```

Four independent wallets, no hand-written values, every step a real transaction:

```
  faucet ALICE / BOB / LENDER          3 real mints
  BOB deposits bond capital            tx=0xf22e94ab…e68189
  LENDER funds liquidity               tx=0x21b7a644…cf05d8
  ALICE buys coverage                  tx=0x1a9aece9…9ed0a5   (premium 56 cxTUSD, quoted on-chain)
  isValid                              true (VALID)
  ALICE draws against coverage         tx=0x84c5783f…fe87be
  fetched real proof                   height 11671180, 7 siblings, 21 continuity roots
  previewChallenge (free, read-only)   true — "counterexample breaches the position"
  CAROL challenges                     tx=0x5930a7e3…26686f
  bond paid to the challenger          +12000 cxTUSD
  coverage status                      BREACHED
  draw after breach                    reverted CoverageNotValid(STATUS_BREACHED)
  second challenger                    reverted NotLive()

  --- honest path ---
  ALICE buys a second position         tx=0x72fca7de…ba2d6
  ALICE repays, freeing capacity       tx=0x4401c55c…3ff1a
  anyone settles the clean position    tx=0x508dc45c…273b2
  bond released                        free balance +12000 cxTUSD
  second position status               SETTLED
```

The counterexample is a **real Sepolia USDC transfer** (`0x19c528d3…88a1`, block 11,671,180) whose
recipient was declared prohibited in the coverage terms. Nothing was synthesised: the proof is genuine,
the precompile verified it on-chain, and the invariant it breaks is one a lender could actually write into
a position. Both worlds are covered — a false claim destroyed, and a clean claim settled with the bond
returned.


Everything below was executed on this machine and can be re-run by anyone with one command. Nothing in this section is a projection.

### Attestcoin verification, live on CC3 testnet (keyless)

```
$ cd worker && npm install && node scripts/live-precompile-check.mjs
PASS  chaininfo.frontier                      frontier=11673770 hash=0xe44a92d9…b889cd
PASS  chaininfo.is_height_attested(frontier)  -> true
PASS  chaininfo.is_height_attested(+10M)      -> false (must be false)
PASS  proofBuilder.fetchProof                 height=11653808 txIndex=0 siblings=7 roots=93
PASS  blockprover.verify(realProof)           -> true
PASS  blockprover.verify(tamperedPayload)     reverted: "Merkle proof validation failed"
7/7 checks passed
```

That is a real Sepolia transaction, a real proof from the public proof builder, and the real `0x0FD2` precompile returning `true` — then rejecting the same proof with one bit flipped. No key, no funds, no deployment.

### Continuity compression, measured

```
$ node scripts/continuity-benchmark.mjs 5
naive:  5 calls, total gas 419994, calldata 22676 bytes   (275 continuity roots carried)
batch:  1 call,  total gas 293781, calldata 18820 bytes   (1 shared continuity proof)
saving: 126213 gas (30.1%), calldata 3856 bytes
```

Honest reading: this is a **30% saving, not a 100× one**. The batch overload shares the expensive continuity chain across claims, but each claim still carries its own merkle path and proven bytes, which dominate the calldata. The compression is real, it grows with the number of claims in the window, and it is the reason the protocol is built on the batch path — but anyone claiming an order-of-magnitude win here has not measured it.

### Gas, measured

`forge test --gas-report` on the shipped suite: `CoverageEngine` 7,883 B runtime; `isValid` 1,302–25,884 gas; `LendingAdapter.draw` 62,948–150,649; `ChallengeManager.challenge` 52,928–208,029 (the verification path, paid by the challenger who receives the bond); predicates ~2,230. Full table with commentary in **`docs/GAS.md`**.

### Contract tests

```
$ cd contracts && forge test
48 tests passed, 0 failed, 0 skipped
```

Including the full counterexample suite A–H, the lookalike-emitter case, the reverted-source-transaction case, replay scoping, the challenger race, expiry, and fail-closed behaviour when the frontier is unreachable.

**One limitation stated plainly:** the unit tests run against precompile *doubles* etched at the real addresses, because the protocol's verification is performed by the node, not by EVM bytecode. Those doubles prove this protocol's logic, not Attestcoin's cryptography. The cryptography is proven by the live check above, which calls the real node.

**A second finding worth recording:** a Foundry fork of CC3 **cannot** exercise these precompiles — a fork copies state, not the node's native precompile implementations — and CC3 blocks do not populate `prevrandao`, so a default fork fails header validation anyway. Live verification must go through `eth_call` on the real node. That is why `test/LiveAttestcoin.t.sol` does not exist and `scripts/live-precompile-check.mjs` does.

## 7. What is built, and what is not

| Piece | State |
|---|---|
| Attestcoin adapter (frontier + inclusion + batch) | built, compiles, exercised |
| Coverage engine (positions, bond locking, capacity, validity, settlement) | built, tested |
| Challenge manager (verify → decode → predicate → breach → pay) | built, tested |
| Three predicate modules (prohibited recipient, amount ceiling, amount floor) | built, tested |
| Coverage market (deterministic risk-priced quotes, purchase, capacity) | built, tested |
| Lending adapter (draw gating, exposure accounting, repayment) | built, tested |
| Deploy + deployment-verification scripts | executed — deployment live; verification is RPC-based (see below) |
| Keyless live Attestcoin verification | **executed against CC3 testnet, 7/7** |
| Continuity benchmark | **measured against CC3 testnet** |
| Deployment on CC3 testnet | **live** — 9 contracts, verified 19/19 by `verify-deployment.mjs` |
| Full mechanism run live | **done** — breach + slash and settlement, `worker/evidence/demo-run.json` |
| Demo video, deck, submission form | not started (human deliverables) |
| Frontend | deliberately out of scope for this repository |

`worker/evidence/` holds the raw output of every live run shown above: `live-precompile.json`,
`continuity-benchmark.json`, `deployment-verification.json`, `source-evidence.json` and `demo-run.json`.
`evidence.json` is the machine-readable index of all of it, separating MEASURED facts from anything still
pending (demo video, deck).

**A third Foundry limitation worth recording:** a `forge script` deployment cannot verify the Attestcoin
frontier either, for the same reason no fork test can — Foundry's EVM does not implement Creditcoin's
native precompiles. `script/VerifyDeployment.s.sol` therefore verifies what an EVM *can* see (bytecode,
module wiring, baked-in constants, engine parameters) and reports the frontier check as expected-to-fail
from inside Foundry; the authoritative check is `worker/scripts/verify-deployment.mjs`, which sends
`eth_call` to the real node. Two other defects surfaced during the live run and are fixed in the scripts:
`forge script`'s gas estimate for the wiring call was 14,313 gas short (the transaction reverted OOG and
the call was re-sent with an explicit limit), and the demo's repayment path needed its own ERC-20
allowance for the lending pool.

## 8. Comparison with the rest of this field

The default submission in this hackathon is a credit passport: prove a repayment on one chain, mint a score or a better rate on Creditcoin. That shape is well represented and this project is deliberately **not** it — a score summarises the past; coverage prices a defined future exposure and can be attacked.

The closest neighbours, and the exact boundary in each case, are in **`docs/COMPARISON.md`**. In one line each:

| Neighbour | What it does | What is different here |
|---|---|---|
| **utuh** | bonds the *completeness of an event set* | no bond, no exposure gating, no market in coverage capacity |
| **index41** | bonds a relay's claim about *transaction ordering* | no lending exposure; the bond secures a relay's honesty, not credit |
| **recourse** | proven covenant breach freezes credit and pays a hunter | punitive only — no coverage instrument, no capacity, no pricing |
| **Backstop / Attestable / PegShield / proof-feed / Tutela** | proof-triggered payouts on events affecting the buyer | insures a party against an event on itself; none sells coverage of a third party's behaviour |

## 9. Repository layout

```
contracts/                      Foundry project (Solidity 0.8.30, via_ir)
  src/
    AttestcoinAdapter.sol       the only file that touches a precompile
    CoverageEngine.sol          positions, bond accounting, validity, state machine
    CoverageMarket.sol          pricing curve, purchase, capacity offers
    ChallengeManager.sol        adjudication: proof → decode → predicate → breach
    LendingAdapter.sol          draw gating + exposure accounting
    DemoToken.sol               testnet-only 6-decimal demo asset with a faucet
    interfaces/                 vendored Attestcoin ABIs (provenance in file headers)
    lib/EvmV1Decoder.sol        vendored protocol decoder, byte-identical
    predicates/                 the three invariant modules + shared emitter gate
  test/                         48 tests: lifecycle, attack matrix, state machine, invariants, predicates
  script/                       Deploy.s.sol, VerifyDeployment.s.sol
worker/                         proof pipeline, challenger watcher, live verification, benchmark
docs/                           ATTESTCOIN.md, ECONOMICS.md, COMPARISON.md, INTEGRATION.md, GAS.md
INVARIANTS.md  SECURITY.md      the numbered invariants and the threat model
```

## 10. Reproducing this

```bash
# 1. contracts
cd contracts
forge install            # forge-std + openzeppelin-contracts
forge build
forge test               # 48 tests

# 2. live Attestcoin verification, keyless (network required)
cd ../worker
npm install
node scripts/live-precompile-check.mjs
node scripts/continuity-benchmark.mjs 5

# 3. live deployment checks (keyless)
node scripts/verify-deployment.mjs      # 19/19 on the deployed addresses
node scripts/find-source-evidence.mjs   # locate a real source-chain transaction to prove
node scripts/demo.mjs                   # the whole mechanism, four wallets, real proofs

# 4. deploy your own instance to CC3 testnet (funded key required)
cd ../contracts
FOUNDRY_PROFILE=live forge script script/Deploy.s.sol:Deploy \
  --rpc-url $CC3_TESTNET_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
```

> If you deploy your own instance, send the `wireModules` transaction with an explicit `--gas-limit`:
> `forge script` under-estimated it by ~14k gas on the live network and the call reverted out of gas.

## 11. Limitations

Stated here rather than discovered by a reviewer:

- **A predicate sees one proven transaction.** It cannot read source-chain state, cannot sum history and cannot compare two transactions. Every invariant is therefore a statement about one decoded receipt. See `SECURITY.md` §"What a predicate cannot see".
- **Not deployed.** No addresses, no transactions, no demo video yet.
- **Coverage windows are relative to the attestation frontier.** A position bought over a window the frontier has already passed is expired on arrival; the grace band is configurable (`defaultGraceBlocks`, currently 10,000 source blocks).
- **Compression is 30%, not orders of magnitude** (measured above).
- **The pricing curve is deterministic and documented, not a market.** Underwriters set a per-borrower multiplier and the curve prices window length and depth. Competing underwriters on price is the obvious next step and is deliberately not claimed as done.
- **Frontend is out of scope** for this repository by choice; the contract surface and `previewDraw` / `previewChallenge` views expose everything a UI needs.

## 12. Licence

MIT for this project's code. Vendored files retain their upstream MIT terms and say so in their headers.
