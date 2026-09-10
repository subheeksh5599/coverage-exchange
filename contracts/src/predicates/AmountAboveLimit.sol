// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PredicateLib} from "./PredicateLib.sol";
import {EvmV1Decoder} from "../lib/EvmV1Decoder.sol";

/// @title AmountAboveLimit
/// @notice Violated when a proven transaction carries an amount larger than the covered ceiling.
///         This is the "no new debt above X" / "no single draw above X" invariant.
/// @dev params = (wordIndex << 128) | maxAmount
///      `wordIndex` selects which 32-byte word of the log data holds the amount, because the field
///      position differs per source event. It is snapshotted per coverage position at purchase, so a
///      borrower can never re-point the predicate at a different field afterwards.
contract AmountAboveLimit is PredicateLib {
    function id() external pure override returns (bytes32) {
        return keccak256("AmountAboveLimit");
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

        if (amount > threshold) {
            return (true, "amount exceeds the covered ceiling");
        }
        return (false, "amount within the covered ceiling");
    }
}
