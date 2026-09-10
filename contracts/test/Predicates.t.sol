// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {ProhibitedRecipient} from "../src/predicates/ProhibitedRecipient.sol";
import {AmountAboveLimit} from "../src/predicates/AmountAboveLimit.sol";
import {AmountBelowFloor} from "../src/predicates/AmountBelowFloor.sol";
import {IPredicate} from "../src/predicates/IPredicate.sol";
import {EvmV1Decoder} from "../src/lib/EvmV1Decoder.sol";

/// @notice Predicate modules in isolation. These are the three primitives a lender actually writes in
///         a covenant, and each one's honesty boundary is asserted here: a predicate sees ONE proven
///         transaction, gated by emitter and by topic0, and a malformed payload is "not violated"
///         rather than a violation.
contract PredicatesTest is Test {
    ProhibitedRecipient prohibited;
    AmountAboveLimit above;
    AmountBelowFloor below;

    address constant SOURCE = address(0xABCD);
    address constant OTHER = address(0xDEAD);

    function setUp() public {
        prohibited = new ProhibitedRecipient();
        above = new AmountAboveLimit();
        below = new AmountBelowFloor();
    }

    function _logs(EvmV1Decoder.LogEntry[] memory l) internal pure returns (EvmV1Decoder.LogEntry[] memory) {
        return l;
    }

    function _log(address emitter, bytes32[] memory topics, bytes memory data)
        internal
        pure
        returns (EvmV1Decoder.LogEntry[] memory logs)
    {
        logs = new EvmV1Decoder.LogEntry[](1);
        logs[0] = EvmV1Decoder.LogEntry({address_: emitter, topics: topics, data: data});
    }

    function _topics(bytes32 t0, bytes32 t1, bytes32 t2) internal pure returns (bytes32[] memory t) {
        t = new bytes32[](3);
        t[0] = t0;
        t[1] = t1;
        t[2] = t2;
    }

    // ------------------------------------------------------------------ ProhibitedRecipient

    function test_ProhibitedRecipient_FiresOnMatchingTopic() public {
        address target = address(0xBEEF);
        bytes32[] memory topics = _topics(
            keccak256("Transfer(address,address,uint256)"), bytes32(0), bytes32(uint256(uint160(target)))
        );
        (bool violated, string memory reason) = prohibited.evaluate(
            bytes32(uint256(uint160(target))),
            SOURCE,
            topics[0],
            _log(SOURCE, topics, abi.encode(uint256(1e6)))
        );
        assertTrue(violated);
        assertEq(reason, "transfer recipient is the prohibited address");
    }

    function test_ProhibitedRecipient_IgnoresOtherRecipients() public {
        address target = address(0xBEEF);
        bytes32[] memory topics = _topics(
            keccak256("Transfer(address,address,uint256)"),
            bytes32(0),
            bytes32(uint256(uint160(address(0xCAFE))))
        );
        (bool violated,) = prohibited.evaluate(
            bytes32(uint256(uint160(target))),
            SOURCE,
            topics[0],
            _log(SOURCE, topics, abi.encode(uint256(1e6)))
        );
        assertFalse(violated);
    }

    /// @notice topic0 is not authorship: the same event from another contract is not evidence.
    function test_ProhibitedRecipient_IgnoresLookalikeEmitter() public {
        address target = address(0xBEEF);
        bytes32[] memory topics = _topics(
            keccak256("Transfer(address,address,uint256)"), bytes32(0), bytes32(uint256(uint160(target)))
        );
        (bool violated, string memory reason) = prohibited.evaluate(
            bytes32(uint256(uint160(target))),
            SOURCE,
            topics[0],
            _log(OTHER, topics, abi.encode(uint256(1e6)))
        );
        assertFalse(violated);
        assertEq(reason, "no matching evidence log");
    }

    function test_ProhibitedRecipient_ShortTopicsAreNotAViolation() public {
        address target = address(0xBEEF);
        bytes32[] memory topics = new bytes32[](1);
        topics[0] = keccak256("Transfer(address,address,uint256)");
        (bool violated, string memory reason) = prohibited.evaluate(
            bytes32(uint256(uint160(target))), SOURCE, topics[0], _log(SOURCE, topics, "")
        );
        assertFalse(violated);
        assertEq(reason, "evidence log has no recipient topic");
    }

    // ------------------------------------------------------------------ AmountAboveLimit

    function test_AmountAboveLimit_FiresAndPasses() public {
        bytes32 topic0 = keccak256("Amount(address,uint256)");
        bytes32 params = bytes32((uint256(0) << 128) | uint256(5_000e6));

        (bool violated, string memory reason) = above.evaluate(
            params,
            SOURCE,
            topic0,
            _log(SOURCE, _topics(topic0, bytes32(0), bytes32(0)), abi.encode(uint256(6_000e6)))
        );
        assertTrue(violated);
        assertEq(reason, "amount exceeds the covered ceiling");

        (violated,) = above.evaluate(
            params,
            SOURCE,
            topic0,
            _log(SOURCE, _topics(topic0, bytes32(0), bytes32(0)), abi.encode(uint256(4_000e6)))
        );
        assertFalse(violated, "amount within the ceiling is not a violation");
    }

    function test_AmountAboveLimit_ShortDataIsNotAViolation() public {
        bytes32 topic0 = keccak256("Amount(address,uint256)");
        bytes32 params = bytes32((uint256(0) << 128) | uint256(5_000e6));
        (bool violated, string memory reason) =
            above.evaluate(params, SOURCE, topic0, _log(SOURCE, _topics(topic0, bytes32(0), bytes32(0)), ""));
        assertFalse(violated);
        assertEq(reason, "evidence log too short for the configured amount word");
    }

    /// @notice The word index is part of the position, so a payload can be pointed at the right
    ///         field, and the predicate reads exactly that field.
    function test_AmountAboveLimit_RespectsWordIndex() public {
        bytes32 topic0 = keccak256("Amounts(address,uint256,uint256)");
        bytes memory data = abi.encode(uint256(1), uint256(9_000e6)); // word0 small, word1 large

        bytes32 paramsWord0 = bytes32((uint256(0) << 128) | uint256(5_000e6));
        bytes32 paramsWord1 = bytes32((uint256(1) << 128) | uint256(5_000e6));

        (bool atWord0,) = above.evaluate(
            paramsWord0, SOURCE, topic0, _log(SOURCE, _topics(topic0, bytes32(0), bytes32(0)), data)
        );
        (bool atWord1,) = above.evaluate(
            paramsWord1, SOURCE, topic0, _log(SOURCE, _topics(topic0, bytes32(0), bytes32(0)), data)
        );

        assertFalse(atWord0, "word 0 is within the ceiling");
        assertTrue(atWord1, "word 1 exceeds it");
    }

    // ------------------------------------------------------------------ AmountBelowFloor

    function test_AmountBelowFloor_FiresAndPasses() public {
        bytes32 topic0 = keccak256("Collateral(address,uint256)");
        bytes32 params = bytes32((uint256(0) << 128) | uint256(1_000e6));

        (bool violated, string memory reason) = below.evaluate(
            params,
            SOURCE,
            topic0,
            _log(SOURCE, _topics(topic0, bytes32(0), bytes32(0)), abi.encode(uint256(900e6)))
        );
        assertTrue(violated);
        assertEq(reason, "amount fell below the covered floor");

        (violated,) = below.evaluate(
            params,
            SOURCE,
            topic0,
            _log(SOURCE, _topics(topic0, bytes32(0), bytes32(0)), abi.encode(uint256(1_100e6)))
        );
        assertFalse(violated);
    }

    function test_PredicateIdsAreDistinct() public {
        assertTrue(prohibited.id() != above.id());
        assertTrue(above.id() != below.id());
        assertTrue(prohibited.id() == keccak256("ProhibitedRecipient"));
    }
}
