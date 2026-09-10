# Roadmap — what is deliberately not built

Every item here is a conscious omission with a reason, not an oversight and not a TODO that was quietly
dropped. The checklist that drove this build says explicitly: "Only add this after the core mechanism is
bulletproof. A broken market is worse than a perfect deterministic pricing engine." The core is built,
verified on chain and running; these are the next layer, and they are named so a reviewer can judge the
plan rather than guess at the gaps.

## Why the market layer is a curve, not an order book

The protocol is called an exchange and the honest status is: **one half of the exchange exists.**

Built and live:
- underwriters supply bonded capacity (`deposit`, `withdraw` bounded by `lockedBond`),
- borrowers buy coverage at a price (`quote`, `purchase`),
- the premium is a deterministic function of exposure × base rate × duration multiplier × depth
  multiplier × counterparty multiplier, all in basis points, reproducible by anyone (`docs/ECONOMICS.md`),
- capacity is consumed as exposure is drawn and released on repayment.

Not built: competition on price. Two underwriters cannot bid for the same borrower's business, and there
is no order book. Calling that a market would be a claim the code cannot support, which is why every
description says "pricing curve" and `docs/ECONOMICS.md` says so in its own section.

**Next step, in order:**
1. **Competing underwriters** — an offer registry where underwriters publish (premium, bond, max exposure,
   duration, depth, counterparty) terms and borrowers select. No engine change is needed: the engine
   already snapshots terms per position, so this is a discovery and selection layer on top of `purchase`.
2. **Capacity aggregation** — several underwriters jointly backing one position with separate bonds. The
   engine's `applyBreach` would need to iterate contributing underwriters; the replay key already guards
   against a double payout.
3. **Dynamic pricing** — premium responding to capacity utilisation. Only meaningful once (1) exists.

## Deliberately not built

| Item | Why not | Cost of the omission |
|---|---|---|
| **Risk tranches** (senior/junior coverage) | complexity without score: it multiplies the state machine and the tests for a feature no judge can see in three minutes | the product has one risk class today |
| **Transferable coverage** | making positions tradable would break the counterparty binding, which is one of the two guards that makes the invariant meaningful. If a position can be reassigned, "this borrower may draw" stops being enforceable at the moment of the draw | coverage is non-transferable, so a borrower cannot hand their line to someone else — a deliberate constraint, not a gap |
| **Governance token** | coverage capacity is already the scarce object; a token would add a second claims on the same value and weaken the bond | none |
| **Protocol fee on seized bonds** | the whole bond goes to the challenger. A cut would reduce the only incentive standing between a false claim and a paid-out loan | the protocol has no revenue — correct at this stage |
| **Coverage portfolios** (a lender requiring several positions at once) | composes trivially from what exists — a lender can call `isValid` on N positions — so there is nothing to build, only a convention to document | a lender writes N checks instead of one |

## Frontend

Out of scope for this repository by instruction, and worth stating what a judge therefore does not see:
a UI. The contract surface exposes everything one needs — `getCoverage`, `isValid`, `previewDraw`,
`previewChallenge`, `exposureOf`, `windowClosed`, `freeBalance` — and the state changes are public on the
explorer, which is what the demo script (`docs/DEMO.md`) is built around.

If a frontend is added, the flow it should implement, in six screens:

1. **Market** — the capacity available to underwrite or buy, priced by the curve.
2. **Buy coverage** — exposure, window, required depth, premium, bond, counterparty and the invariant,
   then purchase.
3. **Draw** — the lender's view: `previewDraw` returns VALID or a named reason
   (FRONTIER_NOT_READY vs STATUS_BREACHED are different situations and deserve different copy).
4. **Attack** — the challenger's view: paste a source transaction, see `previewChallenge` say whether it
   breaches, then send it.
5. **Breach** — status BREACHED, the bond transfer, and the frozen draw, in one screen.
6. **Settlement** — a clean window, the frontier past `endBlock + depth`, bond released.

Landing copy is already written and unused: **"Buy guarantees. Don't trust promises."**

## What is missing before submission (not code)

| Item | State |
|---|---|
| Demo video | shot list and narration written — `docs/DEMO.md` |
| Deck PDF | content written across `README.md`, `INVARIANTS.md`, `SECURITY.md` and `docs/` — needs layout |
| Team details for the form | not started (names, contacts, bios, roles, countries) |
| Audit | none. Not claimed anywhere. |

## Sequencing rule for anything added later

The mechanism is verified on chain in both directions — a false claim destroyed, a clean claim settled.
Any change to `CoverageEngine`, `ChallengeManager` or the predicate interface invalidates the recorded
addresses, the explorer verification and the demo evidence, so the order is: extend by adding contracts
(the offer registry can be purely additive), never by editing the ones that are proven; and re-run
`forge test`, `verify-deployment.mjs`, `demo.mjs` and `attack-matrix.mjs --onchain` before claiming
anything about the new state.
