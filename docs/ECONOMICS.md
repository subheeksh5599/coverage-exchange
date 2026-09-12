# Economics

The protocol's money rules, as equations, with the numbers actually deployed. Everything here is
integers and basis points — no floating point, no oracle, no model.

## Notation

| Symbol | Meaning |
|---|---|
| `E` | `maxExposure` — the largest exposure a position can unlock |
| `B` | `bond` — collateral locked from the underwriter for this position |
| `ρ` | `coverageRatioBps` — required bond/backing ratio (basis points, `10 000` = 1.0×) |
| `C` | `capacity` — funded coverage capacity (`C >= E`) |
| `D` | `drawn` — exposure currently unlocked under the position |
| `W = end − start` | window length in source-chain blocks |
| `d` | `requiredDepth` — attestation depth the frontier must pass `end` by |
| `g` | `defaultGraceBlocks` — blocks of slack after `end + d` during which the position may still gate |
| `κ` | counterparty multiplier set by the underwriter (basis points) |

## 1. Creation constraints

```
B >= ⌈E × ρ / 10 000⌉                 (I-04: the bond must cover what it gates)
C >= E                                (capacity must cover the maximum exposure)
freeBalance(underwriter) = balance − lockedBond >= B     (the bond is actually locked, I-03)
start < end                           (a non-empty window)
```

With the deployed defaults (`ρ = 10 000`), a 10,000 position requires a bond of at least 10,000. Below
1.0× breaching becomes rational: draw `E`, forfeit `B`, keep `E − B`. `setRiskParameters` refuses any
ratio below 1.0×, so this is a hard floor rather than a default that can be quietly weakened.

## 2. Premium (a deterministic price curve, not a market)

```
riskBps      = baseRateBps × durationMultiplierBps / 10 000
                          × depthMultiplierBps    / 10 000
                          × counterpartyBps       / 10 000
                          × utilizationMultiplierBps(U) / 10 000
                          × trancheMultiplierBps(t)     / 10 000

premium      = E × riskBps / 10 000
```

where

```
durationMultiplierBps(W)     = min(durationBaseBps    + durationPerBlockBps    × W, durationCapBps)
depthMultiplierBps(d)        = min(depthBaseBps       + depthPerBlockBps       × d, depthCapBps)
utilizationMultiplierBps(U)  = min(utilBaseBps        + utilPerBpsUtilBps      × u / 10 000, utilCapBps)
   where u = lockedBond(U) × 10 000 / max(underwriterBalance(U), 1)   // 0..10 000
trancheMultiplierBps(t)      = t == JUNIOR ? trancheJuniorMultiplierBps : 10 000
```

Deployed constants (in `CoverageMarket.curve`):

| Constant | Value | Meaning |
|---|---|---|
| `baseRateBps` | 50 | 0.50% of exposure at 1.00× multipliers |
| `durationBaseBps` | 10 000 | 1.00× at a zero-length window |
| `durationPerBlockBps` | 5 | +0.05% per source block ⇒ a 100-block window is 1.05× |
| `durationCapBps` | 30 000 | 3.00× ceiling |
| `depthBaseBps` | 10 000 | 1.00× at zero required depth |
| `depthPerBlockBps` | 25 | +0.25% per block of depth ⇒ depth 32 is 1.08× |
| `depthCapBps` | 20 000 | 2.00× ceiling |
| `trancheJuniorMultiplierBps` | 15 000 | 1.50× premium for a junior tranche (slashed first) |
| `utilBaseBps` | 10 000 | 1.00× at zero utilization |
| `utilPerBpsUtilBps` | 10 000 | +1.00× per full utilization ⇒ 2.00× at 100% utilization |
| `utilCapBps` | 25 000 | 2.50× ceiling |

**Worked example** — exposure 10,000, window 100 blocks, depth 32, neutral counterparty:

```
riskBps = 50 × 10 500/10 000 × 10 800/10 000 × 10 000/10 000 = 56.7 bps
premium = 10 000 × 56.7 / 10 000 ≈ 56.7
```

`quote()` is a pure function, so any reviewer recomputes the same number, and `purchase()` rejects a
premium that does not equal the quote exactly (`AttackMatrixTest.test_TamperedPremiumIsRefused`).

**Monotonicity** is the property that makes this a risk price rather than a sticker: a longer window and
a deeper attestation requirement both cost strictly more (`test_LongerWindowAndDeeperAttestationCostMore`
asserts both directions), utilization raises the premium monotonically (`DynamicPricing.t.sol`), and a
junior tranche costs `trancheJuniorMultiplierBps / 10 000` more than the equivalent senior offer
(`test_JuniorOfferChargesMoreThanSenior`).

**This is now a market**, in the sense the roadmap called for: `OfferRegistry` lets several underwriters
publish competing offers against the same borrower and window; `purchaseAggregated` combines several
compatible offers into one position backed by each underwriter's separate bond; the utilization multiplier
makes an under-used underwriter cheaper than one whose book is full, so quotes visibly respond to the
supply side rather than sitting on a fixed curve.

## 3. Counterparty pricing

Underwriters publish `counterpartyMultiplierBps[underwriter][borrower]`, bounded to 0.10×–5.00×, neutral
1.00× when unset. It is a price signal only: it cannot make coverage valid, cannot breach a position and
cannot move money. Underwriting judgement stays where the risk sits — with the underwriter.

## 4. Capacity accounting

```
availableCapacity(U) = balance(U) − lockedBond(U)          (what may be withdrawn)
lockedBond(U)        = Σ bond(positions of U that are not yet terminal)
consumed(id)         = drawn(id) ≤ maxExposure(id)
```

An underwriter can withdraw only `availableCapacity`. Tested by fuzz: for arbitrary deposits and bond
sizes, a withdrawal of `availableCapacity + 1` always reverts (`I-03`).

## 5. Breach and settlement

```
on breach:      status = BREACHED
                lockedBond(underwriter) −= B
                balance(underwriter)     −= B
                transfer B → challenger                    (100% of the bond, no protocol cut)
                further draws revert

on settle:      requires drawn == 0 and the window closed at the required depth
                status = SETTLED
                lockedBond(underwriter) −= B               (B returns to the underwriter's free balance)
```

No protocol fee is taken from the bond. A cut would reduce the incentive to police false claims, and that
incentive is the only thing standing between a false position and a paid-out loan.

## 6. Why these numbers, and what they cost

| Choice | Reason | Cost accepted |
|---|---|---|
| bond ratio floor at 1.0× | makes breaching unprofitable | a borrower with a good story still posts a full-size bond — no capital efficiency |
| pricing by window length and depth | both increase what the underwriter cannot see | a long window is expensive, which pushes users to short windows and more frequent re-pricing |
| `liveUntilHeight = end + d + g` with `g = 10 000` | evidence needs time to mature, and a demo window must be usable shortly after it closes | a position stays drawable for a while after its window closes; `g` is the knob |
| whole bond to the challenger | maximal incentive to find false claims | no treasury, so the protocol has no revenue — by design at this stage |

## 7. Aggregation and tranches

An aggregated position is created by `purchaseAggregated([offerId1, offerId2, ...])`. The registry
refuses baskets whose non-numeric terms disagree (chain, depth, window length, source contract,
predicate, predicate params), and every contributor's bond is locked from its own engine deposit
inside the same transaction. On breach, `applyBreach` iterates contributors and pays the challenger
the **sum of bonds**; junior contributors are accounted first inside the same transfer (visible via
the `ContributorSlashed` event order). Settlement releases every contributor's locked bond.

**Fuzz invariant** — `I-06 aggregatedBond == Σ contributorBonds` (`testFuzz_I06_AggregatedBondEqualsSumOfContributors`).

## 8. What is still deliberately not built

Transferable coverage would break the counterparty binding that makes the invariant meaningful.
A governance token adds a second claim on the value the bond already secures. A protocol fee on
seized bonds reduces the only incentive standing between a false claim and a paid-out loan.
None of these are on the roadmap: they are non-goals with named reasons in `SECURITY.md`.
