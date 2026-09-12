// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./helpers/BaseTest.sol";
import {ICoverage} from "../src/interfaces/ICoverage.sol";
import {CoverageEngine} from "../src/CoverageEngine.sol";
import {CoverageMarket} from "../src/CoverageMarket.sol";
import {OfferRegistry} from "../src/OfferRegistry.sol";
import {ProvenTx} from "./helpers/ProvenTx.sol";

/// @notice The offer surface. Publish, cancel, list, and purchase — each with the negatives the
///         registry has to refuse for the primitive to hold.
contract OfferRegistryTest is BaseTest {
    function _publish(address borrower, uint8 tranche, uint64 expiresAt) internal returns (uint256 id) {
        vm.prank(BOB);
        id = offers.publishOffer(
            borrower,
            CHAIN_KEY,
            DEPTH,
            EXPOSURE,
            BOND,
            END_BLOCK - START_BLOCK,
            expiresAt,
            SOURCE_CONTRACT,
            ProvenTx.transferTopic(),
            address(predicateProhibited),
            bytes32(uint256(uint160(TREASURY))),
            tranche
        );
    }

    function test_PublishAndListReflectsActiveOffers() public {
        uint256 id = _publish(ALICE, 0, 0);
        assertEq(offers.activeOfferCount(), 1);
        OfferRegistry.Offer[] memory list = offers.listActiveOffers();
        assertEq(list.length, 1);
        assertEq(list[0].id, id);
        assertEq(list[0].underwriter, BOB);
        assertEq(list[0].borrower, ALICE);
    }

    function test_PurchaseOfferCreatesPosition() public {
        uint256 offerId = _publish(ALICE, 0, 0);
        vm.prank(ALICE);
        uint256 covId = market.purchaseOffer(offerId, START_BLOCK);

        ICoverage.Coverage memory c = engine.getCoverage(covId);
        assertEq(c.borrower, ALICE);
        assertEq(c.underwriter, BOB);
        assertEq(c.bond, BOND);
        assertEq(c.maxExposure, EXPOSURE);
        assertEq(engine.contributorCount(covId), 1);

        OfferRegistry.Offer memory o = offers.getOffer(offerId);
        assertTrue(o.filled, "offer is filled");
        assertEq(offers.activeOfferCount(), 0);
    }

    function test_OpenOfferAnyBorrowerCanBuy() public {
        uint256 offerId = _publish(address(0), 0, 0);
        // Fund a fresh borrower to avoid perturbing the test with token faucets.
        address CHARLIE = makeAddr("charlie");
        token.faucet(CHARLIE, 1_000_000e6);
        vm.prank(CHARLIE);
        token.approve(address(market), type(uint256).max);

        vm.prank(CHARLIE);
        uint256 covId = market.purchaseOffer(offerId, START_BLOCK);
        assertEq(engine.getCoverage(covId).borrower, CHARLIE);
    }

    function test_WrongBorrowerCannotBuyTargetedOffer() public {
        uint256 offerId = _publish(ALICE, 0, 0);
        vm.prank(DAVE);
        vm.expectRevert(CoverageMarket.NotTheCounterparty.selector);
        market.purchaseOffer(offerId, START_BLOCK);
    }

    function test_CancelThenPurchaseIsRefused() public {
        uint256 offerId = _publish(ALICE, 0, 0);
        vm.prank(BOB);
        offers.cancelOffer(offerId);

        vm.prank(ALICE);
        vm.expectRevert(CoverageMarket.OfferUnavailable.selector);
        market.purchaseOffer(offerId, START_BLOCK);
    }

    function test_OnlyUnderwriterCancels() public {
        uint256 offerId = _publish(ALICE, 0, 0);
        vm.prank(DAVE);
        vm.expectRevert(OfferRegistry.NotAuthorized.selector);
        offers.cancelOffer(offerId);
    }

    function test_ExpiredOfferIsRefused() public {
        uint256 offerId = _publish(ALICE, 0, uint64(block.timestamp + 100));
        vm.warp(block.timestamp + 101);

        vm.prank(ALICE);
        vm.expectRevert(CoverageMarket.OfferExpired.selector);
        market.purchaseOffer(offerId, START_BLOCK);

        assertEq(offers.activeOfferCount(), 0, "expired offers are inactive in listing");
    }

    function test_DoubleFillIsRefused() public {
        uint256 offerId = _publish(ALICE, 0, 0);
        vm.prank(ALICE);
        market.purchaseOffer(offerId, START_BLOCK);

        vm.prank(ALICE);
        vm.expectRevert(CoverageMarket.OfferUnavailable.selector);
        market.purchaseOffer(offerId, START_BLOCK);
    }

    function test_MarkFilledIsMarketOnly() public {
        uint256 offerId = _publish(ALICE, 0, 0);
        vm.expectRevert(OfferRegistry.NotAuthorized.selector);
        offers.markFilled(offerId, 1);
    }

    function test_JuniorOfferChargesMoreThanSenior() public {
        uint256 seniorPremium = market.quoteTranche(EXPOSURE, END_BLOCK - START_BLOCK, DEPTH, BOB, ALICE, 0);
        uint256 juniorPremium = market.quoteTranche(EXPOSURE, END_BLOCK - START_BLOCK, DEPTH, BOB, ALICE, 1);
        assertGt(juniorPremium, seniorPremium, "JUNIOR must cost more than SENIOR");
    }
}
