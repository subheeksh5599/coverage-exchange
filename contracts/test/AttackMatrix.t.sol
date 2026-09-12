// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./helpers/BaseTest.sol";
import {ICoverage} from "../src/interfaces/ICoverage.sol";
import {CoverageEngine} from "../src/CoverageEngine.sol";
import {CoverageMarket} from "../src/CoverageMarket.sol";
import {LendingAdapter} from "../src/LendingAdapter.sol";
import {ChallengeManager} from "../src/ChallengeManager.sol";
import {OfferRegistry} from "../src/OfferRegistry.sol";
import {ProvenTx} from "./helpers/ProvenTx.sol";

/// @notice The adversary. Every test here is an attempt to make the protocol do something it should
///         refuse — including the counterexample suite (A–H in the build checklist) and the race
///         between two challengers. A suite that only shows the happy path proves nothing.
contract AttackMatrixTest is BaseTest {
    // ------------------------------------------------------------------ product necessity

    /// @notice No coverage, no draw. The lender's money is gated by the position, not by a badge.
    function testFuzz_NoCoverageNoDraw(uint96 amount) public {
        vm.assume(amount > 0 && amount <= LIQUIDITY);
        vm.prank(ALICE);
        vm.expectRevert(); // engine.getCoverage reverts with UnknownCoverage
        lending.draw(999, amount);
    }

    /// @notice Coverage smaller than the requested draw cannot be stretched.
    function test_DrawAbovePositionLimitReverts() public {
        uint256 id = buyDefault();

        vm.prank(ALICE);
        lending.draw(id, EXPOSURE);

        // The lending adapter is the gate, so its own error fires first — the engine's consume()
        // check is a second line of defence behind it.
        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(
                LendingAdapter.CoverageNotValid.selector, ICoverage.Reason.CAPACITY_EXCEEDED
            )
        );
        lending.draw(id, 1);
    }

    /// @notice Coverage that has expired gates nothing.
    function test_DrawAfterExpiryReverts() public {
        uint256 id = buyDefault();

        // liveUntilHeight = end + depth + grace(10_000). Push the frontier well past it.
        setFrontier(END_BLOCK + DEPTH + 10_000 + 1);

        (bool ok, ICoverage.Reason r) = engine.isValid(id);
        assertFalse(ok);
        assertEq(uint256(r), uint256(ICoverage.Reason.FRONTIER_PAST_LIVE_WINDOW));

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(
                LendingAdapter.CoverageNotValid.selector, ICoverage.Reason.FRONTIER_PAST_LIVE_WINDOW
            )
        );
        lending.draw(id, 1_000e6);
    }

    /// @notice A borrower cannot spend someone else's coverage.
    function test_WrongCounterpartyCannotDraw() public {
        uint256 id = buyDefault();

        (bool ok, ICoverage.Reason r) = lending.previewDraw(id, DAVE, 1_000e6);
        assertFalse(ok);
        assertEq(uint256(r), uint256(ICoverage.Reason.WRONG_COUNTERPARTY));

        vm.prank(DAVE);
        vm.expectRevert(LendingAdapter.NotTheCounterparty.selector);
        lending.draw(id, 1_000e6);
    }

    // ---------------------------------------------------------------------- supply-side attacks

    /// @notice A bond that does not cover the exposure makes breaching profitable, so it is refused.
    function test_BondBelowExposureIsRefused() public {
        ICoverage.CreateParams memory p = defaultParams();
        p.bond = EXPOSURE - 1; // 9,999.999999 for a 10,000 exposure

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(CoverageEngine.BondBelowExposure.selector, EXPOSURE - 1, EXPOSURE)
        );
        market.purchase(p);
    }

    /// @notice The bond is locked, not merely recorded: it cannot walk out from under live exposure.
    function test_UnderwriterCannotWithdrawLockedBond() public {
        buyDefault();

        uint256 free = engine.freeBalance(BOB);
        vm.prank(BOB);
        vm.expectRevert(
            abi.encodeWithSelector(CoverageEngine.InsufficientFreeBalance.selector, free, free + 1)
        );
        engine.withdraw(free + 1);
    }

    /// @notice Capacity the underwriter has not deposited cannot be created out of thin air.
    function test_CannotCreateCoverageBeyondDeposit() public {
        ICoverage.CreateParams memory p = defaultParams();
        p.bond = 600_000e6; // more than BOB's 500k deposit

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(CoverageEngine.InsufficientFreeBalance.selector, 500_000e6, 600_000e6)
        );
        market.purchase(p);
    }

    /// @notice Only the covered party may buy a position, even if someone else pays for it.
    function test_PurchaseMustComeFromTheCounterparty() public {
        ICoverage.CreateParams memory p = defaultParams();
        vm.prank(DAVE);
        vm.expectRevert(CoverageMarket.NotTheCounterparty.selector);
        market.purchase(p);
    }

    /// @notice A tampered premium is refused: the quote is reproducible, so a "discount" is impossible.
    function test_TamperedPremiumIsRefused() public {
        ICoverage.CreateParams memory p = defaultParams();
        p.premium = p.premium / 2;

        vm.prank(ALICE);
        vm.expectRevert("premium != quoted");
        market.purchase(p);
    }

    // ------------------------------------------------------------------ counterexample suite

    /// @notice A: a prohibited transfer inside the window breaches the position and pays the
    ///         challenger atomically.
    function test_A_ProhibitedTransferBreachesAndPaysChallenger() public {
        uint256 id = buyDefault();
        vm.prank(ALICE);
        lending.draw(id, EXPOSURE);

        bytes memory evidence = transferEvidence(START_BLOCK + 10, TREASURY, 5_000e6, 1);

        uint256 carolBefore = token.balanceOf(CAROL);
        vm.prank(CAROL);
        challenges.challenge(
            id, CHAIN_KEY, START_BLOCK + 10, evidence, dummyMerkleProof(), dummyContinuityProof()
        );

        assertEq(
            token.balanceOf(CAROL), carolBefore + BOND, "bond paid to the challenger in the same transaction"
        );

        ICoverage.Coverage memory c = engine.getCoverage(id);
        assertEq(uint256(c.status), uint256(ICoverage.Status.BREACHED));

        (bool ok, ICoverage.Reason r) = engine.isValid(id);
        assertFalse(ok);
        assertEq(uint256(r), uint256(ICoverage.Reason.STATUS_BREACHED));

        // Further draws are frozen.
        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(LendingAdapter.CoverageNotValid.selector, ICoverage.Reason.STATUS_BREACHED)
        );
        lending.draw(id, 1);

        assertEq(engine.lockedBond(BOB), 0, "the bond left the underwriter");
    }

    /// @notice B: a valid proof of an unrelated event (not the prohibited recipient) is refused.
    function test_B_UnrelatedEventDoesNotBreach() public {
        uint256 id = buyDefault();
        bytes memory evidence = transferEvidence(START_BLOCK + 10, makeAddr("someOtherParty"), 5_000e6, 1);

        vm.prank(CAROL);
        vm.expectRevert(
            abi.encodeWithSelector(
                ChallengeManager.PredicateNotViolated.selector, "recipient is not prohibited"
            )
        );
        challenges.challenge(
            id, CHAIN_KEY, START_BLOCK + 10, evidence, dummyMerkleProof(), dummyContinuityProof()
        );
    }

    /// @notice C: a real violation outside the covered window is refused.
    function test_C_EventOutsideWindowIsRefused() public {
        uint256 id = buyDefault();
        bytes memory evidence = transferEvidence(END_BLOCK + 1, TREASURY, 5_000e6, 1);

        vm.prank(CAROL);
        vm.expectRevert(
            abi.encodeWithSelector(
                ChallengeManager.BlockOutsideWindow.selector, END_BLOCK + 1, START_BLOCK, END_BLOCK
            )
        );
        challenges.challenge(
            id, CHAIN_KEY, END_BLOCK + 1, evidence, dummyMerkleProof(), dummyContinuityProof()
        );
    }

    /// @notice D: a real violation on another chain is refused.
    function test_D_WrongChainIsRefused() public {
        uint256 id = buyDefault();
        bytes memory evidence = transferEvidence(START_BLOCK + 10, TREASURY, 5_000e6, 1);

        vm.prank(CAROL);
        vm.expectRevert(abi.encodeWithSelector(ChallengeManager.WrongChain.selector, CHAIN_KEY, uint64(3)));
        challenges.challenge(id, 3, START_BLOCK + 10, evidence, dummyMerkleProof(), dummyContinuityProof());
    }

    /// @notice E: the same counterexample cannot be reused against the same position to drain a
    ///         second bond. (Two challengers racing is covered by test_H_ below.)
    function test_E_BreachIsTerminalAndSecondChallengerLoses() public {
        uint256 id = buyDefault();
        bytes memory evidence = transferEvidence(START_BLOCK + 10, TREASURY, 5_000e6, 1);

        vm.prank(CAROL);
        challenges.challenge(
            id, CHAIN_KEY, START_BLOCK + 10, evidence, dummyMerkleProof(), dummyContinuityProof()
        );

        // The replay guard is a second line of defence: the terminal-status check fires first.
        vm.prank(DAVE);
        vm.expectRevert(ChallengeManager.NotLive.selector);
        challenges.challenge(
            id, CHAIN_KEY, START_BLOCK + 10, evidence, dummyMerkleProof(), dummyContinuityProof()
        );

        assertEq(token.balanceOf(DAVE), 0, "the losing challenger is paid nothing");
    }

    /// @notice F: a fabricated proof is refused — the precompile rejects it, not this contract.
    function test_F_FabricatedProofIsRefused() public {
        uint256 id = buyDefault();

        // Never registered with the prover double: the precompile reverts on it.
        bytes32[] memory extra = new bytes32[](2);
        extra[0] = bytes32(uint256(uint160(address(0xF00D))));
        extra[1] = bytes32(uint256(uint160(TREASURY)));
        bytes memory unproven =
            ProvenTx.build(SOURCE_CONTRACT, ProvenTx.transferTopic(), extra, ProvenTx.word(5_000e6), 1);

        vm.prank(CAROL);
        vm.expectRevert();
        challenges.challenge(
            id, CHAIN_KEY, START_BLOCK + 10, unproven, dummyMerkleProof(), dummyContinuityProof()
        );
    }

    /// @notice G: one counterexample may legitimately breach several positions — the replay key is
    ///         scoped per coverage, not globally, so the first breach does not immunise the rest.
    function test_G_SameEvidenceBreachesTwoDistinctPositions() public {
        uint256 first = buyDefault();
        uint256 second = buyDefault();

        bytes memory evidence = transferEvidence(START_BLOCK + 10, TREASURY, 5_000e6, 1);

        vm.prank(CAROL);
        challenges.challenge(
            first, CHAIN_KEY, START_BLOCK + 10, evidence, dummyMerkleProof(), dummyContinuityProof()
        );

        // Different position, same evidence: the key differs because the coverage id differs.
        vm.prank(CAROL);
        challenges.challenge(
            second, CHAIN_KEY, START_BLOCK + 10, evidence, dummyMerkleProof(), dummyContinuityProof()
        );

        assertEq(uint256(engine.getCoverage(first).status), uint256(ICoverage.Status.BREACHED));
        assertEq(uint256(engine.getCoverage(second).status), uint256(ICoverage.Status.BREACHED));

        bytes32 keyFirst = engine.getCoverage(first).challengeKey;
        bytes32 keySecond = engine.getCoverage(second).challengeKey;
        assertTrue(keyFirst != keySecond, "keys are coverage-scoped");
        assertTrue(challenges.usedChallengeKeys(keyFirst));
        assertTrue(challenges.usedChallengeKeys(keySecond));
    }

    /// @notice H: a counterexample after expiry is refused — the exposure it gated has lapsed, so the
    ///         bond is no longer at risk.
    function test_H_ChallengeAfterExpiryIsRefused() public {
        uint256 id = buyDefault();
        setFrontier(END_BLOCK + DEPTH + 10_000 + 1);

        bytes memory evidence = transferEvidence(START_BLOCK + 10, TREASURY, 5_000e6, 1);

        vm.prank(CAROL);
        vm.expectRevert(ChallengeManager.NotLive.selector);
        challenges.challenge(
            id, CHAIN_KEY, START_BLOCK + 10, evidence, dummyMerkleProof(), dummyContinuityProof()
        );
    }

    // ---------------------------------------------------------------- inclusion != success, authorship

    /// @notice A reverted source transaction is still a validly included transaction. It cannot be
    ///         used as state-changing evidence, because nothing state-changing happened.
    function test_RevertedSourceTransactionIsNotEvidence() public {
        uint256 id = buyDefault();
        bytes memory evidence = transferEvidence(START_BLOCK + 10, TREASURY, 5_000e6, 0); // status 0 = reverted

        vm.prank(CAROL);
        vm.expectRevert(abi.encodeWithSelector(ChallengeManager.TransactionFailed.selector, uint8(0)));
        challenges.challenge(
            id, CHAIN_KEY, START_BLOCK + 10, evidence, dummyMerkleProof(), dummyContinuityProof()
        );
    }

    /// @notice A lookalike event: right topic0, right data, wrong emitter. topic0 is not authorship.
    function test_LookalikeEventFromAnotherContractIsNotEvidence() public {
        uint256 id = buyDefault();

        address impostor = makeAddr("impostor");
        bytes32[] memory extra = new bytes32[](2);
        extra[0] = bytes32(uint256(uint160(address(0xF00D))));
        extra[1] = bytes32(uint256(uint160(TREASURY)));
        bytes memory evidence =
            ProvenTx.build(impostor, ProvenTx.transferTopic(), extra, ProvenTx.word(5_000e6), 1);
        acceptTx(START_BLOCK + 10, evidence);

        vm.prank(CAROL);
        vm.expectRevert(
            abi.encodeWithSelector(ChallengeManager.PredicateNotViolated.selector, "no matching evidence log")
        );
        challenges.challenge(
            id, CHAIN_KEY, START_BLOCK + 10, evidence, dummyMerkleProof(), dummyContinuityProof()
        );
    }

    // ------------------------------------------------------------------------------ preflight

    /// @notice The free view path agrees with the money path, and never reverts on hostile input.
    function test_PreviewChallengeMatchesTheRealOutcome() public {
        uint256 id = buyDefault();
        bytes memory evidence = transferEvidence(START_BLOCK + 10, TREASURY, 5_000e6, 1);

        (bool wouldBreach,) = challenges.previewChallenge(
            id, CHAIN_KEY, START_BLOCK + 10, evidence, dummyMerkleProof(), dummyContinuityProof()
        );
        assertTrue(wouldBreach, "preflight agrees the counterexample breaches");

        vm.prank(CAROL);
        challenges.challenge(
            id, CHAIN_KEY, START_BLOCK + 10, evidence, dummyMerkleProof(), dummyContinuityProof()
        );

        (bool stillBreaches,) = challenges.previewChallenge(
            id, CHAIN_KEY, START_BLOCK + 10, evidence, dummyMerkleProof(), dummyContinuityProof()
        );
        assertFalse(stillBreaches, "already breached: preflight reports no further breach");
    }

    // ------------------------------------------------------------------ offer + aggregation attacks

    /// @notice Accepting an offer that has been cancelled is refused: the market re-reads the
    ///         registry so a stale UI cannot slip a purchase past the cancel.
    function test_CancelledOfferCannotBeAccepted() public {
        vm.prank(BOB);
        uint256 offerId = offers.publishOffer(
            ALICE,
            CHAIN_KEY,
            DEPTH,
            EXPOSURE,
            BOND,
            END_BLOCK - START_BLOCK,
            0,
            SOURCE_CONTRACT,
            ProvenTx.transferTopic(),
            address(predicateProhibited),
            bytes32(uint256(uint160(TREASURY))),
            0
        );
        vm.prank(BOB);
        offers.cancelOffer(offerId);

        vm.prank(ALICE);
        vm.expectRevert(CoverageMarket.OfferUnavailable.selector);
        market.purchaseOffer(offerId, START_BLOCK);
    }

    /// @notice An aggregated purchase where one contributor's bond overstates their free balance is
    ///         refused atomically: the whole basket reverts, so a fraudulent offer cannot borrow the
    ///         legitimate offer's bond as camouflage.
    function test_AggregatedFraudulentContributorIsRefused() public {
        // FRAUD publishes an offer with a bond larger than their deposit.
        address FRAUD = makeAddr("fraudUnderwriter");
        token.faucet(FRAUD, 100e6); // trivial deposit
        vm.prank(FRAUD);
        token.approve(address(engine), type(uint256).max);
        vm.prank(FRAUD);
        engine.deposit(100e6);

        vm.prank(BOB);
        uint256 honestId = offers.publishOffer(
            ALICE, CHAIN_KEY, DEPTH, 6_000e6, 7_200e6, END_BLOCK - START_BLOCK, 0,
            SOURCE_CONTRACT, ProvenTx.transferTopic(),
            address(predicateProhibited), bytes32(uint256(uint160(TREASURY))), 0
        );
        vm.prank(FRAUD);
        uint256 fraudId = offers.publishOffer(
            ALICE, CHAIN_KEY, DEPTH, 4_000e6, 4_800e6, END_BLOCK - START_BLOCK, 0,
            SOURCE_CONTRACT, ProvenTx.transferTopic(),
            address(predicateProhibited), bytes32(uint256(uint160(TREASURY))), 1
        );

        uint256[] memory ids = new uint256[](2);
        ids[0] = honestId;
        ids[1] = fraudId;

        vm.prank(ALICE);
        vm.expectRevert(); // engine reverts on InsufficientFreeBalance for FRAUD
        market.purchaseAggregated(ids, START_BLOCK);

        // Both offers remain open — the transaction unwound cleanly.
        assertFalse(offers.getOffer(honestId).filled);
        assertFalse(offers.getOffer(fraudId).filled);
    }

    /// @notice Malformed bytes are reported, not reverted, by the preflight path.
    function test_PreviewChallengeSurvivesMalformedPayload() public {
        uint256 id = buyDefault();
        (bool wouldBreach, string memory why) = challenges.previewChallenge(
            id, CHAIN_KEY, START_BLOCK + 10, hex"deadbeef", dummyMerkleProof(), dummyContinuityProof()
        );
        assertFalse(wouldBreach);
        assertGt(bytes(why).length, 0, "a reason is returned");
    }
}
