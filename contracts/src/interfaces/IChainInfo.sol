// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IChainInfo
/// @notice The Attestcoin ChainInfo precompile at 0x0000000000000000000000000000000000000fD3.
/// @dev VENDORED SIGNATURES — not authored by this project. The selectors are snake_case as
///      published on docs.attestcoin.org (Attestcoin Protocol Chains - Environments, and the
///      precompile metadata ABI); the JavaScript SDK wraps them in camelCase, do not copy that here.
///
///      Block Prover (0xFD2) answers "did this happen?". ChainInfo (0xFD3) answers "how far along is
///      the attestation frontier?" — which is what makes a coverage window auditable: a window can
///      only be treated as fully covered once the frontier has passed its end by the required depth.
interface IChainInfo {
    struct HeightHashResult {
        uint64 height;
        bytes32 hash;
        bool isAttestation;
        bool exists;
    }

    /// @notice True once the attestation frontier for `chainKey` has reached `height`.
    function is_height_attested(uint64 chainKey, uint64 height) external view returns (bool isAttested);

    /// @notice Latest attested height + hash for a chain key.
    function get_latest_attestation_height_and_hash(uint64 chainKey)
        external
        view
        returns (HeightHashResult memory result);
}

/// @dev 0x0FD3 is native runtime code in the Creditcoin node, not EVM bytecode — `eth_getCode`
///      returns 0x there, which is expected and is not evidence of a missing deployment.
library ChainInfoLib {
    address internal constant PRECOMPILE = 0x0000000000000000000000000000000000000fD3;

    function getChainInfo() internal pure returns (IChainInfo) {
        return IChainInfo(PRECOMPILE);
    }
}
