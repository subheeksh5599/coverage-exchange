// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./helpers/BaseTest.sol";
import {ICoverage} from "../src/interfaces/ICoverage.sol";
import {CoverageMarket} from "../src/CoverageMarket.sol";
import {ProvenTx} from "./helpers/ProvenTx.sol";

/// @notice The utilization dimension of the pricing curve. As an underwriter's locked bond climbs
///         relative to their balance, the same coverage costs more, monotonically, up to a cap.
///         Everything is deterministic from public state: no oracle, no timestamp.
contract DynamicPricingTest is BaseTest {
    function test_ZeroUtilizationGivesBaseRate() public view {
        // Fresh BOB has zero locked bond. utilizationMultiplier == utilBaseBps (10_000 = 1.00x).
        assertEq(market.utilizationMultiplierBps(BOB), 10_000);

        // The regular quote (no utilization) matches the tranche-aware SENIOR quote (tranche mult 1x).
        uint256 q1 = market.quote(EXPOSURE, END_BLOCK - START_BLOCK, DEPTH, BOB, ALICE);
        uint256 q2 = market.quoteTranche(EXPOSURE, END_BLOCK - START_BLOCK, DEPTH, BOB, ALICE, 0);
        assertEq(q1, q2);
    }

    function test_UtilizationRaisesPremiumMonotonically() public {
        uint256 basePremium = market.quote(EXPOSURE, END_BLOCK - START_BLOCK, DEPTH, BOB, ALICE);

        // Lock a bond so utilization becomes positive.
        buyDefault();
        uint256 midPremium = market.quote(EXPOSURE, END_BLOCK - START_BLOCK, DEPTH, BOB, ALICE);
        assertGt(midPremium, basePremium, "positive utilization raises the premium");

        // Lock more bond. Utilization climbs, so does the premium.
        ICoverage.CreateParams memory p = defaultParams();
        // Recompute the premium at the current utilization so purchase() succeeds.
        p.premium = market.quote(EXPOSURE, END_BLOCK - START_BLOCK, DEPTH, BOB, ALICE);
        vm.prank(ALICE);
        market.purchase(p);

        uint256 highPremium = market.quote(EXPOSURE, END_BLOCK - START_BLOCK, DEPTH, BOB, ALICE);
        assertGt(highPremium, midPremium, "more locked bond -> higher premium");
    }

    function test_UtilizationIsCappedAtUtilCap() public {
        // Set a curve with a low cap and steep per-util slope, so a moderate utilization pushes into
        // the cap. The important assertion is that the accessor NEVER exceeds the declared cap.
        CoverageMarket.PricingCurve memory c = CoverageMarket.PricingCurve({
            baseRateBps: 50,
            durationBaseBps: 10_000,
            durationPerBlockBps: 5,
            durationCapBps: 30_000,
            depthBaseBps: 10_000,
            depthPerBlockBps: 25,
            depthCapBps: 20_000,
            trancheJuniorMultiplierBps: 15_000,
            utilBaseBps: 10_000,
            utilPerBpsUtilBps: 65_535, // uint16 max slope -> saturates quickly
            utilCapBps: 10_100 // hard cap only 100bps above base
        });
        market.setCurve(c);

        // Any nonzero utilization must land at the cap under this curve.
        buyDefault();
        assertEq(market.utilizationMultiplierBps(BOB), 10_100, "capped exactly at utilCapBps");
    }

    function test_UtilizationMultiplierNeverBelowBase() public {
        // A fresh address with zero balance: the accessor returns the base rate, not a division-by-
        // zero revert. This is the fail-safe that keeps `quote()` callable during initial pricing.
        address fresh = makeAddr("freshUnderwriter");
        assertEq(market.utilizationMultiplierBps(fresh), 10_000);
    }
}
