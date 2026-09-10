# Integrating another protocol

Coverage is only load-bearing if someone else's money depends on it. This is the entire integration
surface — one view call in the same transaction that moves funds.

## The one-line integration

```solidity
import {ICoverage} from "./interfaces/ICoverage.sol";

contract YourLendingMarket {
    ICoverage public engine;

    function draw(address borrower, uint256 amount, uint256 coverageId) external {
        ICoverage.Coverage memory c = engine.getCoverage(coverageId);
        require(c.borrower == borrower, "coverage is bound to another counterparty");

        (bool ok, ICoverage.Reason reason) = engine.isValid(coverageId);
        require(ok, "no valid coverage");

        // …your own exposure accounting, then move funds…
    }
}
```

`isValid` returns `(false, Reason)` rather than reverting, and `Reason` is an enum, so a caller can
branch on the specific cause — `FRONTIER_UNAVAILABLE` (waiting on attestation) is a materially different
situation from `STATUS_BREACHED` (the position is dead). A UI should render the first as *pending* and
the second as *refused*.

## Reading a position

```solidity
ICoverage.Coverage memory c = engine.getCoverage(id);

c.borrower        // the only counterparty this position may cover
c.underwriter     // who is at risk
c.chainKey        // 1 = Sepolia, 3 = Ethereum mainnet
c.startBlock      // covered window (source-chain heights, inclusive)
c.endBlock
c.requiredDepth   // depth the frontier must pass endBlock by
c.liveUntilHeight // computed at creation: endBlock + requiredDepth + grace
c.maxExposure     // the ceiling on exposure this position can unlock
c.capacity        // funded capacity (>= maxExposure)
c.drawn           // exposure currently unlocked
c.bond            // locked collateral behind the claim
c.predicate       // the invariant module
c.predicateParams // packed parameters, snapshotted at purchase
c.sourceContract  // the only source-chain emitter accepted as evidence
c.eventSignature  // expected topic0
c.status          // ACTIVE | BREACHED | EXPIRED | SETTLED  (expiry recomputed on read)
c.challengeKey    // replay key of the counterexample that breached it, if any
```

Note what is **absent**: there is no field anyone can write after purchase, and no admin function that
changes any of the above. The position is immutable except for its lifecycle status and its `drawn`
counter.

## Preflight, for UIs and workers

```solidity
(bool ok, ICoverage.Reason reason) = engine.previewDraw(coverageId, borrower, amount);
(bool wouldBreach, string memory why) =
    challenges.previewChallenge(coverageId, chainKey, blockHeight, encodedTx, merkleProof, continuityProof);
```

Both are free, read-only, and use the precompile's `verify` view path for proofs. Both never revert on
hostile input — a payload that cannot be decoded is reported as "not a breach", because a payload that
cannot be decoded is not evidence. **Neither is a source of truth:** the money path re-runs every check
on-chain in the transaction that moves funds.

## Becoming an underwriter

```solidity
token.approve(address(engine), type(uint256).max);
engine.deposit(amount);                            // your capital, now backing capacity

market.setCounterpartyMultiplier(borrower, 11_000); // optional: 1.10x price for this borrower
```

`engine.withdraw(amount)` returns anything not currently locked. Attempting to withdraw locked bond
capital reverts — the capital that secures a live position cannot walk out from under it.

## Becoming a challenger

No permission, no stake, no allowlist, no registration:

```solidity
challenges.challenge(coverageId, chainKey, blockHeight, encodedTx, merkleProof, continuityProof);
```

If the proof is valid, the block is inside the window, the transaction succeeded, the emitter is the
contracted one and the predicate fires, the bond is transferred to `msg.sender` in the same transaction.
`worker/src/watch.mjs` is a reference watcher that does exactly this with no more privilege than any
other wallet.

## Wiring a new invariant

A predicate is a small pure contract:

```solidity
contract MyInvariant is PredicateLib {
    function id() external pure override returns (bytes32) { return keccak256("MyInvariant"); }

    function evaluate(bytes32 params, address expectedEmitter, bytes32 expectedTopic0, EvmV1Decoder.LogEntry[] calldata logs)
        external pure override returns (bool violated, string memory reason)
    {
        (bool found, uint256 i) = firstMatchingLog(expectedEmitter, expectedTopic0, logs); // the emitter gate
        if (!found) return (false, "no matching evidence log");
        // …decode, compare, decide…
    }
}
```

Read `SECURITY.md` §"What a predicate cannot see" first: a predicate sees **one proven transaction**. If
your invariant needs state (a ratio, a running total), the honest design is to have the source contract
emit that value and write a predicate over the event, rather than to claim the proof gives you state.
