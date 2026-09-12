// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {AttestcoinAdapter} from "../../src/AttestcoinAdapter.sol";
import {CoverageEngine} from "../../src/CoverageEngine.sol";
import {CoverageMarket} from "../../src/CoverageMarket.sol";
import {ChallengeManager} from "../../src/ChallengeManager.sol";
import {LendingAdapter} from "../../src/LendingAdapter.sol";
import {OfferRegistry} from "../../src/OfferRegistry.sol";
import {DemoToken} from "../../src/DemoToken.sol";
import {ICoverage} from "../../src/interfaces/ICoverage.sol";
import {INativeQueryVerifier} from "../../src/interfaces/INativeQueryVerifier.sol";
import {ProhibitedRecipient} from "../../src/predicates/ProhibitedRecipient.sol";
import {AmountAboveLimit} from "../../src/predicates/AmountAboveLimit.sol";
import {AmountBelowFloor} from "../../src/predicates/AmountBelowFloor.sol";
import {MockBlockProver, MockChainInfo} from "../mocks/MockAttestcoin.sol";
import {ProvenTx} from "./ProvenTx.sol";

/// @notice Shared harness. Etches the TEST-ONLY precompile doubles at the real addresses, wires the
///         protocol the same way a deployment script does, and funds four independent actors:
///         ALICE (borrower), BOB (underwriter), CAROL (challenger), DAVE (second challenger).
abstract contract BaseTest is Test {
    address constant BLOCK_PROVER_ADDR = 0x0000000000000000000000000000000000000FD2;
    address constant CHAIN_INFO_ADDR = 0x0000000000000000000000000000000000000fD3;

    uint64 constant CHAIN_KEY = 1; // Ethereum Sepolia per docs.attestcoin.org
    uint64 constant START_BLOCK = 22_000_000;
    uint64 constant END_BLOCK = 22_000_100;
    uint64 constant DEPTH = 32;

    uint256 constant EXPOSURE = 10_000e6;
    uint256 constant BOND = 12_000e6;
    uint256 constant LIQUIDITY = 100_000e6;

    address ALICE = makeAddr("alice"); // borrower / covered counterparty
    address BOB = makeAddr("bob"); // underwriter
    address CAROL = makeAddr("carol"); // challenger
    address DAVE = makeAddr("dave"); // second challenger (race)
    address TREASURY = makeAddr("protocolTreasury"); // the prohibited recipient
    address SOURCE_CONTRACT = makeAddr("sourceVault"); // the only contracted evidence emitter

    DemoToken token;
    AttestcoinAdapter adapter;
    CoverageEngine engine;
    CoverageMarket market;
    ChallengeManager challenges;
    LendingAdapter lending;
    OfferRegistry offers;

    ProhibitedRecipient predicateProhibited;
    AmountAboveLimit predicateAbove;
    AmountBelowFloor predicateBelow;

    MockBlockProver prover;
    MockChainInfo chainInfo;

    function setUp() public virtual {
        // --- precompile doubles, etched at the REAL addresses --------------------------------
        MockBlockProver proverImpl = new MockBlockProver();
        MockChainInfo infoImpl = new MockChainInfo();
        vm.etch(BLOCK_PROVER_ADDR, address(proverImpl).code);
        vm.etch(CHAIN_INFO_ADDR, address(infoImpl).code);
        prover = MockBlockProver(BLOCK_PROVER_ADDR);
        chainInfo = MockChainInfo(CHAIN_INFO_ADDR);

        // The doubles have code but no constructor state; initialise the field that matters.
        prover.setTxIndex(3);

        // --- protocol -------------------------------------------------------------------------
        token = new DemoToken();
        adapter = new AttestcoinAdapter();
        engine = new CoverageEngine(IERC20(address(token)), adapter);
        market = new CoverageMarket(IERC20(address(token)), engine);
        challenges = new ChallengeManager(adapter, engine);
        lending = new LendingAdapter(IERC20(address(token)), engine);
        offers = new OfferRegistry();
        engine.wireModules(address(market), address(challenges), address(lending));
        offers.setMarket(address(market));
        market.setOfferRegistry(address(offers));

        predicateProhibited = new ProhibitedRecipient();
        predicateAbove = new AmountAboveLimit();
        predicateBelow = new AmountBelowFloor();

        // --- actors ---------------------------------------------------------------------------
        token.faucet(ALICE, 1_000_000e6);
        token.faucet(BOB, 1_000_000e6);
        token.faucet(address(lending), LIQUIDITY);

        vm.prank(BOB);
        token.approve(address(engine), type(uint256).max);
        vm.prank(ALICE);
        token.approve(address(market), type(uint256).max);
        vm.prank(ALICE);
        token.approve(address(lending), type(uint256).max);

        vm.prank(BOB);
        engine.deposit(500_000e6);

        // The frontier starts just before the covered window: the window is in the future, which is
        // the case a lender actually insures.
        chainInfo.setFrontier(CHAIN_KEY, START_BLOCK - 100);
    }

    // ------------------------------------------------------------------------------ test helpers

    /// @notice Advance the mock attestation frontier.
    function setFrontier(uint64 height) internal {
        chainInfo.setFrontier(CHAIN_KEY, height);
    }

    /// @notice Canonical position parameters: exposure 10k, bond 12k, prohibited recipient = TREASURY.
    function defaultParams() internal view returns (ICoverage.CreateParams memory p) {
        p = ICoverage.CreateParams({
            borrower: ALICE,
            underwriter: BOB,
            chainKey: CHAIN_KEY,
            startBlock: START_BLOCK,
            endBlock: END_BLOCK,
            requiredDepth: DEPTH,
            maxExposure: EXPOSURE,
            capacity: EXPOSURE,
            bond: BOND,
            premium: market.quote(EXPOSURE, END_BLOCK - START_BLOCK, DEPTH, BOB, ALICE),
            predicate: address(predicateProhibited),
            predicateParams: bytes32(uint256(uint160(TREASURY))),
            sourceContract: SOURCE_CONTRACT,
            eventSignature: ProvenTx.transferTopic()
        });
    }

    /// @notice Buy the canonical position and return its id.
    function buyDefault() internal returns (uint256 id) {
        // NOTE: params are built BEFORE the prank. `defaultParams()` makes an external quote() call,
        // which would otherwise consume the prank and leave the test contract as msg.sender.
        ICoverage.CreateParams memory p = defaultParams();
        vm.prank(ALICE);
        id = market.purchase(p);
    }

    /// @notice Register a transaction as provable by the attestation double at a given height.
    function acceptTx(uint64 height, bytes memory encodedTx) internal {
        prover.setAccepted(CHAIN_KEY, height, encodedTx);
    }

    /// @notice A proven ERC-20-shaped transfer to `to`, inside the default window.
    function transferEvidence(uint64 height, address to, uint256 amount, uint8 status)
        internal
        returns (bytes memory encodedTx)
    {
        bytes32[] memory extra = new bytes32[](2);
        extra[0] = bytes32(uint256(uint160(address(0xF00D)))); // from
        extra[1] = bytes32(uint256(uint160(to))); // to
        encodedTx =
            ProvenTx.build(SOURCE_CONTRACT, ProvenTx.transferTopic(), extra, ProvenTx.word(amount), status);
        acceptTx(height, encodedTx);
    }

    /// @notice Empty Merkle / continuity proofs: the doubles key off the (chain, height, tx) triple,
    ///         which mirrors how the real precompile is parameterised.
    function dummyMerkleProof() internal pure returns (INativeQueryVerifier.MerkleProof memory) {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings =
            new INativeQueryVerifier.MerkleProofEntry[](0);
        return INativeQueryVerifier.MerkleProof({root: bytes32(0), siblings: siblings});
    }

    function dummyContinuityProof() internal pure returns (INativeQueryVerifier.ContinuityProof memory) {
        bytes32[] memory roots = new bytes32[](0);
        return INativeQueryVerifier.ContinuityProof({lowerEndpointDigest: bytes32(0), roots: roots});
    }

    function reasonName(ICoverage.Reason r) internal pure returns (string memory) {
        if (r == ICoverage.Reason.VALID) return "VALID";
        if (r == ICoverage.Reason.UNKNOWN_COVERAGE) return "UNKNOWN_COVERAGE";
        if (r == ICoverage.Reason.STATUS_BREACHED) return "STATUS_BREACHED";
        if (r == ICoverage.Reason.STATUS_EXPIRED) return "STATUS_EXPIRED";
        if (r == ICoverage.Reason.STATUS_SETTLED) return "STATUS_SETTLED";
        if (r == ICoverage.Reason.FRONTIER_UNAVAILABLE) return "FRONTIER_UNAVAILABLE";
        if (r == ICoverage.Reason.FRONTIER_PAST_LIVE_WINDOW) return "FRONTIER_PAST_LIVE_WINDOW";
        if (r == ICoverage.Reason.WRONG_COUNTERPARTY) return "WRONG_COUNTERPARTY";
        if (r == ICoverage.Reason.CAPACITY_EXCEEDED) return "CAPACITY_EXCEEDED";
        return "BOND_BELOW_EXPOSURE";
    }
}
