// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {CoverageEngine} from "../src/CoverageEngine.sol";
import {CoverageMarket} from "../src/CoverageMarket.sol";
import {ChallengeManager} from "../src/ChallengeManager.sol";
import {LendingAdapter} from "../src/LendingAdapter.sol";
import {OfferRegistry} from "../src/OfferRegistry.sol";
import {AttestcoinAdapter} from "../src/AttestcoinAdapter.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {ProhibitedRecipient} from "../src/predicates/ProhibitedRecipient.sol";
import {AmountAboveLimit} from "../src/predicates/AmountAboveLimit.sol";
import {AmountBelowFloor} from "../src/predicates/AmountBelowFloor.sol";

/// @notice Testnet deployment. Deploys the protocol, the demo asset and the three predicate modules,
///         wires the modules once, and prints a JSON block that is written to
///         deployments/<chainid>.json by the accompanying shell wrapper.
///
///         No secret is read from this file: `forge script --broadcast` uses the private key from the
///         environment, and nothing is written back into the repository by the script itself.
///
/// Usage:
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url $CC3_TESTNET_RPC_URL --broadcast \
///     --private-key $DEPLOYER_PRIVATE_KEY
contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        DemoToken token = new DemoToken();
        AttestcoinAdapter adapter = new AttestcoinAdapter();
        CoverageEngine engine = new CoverageEngine(token, adapter);
        CoverageMarket market = new CoverageMarket(token, engine);
        ChallengeManager challenges = new ChallengeManager(adapter, engine);
        LendingAdapter lending = new LendingAdapter(token, engine);
        OfferRegistry offerRegistry = new OfferRegistry();

        engine.wireModules(address(market), address(challenges), address(lending));
        offerRegistry.setMarket(address(market));
        market.setOfferRegistry(address(offerRegistry));

        ProhibitedRecipient predicateProhibited = new ProhibitedRecipient();
        AmountAboveLimit predicateAbove = new AmountAboveLimit();
        AmountBelowFloor predicateBelow = new AmountBelowFloor();

        vm.stopBroadcast();

        console.log("=== COVERAGE EXCHANGE DEPLOYMENT ===");
        console.log("chainId              ", block.chainid);
        console.log("DemoToken            ", address(token));
        console.log("AttestcoinAdapter    ", address(adapter));
        console.log("CoverageEngine       ", address(engine));
        console.log("CoverageMarket       ", address(market));
        console.log("ChallengeManager     ", address(challenges));
        console.log("LendingAdapter       ", address(lending));
        console.log("OfferRegistry        ", address(offerRegistry));
        console.log("ProhibitedRecipient  ", address(predicateProhibited));
        console.log("AmountAboveLimit     ", address(predicateAbove));
        console.log("AmountBelowFloor     ", address(predicateBelow));
        console.log("");
        console.log("BlockProver precompile (verify, not deployed):", adapter.BLOCK_PROVER_ADDRESS());
        console.log("ChainInfo precompile   (verify, not deployed):", adapter.CHAIN_INFO_ADDRESS());
    }
}
