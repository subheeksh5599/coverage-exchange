// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PredicateLib} from "./PredicateLib.sol";
import {EvmV1Decoder} from "../lib/EvmV1Decoder.sol";

/// @title AmountBelowFloor
/// @notice Violated when a proven transaction carries an amount below the covered floor — the
///         "collateral withdrawal / repayment must not fall under X" invariant.
/// @dev params = (wordIndex << 128) | floor
///      Complement of AmountAboveLimit by design: together they cover both directions of a
///      threshold on a single proven value, which is what a lender actually writes in a covenant.
contract AmountBelowFloor is PredicateLib {
    function id() external pure override returns (bytes32) {
        return keccak256("AmountBelowFloor");
    }

    function evaluate(
        bytes32 params,
        address expectedEmitter,
        bytes32 expectedTopic0,
        EvmV1Decoder.LogEntry[] calldata logs
    ) external pure override returns (bool violated, string memory reason) {
        // Packed: high 128 bits = word index, low 128 bits = the threshold.
        uint256 wordIndex = uint256(params) >> 128;
        uint256 threshold = uint256(params) & type(uint128).max;

        (bool found, uint256 idx) = firstMatchingLog(expectedEmitter, expectedTopic0, logs);
        if (!found) return (false, "no matching evidence log");

        (bool ok, uint256 amount) = word(logs[idx], wordIndex);
        if (!ok) return (false, "evidence log too short for the configured amount word");

        if (amount < threshold) {
            return (true, "amount fell below the covered floor");
        }
        return (false, "amount at or above the covered floor");
    }
}
