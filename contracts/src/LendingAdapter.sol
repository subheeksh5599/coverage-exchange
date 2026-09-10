// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ICoverage} from "./interfaces/ICoverage.sol";
import {CoverageEngine} from "./CoverageEngine.sol";

/// @title LendingAdapter
/// @notice The consumer. A minimal lending pool whose capital can only leave against a valid
///         coverage position. This contract is the answer to "is the coverage load-bearing?" — the
///         draw path calls the engine in the same transaction, so a UI badge cannot substitute for
///         the real check, and no admin can wave a draw through.
///
/// @dev Wired the same way any external protocol would use the primitive:
///        require(engine.isValid(coverageId)) -> engine.consume(...) -> transfer
///      A third party integrates by doing exactly this; see docs/INTEGRATION.md.
contract LendingAdapter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable TOKEN;
    CoverageEngine public immutable ENGINE;

    uint256 public totalLiquidity;
    mapping(address => uint256) public liquidityOf;
    mapping(uint256 coverageId => uint256) public exposureOfCoverage;

    event LiquidityDeposited(address indexed lender, uint256 amount);
    event LiquidityWithdrawn(address indexed lender, uint256 amount);
    event Drawn(uint256 indexed coverageId, address indexed borrower, uint256 amount);
    event Repaid(uint256 indexed coverageId, address indexed borrower, uint256 amount);

    error CoverageNotValid(ICoverage.Reason reason);
    error NotTheCounterparty();
    error InsufficientLiquidity(uint256 available, uint256 requested);
    error InsufficientExposure(uint256 outstanding, uint256 requested);

    constructor(IERC20 token, CoverageEngine engine) {
        TOKEN = token;
        ENGINE = engine;
    }

    /// @notice Provide drawable liquidity. Unrelated to bonds: this is the lender's capital, held in
    ///         its own accounting, never commingled with an underwriter's bond.
    function depositLiquidity(uint256 amount) external nonReentrant {
        TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        liquidityOf[msg.sender] += amount;
        totalLiquidity += amount;
        emit LiquidityDeposited(msg.sender, amount);
    }

    function withdrawLiquidity(uint256 amount) external nonReentrant {
        require(liquidityOf[msg.sender] >= amount, "insufficient lender balance");
        liquidityOf[msg.sender] -= amount;
        totalLiquidity -= amount;
        TOKEN.safeTransfer(msg.sender, amount);
        emit LiquidityWithdrawn(msg.sender, amount);
    }

    /// @notice Draw against a coverage position. Reverts unless the coverage is valid at this block,
    ///         the caller is the covered counterparty, and the amount fits both the position's
    ///         maximum exposure and the pool's free liquidity.
    function draw(uint256 coverageId, uint256 amount) external nonReentrant {
        ICoverage.Coverage memory c = ENGINE.getCoverage(coverageId);
        if (c.borrower != msg.sender) revert NotTheCounterparty();

        (bool ok, ICoverage.Reason reason) = ENGINE.isValid(coverageId);
        if (!ok) revert CoverageNotValid(reason);

        uint256 remaining = c.maxExposure - c.drawn;
        if (amount > remaining) revert CoverageNotValid(ICoverage.Reason.CAPACITY_EXCEEDED);

        uint256 available = TOKEN.balanceOf(address(this));
        if (amount > available) revert InsufficientLiquidity(available, amount);

        // Checks-effects-interactions: the engine records the exposure before any token leaves.
        ENGINE.consume(coverageId, amount);
        exposureOfCoverage[coverageId] += amount;

        TOKEN.safeTransfer(msg.sender, amount);
        emit Drawn(coverageId, msg.sender, amount);
    }

    /// @notice Repay exposure, freeing capacity inside the position for a later draw.
    function repay(uint256 coverageId, uint256 amount) external nonReentrant {
        uint256 outstanding = exposureOfCoverage[coverageId];
        if (amount > outstanding) revert InsufficientExposure(outstanding, amount);

        TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        exposureOfCoverage[coverageId] = outstanding - amount;
        ENGINE.release(coverageId, amount);

        emit Repaid(coverageId, msg.sender, amount);
    }

    /// @notice Preflight for the UI and for integrations: identical checks, no state change.
    function previewDraw(uint256 coverageId, address borrower, uint256 amount)
        external
        view
        returns (bool ok, ICoverage.Reason reason)
    {
        ICoverage.Coverage memory c = ENGINE.getCoverage(coverageId);
        if (c.borrower != borrower) return (false, ICoverage.Reason.WRONG_COUNTERPARTY);

        (bool valid, ICoverage.Reason r) = ENGINE.isValid(coverageId);
        if (!valid) return (false, r);
        if (c.drawn + amount > c.maxExposure) return (false, ICoverage.Reason.CAPACITY_EXCEEDED);
        if (amount > TOKEN.balanceOf(address(this))) return (false, ICoverage.Reason.CAPACITY_EXCEEDED);
        return (true, ICoverage.Reason.VALID);
    }
}
