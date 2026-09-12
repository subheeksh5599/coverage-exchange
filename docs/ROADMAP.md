# Roadmap — what is built, and what is a non-goal

The build checklist had one rule: "only add the market layer after the core mechanism is bulletproof.
A broken market is worse than a perfect deterministic pricing engine." The core is verified on chain
in both directions, and the market layer is now built on top of it: competing underwriters, capacity
aggregation, dynamic pricing, and risk tranches are all live in the code with their own tests.

## Built

| Item | Contract | Tests |
|---|---|---|
| **Bonded coverage positions** | `CoverageEngine`, `CoverageMarket` | `CoverageLifecycle`, `StateMachine`, `Invariants` (I-01..I-05) |
| **Attestcoin-verified challenges** | `ChallengeManager`, `AttestcoinAdapter` | `AttackMatrix` (A–H + 12 more), `Predicates` |
| **Competing underwriters** | `OfferRegistry` | `OfferRegistry` (10 tests: publish, cancel, list, fill, expired, wrong borrower, double-fill…) |
| **Capacity aggregation** | `CoverageEngine.createAggregatedCoverage`, `CoverageMarket.purchaseAggregated` | `Aggregation` (6 tests: sum-of-bonds, junior-first slashing, mismatched-terms rejection, dual settle) plus `Invariants` I-06 |
| **Dynamic pricing** | `CoverageMarket.utilizationMultiplierBps` | `DynamicPricing` (4 tests: monotonicity, base-rate at zero utilization, util cap) |
| **Risk tranches** | per-contributor `tranche` field, `quoteTranche` | inside `OfferRegistry` (junior charges more) and `Aggregation` (junior slashed first) |
| **Transactional frontend** | `web/` (Next.js) with wallet, faucet, deposit, publish/cancel offer, fill/aggregate, draw, repay, settle, challenge | typecheck clean; every action is a real transaction against the deployed contracts (or the fresh redeploy once `NEXT_PUBLIC_OFFER_REGISTRY_ADDRESS` is set) |

The full test suite is `Ran 9 test suites: 71 tests passed, 0 failed, 0 skipped` — up from 48 at the
initial submission. The extra 23 tests are all adversarial or invariant coverage for the new market
layer, not smoke tests.

## The one thing that still requires a human step

The recorded 2026-09-10 deployment on Creditcoin CC3 testnet predates the market-layer contracts, so
the currently live site at `coverage-exchange.vercel.app` still talks to the earlier engine and does
not surface `OfferRegistry`. The offers page detects this via `offerRegistryDeployed()` and shows a
"registry not deployed" notice with the exact command to re-enable it:

```
cd contracts
forge script script/Deploy.s.sol:Deploy --rpc-url $CC3_TESTNET_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
# then set NEXT_PUBLIC_OFFER_REGISTRY_ADDRESS in the web deployment
```

The code, tests and deploy script are all in place; the redeploy itself is the human step (funded
deployer key required).

## Deliberate non-goals

These are not roadmap items — they are decisions with named mechanism-level reasons. Building any
of them would weaken the invariant, not extend it.

| Item | Why not |
|---|---|
| **Transferable coverage** | Reassigning a position at the moment of the draw would break the counterparty binding, which is one of the two guards that makes `isValid` meaningful. |
| **Governance token** | Coverage capacity is already the scarce object; a token would add a second claim on the same value and weaken the bond. |
| **Protocol fee on seized bonds** | The challenger's incentive to find false claims *is* the mechanism. A cut reduces the only economic force standing between a false claim and a paid-out loan. |

## Sequencing rule for future changes

The mechanism is verified on chain in both directions — a false claim destroyed, a clean claim
settled. Any change to `CoverageEngine`, `ChallengeManager` or the predicate interface invalidates
the recorded addresses, the explorer verification and the demo evidence, so the order is: extend by
adding contracts (`OfferRegistry` is a clean example of an additive extension), and re-run
`forge test`, `verify-deployment.mjs`, `demo.mjs` and `attack-matrix.mjs --onchain` before claiming
anything about the new state.
