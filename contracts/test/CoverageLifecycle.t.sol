// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./helpers/BaseTest.sol";
import {ICoverage} from "../src/interfaces/ICoverage.sol";
import {CoverageEngine} from "../src/CoverageEngine.sol";
import {LendingAdapter} from "../src/LendingAdapter.sol";

/// @notice The honest path, end to end: capacity is bonded, a position is bought, capital is drawn,
///         the window closes cleanly, the bond is released and the underwriter can withdraw again.
///         Without this suite the protocol would look like a machine that only takes bonds away.
contract CoverageLifecycleTest is BaseTest {
    function test_FullHonestPath_BondReleasedAfterCleanWindow() public {
        uint256 id = buyDefault();

        // Position is live: the window is in the future, which is what a lender insures.
        (bool ok, ICoverage.Reason r) = engine.isValid(id);
        assertTrue(ok, reasonName(r));

        // Draw the whole exposure.
        vm.prank(ALICE);
        lending.draw(id, EXPOSURE);
        (, uint256 remaining) = engine.exposureOf(id);
        assertEq(remaining, 0, "exposure fully consumed");

        // Repay, so capacity is reusable and the bond is not encumbered by outstanding debt.
        vm.prank(ALICE);
        lending.repay(id, EXPOSURE);

        // The attestation frontier moves past the window end + required depth: the window is now
        // fully evidenced, and nobody has produced a counterexample.
        setFrontier(END_BLOCK + DEPTH);

        assertTrue(engine.windowClosed(id), "window attested at the required depth");

        uint256 bondBefore = token.balanceOf(BOB);
        engine.settle(id);

        assertEq(token.balanceOf(BOB), bondBefore, "no transfer on settle: the bond was always BOB's");
        assertEq(engine.freeBalance(BOB), 500_000e6 - 0, "bond unlocked");

        ICoverage.Coverage memory c = engine.getCoverage(id);
        assertEq(uint256(c.status), uint256(ICoverage.Status.SETTLED));
        assertEq(engine.lockedBond(BOB), 0, "nothing left locked");
    }

    function test_UnderwriterWithdrawsOnlyAfterSettlement() public {
        uint256 id = buyDefault();

        // While the position is live the bond is locked: the underwriter's free balance excludes it.
        assertEq(engine.freeBalance(BOB), 500_000e6 - BOND, "bond is not free while it secures exposure");

        setFrontier(END_BLOCK + DEPTH);
        engine.settle(id);

        assertEq(engine.freeBalance(BOB), 500_000e6, "bond becomes withdrawable after settlement");

        // BOB holds the un-deposited half of the faucet plus the premium he earned; the withdrawal
        // must move exactly the deposited 500k and leave nothing locked.
        uint256 before = token.balanceOf(BOB);
        vm.prank(BOB);
        engine.withdraw(500_000e6);
        assertEq(token.balanceOf(BOB), before + 500_000e6, "underwriter recovered the full deposit");
        assertEq(engine.freeBalance(BOB), 0);
    }

    function test_MultipleDrawsShareOnePosition() public {
        uint256 id = buyDefault();

        vm.prank(ALICE);
        lending.draw(id, 4_000e6);
        vm.prank(ALICE);
        lending.draw(id, 6_000e6);

        (uint256 drawn, uint256 remaining) = engine.exposureOf(id);
        assertEq(drawn, EXPOSURE);
        assertEq(remaining, 0);

        // One more token would exceed the position's maximum exposure.
        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(
                LendingAdapter.CoverageNotValid.selector, ICoverage.Reason.CAPACITY_EXCEEDED
            )
        );
        lending.draw(id, 1);
    }

    function test_PremiumReachesTheUnderwriterAndIsSeparateFromTheBond() public {
        ICoverage.CreateParams memory p = defaultParams();
        uint256 premium = p.premium;
        assertGt(premium, 0);

        uint256 aliceBefore = token.balanceOf(ALICE);
        uint256 bobBefore = token.balanceOf(BOB);

        vm.prank(ALICE);
        market.purchase(p);

        assertEq(token.balanceOf(ALICE), aliceBefore - premium, "borrower pays the premium");
        assertEq(token.balanceOf(BOB), bobBefore + premium, "underwriter receives it");
        assertEq(engine.lockedBond(BOB), BOND, "the bond is locked separately from the premium");
    }

    function test_LongerWindowAndDeeperAttestationCostMore() public {
        uint256 shortPremium = market.quote(EXPOSURE, 100, DEPTH, BOB, ALICE);
        uint256 longPremium = market.quote(EXPOSURE, 1_000, DEPTH, BOB, ALICE);
        assertGt(longPremium, shortPremium, "duration must raise the premium");

        uint256 shallowPremium = market.quote(EXPOSURE, 100, 8, BOB, ALICE);
        uint256 deepPremium = market.quote(EXPOSURE, 100, 32, BOB, ALICE);
        assertGt(deepPremium, shallowPremium, "attestation depth must raise the premium");
    }
}
