# Judge packet

Everything a reviewer needs, in the order they will ask it. Every link and number here resolves; none of
it is a projection. Full machine-readable index: `evidence.json`.

## 1. What is it?

A market for **bonded coverage over a range of cross-chain state**. An underwriter locks a bond behind a
claim about a window of source-chain blocks; a lender releases exposure only while that claim is valid;
anyone who proves one contradicting transaction inside the window takes the bond, atomically.

Not a credit score. A score summarises the past and cannot be wrong later, so nobody can be paid for
catching it out. This is a claim about a specific window that one transaction can destroy, and the party
who destroys it is paid.

## 2. What is new?

Four properties, none of which the surrounding field combines:

1. **Coverage is sold to a lender against a third party's future behaviour** — not insurance against an
   event on oneself, which is what the proof-triggered-payout cluster does.
2. **Capacity is a priced instrument.** The premium is a function of window length, required attestation
   depth and counterparty; capacity is consumed as exposure is drawn.
3. **The challenge *is* the mechanism.** One proof, one transaction, bond transferred, draws frozen —
   no claims process, no dispute window, no committee.
4. **Validity is computed from the attested frontier on every read**, so there is no keeper to bribe,
   forget or front-run, and no stored flag that can go stale.

Boundary against the nearest work in this field, stated as mechanism differences rather than adjectives:
`docs/COMPARISON.md`.

## 3. Why Attestcoin?

Because the thing being sold is a claim about *history*, and the protocol must be able to establish that
the claimed window was actually observed — and then be contradicted by a specific transaction inside it.

- **ChainInfo (`0x0FD3`)** answers "has the frontier reached this height?" — that is what makes the
  coverage window auditable rather than asserted. Used by `AttestcoinAdapter.frontierReached`, and by
  `CoverageEngine.isValid` on every draw.
- **Block Prover (`0x0FD2`)** answers "did this exact transaction happen in this block?" — that is what
  makes a counterexample admissible. Used with the state-changing `verifyAndEmit` on the money path and
  the free `verify` view for preflight.
- **`calculateTxIndex`** recovers a transaction's position inside its block from the merkle path shape, so
  the replay key cannot be claimed by a submitter.

Remove Attestcoin and this is an unverifiable promise. There is no fallback path: if the frontier cannot be
read, the position is not valid and the protocol says so (`FRONTIER_UNAVAILABLE`), rather than assuming.

Deployed on **Creditcoin CC3 testnet, chainId 102031**. Detail: `docs/ATTESTCOIN.md`.

## 4. What is the invariant?

```
isValid(id)  iff
      ChainInfo(chainKey).is_height_attested(endBlock + requiredDepth) is reachable
  AND frontier <= liveUntilHeight
  AND status != BREACHED, != SETTLED
  AND drawn < maxExposure
```

and at creation: `bond >= maxExposure × coverageRatioBps / 10 000` (floor 1.0×), `capacity >= maxExposure`,
and the bond is actually locked (`freeBalance >= bond`).

Fifteen numbered invariants, each mapped to the test that enforces it: `INVARIANTS.md`.

## 5. What is the attack, and what happens?

A challenger submits a proven counterexample. In one transaction the contract verifies inclusion and
continuity through the precompile, decodes the receipt, **requires the source transaction to have
succeeded**, gates on the contracted emitter, evaluates the position's predicate, checks the block is
inside the window, consumes a replay key derived from the proof, and then transfers the bond to the
challenger and freezes the position.

Live, on the deployed contracts:

```
REJECTED  draw against an unknown position                UnknownCoverage(999999)
REJECTED  draw as a different counterparty                NotTheCounterparty()
REJECTED  draw above the position maximum                 CoverageNotValid(CAPACITY_EXCEEDED)
REJECTED  underwriter withdraws the locked bond           InsufficientFreeBalance(2904000000000, 2904000000001)
REJECTED  create a position with bond < exposure           BondBelowExposure(1000000, 10000000000)
REJECTED  stranger calls wireModules                      OwnableUnauthorizedAccount(0xc044…1130)
REJECTED  challenge with a fabricated proof               Merkle proof validation failed
REJECTED  challenge with a real proof, wrong chainKey      WrongChain(1, 3)
REJECTED  challenge with a valid proof outside the window  BlockOutsideWindow(11671129, 11671130, 11671130)
REJECTED  challenge with proof of a reverted source tx     TransactionFailed(0)
REJECTED  replay the counterexample on a breached position NotLive()          tx 0x65a8bc7f…2be7
REJECTED  draw against a breached position                 CoverageNotValid(STATUS_BREACHED)  tx 0xb62ce5ed…fbfa
REJECTED  settle a breached position                       OutstandingExposure(10000000000)
REJECTED  settle with exposure outstanding                 OutstandingExposure(4000000000)
REJECTED  re-run the one-time module wiring                ModulesAlreadyWired()

15/15 attacks refused
```

Two of those refusals are **real transactions that failed on chain** (status 0) — linkable, not simulated.
Reproduce the whole matrix yourself: `node worker/scripts/attack-matrix.mjs --onchain`.

## 6. Is it real?

Yes, on testnet, and independently checkable:

| | |
|---|---|
| Contracts | 9 deployed, **all verified on the explorer** (`is_verified: true`) |
| Deployment check | `node worker/scripts/verify-deployment.mjs` → **19/19**, incl. our own adapter reading the live frontier (height 11,674,170) |
| Mechanism, live | `node worker/scripts/demo.mjs` → purchase, draw, real proof, challenge, bond paid, blocked draw, clean settlement |
| Attestcoin, live | `node worker/scripts/live-precompile-check.mjs` → **7/7**, real proof accepted, tampered proof rejected |
| Contract tests | `forge test` → **48 passed, 0 failed** |
| Explorer verification | 9/9 contracts verified |

Addresses, and every transaction hash, in `evidence.json`.

### Can I see it without a terminal?

Yes — it is deployed, so nothing needs to be installed:

**<https://coverage-exchange.vercel.app>**

| Route | What it shows |
|---|---|
| `/` | the mechanism and the invariant, with Ethereum's attested frontier read live in the header |
| `/dashboard` | four views of the deployed engine: **Overview** (bond, exposure, drawn, the per-position invariant, covered windows against the live frontier), **Positions** (every position with the validity reason from `isValid`), **Attack matrix** (all 15 attempts and the revert each one hit), **Contracts** (the 9 verified deployments) |

The console reads Creditcoin CC3 from your browser. If the RPC is unreachable it says so rather
than showing a stale number, so an empty state on that page is a real signal, not a broken deploy.

To run it yourself instead: `cd web && npm install && npm run dev`.

Two things about this UI are deliberate and worth a reviewer's attention:

- **It holds no on-chain facts of its own.** `web/lib/evidence.generated.ts` is generated from
  `evidence.json` and `worker/evidence/*.json` before every build, and CI fails if the committed copy
  differs (`npm run check:evidence`). The interface physically cannot claim a transaction hash, address
  or gas number that the scripts did not record. Given that this project exists because software says
  "success" without proving it, a UI free to invent its own numbers would have been the wrong artifact.
- **It is read-only.** It renders state; it never sends a transaction. The wallets live in `worker/`.

## 7. Is it reusable?

`docs/INTEGRATION.md`. The whole integration is one call in the transaction that moves funds:

```solidity
(bool ok, ICoverage.Reason reason) = engine.isValid(coverageId);
require(ok, "no valid coverage");
```

`Reason` is an enum, so a consumer distinguishes *pending attestation* from *breached*. `LendingAdapter`
in this repository is a worked example of a protocol whose capital cannot leave except against a valid
position, and `CoverageMarket` is a second consumer of the same primitive. A new invariant is a small
pure contract implementing `IPredicate`; `docs/INTEGRATION.md` shows the shape.

## 8. Does it survive adversarial input?

The matrix in §5 is the answer, and it runs against the live deployment, not a mock. Underneath it:
48 contract tests including the counterexample suite A–H, fuzzed invariants I-01…I-05, the lookalike-emitter
case, the reverted-source-transaction case, replay scoping across positions, and the challenger race.

Known limits, stated rather than discovered — `SECURITY.md`:

- **A predicate sees one proven transaction.** It cannot read source-chain state, cannot sum history and
  cannot compare two transactions. Any claim of an arbitrary off-chain invariant from a single proof is
  overclaiming; this repository says so in writing and shows the honest pattern instead.
- The market is a **deterministic pricing curve**, not an order book. Underwriters do not yet compete.
- The measurement that is easiest to overstate: continuity compression is **30.1%**, not orders of
  magnitude (`docs/GAS.md`).
- Not audited. Testnet only.

## 9. The one-sentence version

> Coverage Exchange lets capital providers sell bonded, cross-chain coverage over a defined state window;
> Attestcoin establishes the window's evidentiary frontier, and any participant can atomically destroy a
> false coverage claim by proving one counterexample inside it.
