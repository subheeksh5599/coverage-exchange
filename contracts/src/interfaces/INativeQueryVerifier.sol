// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title INativeQueryVerifier
/// @notice The Attestcoin Block Prover precompile at 0x0000000000000000000000000000000000000FD2.
/// @dev VENDORED SIGNATURES — not authored by this project. Copied from @gluwa/asc-contracts@0.2.1
///      /contracts/write-ability/common/INativeQueryVerifier.sol (MIT). The struct layouts, the
///      argument order and the two overload sets are kept byte-identical to the published package:
///      a wrong field order here would make every proof verification fail silently on-chain.
///
///      Note the batch overload: N transactions verified in one call sharing ONE continuity proof.
///      That overload is the compression primitive this protocol is built on.
interface INativeQueryVerifier {
    struct MerkleProofEntry {
        bytes32 hash;
        bool isLeft;
    }

    struct MerkleProof {
        bytes32 root;
        MerkleProofEntry[] siblings;
    }

    struct ContinuityProof {
        bytes32 lowerEndpointDigest;
        bytes32[] roots;
    }

    event TransactionVerified(uint64 indexed chainKey, uint64 indexed height, uint64 transactionIndex);

    /// @notice Verify one source-chain transaction and emit TransactionVerified (state-changing).
    function verifyAndEmit(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external returns (bool);

    /// @notice Verify N transactions against ONE shared continuity proof (state-changing).
    function verifyAndEmit(
        uint64 chainKey,
        uint64[] calldata heights,
        bytes[] calldata encodedTransactions,
        MerkleProof[] calldata merkleProofs,
        ContinuityProof calldata sharedContinuityProof
    ) external returns (bool);

    /// @notice Read-only verification of one transaction. Free — usable as a preflight.
    function verify(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external view returns (bool);

    /// @notice Read-only verification of N transactions against one shared continuity proof.
    function verify(
        uint64 chainKey,
        uint64[] calldata heights,
        bytes[] calldata encodedTransactions,
        MerkleProof[] calldata merkleProofs,
        ContinuityProof calldata sharedContinuityProof
    ) external view returns (bool);

    /// @notice Recover a transaction's ordinal position in its source block from its merkle path.
    function calculateTxIndex(MerkleProof calldata merkleProof) external view returns (uint64);
}

/// @title NativeQueryVerifierLib
/// @notice VENDORED from @gluwa/asc-contracts@0.2.1 (MIT).
library NativeQueryVerifierLib {
    address internal constant PRECOMPILE = 0x0000000000000000000000000000000000000FD2;

    function getVerifier() internal pure returns (INativeQueryVerifier) {
        return INativeQueryVerifier(PRECOMPILE);
    }

    /// @dev Creditcoin mainnet / testnet / devnet.
    function isCreditcoinChainId(uint256 chainId) internal pure returns (bool) {
        return chainId == 102030 || chainId == 102031 || chainId == 102032;
    }
}
