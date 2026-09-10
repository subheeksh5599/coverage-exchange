// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IWired
/// @notice Minimal view surface used by the deployment-verification script. Declared here rather than
///         imported so the script does not drag the whole engine ABI into its compilation.
interface IWired {
    function market() external view returns (address);

    function challengeManager() external view returns (address);

    function lendingAdapter() external view returns (address);

    function coverageRatioBps() external view returns (uint16);

    function defaultGraceBlocks() external view returns (uint64);
}
