# Invariants

Numbered, testable and mapped to the test that enforces each one. This file is the specification; the
contracts are the implementation, and the tests are the evidence that the two agree.

A note on reading these: an invariant is only meaningful if it holds for *attacker-chosen* inputs, not
just for the happy path. Where an invariant is fuzzed, the test name says so.

| # | Invariant | Enforced in | Test |
|---|---|---|---|
| I-01 | **No exposure is unlocked without valid coverage.** A draw reverts unless `isValid(id)` is true in the same transaction. | `LendingAdapter.draw` → `CoverageEngine.isValid` | `InvariantsTest.testFuzz_I01_I02_NoExposureWithoutValidCoverage`, `AttackMatrixTest.testFuzz_NoCoverageNoDraw` |
| I-02 | **Coverage is never valid past its live window.** Once the attested frontier passes `liveUntilHeight = endBlock + requiredDepth + grace`, the position reads `EXPIRED` and gates nothing. | `CoverageEngine.effectiveStatus`, `isValid` | `StateMachineTest.test_NoKeeperNeededForExpiry`, `test_DrawAfterExpiryReverts` |
| I-03 | **A bond cannot be withdrawn while it secures a live position.** Only `freeBalance = balance − lockedBond` is withdrawable; anything more reverts. | `CoverageEngine.withdraw`, `freeBalance` | `InvariantsTest.testFuzz_I03_LockedBondIsNeverWithdrawable`, `test_UnderwriterCannotWithdrawLockedBond` |
| I-04 | **The bond always covers the exposure it gates** (`bond >= maxExposure × coverageRatioBps / 10 000`, ratio floor 1.0×). Otherwise breaching on purpose is profitable. | `CoverageEngine.createCoverage` | `InvariantsTest.testFuzz_I04_BondAlwaysCoversExposure`, `test_BondBelowExposureIsRefused` |
| I-05 | **Capacity is never created without a deposit behind it.** | `CoverageEngine.createCoverage`, `deposit` | `InvariantsTest.testFuzz_I05_NoCapacityWithoutDeposit` |
| I-06 | **Coverage can never exceed the position's maximum exposure**, across any number of draws. | `LendingAdapter.draw`, `CoverageEngine.consume` | `CoverageLifecycleTest.test_MultipleDrawsShareOnePosition` |
| I-07 | **A counterexample must prove a violation of *this* position's predicate, inside *this* position's window, on *this* position's chain, from a transaction that actually succeeded.** | `ChallengeManager.challenge` | `AttackMatrixTest` A–H, lookalike-emitter and reverted-transaction cases |
| I-08 | **A lookalike event is not evidence.** topic0 alone never establishes authorship; only logs emitted by the position's contracted source address are evaluated. | `predicates/PredicateLib.firstMatchingLog` | `PredicatesTest.test_ProhibitedRecipient_IgnoresLookalikeEmitter`, `AttackMatrixTest.test_LookalikeEventFromAnotherContractIsNotEvidence` |
| I-09 | **No owner or admin can breach a position, declare a draw valid, or release a bond early.** Owner powers are limited to one-time module wiring and risk parameters; positions snapshot everything else at creation. | `CoverageEngine` (absence of such functions) | `StateMachineTest.test_ModulesCanOnlyBeWiredOnce`, `test_OnlyAuthorizedCallersCanWriteOutcomes` |
| I-10 | **A breach pays the challenger atomically and exactly once.** The bond transfer happens in the same transaction as the state change, and the position cannot be breached again. | `CoverageEngine.applyBreach` | `AttackMatrixTest.test_A_…`, `test_E_BreachIsTerminalAndSecondChallengerLoses` |
| I-11 | **A counterexample cannot be replayed against the same position.** The replay key is `keccak(coverageId, chainKey, blockHeight, txIndex)`, where `txIndex` is recovered from the merkle path rather than claimed by the submitter. | `ChallengeManager.challenge` | `AttackMatrixTest.test_G_SameEvidenceBreachesTwoDistinctPositions` (+ `usedChallengeKeys` assertions) |
| I-12 | **`BREACHED` and `SETTLED` are terminal.** Nothing leaves them; a breached position can never settle cleanly. | `CoverageEngine.settle`, `applyBreach` | `StateMachineTest.test_BreachedIsTerminal`, `test_SettledIsTerminal` |
| I-13 | **An unreachable attestation frontier fails closed.** If ChainInfo cannot be read, the position is not valid and the window is not closed — never "assume it was fine". | `AttestcoinAdapter.tryFrontier`, `CoverageEngine.isValid` | `StateMachineTest.test_UnreachableFrontierFailsClosed` |
| I-14 | **Settlement requires zero outstanding exposure.** An underwriter cannot free a bond while the exposure it secured is still drawn. | `CoverageEngine.settle` | `StateMachineTest.test_SettleRequiresZeroOutstandingExposure` |
| I-15 | **Quotes are reproducible.** The premium is a pure function of exposure, window length, required depth, underwriter and borrower; a tampered premium is rejected. | `CoverageMarket.quote`, `purchase` | `CoverageLifecycleTest.test_PremiumReaches…`, `AttackMatrixTest.test_TamperedPremiumIsRefused` |
| I-16 | **An aggregated position's bond equals the sum of its contributors' bonds**, and each contributor's `lockedBond` rises by exactly its contribution. | `CoverageEngine.createAggregatedCoverage` | `InvariantsTest.testFuzz_I16_AggregatedBondEqualsSumOfContributors` |
| I-17 | **A junior tranche is priced strictly higher than the equivalent senior offer.** Junior contributors also account for slashing first inside a breach (single transfer to the challenger; order is observable via `ContributorSlashed` events). | `CoverageMarket.quoteTranche`, `CoverageEngine.applyBreach` | `OfferRegistryTest.test_JuniorOfferChargesMoreThanSenior`, `AggregationTest` (junior-first slashing) |
| I-18 | **Offer terms are immutable after publication.** An underwriter may `cancelOffer` but cannot mutate an offer's fields; a filled offer cannot be filled again. | `OfferRegistry` (absence of setters), `markFilled` (market-only) | `OfferRegistryTest.test_DoubleFillIsRefused`, `test_CancelThenPurchaseIsRefused`, `test_MarkFilledIsMarketOnly` |
| I-19 | **Aggregated offers must agree on their non-numeric terms.** Chain, depth, window length, source contract, event signature, predicate and predicate params must be identical across the basket; otherwise `purchaseAggregated` reverts with `OffersDoNotAggregate`. | `CoverageMarket.purchaseAggregated` | `AggregationTest.test_MismatchedTermsRejected` |

## State machine

```
                    ┌──────────────────────────────────────────────┐
  buy a position ──►│ ACTIVE                                       │
                    │  · frontier condition checked on every read  │
                    │  · draws permitted up to maxExposure         │
                    └───────┬───────────────────────┬──────────────┘
                            │                       │
        counterexample      │                       │  frontier advances past
        proven inside       │                       │  liveUntilHeight (computed,
        the window          │                       │  no transaction needed)
                            ▼                       ▼
                     ┌─────────────┐         ┌─────────────┐
                     │  BREACHED   │         │  EXPIRED    │
                     │  bond →     │         │  gates      │
                     │  challenger │         │  nothing    │
                     │  terminal   │         └──────┬──────┘
                     └─────────────┘                │ settle() (permissionless,
                                                    │ requires drawn == 0)
                                                    ▼
                                             ┌─────────────┐
                                             │  SETTLED    │
                                             │  bond freed │
                                             │  terminal   │
                                             └─────────────┘
```

Illegal transitions, all asserted in `test/StateMachine.t.sol`:

- `BREACHED → ACTIVE`: impossible.
- `BREACHED → SETTLED`: impossible — a breached position never looks clean.
- `SETTLED → anything`: impossible.
- `ACTIVE → SETTLED` without the window being closed at the required depth: impossible.
- `EXPIRED` back to `ACTIVE`: impossible, because expiry is recomputed from the same frontier every read.

## Why expiry is computed rather than stored

A stored `expired` flag needs someone to set it. That someone is a keeper: bribeable, forgettable,
front-runnable, and a liveness dependency for a safety property. Deriving expiry from the attested
frontier on every read means there is no such actor, and it costs one precompile call that the draw
path was making anyway.
