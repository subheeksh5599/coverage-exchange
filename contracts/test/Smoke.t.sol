// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./helpers/BaseTest.sol";
import {ICoverage} from "../src/interfaces/ICoverage.sol";

contract SmokeTest is BaseTest {
    function test_HarnessWiresAndQuoteIsReproducible() public {
        ICoverage.CreateParams memory p = defaultParams();
        assertGt(p.premium, 0, "premium must be non-zero");
        assertEq(p.premium, market.quote(EXPOSURE, END_BLOCK - START_BLOCK, DEPTH, BOB, ALICE));
        assertEq(engine.freeBalance(BOB), 500_000e6);

        ICoverage.CreateParams memory params = defaultParams();
        vm.prank(ALICE);
        uint256 id = market.purchase(params);

        (bool ok, ICoverage.Reason r) = engine.isValid(id);
        assertTrue(ok, reasonName(r));
    }
}
