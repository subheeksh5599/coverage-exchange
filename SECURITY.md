# Security model

What this protocol assumes, what it guarantees, what it explicitly does not, and where an attacker
would go looking. Written to be read by someone trying to break it.

## Trust assumptions

| Assumption | Why it is acceptable | What breaks if it fails |
|---|---|---|
| **Attestcoin attestors reach consensus honestly** on source-chain blocks | This is the protocol's own security model and the reason to use Creditcoin rather than an oracle operator; the protocol adds nothing on top and claims nothing on top | a false frontier or a false proof would let a position be drawn against an untrue claim about history |
| **The Attestcoin proofs are cryptographically sound** (Merkle inclusion + continuity) | verified by the node's native precompile `0x0FD2` inside our transaction; demonstrated live, including rejection of a tampered payload (`worker/scripts/live-precompile-check.mjs`) | fabricated evidence would be accepted |
| **The source contract emits the events the position was sold on** | the position snapshots the emitter address and the event signature at purchase; the predicate refuses any log from another contract | a lookalike event could trigger a breach — closed by I-07/I-08 |
| **Someone will challenge a false claim, or nothing needed challenging** | not an assumption the protocol depends on for safety — see "liveness vs safety" below | nothing: an unchallenged *valid* claim is correct by construction; an unchallenged *invalid* claim is caught by the frontier condition only if the window itself was never covered, which is exactly what the frontier check refuses to accept |

## Liveness vs safety

**Safety — what can never happen:** exposure cannot be unlocked against a position whose window is not
covered by the attested frontier, whose bond does not cover the exposure, or that is expired, breached
or settled. All of these hold whether or not anyone is watching, because they are checks in the draw
path, not monitoring.

**Liveness — what can be delayed:** attestation takes time. A position whose window has not yet been
attested to the required depth simply is not valid yet; a UI should show "pending, frontier 10,020 of
10,032 required", not an error. A delayed frontier costs liveness and never safety.

**No challenger is required for safety.** If nobody challenges, one of two things is true: the claim was
true (the position settles and the bond goes back), or the claim was false *and* the window was never
actually attested — in which case the frontier condition, not a human, refuses the draw. What a missing
challenger loses is the *economic* pressure on underwriters to screen borrowers, which is why the bond
must exceed the exposure: the mechanism has to be profitable to attack or it is only theatre.

## What a predicate cannot see (the honesty boundary)

A predicate receives **one proven transaction**. It cannot read source-chain state, cannot sum history,
and cannot compare two transactions. Every invariant in `predicates/` is therefore a statement about the
decoded logs of a single receipt:

- `ProhibitedRecipient` — an address in an indexed topic;
- `AmountAboveLimit` / `AmountBelowFloor` — one 32-byte word of log data against a threshold.

This matters in practice. "Collateral ratio never dropped below 130% over the window" is **not**
directly expressible, because the ratio is a function of state, not of one log. The honest way to cover
it is to have the source contract emit the ratio (or a breach flag) and to write a predicate over that
event — which is what the source-side contract is for, and why `docs/ATTESTCOIN.md` documents the
"source chain smart contracts" pattern. Any submission in this field that claims to prove an arbitrary
off-chain invariant from a single transaction proof is overclaiming; this one says so in writing.

## Attack surface, by attempted attack

| Attack | Result | Where |
|---|---|---|
| Draw without coverage | reverts | `LendingAdapter.draw` |
| Draw more than the position's maximum exposure | reverts | `LendingAdapter.draw`, `CoverageEngine.consume` |
| Draw after expiry | reverts | `CoverageEngine.isValid` |
| Draw as a different borrower | reverts | `LendingAdapter.draw` (`NotTheCounterparty`) |
| Underwriter withdraws the locked bond | reverts | `CoverageEngine.withdraw` |
| Create a position with a bond below the exposure | reverts | `CoverageEngine.createCoverage` |
| Create capacity without a deposit | reverts | `CoverageEngine.createCoverage` |
| Challenge with a fabricated proof | reverts at the precompile | `AttestcoinAdapter.verifyInclusion` |
| Challenge with a valid proof of a reverted transaction | reverts | `ChallengeManager` (`TransactionFailed`) |
| Challenge with a lookalike event from another contract | predicate returns not-violated, reverts | `PredicateLib.firstMatchingLog` |
| Challenge outside the covered window | reverts | `ChallengeManager` (`BlockOutsideWindow`) |
| Challenge with another chain's proof | reverts | `ChallengeManager` (`WrongChain`) |
| Replay a challenge against the same position | the key is consumed | `ChallengeManager.usedChallengeKeys` |
| Two challengers race | first wins, second reverts (`NotLive`) | `ChallengeManager`, `CoverageEngine.applyBreach` |
| Challenge after expiry | reverts (`NotLive`) | `CoverageEngine.effectiveStatus` |
| Re-activate a breached position | impossible | terminal status |
| Owner force-breaches or force-releases a bond | no such function exists | `CoverageEngine` |
| Re-entrancy through token transfers | `nonReentrant` + checks-effects-interactions; the engine records exposure before any token moves | `CoverageEngine`, `LendingAdapter` |
| Front-run a challenge to steal the bond | the bond goes to `msg.sender` of the first valid challenge; discovering the counterexample is the work, and it is permissionless by design | `CoverageEngine.applyBreach` |

Static analysis and fuzzing status: see the "Tests" section of the README. Foundry's fuzzer covers the
draw/validity boundary, the bond and capacity invariants (I-01…I-05). `forge lint` runs in CI.

## Economic assumptions worth arguing about

1. **`bond >= exposure`** (ratio floor 1.0×, currently exactly 1.0× by default). Below 1.0×, the rational
   borrower breaches on purpose, forfeits the bond and keeps the difference. This is a hard requirement
   in code, not a parameter anyone can loosen below 1.0× (`setRiskParameters` rejects it).
2. **A challenger needs gas, not capital.** The proof is the only credential and the bond goes to
   whoever lands the first valid challenge. If a challenge required matching the bond, the mechanism
   would only be available to the already-capitalised.
3. **Underwriters price counterparty risk.** They set a per-borrower multiplier (0.10×–5.00×, neutral
   1.00×) that feeds the quote. A poor multiplier is a price, not a restriction — the protocol does not
   decide who deserves coverage.
4. **No protocol fee is taken on the bond.** The whole bond goes to the challenger. Introducing a cut
   would weaken the incentive to police the system, which is the only thing standing between a false
   claim and a paid-out loan.

## Why the demo asset is not USDC

`DemoToken` (cxTUSD, 6 decimals, public faucet) exists so a reviewer can fund three wallets in three
transactions without hunting faucets. It is not a stablecoin and is never deployed to mainnet. The
protocol's accounting is asset-agnostic — the constructor takes an `IERC20` — so a testnet stablecoin
can be substituted at deployment without touching the contracts.

## Known limitations

- **Not deployed.** No live addresses yet; the deploy script is written and dry-run verified, but this
  release makes no claim about an on-chain deployment.
- **Unit tests use precompile doubles**, because verification happens in the node rather than in EVM
  bytecode. The doubles exercise *this protocol's* logic; the cryptography is exercised only by the
  live keyless check, which calls the real precompiles over `eth_call`.
- **A Foundry fork of CC3 cannot exercise the precompiles** (a fork copies state, not native precompile
  implementations) and CC3 headers do not carry `prevrandao`, so a default fork fails validation. Live
  verification therefore lives in `worker/scripts/live-precompile-check.mjs`, not in a Solidity test.
- **Predicates are per-transaction** (see above) — the largest honest gap in the design.
- **The market is a pricing curve, not an order book.** Underwriters do not yet compete on price.
- **Coverage windows are attested-range relative.** A position over a window the frontier has already
  passed is expired on arrival; the grace band (`defaultGraceBlocks`) is the knob that makes recent
  windows usable for a demo.

## Reporting

Find a hole? The right way to demonstrate it is a failing test in `contracts/test/` (the harness in
`test/helpers/BaseTest.sol` wires a full protocol in a few lines). That is faster and more convincing
than prose, and it is how the current attack matrix was assembled.
