// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {INativeQueryVerifier} from "./interfaces/INativeQueryVerifier.sol";
import {ICoverage} from "./interfaces/ICoverage.sol";
import {IPredicate} from "./predicates/IPredicate.sol";
import {EvmV1Decoder} from "./lib/EvmV1Decoder.sol";
import {AttestcoinAdapter} from "./AttestcoinAdapter.sol";
import {CoverageEngine} from "./CoverageEngine.sol";
import {EvmV1Decoder} from "./lib/EvmV1Decoder.sol";

/// @title ChallengeManager
/// @notice Adjudication. Anyone may submit a proven counterexample against a live coverage position;
///         if the proof is valid, the block is inside the covered window, the source transaction
///         actually succeeded, the emitter is the contracted one and the predicate fires, then the
///         bond is transferred to the challenger and the position is breached — one transaction.
///
/// @dev The rejection set IS the product. Every check below exists because the matching attack is
///      why coverage systems leak money in practice, and every one has a named error and a test:
///        WrongChain           — a proof from a different source chain
///        BlockOutsideWindow   — a real violation outside the covered range
///        TransactionFailed    — inclusion is not success (receiptStatus != 1)
///        PredicateNotViolated — a valid proof of the wrong thing (includes lookalike events)
///        ProofInvalid         — fabricated or malformed proof; the precompile decides, not this contract
///        NotLive              — a challenge after expiry, or on a position that never went live
///        ChallengeReplayed    — the same counterexample submitted twice
///        AlreadyTerminal      — a second challenger loses the race and reverts
contract ChallengeManager {
    AttestcoinAdapter public immutable ADAPTER;
    CoverageEngine public immutable ENGINE;

    /// @notice challenge key => consumed. Keyed per coverage by construction, so one violating source
    ///         transaction may legitimately breach several positions, while the SAME counterexample
    ///         can never breach the same position twice.
    mapping(bytes32 => bool) public usedChallengeKeys;

    event ChallengeSubmitted(
        uint256 indexed coverageId, bytes32 indexed challengeKey, address indexed challenger
    );

    error WrongChain(uint64 expected, uint64 supplied);
    error BlockOutsideWindow(uint64 blockHeight, uint64 startBlock, uint64 endBlock);
    error TransactionFailed(uint8 receiptStatus);
    error PredicateNotViolated(string reason);
    error ProofInvalid();
    error ChallengeReplayed(bytes32 challengeKey);
    error NotLive();

    /// @dev Parameters are passed flat rather than wrapped in a struct: a nested calldata struct
    ///      containing two further dynamic structs overflows the decoder's stack without --via-ir.
    ///      Flat parameters are also what a challenger worker or a UI actually signs.

    constructor(AttestcoinAdapter adapter, CoverageEngine engine) {
        ADAPTER = adapter;
        ENGINE = engine;
    }

    // ----------------------------------------------------------------------------------- challenge

    /// @notice Submit a counterexample. Permissionless: no role, no allowlist, no required stake. The
    ///         proof is the only credential, which is the entire point of the mechanism.
    function challenge(
        uint256 coverageId,
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        INativeQueryVerifier.MerkleProof calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) external returns (bool) {
        _requireLiveWindow(coverageId, chainKey, blockHeight);

        // 1. Inclusion + continuity, verified by the Attestcoin Block Prover inside this transaction.
        if (!ADAPTER.verifyInclusion(chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof))
        {
            revert ProofInvalid();
        }

        // 2. A reverted source transaction is still a validly included transaction. Inclusion is not
        //    success, and only a successful transaction can be state-changing evidence.
        (bool violated, string memory reason) = _evaluatePredicate(coverageId, encodedTransaction);
        if (!violated) revert PredicateNotViolated(reason);

        // 3. Replay key built from evidence the submitter cannot forge: the transaction's ordinal
        //    index inside its own source block is recovered from the merkle path, not from a claim.
        bytes32 key = challengeKeyOf(coverageId, chainKey, blockHeight, ADAPTER.transactionIndex(merkleProof));
        if (usedChallengeKeys[key]) revert ChallengeReplayed(key);
        usedChallengeKeys[key] = true;

        emit ChallengeSubmitted(coverageId, key, msg.sender);

        // 4. Atomic: breach and pay the challenger in the same transaction.
        ENGINE.applyBreach(coverageId, key, msg.sender);
        return true;
    }

    /// @dev Position exists, is live, the chain matches and the block is inside the covered window.
    function _requireLiveWindow(uint256 coverageId, uint64 chainKey, uint64 blockHeight) internal view {
        ICoverage.AdjudicationView memory a = ENGINE.adjudication(coverageId);
        if (a.status != ICoverage.Status.ACTIVE) revert NotLive();
        if (chainKey != a.chainKey) revert WrongChain(a.chainKey, chainKey);
        if (blockHeight < a.startBlock || blockHeight > a.endBlock) {
            revert BlockOutsideWindow(blockHeight, a.startBlock, a.endBlock);
        }
    }

    /// @dev Decode the proven receipt and run the position's invariant against its logs.
    ///      The emitter gate lives inside the predicate modules, so a lookalike event from another
    ///      contract cannot fire the invariant.
    function _evaluatePredicate(uint256 coverageId, bytes calldata encodedTransaction)
        internal
        view
        returns (bool, string memory)
    {
        ICoverage.AdjudicationView memory a = ENGINE.adjudication(coverageId);

        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert TransactionFailed(receipt.receiptStatus);

        // The predicate receives the decoder's own log array: no conversion layer, so what the
        // invariant sees is exactly what Attestcoin's decoder produced.
        return IPredicate(a.predicate)
            .evaluate(a.predicateParams, a.sourceContract, a.eventSignature, receipt.receiptLogs);
    }

    function challengeKeyOf(uint256 coverageId, uint64 chainKey, uint64 blockHeight, uint64 txIndex)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(coverageId, chainKey, blockHeight, txIndex));
    }

    // --------------------------------------------------------------------------------- preflight

    /// @notice Free, read-only simulation: would this counterexample breach this position right now?
    ///         Uses the precompile's view path, so nothing is spent and nothing is written.
    /// @dev Never reverts. A payload that cannot be decoded is reported as not-breaching, because a
    ///      payload that cannot be decoded is not evidence. The money path re-runs every check.
    function previewChallenge(
        uint256 coverageId,
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        INativeQueryVerifier.MerkleProof calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) external view returns (bool wouldBreach, string memory reason) {
        try this.simulateChallenge(
            coverageId, chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof
        ) returns (
            bool breached, string memory why
        ) {
            return (breached, why);
        } catch Error(string memory err) {
            return (false, err);
        } catch (bytes memory) {
            return (false, "malformed payload or invalid proof");
        }
    }

    /// @dev External so previewChallenge can catch its reverts. Writes nothing; reverts on any failed
    ///      check, with the same errors as the money path.
    function simulateChallenge(
        uint256 coverageId,
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        INativeQueryVerifier.MerkleProof calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) external view returns (bool, string memory) {
        _requireLiveWindow(coverageId, chainKey, blockHeight);

        if (!ADAPTER.preflightInclusion(
                chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof
            )) {
            revert ProofInvalid();
        }

        (bool violated, string memory why) = _evaluatePredicate(coverageId, encodedTransaction);
        if (!violated) revert PredicateNotViolated(why);

        return (true, "counterexample breaches the position");
    }
}
