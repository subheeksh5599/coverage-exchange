// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {AttestcoinAdapter} from "../src/AttestcoinAdapter.sol";
import {CoverageEngine} from "../src/CoverageEngine.sol";
import {ICoverage} from "../src/interfaces/ICoverage.sol";

/// @notice Deployment verification: never trust the addresses in your own environment. This reads the
///         live chain and asserts what is actually deployed there, including the two precompiles the
///         protocol depends on.
///
/// Usage:
///   ENGINES=0x...,ADAPTERS=... RPC_URL=$CC3_TESTNET_RPC_URL forge script script/VerifyDeployment.s.sol \
///     --rpc-url $CC3_TESTNET_RPC_URL
contract VerifyDeployment is Script {
    function run() external view {
        address engineAddr = vm.envAddress("ENGINE_ADDRESS");
        address adapterAddr = vm.envAddress("ADAPTER_ADDRESS");
        uint64 chainKey = uint64(vm.envOr("CHAIN_KEY", uint256(1)));

        require(engineAddr.code.length > 0, "engine has no code at that address");
        require(adapterAddr.code.length > 0, "adapter has no code at that address");
        console.log("engine code size   ", engineAddr.code.length);
        console.log("adapter code size  ", adapterAddr.code.length);

        AttestcoinAdapter adapter = AttestcoinAdapter(adapterAddr);
        CoverageEngine engine = CoverageEngine(engineAddr);

        require(
            adapter.BLOCK_PROVER_ADDRESS() == 0x0000000000000000000000000000000000000FD2, "bad prover address"
        );
        require(
            adapter.CHAIN_INFO_ADDRESS() == 0x0000000000000000000000000000000000000fD3,
            "bad chaininfo address"
        );

        // The precompiles are native runtime code: eth_getCode returns 0x there, which is expected.
        console.log("block prover code length (0 expected):", adapter.BLOCK_PROVER_ADDRESS().code.length);
        console.log("chaininfo  code length (0 expected):", adapter.CHAIN_INFO_ADDRESS().code.length);

        // Live frontier read. Reverts loudly if ChainInfo does not answer on this network.
        (bool available, uint64 height, bytes32 hash) = adapter.tryFrontier(chainKey);
        require(available, "ChainInfo did not answer: is this really a Creditcoin network?");
        console.log("attested frontier height", height);
        console.logBytes32(hash);

        // Engine wiring must be complete, or nothing can be challenged or drawn.
        require(engine.market() != address(0), "market not wired");
        require(engine.challengeManager() != address(0), "challenge manager not wired");
        require(engine.lendingAdapter() != address(0), "lending adapter not wired");
        console.log("market           ", engine.market());
        console.log("challengeManager ", engine.challengeManager());
        console.log("lendingAdapter   ", engine.lendingAdapter());
        console.log("coverageRatioBps ", engine.coverageRatioBps());

        console.log("");
        console.log("VERIFIED: deployment responds, modules are wired, Attestcoin frontier is live.");
    }
}
