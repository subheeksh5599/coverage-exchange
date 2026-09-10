# Gas report

Measured with `forge test --gas-report` on the committed test suite (48 tests). No estimates, no
projections: every row below was produced by the suite that ships in this repository.

Reproduce:

```bash
cd contracts && forge test --gas-report
```

## Deployment

| Contract | Deploy gas | Runtime size (B) | EIP-170 margin (B) |
|---|---|---|---|
| CoverageEngine | 1,754,518 | 7,883 | 16,617 |
| ChallengeManager | 1,278,406 | 5,927 | 18,573 |
| CoverageMarket | 795,452 | 3,590 | 20,910 |
| LendingAdapter | 782,622 | 3,558 | 20,942 |
| AttestcoinAdapter | — | 2,620 | 21,956 |
| Predicate modules | ~320,000 | ~1,240 | ~23,300 |
| DemoToken | 477,819 | 2,512 | — |

Every contract is comfortably inside the 24,576-byte limit, which is why the protocol is split into
modules rather than written as one contract.

## The paths that matter

| Function | Min | Avg | Max | What it is |
|---|---|---|---|---|
| `CoverageEngine.isValid` | 1,302 | 13,135 | 25,884 | The predicate every consumer calls. The cheap end is a terminal-status early exit (no precompile call); the expensive end includes the live `ChainInfo` frontier read. |
| `CoverageEngine.adjudication` | 6,222 | 20,969 | 31,224 | The lean surface the challenge path reads. |
| `LendingAdapter.draw` | 62,948 | 74,619 | 150,649 | Coverage check + engine consume + token transfer. |
| `CoverageMarket.quote` | 6,143 | 6,143 | 6,143 | Pure function: a quote costs only a view call. |
| `CoverageMarket.purchase` | 30,165 | 250,492 | 388,779 | Premium transfer + bond lock + position write. |
| `ChallengeManager.challenge` | 52,928 | 125,484 | 208,029 | Precompile verification + receipt decode + predicate + breach + bond payout. This is the most expensive path in the protocol and it is paid by the challenger who is about to receive the bond. |
| `ChallengeManager.previewChallenge` | 28,886 | 51,161 | 73,961 | Free read-only simulation via the precompile's view path. |
| `CoverageEngine.applyBreach` | 24,492 | 24,492 | 24,492 | Single bond transfer, no branch. |
| `CoverageEngine.deposit` | 48,479 | 53,003 | 82,691 | Underwriter capital in. |
| `CoverageEngine.settle` | 31,091 | 60,386 | 60,725 | Frontier re-read + bond release. |
| Predicate `evaluate` | 2,086 | ~2,230 | 2,268 | The invariants are cheap: they inspect one decoded receipt and one address or one word. |

## What the numbers say

- **Verification dominates cost, and only on the challenge path.** Everything a lender or underwriter
  does on the happy path is tens of thousands of gas; the proof-verification path is ~2-3× that. That
  is the honest shape of the design: the expensive operation is the one that decides whether money is
  seized, and it happens once.
- **`isValid` is cheap enough to be a gate.** Its floor is 1,302 gas when the position is already
  terminal, and its ceiling (25,884) is still less than a token transfer to a cold recipient. A lending
  protocol can call it in the same transaction as a draw without thinking about it.
- **Predicates cost nothing worth optimising.** ~2.2k gas each; splitting them into modules was a
  readability and safety choice, not a gas one.
- **The frontier read is the only unavoidable cost inside `isValid`.** It is one precompile call, which
  is exactly the price of not trusting a locally stored height.

## Continuity compression (separate, measured on the live network)

From `worker/scripts/continuity-benchmark.mjs`, 5 claims, live CC3 testnet precompiles:

| Shape | Calls | Gas | Calldata | Continuity proofs |
|---|---|---|---|---|
| Naive (one proof per claim) | 5 | 419,994 | 22,676 B | 5 (275 continuity roots total) |
| Batched (one shared continuity proof) | 1 | 293,781 | 18,820 B | 1 |

**30.1% saving.** Reported as measured rather than as a headline: the per-claim merkle paths and proven
bytes still dominate, so this is a real but bounded win that grows with the number of claims sharing a
window.
