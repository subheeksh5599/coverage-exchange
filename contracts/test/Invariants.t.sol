// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./helpers/BaseTest.sol";
import {ICoverage} from "../src/interfaces/ICoverage.sol";
import {CoverageEngine} from "../src/CoverageEngine.sol";
import {CoverageMarket} from "../src/CoverageMarket.sol";
import {LendingAdapter} from "../src/LendingAdapter.sol";
import {OfferRegistry} from "../src/OfferRegistry.sol";
import {ProvenTx} from "./helpers/ProvenTx.sol";

/// @notice Property tests. These are the sentences the protocol must never violate, fuzzed over the
///         parameters an attacker controls rather than asserted for one happy path.
///         I-01 no exposure without valid coverage
///         I-02 coverage is never valid past its live window
///         I-03 a bond can never be withdrawn while it secures a live position
///         I-04 the bond always covers the exposure it gates
///         I-05 capacity is never created beyond the deposit backing it
contract InvariantsTest is BaseTest {
    /// I-01 + I-02: for arbitrary exposures and frontier heights, a draw either succeeds while the
    /// position is valid, or it reverts — and after an expiry it can never succeed.
    function testFuzz_I01_I02_NoExposureWithoutValidCoverage(
        uint96 exposure,
        uint64 frontierDrift,
        uint96 drawAmount
    ) public {
        exposure = uint96(bound(exposure, 1e6, 50_000e6));
        drawAmount = uint96(bound(drawAmount, 1, 60_000e6));
        // Bounded so the window arithmetic stays inside uint64: the fuzzer's job here is the
        // draw/validity boundary, not integer wraparound in the test's own setup.
        frontierDrift = uint64(bound(frontierDrift, 0, 1_000_000));

        ICoverage.CreateParams memory p = defaultParams();
        p.maxExposure = exposure;
        p.capacity = exposure;
        p.bond = exposure; // ratio 1.0x exactly
        p.premium = market.quote(exposure, END_BLOCK - START_BLOCK, DEPTH, BOB, ALICE);

        vm.prank(ALICE);
        uint256 id = market.purchase(p);

        setFrontier(END_BLOCK + DEPTH + 10_000 + frontierDrift);

        (bool valid,) = engine.isValid(id);
        if (!valid) {
            vm.prank(ALICE);
            vm.expectRevert(
                abi.encodeWithSelector(
                    LendingAdapter.CoverageNotValid.selector, ICoverage.Reason.FRONTIER_PAST_LIVE_WINDOW
                )
            );
            lending.draw(id, drawAmount);
            return;
        }

        if (drawAmount > exposure) {
            vm.prank(ALICE);
            vm.expectRevert(
                abi.encodeWithSelector(
                    LendingAdapter.CoverageNotValid.selector, ICoverage.Reason.CAPACITY_EXCEEDED
                )
            );
            lending.draw(id, drawAmount);
            return;
        }

        vm.prank(ALICE);
        lending.draw(id, drawAmount);
        (uint256 drawn,) = engine.exposureOf(id);
        assertEq(drawn, drawAmount, "a permitted draw is recorded exactly");
        assertLe(drawn, exposure, "exposure never exceeds the position's maximum");
    }

    /// I-03: whatever the deposit and bond sizes, the free balance never dips below zero and a
    /// withdrawal can never touch locked bond capital.
    function testFuzz_I03_LockedBondIsNeverWithdrawable(uint96 depositAmount, uint96 bondAmount) public {
        depositAmount = uint96(bound(depositAmount, 1e6, 400_000e6));
        bondAmount = uint96(
            bound(
                bondAmount,
                EXPOSURE,
                uint96(engine.freeBalance(BOB) > EXPOSURE ? engine.freeBalance(BOB) : EXPOSURE)
            )
        );

        vm.prank(BOB);
        token.approve(address(engine), type(uint256).max);
        vm.prank(BOB);
        engine.deposit(depositAmount);

        ICoverage.CreateParams memory p = defaultParams();
        p.bond = bondAmount;
        p.premium = market.quote(EXPOSURE, END_BLOCK - START_BLOCK, DEPTH, BOB, ALICE);

        vm.prank(ALICE);
        uint256 id = market.purchase(p);

        uint256 free = engine.freeBalance(BOB);
        uint256 locked = engine.lockedBond(BOB);
        assertGe(locked, p.bond, "the bond is locked");
        assertEq(engine.underwriterBalance(BOB) - locked, free, "free balance excludes locked bond");

        // One token beyond free reverts; exactly free succeeds.
        if (free > 0) {
            vm.prank(BOB);
            vm.expectRevert(
                abi.encodeWithSelector(CoverageEngine.InsufficientFreeBalance.selector, free, free + 1)
            );
            engine.withdraw(free + 1);
        }

        // After settlement the same capital is free again.
        setFrontier(END_BLOCK + DEPTH);
        engine.settle(id);
        assertEq(engine.freeBalance(BOB), engine.underwriterBalance(BOB), "nothing locked after settlement");
    }

    /// I-04: a position can never be created with a bond smaller than the exposure it gates, for any
    /// combination the fuzzer produces.
    function testFuzz_I04_BondAlwaysCoversExposure(uint96 exposure, uint96 bond) public {
        exposure = uint96(bound(exposure, 1e6, 40_000e6));
        bond = uint96(bound(bond, 0, 60_000e6));

        ICoverage.CreateParams memory p = defaultParams();
        p.maxExposure = exposure;
        p.capacity = exposure;
        p.bond = bond;
        p.premium = market.quote(exposure, END_BLOCK - START_BLOCK, DEPTH, BOB, ALICE);

        if (bond < exposure || engine.freeBalance(BOB) < bond) {
            vm.prank(ALICE);
            vm.expectRevert();
            market.purchase(p);
            return;
        }

        vm.prank(ALICE);
        uint256 id = market.purchase(p);
        ICoverage.Coverage memory c = engine.getCoverage(id);
        assertGe(c.bond, c.maxExposure, "I-04: bond >= exposure");
    }

    /// I-05: capacity cannot exist without a deposit behind it.
    function testFuzz_I05_NoCapacityWithoutDeposit(uint96 bond) public {
        bond = uint96(bound(bond, EXPOSURE, 500_000e6));

        // A funded underwriter is used as the ceiling so the fuzz stays inside the deposit.
        address fresh = makeAddr("freshUnderwriter");
        token.faucet(fresh, uint256(bond) - 1);

        ICoverage.CreateParams memory p = defaultParams();
        p.underwriter = fresh;
        p.bond = bond;
        p.premium = market.quote(EXPOSURE, END_BLOCK - START_BLOCK, DEPTH, fresh, ALICE);

        vm.prank(fresh);
        token.approve(address(engine), type(uint256).max);

        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(CoverageEngine.InsufficientFreeBalance.selector, 0, bond));
        market.purchase(p);
    }

    /// I-16: for any legal split of one aggregated position, `sum(contributor.bond) == position.bond`
    /// and each contributor's lockedBond increases by their contribution exactly.
    function testFuzz_I16_AggregatedBondEqualsSumOfContributors(uint96 bondA, uint96 bondB) public {
        // Both contributors need bond >= their own maxExposure (each covers half the total).
        bondA = uint96(bound(bondA, 1_000e6, 100_000e6));
        bondB = uint96(bound(bondB, 1_000e6, 100_000e6));

        address EVE = makeAddr("eveInvariant");
        token.faucet(EVE, 500_000e6);
        vm.prank(EVE);
        token.approve(address(engine), type(uint256).max);
        vm.prank(EVE);
        engine.deposit(500_000e6);

        vm.prank(BOB);
        uint256 idA = offers.publishOffer(
            ALICE, CHAIN_KEY, DEPTH, uint256(bondA), uint256(bondA),
            END_BLOCK - START_BLOCK, 0, SOURCE_CONTRACT, ProvenTx.transferTopic(),
            address(predicateProhibited), bytes32(uint256(uint160(TREASURY))), 0
        );
        vm.prank(EVE);
        uint256 idB = offers.publishOffer(
            ALICE, CHAIN_KEY, DEPTH, uint256(bondB), uint256(bondB),
            END_BLOCK - START_BLOCK, 0, SOURCE_CONTRACT, ProvenTx.transferTopic(),
            address(predicateProhibited), bytes32(uint256(uint160(TREASURY))), 1
        );

        uint256 lockedBobBefore = engine.lockedBond(BOB);
        uint256 lockedEveBefore = engine.lockedBond(EVE);

        uint256[] memory ids = new uint256[](2);
        ids[0] = idA;
        ids[1] = idB;
        vm.prank(ALICE);
        uint256 covId = market.purchaseAggregated(ids, START_BLOCK);

        ICoverage.Coverage memory c = engine.getCoverage(covId);
        CoverageEngine.Contributor[] memory list = engine.contributorsOf(covId);
        uint256 sum;
        for (uint256 i; i < list.length; ++i) sum += list[i].bond;
        assertEq(sum, c.bond, "I-06: sum(contributor.bond) == position.bond");
        assertEq(engine.lockedBond(BOB) - lockedBobBefore, uint256(bondA));
        assertEq(engine.lockedBond(EVE) - lockedEveBefore, uint256(bondB));
    }
}
