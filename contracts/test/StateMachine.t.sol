// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./helpers/BaseTest.sol";
import {ICoverage} from "../src/interfaces/ICoverage.sol";
import {CoverageEngine} from "../src/CoverageEngine.sol";
import {ChallengeManager} from "../src/ChallengeManager.sol";

/// @notice The state machine, asserted rather than described. A financial guarantee is only as strong
///         as the transitions it forbids: nothing may leave BREACHED, nothing may re-enter ACTIVE, and
///         expiry must be computed from the attested frontier rather than flipped by a keeper.
contract StateMachineTest is BaseTest {
    function test_LegalTransitionsOnly() public {
        uint256 id = buyDefault();
        assertEq(uint256(engine.getCoverage(id).status), uint256(ICoverage.Status.ACTIVE));

        // ACTIVE -> EXPIRED is computed from the frontier, with no transaction in between.
        setFrontier(END_BLOCK + DEPTH + 10_000 + 1);
        assertEq(uint256(engine.getCoverage(id).status), uint256(ICoverage.Status.EXPIRED));

        // EXPIRED -> SETTLED is permissionless.
        engine.settle(id);
        assertEq(uint256(engine.getCoverage(id).status), uint256(ICoverage.Status.SETTLED));
    }

    function test_BreachedIsTerminal() public {
        uint256 id = buyDefault();
        bytes memory evidence = transferEvidence(START_BLOCK + 1, TREASURY, 1e6, 1);

        vm.prank(CAROL);
        challenges.challenge(
            id, CHAIN_KEY, START_BLOCK + 1, evidence, dummyMerkleProof(), dummyContinuityProof()
        );
        assertEq(uint256(engine.getCoverage(id).status), uint256(ICoverage.Status.BREACHED));

        // No path back to ACTIVE...
        setFrontier(START_BLOCK - 1);
        assertEq(uint256(engine.getCoverage(id).status), uint256(ICoverage.Status.BREACHED));

        // ...and settlement is refused: a breached position can never look clean.
        vm.expectRevert(
            abi.encodeWithSelector(CoverageEngine.AlreadyTerminal.selector, ICoverage.Status.BREACHED)
        );
        engine.settle(id);
    }

    function test_SettledIsTerminal() public {
        uint256 id = buyDefault();
        setFrontier(END_BLOCK + DEPTH);
        engine.settle(id);

        vm.expectRevert(
            abi.encodeWithSelector(CoverageEngine.AlreadyTerminal.selector, ICoverage.Status.SETTLED)
        );
        engine.settle(id);

        // A settled position cannot be challenged: its bond has already been released.
        bytes memory evidence = transferEvidence(START_BLOCK + 1, TREASURY, 1e6, 1);
        vm.prank(CAROL);
        vm.expectRevert(ChallengeManager.NotLive.selector);
        challenges.challenge(
            id, CHAIN_KEY, START_BLOCK + 1, evidence, dummyMerkleProof(), dummyContinuityProof()
        );
    }

    function test_NoKeeperNeededForExpiry() public {
        uint256 id = buyDefault();
        assertEq(uint256(engine.getCoverage(id).status), uint256(ICoverage.Status.ACTIVE));

        // Only the attestation frontier moves. Nothing else is called.
        setFrontier(END_BLOCK + DEPTH + 10_001);

        (bool ok, ICoverage.Reason r) = engine.isValid(id);
        assertFalse(ok, "coverage must not be valid past its live window");
        assertEq(uint256(r), uint256(ICoverage.Reason.FRONTIER_PAST_LIVE_WINDOW));
    }

    /// @notice Fail closed: if the attestation frontier cannot be read at all, the position is not
    ///         valid. A missing oracle must never mean "assume it was fine".
    function test_UnreachableFrontierFailsClosed() public {
        uint256 id = buyDefault();

        // Remove the ChainInfo double: the precompile call now hits an empty address.
        vm.etch(CHAIN_INFO_ADDR, "");

        (bool ok, ICoverage.Reason r) = engine.isValid(id);
        assertFalse(ok, "unreachable frontier must not read as valid");
        assertEq(uint256(r), uint256(ICoverage.Reason.FRONTIER_UNAVAILABLE));

        vm.prank(ALICE);
        vm.expectRevert(); // the lending path refuses as well
        lending.draw(id, 1_000e6);

        assertFalse(engine.windowClosed(id), "an unreachable frontier cannot close a window");
    }

    function test_SettleRequiresZeroOutstandingExposure() public {
        uint256 id = buyDefault();
        vm.prank(ALICE);
        lending.draw(id, 1_000e6);

        setFrontier(END_BLOCK + DEPTH);

        vm.expectRevert(abi.encodeWithSelector(CoverageEngine.OutstandingExposure.selector, 1_000e6));
        engine.settle(id);

        vm.prank(ALICE);
        lending.repay(id, 1_000e6);
        engine.settle(id);
        assertEq(uint256(engine.getCoverage(id).status), uint256(ICoverage.Status.SETTLED));
    }

    function test_ModulesCanOnlyBeWiredOnce() public {
        vm.expectRevert(CoverageEngine.ModulesAlreadyWired.selector);
        engine.wireModules(address(market), address(challenges), address(lending));
    }

    function test_OnlyAuthorizedCallersCanWriteOutcomes() public {
        uint256 id = buyDefault();

        vm.prank(CAROL);
        vm.expectRevert(CoverageEngine.NotAuthorized.selector);
        engine.applyBreach(id, bytes32(0), CAROL);

        vm.prank(CAROL);
        vm.expectRevert(CoverageEngine.NotAuthorized.selector);
        engine.consume(id, 1e6);
    }
}
