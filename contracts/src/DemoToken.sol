// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title DemoToken
/// @notice TESTNET-ONLY demo asset used by the local test suite and the CC3 testnet demo. Six
///         decimals and a public faucet so a reviewer can fund three wallets (borrower, underwriter,
///         challenger) in three transactions. It is not a stablecoin, holds no value, and is
///         deliberately not called USDC — see SECURITY.md, "Why the demo asset is not USDC".
contract DemoToken is ERC20 {
    constructor() ERC20("Coverage Exchange Demo Token", "cxTUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Anyone may mint. Testnet only; the contract is never deployed to mainnet.
    function faucet(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
