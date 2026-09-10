// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ProvenTx
/// @notice Test helper that builds the exact `encodedTransaction` payload the Attestcoin proof builder
///         returns, so the protocol's decoder path is exercised with real format data instead of a
///         stub. Format (from the asc-contracts package EvmV1Decoder):
///
///           abi.encode(uint8 txType, bytes[] chunks)
///             chunks[0]        = abi.encode(uint64 nonce, uint64 gasLimit, address from, bool toIsNull,
///                                           address to, uint256 value, bytes data)
///             chunks[1]        = type-specific fields (type 0: gasPrice, v, r, s)
///             chunks[2]        = receipt (types 0..2): abi.encode(uint8 status, uint64 gasUsed,
///                                           LogEntryTuple[] logs, bytes logsBloom)
///             chunks[3]        = receipt (types 3..4)
///
///         A type-0 transaction is used throughout: it is the simplest shape with three chunks and it
///         decodes through the same receipt path every other type uses.
library ProvenTx {
    struct LogTuple {
        address address_;
        bytes32[] topics;
        bytes data;
    }

    /// @notice A successful type-0 transaction carrying one log.
    function build(
        address emitter,
        bytes32 topic0,
        bytes32[] memory extraTopics,
        bytes memory logData,
        uint8 receiptStatus
    ) internal pure returns (bytes memory encoded) {
        LogTuple[] memory logs = new LogTuple[](1);
        bytes32[] memory topics = new bytes32[](1 + extraTopics.length);
        topics[0] = topic0;
        for (uint256 i; i < extraTopics.length; ++i) {
            topics[i + 1] = extraTopics[i];
        }
        logs[0] = LogTuple({address_: emitter, topics: topics, data: logData});

        return buildMulti(emitter, logs, receiptStatus);
    }

    /// @notice A transaction carrying several logs (for lookalike-event cases).
    function buildMulti(address emitter, LogTuple[] memory logs, uint8 receiptStatus)
        internal
        pure
        returns (bytes memory encoded)
    {
        bytes[] memory chunks = new bytes[](3);

        chunks[0] = abi.encode(
            uint64(7), // nonce
            uint64(21000), // gasLimit
            address(0xA11CE), // from
            false, // toIsNull
            emitter, // to
            uint256(1 ether), // value
            bytes("") // data
        );
        chunks[1] = abi.encode(uint128(1 gwei), uint256(27), bytes32(uint256(1)), bytes32(uint256(2)));
        chunks[2] = abi.encode(uint8(receiptStatus), uint64(21000), toTuples(logs), bytes(""));

        encoded = abi.encode(uint8(0), chunks);
    }

    function toTuples(LogTuple[] memory logs) internal pure returns (LogTuple[] memory) {
        return logs;
    }

    /// @notice erc20 Transfer(address indexed from, address indexed to, uint256 value) signature.
    function transferTopic() internal pure returns (bytes32) {
        return keccak256("Transfer(address,address,uint256)");
    }

    /// @notice keccak of a source-side event carrying one non-indexed uint256 amount.
    function amountEventTopic() internal pure returns (bytes32) {
        return keccak256("Amount(address,uint256)");
    }

    /// @notice Single 32-byte word payload, as an event with one non-indexed uint256 would emit.
    function word(uint256 value) internal pure returns (bytes memory) {
        return abi.encode(value);
    }
}
