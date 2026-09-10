// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {INativeQueryVerifier} from "./interfaces/INativeQueryVerifier.sol";
import {IChainInfo} from "./interfaces/IChainInfo.sol";

/// @title AttestcoinAdapter
/// @notice The only contract in this project that talks to the Attestcoin precompiles. Business
///         logic calls the three verbs below and never a precompile address directly, so the
///         protocol's Attestcoin surface is auditable in one file.
///
///         ChainInfo (0xFD3)  -> "how far has the attested frontier reached?"      -> frontierReached
///         BlockProver (0xFD2) -> "did this exact transaction happen?"              -> verifyInclusion
///         BlockProver (0xFD2) -> "…for N transactions against one continuity proof" -> verifyInclusionBatch
///
/// @dev Fail-closed by construction: every read of the frontier goes through a staticcall wrapped in
///      try/catch-like branching. If ChainInfo is unreachable (local devnet, an RPC without the
///      precompiles, a future network change), `tryFrontier` reports `available = false` and the
///      engine refuses to treat coverage as valid. There is deliberately no fallback that substitutes
///      `block.number` or any locally stored height for the attestation frontier.
contract AttestcoinAdapter {
    /// @dev Precompile addresses are native runtime code with no bytecode; they are constants here
    ///      and cast per use. `eth_getCode` returns 0x at both — expected, not a missing deployment.
    address public constant BLOCK_PROVER_ADDRESS = 0x0000000000000000000000000000000000000FD2;
    address public constant CHAIN_INFO_ADDRESS = 0x0000000000000000000000000000000000000fD3;

    error ProofVerificationFailed();
    error BatchLengthMismatch();

    /// @notice Read the attested frontier for a chain key. Never reverts: reports availability.
    /// @return available False when ChainInfo cannot be reached at all.
    /// @return height Latest attested source-chain height (0 when unavailable).
    /// @return hash Attested block hash at that height.
    function tryFrontier(uint64 chainKey) public view returns (bool available, uint64 height, bytes32 hash) {
        (bool ok, bytes memory ret) = CHAIN_INFO_ADDRESS.staticcall(
            abi.encodeCall(IChainInfo.get_latest_attestation_height_and_hash, (chainKey))
        );
        if (!ok || ret.length < 128) {
            return (false, 0, bytes32(0));
        }
        IChainInfo.HeightHashResult memory r = abi.decode(ret, (IChainInfo.HeightHashResult));
        if (!r.exists) {
            return (false, 0, bytes32(0));
        }
        return (true, r.height, r.hash);
    }

    /// @notice Has the frontier for `chainKey` reached at least `height`?
    /// @dev Uses the protocol's own predicate rather than comparing against a locally cached height,
    ///      so a stale or manipulated local value cannot fake readiness.
    function frontierReached(uint64 chainKey, uint64 height) public view returns (bool) {
        (bool ok, bytes memory ret) =
            CHAIN_INFO_ADDRESS.staticcall(abi.encodeCall(IChainInfo.is_height_attested, (chainKey, height)));
        if (!ok || ret.length < 32) {
            return false;
        }
        return abi.decode(ret, (bool));
    }

    /// @notice Read-only inclusion check. Free, no state change: the preflight path.
    function preflightInclusion(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        INativeQueryVerifier.MerkleProof calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) external view returns (bool) {
        return INativeQueryVerifier(BLOCK_PROVER_ADDRESS)
            .verify(chainKey, height, encodedTransaction, merkleProof, continuityProof);
    }

    /// @notice State-changing verification of one transaction. Reverts when the proof is invalid.
    /// @dev verifyAndEmit is used (not verify) so the precompile's own TransactionVerified event is
    ///      emitted on Creditcoin in the same transaction — the on-chain receipt that Attestcoin, not
    ///      this protocol, did the checking.
    function verifyInclusion(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        INativeQueryVerifier.MerkleProof calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) external returns (bool) {
        bool verified = INativeQueryVerifier(BLOCK_PROVER_ADDRESS)
            .verifyAndEmit(chainKey, height, encodedTransaction, merkleProof, continuityProof);
        if (!verified) revert ProofVerificationFailed();
        return true;
    }

    /// @notice State-changing verification of N transactions against ONE shared continuity proof.
    /// @dev This is the compression the protocol is built on: the expensive part of Attestcoin
    ///      verification is the continuity chain, and the batch overload charges it once for the whole
    ///      window instead of once per claim. Benchmarked in benchmark/ — not asserted here.
    function verifyInclusionBatch(
        uint64 chainKey,
        uint64[] calldata heights,
        bytes[] calldata encodedTransactions,
        INativeQueryVerifier.MerkleProof[] calldata merkleProofs,
        INativeQueryVerifier.ContinuityProof calldata sharedContinuityProof
    ) external returns (bool) {
        if (heights.length != encodedTransactions.length || heights.length != merkleProofs.length) {
            revert BatchLengthMismatch();
        }
        bool verified = INativeQueryVerifier(BLOCK_PROVER_ADDRESS)
            .verifyAndEmit(chainKey, heights, encodedTransactions, merkleProofs, sharedContinuityProof);
        if (!verified) revert ProofVerificationFailed();
        return true;
    }

    /// @notice A transaction's ordinal index inside its source block, recovered from its merkle path.
    /// @dev Used to build replay keys that are independent of anything the submitter claims.
    function transactionIndex(INativeQueryVerifier.MerkleProof calldata merkleProof)
        external
        view
        returns (uint64)
    {
        return INativeQueryVerifier(BLOCK_PROVER_ADDRESS).calculateTxIndex(merkleProof);
    }
}
