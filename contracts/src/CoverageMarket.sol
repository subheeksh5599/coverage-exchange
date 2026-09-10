// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ICoverage} from "./interfaces/ICoverage.sol";
import {CoverageEngine} from "./CoverageEngine.sol";

/// @title CoverageMarket
/// @notice The supply side and the price. Underwriters publish a capacity offer; borrowers buy a
///         coverage position against it; the premium is paid to the underwriter and the bond is
///         locked in the engine.
///
/// @dev Pricing is a documented deterministic curve, NOT an oracle and NOT a model. Every quote is
///      reproducible from public inputs (exposure, window length, required depth, counterparty), and
///      the multipliers are declared constants, not "AI risk pricing". The curve exists so the
///      instrument visibly responds to risk: a longer window and a deeper attestation requirement
///      both cost more, monotonically. See docs/ECONOMICS.md for the equations.
contract CoverageMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;

    IERC20 public immutable TOKEN;
    CoverageEngine public immutable ENGINE;

    /// @notice Deterministic pricing curve parameters (basis points; 10_000 = 1.0x).
    struct PricingCurve {
        uint16 baseRateBps; // flat rate applied to exposure
        uint16 durationBaseBps; // multiplier at a zero-length window
        uint16 durationPerBlockBps; // added per source-chain block of window
        uint16 durationCapBps; // ceiling for the duration multiplier
        uint16 depthBaseBps; // multiplier at zero required depth
        uint16 depthPerBlockBps; // added per block of attestation depth
        uint16 depthCapBps; // ceiling for the depth multiplier
    }

    PricingCurve public curve = PricingCurve({
        baseRateBps: 50, // 0.50% of exposure at 1.0x multipliers
        durationBaseBps: 10_000, // 1.00x
        durationPerBlockBps: 5, // +0.05% per block, so 100 blocks -> 1.05x
        durationCapBps: 30_000, // 3.00x ceiling
        depthBaseBps: 10_000, // 1.00x
        depthPerBlockBps: 25, // +0.25% per block of depth, so depth 32 -> 1.08x
        depthCapBps: 20_000 // 2.00x ceiling
    });

    /// @notice Underwriter-declared risk multiplier per borrower (10_000 = neutral).
    mapping(address underwriter => mapping(address borrower => uint16)) public counterpartyMultiplierBps;

    event CounterpartyMultiplierSet(address indexed underwriter, address indexed borrower, uint16 bps);
    event CoveragePurchased(
        uint256 indexed coverageId,
        address indexed borrower,
        address indexed underwriter,
        uint256 premium,
        uint256 bond
    );

    error ZeroAddress();
    error BadCurve();
    error MultiplierOutOfRange();
    error NotTheCounterparty();

    constructor(IERC20 token, CoverageEngine engine) Ownable(msg.sender) {
        if (address(token) == address(0) || address(engine) == address(0)) revert ZeroAddress();
        TOKEN = token;
        ENGINE = engine;
    }

    // ----------------------------------------------------------------------------------- pricing

    /// @notice Set the upfront risk multiplier for one borrower. Purely a supply-side price input:
    ///         it can never alter an existing position, and it cannot make coverage valid.
    function setCounterpartyMultiplier(address borrower, uint16 bps) external {
        if (borrower == address(0)) revert ZeroAddress();
        if (bps < 1_000 || bps > 50_000) revert MultiplierOutOfRange(); // 0.10x .. 5.00x
        counterpartyMultiplierBps[msg.sender][borrower] = bps;
        emit CounterpartyMultiplierSet(msg.sender, borrower, bps);
    }

    function setCurve(PricingCurve calldata c) external onlyOwner {
        if (c.durationBaseBps == 0 || c.depthBaseBps == 0 || c.baseRateBps == 0) revert BadCurve();
        curve = c;
    }

    /// @notice Duration multiplier for a window of `windowBlocks` source-chain blocks.
    function durationMultiplierBps(uint64 windowBlocks) public view returns (uint16) {
        uint256 m = uint256(curve.durationBaseBps) + uint256(curve.durationPerBlockBps) * windowBlocks;
        return m > curve.durationCapBps ? curve.durationCapBps : uint16(m);
    }

    /// @notice Depth multiplier for a required attestation depth.
    function depthMultiplierBps(uint64 requiredDepth) public view returns (uint16) {
        uint256 m = uint256(curve.depthBaseBps) + uint256(curve.depthPerBlockBps) * requiredDepth;
        return m > curve.depthCapBps ? curve.depthCapBps : uint16(m);
    }

    /// @notice Reproducible premium quote. Anyone can recompute this from public inputs.
    function quote(
        uint256 maxExposure,
        uint64 windowBlocks,
        uint64 requiredDepth,
        address underwriter,
        address borrower
    ) public view returns (uint256 premium) {
        uint16 cpm = counterpartyMultiplierBps[underwriter][borrower];
        if (cpm == 0) cpm = BPS;

        uint256 risk = uint256(curve.baseRateBps) * durationMultiplierBps(windowBlocks) / BPS
            * depthMultiplierBps(requiredDepth) / BPS * cpm / BPS;

        premium = maxExposure * risk / BPS;
    }

    // ---------------------------------------------------------------------------------- purchase

    /// @notice Buy a coverage position. The premium is paid to the underwriter immediately; the bond
    ///         is locked in the engine (which refuses if the underwriter's free balance is short).
    function purchase(ICoverage.CreateParams calldata p) external nonReentrant returns (uint256 coverageId) {
        if (p.borrower != msg.sender) revert NotTheCounterparty(); // only the covered party may buy
        if (p.underwriter == address(0)) revert ZeroAddress();

        uint64 windowBlocks = p.endBlock - p.startBlock;
        uint256 expectedPremium =
            quote(p.maxExposure, windowBlocks, p.requiredDepth, p.underwriter, p.borrower);
        require(p.premium == expectedPremium, "premium != quoted");

        if (p.premium > 0) {
            TOKEN.safeTransferFrom(msg.sender, p.underwriter, p.premium);
        }

        coverageId = ENGINE.createCoverage(p);
        emit CoveragePurchased(coverageId, p.borrower, p.underwriter, p.premium, p.bond);
    }
}
