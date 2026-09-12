// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {AttestcoinAdapter} from "../src/AttestcoinAdapter.sol";
import {CoverageEngine} from "../src/CoverageEngine.sol";
import {IWired} from "./interfaces/IWired.sol";

/// @notice Deployment verification: never trust the addresses in your own environment. This reads the
///         live chain and asserts what is actually deployed there.
///
///         SCOPE, and why it is limited: this runs inside Foundry's own EVM, which does not implement
///         Creditcoin's native precompiles. A call to 0x0FD2 / 0x0FD3 from here therefore hits an empty
///         account and can never answer — the same reason no Solidity test in this repository claims to
///         verify a proof. So this script verifies everything an EVM *can* verify (bytecode present,
///         modules wired, constants correct, engine parameters readable), and the Attestcoin frontier
///         check is performed over JSON-RPC by `worker/scripts/verify-deployment.mjs`, which talks to
///         the real node.
///
/// Usage:
///   ENGINE_ADDRESS=0x… ADAPTER_ADDRESS=0x… forge script script/VerifyDeployment.s.sol \
///     --rpc-url $CC3_TESTNET_RPC_URL
contract VerifyDeployment is Script {
    function run() external {
        address engineAddr = vm.envAddress("ENGINE_ADDRESS");
        address adapterAddr = vm.envAddress("ADAPTER_ADDRESS");

        require(engineAddr.code.length > 0, "engine has no code at that address");
        require(adapterAddr.code.length > 0, "adapter has no code at that address");

        console.log("=== deployed code we can see on this chain ===");
        console.log("engine  code size", engineAddr.code.length);
        console.log("adapter code size", adapterAddr.code.length);

        AttestcoinAdapter adapter = AttestcoinAdapter(adapterAddr);
        CoverageEngine engine = CoverageEngine(engineAddr);

        require(
            adapter.BLOCK_PROVER_ADDRESS() == 0x0000000000000000000000000000000000000FD2, "bad prover address"
        );
        require(
            adapter.CHAIN_INFO_ADDRESS() == 0x0000000000000000000000000000000000000fD3,
            "bad chaininfo address"
        );
        console.log("");
        console.log("=== attestcoin constants baked into the deployment ===");
        console.log("Block Prover", adapter.BLOCK_PROVER_ADDRESS());
        console.log("ChainInfo   ", adapter.CHAIN_INFO_ADDRESS());
        console.log("");

        // Wiring must be complete or nothing can be challenged, drawn or priced.
        require(engine.market() != address(0), "market not wired");
        require(engine.challengeManager() != address(0), "challenge manager not wired");
        require(engine.lendingAdapter() != address(0), "lending adapter not wired");
        console.log("=== module wiring ===");
        console.log("market          ", engine.market());
        console.log("challengeManager", engine.challengeManager());
        console.log("lendingAdapter  ", engine.lendingAdapter());
        console.log("");

        console.log("=== risk parameters ===");
        console.log("coverageRatioBps  ", engine.coverageRatioBps());
        console.log("defaultGraceBlocks", engine.defaultGraceBlocks());

        // Non-fatal by design: a precompile cannot answer from inside this EVM, so reporting it as a
        // failure would be a false negative. The authoritative frontier read is the RPC script.
        (bool available, uint64 height,) = adapter.tryFrontier(1);
        console.log("");
        console.log("=== attestcoin frontier (expected: NOT readable from inside Foundry) ===");
        if (available) {
            console.log("frontier readable here, height", height);
        } else {
            console.log("precompile did not answer HERE. That is expected: Foundry's EVM does not");
            console.log("implement Creditcoin's native precompiles. Run the RPC check instead:");
            console.log("  node worker/scripts/verify-deployment.mjs");
        }

        console.log("");
        console.log("VERIFIED (EVM-visible): bytecode present, constants correct, modules wired.");
        console.log("VERIFY (RPC-only):      live ChainInfo frontier -> worker/scripts/verify-deployment.mjs");
    }
}
