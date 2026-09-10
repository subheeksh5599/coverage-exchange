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

premium      = E × riskBps / 10 000
```

where

```
durationMultiplierBps(W) = min(durationBaseBps + durationPerBlockBps × W, durationCapBps)
depthMultiplierBps(d)    = min(depthBaseBps    + depthPerBlockBps    × d, depthCapBps)
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

**Worked example** — exposure 10,000, window 100 blocks, depth 32, neutral counterparty:

```
riskBps = 50 × 10 500/10 000 × 10 800/10 000 × 10 000/10 000 = 56.7 bps
premium = 10 000 × 56.7 / 10 000 ≈ 56.7
```

`quote()` is a pure function, so any reviewer recomputes the same number, and `purchase()` rejects a
premium that does not equal the quote exactly (`AttackMatrixTest.test_TamperedPremiumIsRefused`).

**Monotonicity** is the property that makes this a risk price rather than a sticker: a longer window and
a deeper attestation requirement both cost strictly more (`test_PremiumReaches…` asserts both
directions). What it is *not*: a market. Underwriters do not compete on price, and the README says so.

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

## 7. What would make this a market

Deliberately not built: multiple underwriters competing on premium for the same borrower and window,
capacity aggregation across underwriters for a single position, and transferable coverage positions.
Those turn "Coverage Exchange" from a pricing curve into an exchange, and they are listed as roadmap
rather than claimed as done. A broken market is worse than a clean curve.
