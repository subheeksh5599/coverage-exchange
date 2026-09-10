// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {INativeQueryVerifier} from "../../src/interfaces/INativeQueryVerifier.sol";
import {IChainInfo} from "../../src/interfaces/IChainInfo.sol";

/// ============================================================================
///  TEST-ONLY DOUBLES. These contracts are NEVER deployed and NEVER on any path
///  a user touches. They are `vm.etch`ed over the real precompile addresses in
///  unit tests so the protocol's own logic (rejection handling, replay keys,
///  state machine, accounting) can be exercised deterministically.
///
///  WHAT THEY DO NOT PROVE: cryptographic verification of a Merkle/continuity
///  proof. That is the node's job. A test asserting "a forged proof is rejected"
///  only proves this protocol propagates the precompile's rejection faithfully.
///  The real precompile is exercised separately and without keys by
///  test/LiveAttestcoin.t.sol and script/Preflight.s.sol, which call the live
///  CC3 testnet precompiles. Do not cite these doubles as proof that Attestcoin
///  verification works.
/// ============================================================================

contract MockBlockProver {
    error ProofNotAccepted(uint64 chainKey, uint64 height, bytes32 txHash);

    mapping(bytes32 => bool) public accepted;
    uint64 public txIndex;

    event TransactionVerified(uint64 indexed chainKey, uint64 indexed height, uint64 transactionIndex);

    function commitment(uint64 chainKey, uint64 height, bytes calldata encodedTransaction)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(chainKey, height, keccak256(encodedTransaction)));
    }

    /// @notice Test control: mark one (chainKey, height, transaction) triple as provable.
    function setAccepted(uint64 chainKey, uint64 height, bytes calldata encodedTransaction) external {
        accepted[commitment(chainKey, height, encodedTransaction)] = true;
    }

    /// @notice Test control: the ordinal index reported for the next calculateTxIndex call.
    function setTxIndex(uint64 index) external {
        txIndex = index;
    }

    function verify(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        INativeQueryVerifier.MerkleProof calldata,
        INativeQueryVerifier.ContinuityProof calldata
    ) external view returns (bool) {
        if (!accepted[commitment(chainKey, height, encodedTransaction)]) {
            revert ProofNotAccepted(chainKey, height, keccak256(encodedTransaction));
        }
        return true;
    }

    function verifyAndEmit(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        INativeQueryVerifier.MerkleProof calldata,
        INativeQueryVerifier.ContinuityProof calldata
    ) external returns (bool) {
        if (!accepted[commitment(chainKey, height, encodedTransaction)]) {
            revert ProofNotAccepted(chainKey, height, keccak256(encodedTransaction));
        }
        emit TransactionVerified(chainKey, height, txIndex);
        return true;
    }

    function verifyAndEmit(
        uint64 chainKey,
        uint64[] calldata heights,
        bytes[] calldata encodedTransactions,
        INativeQueryVerifier.MerkleProof[] calldata,
        INativeQueryVerifier.ContinuityProof calldata
    ) external returns (bool) {
        for (uint256 i; i < heights.length; ++i) {
            if (!accepted[commitment(chainKey, heights[i], encodedTransactions[i])]) {
                revert ProofNotAccepted(chainKey, heights[i], keccak256(encodedTransactions[i]));
            }
        }
        // One continuity proof, N verification events: the compression this protocol is built on.
        for (uint256 i; i < heights.length; ++i) {
            emit TransactionVerified(chainKey, heights[i], txIndex);
        }
        return true;
    }

    function calculateTxIndex(INativeQueryVerifier.MerkleProof calldata) external view returns (uint64) {
        return txIndex;
    }
}

contract MockChainInfo {
    mapping(uint64 => uint64) public frontier;
    mapping(uint64 => bytes32) public frontierHash;

    function setFrontier(uint64 chainKey, uint64 height) external {
        frontier[chainKey] = height;
        frontierHash[chainKey] = keccak256(abi.encode("attested", chainKey, height));
    }

    function is_height_attested(uint64 chainKey, uint64 height) external view returns (bool) {
        return height <= frontier[chainKey];
    }

    function get_latest_attestation_height_and_hash(uint64 chainKey)
        external
        view
        returns (IChainInfo.HeightHashResult memory result)
    {
        uint64 h = frontier[chainKey];
        result = IChainInfo.HeightHashResult({
            height: h, hash: frontierHash[chainKey], isAttestation: h > 0, exists: h > 0
        });
    }
}
