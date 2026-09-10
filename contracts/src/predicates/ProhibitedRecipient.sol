// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PredicateLib} from "./PredicateLib.sol";
import {EvmV1Decoder} from "../lib/EvmV1Decoder.sol";

/// @title ProhibitedRecipient
/// @notice Violated when the proven transaction moves value to a prohibited address.
/// @dev params = bytes32(uint256(uint160(prohibitedRecipient)))
///      Expects a standard ERC-20 shaped log: topic0 = event signature, topic1 = from, topic2 = to.
///      The address is matched on the TOPIC, which is what the source chain indexed — a lookalike
///      event emitted by another contract never reaches this check because the emitter is gated in
///      PredicateLib.firstMatchingLog.
contract ProhibitedRecipient is PredicateLib {
    function id() external pure override returns (bytes32) {
        return keccak256("ProhibitedRecipient");
    }

    function evaluate(
        bytes32 params,
        address expectedEmitter,
        bytes32 expectedTopic0,
        EvmV1Decoder.LogEntry[] calldata logs
    ) external pure override returns (bool violated, string memory reason) {
        address prohibited = address(uint160(uint256(params)));

        (bool found, uint256 idx) = firstMatchingLog(expectedEmitter, expectedTopic0, logs);
        if (!found) return (false, "no matching evidence log");

        (bool hasTo, bytes32 to) = topic(logs[idx], 2);
        if (!hasTo) return (false, "evidence log has no recipient topic");

        if (address(uint160(uint256(to))) == prohibited) {
            return (true, "transfer recipient is the prohibited address");
        }
        return (false, "recipient is not prohibited");
    }
}
