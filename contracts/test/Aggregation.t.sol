// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {BaseTest} from "./helpers/BaseTest.sol";
import {ICoverage} from "../src/interfaces/ICoverage.sol";
import {CoverageEngine} from "../src/CoverageEngine.sol";
import {CoverageMarket} from "../src/CoverageMarket.sol";
import {OfferRegistry} from "../src/OfferRegistry.sol";
import {ProvenTx} from "./helpers/ProvenTx.sol";

/// @notice Aggregated positions: two underwriters back one position, breach pays the challenger
///         the sum of bonds, junior loses accounting priority, settle releases both, and mismatched
///         offer terms are refused.
contract AggregationTest is BaseTest {
    address EVE = makeAddr("eve"); // second underwriter (JUNIOR)

    uint256 constant EXP_A = 6_000e6;
    uint256 constant BOND_A = 7_200e6; // SENIOR contributor (BOB)
    uint256 constant EXP_B = 4_000e6;
    uint256 constant BOND_B = 4_800e6; // JUNIOR contributor (EVE)

    function setUp() public override {
        super.setUp();
        token.faucet(EVE, 1_000_000e6);
        vm.prank(EVE);
        token.approve(address(engine), type(uint256).max);
        vm.prank(EVE);
        engine.deposit(500_000e6);
    }

    function _publish(address underwriter, address borrower, uint256 exposure, uint256 bond, uint8 tranche)
        internal
        returns (uint256 id)
    {
        vm.prank(underwriter);
        id = offers.publishOffer(
            borrower,
            CHAIN_KEY,
            DEPTH,
            exposure,
            bond,
            END_BLOCK - START_BLOCK,
            0,
            SOURCE_CONTRACT,
            ProvenTx.transferTopic(),
            address(predicateProhibited),
            bytes32(uint256(uint160(TREASURY))),
            tranche
        );
    }

    function _publishTwoMatchedOffers() internal returns (uint256[] memory ids) {
        ids = new uint256[](2);
        ids[0] = _publish(BOB, ALICE, EXP_A, BOND_A, 0);
        ids[1] = _publish(EVE, ALICE, EXP_B, BOND_B, 1);
    }

    function test_AggregatedPositionSumsBondsAndExposure() public {
        uint256[] memory ids = _publishTwoMatchedOffers();

        vm.prank(ALICE);
        uint256 covId = market.purchaseAggregated(ids, START_BLOCK);

        ICoverage.Coverage memory c = engine.getCoverage(covId);
        assertEq(c.underwriter, address(0), "aggregated position has no single underwriter");
        assertEq(c.bond, BOND_A + BOND_B);
        assertEq(c.maxExposure, EXP_A + EXP_B);

        CoverageEngine.Contributor[] memory list = engine.contributorsOf(covId);
        assertEq(list.length, 2);
        assertEq(list[0].underwriter, BOB);
        assertEq(list[1].underwriter, EVE);

        assertEq(engine.lockedBond(BOB), BOND_A);
        assertEq(engine.lockedBond(EVE), BOND_B);
    }

    function test_BreachPaysChallengerSumOfBondsAndJuniorAccountedFirst() public {
        uint256[] memory ids = _publishTwoMatchedOffers();
        vm.prank(ALICE);
        uint256 covId = market.purchaseAggregated(ids, START_BLOCK);

        bytes memory evidence = transferEvidence(START_BLOCK + 10, TREASURY, 5_000e6, 1);

        // Watch the per-contributor slash events: JUNIOR (EVE) fires before SENIOR (BOB).
        vm.recordLogs();
        uint256 carolBefore = token.balanceOf(CAROL);
        vm.prank(CAROL);
        challenges.challenge(
            covId, CHAIN_KEY, START_BLOCK + 10, evidence, dummyMerkleProof(), dummyContinuityProof()
        );

        assertEq(token.balanceOf(CAROL), carolBefore + BOND_A + BOND_B, "challenger paid the sum");
        assertEq(engine.lockedBond(BOB), 0);
        assertEq(engine.lockedBond(EVE), 0);

        // Junior first: scan the ContributorSlashed events in order and check the tranche sequence.
        bytes32 slashTopic = keccak256("ContributorSlashed(uint256,address,uint256,uint8)");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint8[] memory tranches = new uint8[](2);
        uint256 k;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == slashTopic) {
                (, uint8 tr) = abi.decode(logs[i].data, (uint256, uint8));
                tranches[k++] = tr;
            }
        }
        assertEq(k, 2, "two slash events");
        assertEq(tranches[0], 1, "JUNIOR slashed first");
        assertEq(tranches[1], 0, "SENIOR slashed second");
    }

    function test_SettleReleasesEveryContributor() public {
        uint256[] memory ids = _publishTwoMatchedOffers();
        vm.prank(ALICE);
        uint256 covId = market.purchaseAggregated(ids, START_BLOCK);

        setFrontier(END_BLOCK + DEPTH);
        engine.settle(covId);
        assertEq(engine.lockedBond(BOB), 0);
        assertEq(engine.lockedBond(EVE), 0);
    }

    function test_ContributorCannotWithdrawLockedPortion() public {
        uint256[] memory ids = _publishTwoMatchedOffers();
        vm.prank(ALICE);
        market.purchaseAggregated(ids, START_BLOCK);

        uint256 freeE = engine.freeBalance(EVE);
        vm.prank(EVE);
        vm.expectRevert(
            abi.encodeWithSelector(CoverageEngine.InsufficientFreeBalance.selector, freeE, freeE + 1)
        );
        engine.withdraw(freeE + 1);
    }

    function test_MismatchedOfferTermsAreRefused() public {
        // Same as _publishTwoMatchedOffers but the second offer has a different requiredDepth.
        uint256[] memory ids = new uint256[](2);
        ids[0] = _publish(BOB, ALICE, EXP_A, BOND_A, 0);
        vm.prank(EVE);
        ids[1] = offers.publishOffer(
            ALICE,
            CHAIN_KEY,
            DEPTH + 1, // <-- mismatch
            EXP_B,
            BOND_B,
            END_BLOCK - START_BLOCK,
            0,
            SOURCE_CONTRACT,
            ProvenTx.transferTopic(),
            address(predicateProhibited),
            bytes32(uint256(uint160(TREASURY))),
            1
        );

        vm.prank(ALICE);
        vm.expectRevert(CoverageMarket.OffersDoNotAggregate.selector);
        market.purchaseAggregated(ids, START_BLOCK);
    }

    function test_AggregatedInvariantBondEqualsSum() public {
        uint256[] memory ids = _publishTwoMatchedOffers();
        vm.prank(ALICE);
        uint256 covId = market.purchaseAggregated(ids, START_BLOCK);

        CoverageEngine.Contributor[] memory list = engine.contributorsOf(covId);
        uint256 sum;
        for (uint256 i; i < list.length; ++i) {
            sum += list[i].bond;
        }
        assertEq(sum, engine.getCoverage(covId).bond, "sum of contributor bonds == position bond");
    }
}

