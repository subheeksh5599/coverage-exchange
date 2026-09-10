// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EvmV1Decoder} from "../lib/EvmV1Decoder.sol";

/// @title IPredicate
/// @notice An invariant module. A predicate answers exactly one question about a PROVEN source-chain
///         transaction: do the logs inside it break the condition this coverage position was sold on?
/// @dev Scope, stated plainly because it is the honesty boundary of the whole protocol: a predicate
///      sees one proven transaction. It cannot read source-chain state, cannot sum history and cannot
///      compare two transactions. Every predicate below is therefore a statement about THIS
///      transaction's decoded logs — a recipient, an amount, a topic — and the protocol is only ever
///      as strong as that. See SECURITY.md ("What a predicate cannot see").
interface IPredicate {
    /// @notice Stable identifier of the module (keccak of its name), snapshotted per position.
    function id() external pure returns (bytes32);

    /// @notice Evaluate the predicate against the logs of one proven transaction.
    /// @param params Module-specific packed parameters (see each module's NatSpec).
    /// @param expectedEmitter The only source-chain address accepted as evidence.
    /// @param expectedTopic0 The event signature the evidence must carry.
    /// @return violated True when the logs break the invariant.
    /// @return reason Human-readable, surfaced by previewChallenge and the challenge revert path.
    /// @dev Takes the protocol decoder's own log type (`EvmV1Decoder.LogEntry`) so predicates read
    ///      exactly the bytes the Attestcoin decoder produced, with no intermediate conversion layer.
    function evaluate(
        bytes32 params,
        address expectedEmitter,
        bytes32 expectedTopic0,
        EvmV1Decoder.LogEntry[] calldata logs
    ) external pure returns (bool violated, string memory reason);
}
