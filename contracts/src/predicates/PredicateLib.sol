// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPredicate} from "./IPredicate.sol";
import {EvmV1Decoder} from "../lib/EvmV1Decoder.sol";

/// @title PredicateLib
/// @notice Shared helpers for predicate modules: emitter/topic gating and calldata word reads.
/// @dev Every module MUST go through `firstMatchingLog` so the two cheapest attacks against a
///      predicate-based system are closed once, in one place:
///        - a lookalike event from a different contract (topic0 alone is not authorship),
///        - an event with the right topic0 but the wrong arity.
abstract contract PredicateLib is IPredicate {
    /// @dev Returns the first log that matches the expected emitter AND topic0. Logs that do not
    ///      match are ignored, never treated as evidence and never as a violation.
    function firstMatchingLog(
        address expectedEmitter,
        bytes32 expectedTopic0,
        EvmV1Decoder.LogEntry[] calldata logs
    ) internal pure returns (bool found, uint256 index) {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].address_ != expectedEmitter) continue;
            if (logs[i].topics.length == 0) continue;
            if (logs[i].topics[0] != expectedTopic0) continue;
            return (true, i);
        }
        return (false, 0);
    }

    /// @dev Reads the `wordIndex`-th 32-byte word of a log's data. Reverts the predicate to
    ///      "not violated" if the log is too short: a malformed payload is not a violation, it is
    ///      simply not evidence.
    function word(EvmV1Decoder.LogEntry calldata log, uint256 wordIndex)
        internal
        pure
        returns (bool ok, uint256 value)
    {
        uint256 offset = wordIndex * 32;
        if (log.data.length < offset + 32) return (false, 0);
        bytes calldata d = log.data[offset:offset + 32];
        assembly {
            value := calldataload(d.offset)
        }
        return (true, value);
    }

    /// @dev Topic at `topicIndex`, or (false, 0) when the log carries fewer topics.
    function topic(EvmV1Decoder.LogEntry calldata log, uint256 topicIndex)
        internal
        pure
        returns (bool ok, bytes32 value)
    {
        if (log.topics.length <= topicIndex) return (false, bytes32(0));
        return (true, log.topics[topicIndex]);
    }
}
