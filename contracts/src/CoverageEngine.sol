// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ICoverage} from "./interfaces/ICoverage.sol";
import {AttestcoinAdapter} from "./AttestcoinAdapter.sol";

/// @title CoverageEngine
/// @notice Positions, capacity accounting, validity and the one-way state machine. Holds no
///         business policy of its own: the market prices, the challenge manager adjudicates, the
///         lending adapter consumes. This contract only answers "is this coverage valid" and moves
///         the bond exactly once.
///
/// @dev Deliberate design constraints, all enforced in code rather than promised in docs:
///      - validity is COMPUTED from the attested frontier on every call. No stored "is valid" flag,
///        no keeper to expire a position, no way for a stale local value to assert readiness.
///      - a position is immutable after creation: borrower, window, depth, exposure, bond,
///        predicate, predicate params, source contract and event signature are all snapshotted.
///      - the bond is locked, not merely recorded: an underwriter can only withdraw the free part,
///        so a bond that secures live exposure cannot walk away.
///      - the owner has NO function that can breach a position, release a bond early, or declare a
///        draw valid. Owner powers are limited to wiring module addresses once and setting the
///        coverage ratio / grace / fee parameters. See SECURITY.md.
contract CoverageEngine is ICoverage, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;

    uint8 public constant TRANCHE_SENIOR = 0;
    uint8 public constant TRANCHE_JUNIOR = 1;

    /// @dev A capacity provider for one coverage position. A single-underwriter position stores one
    ///      entry; an aggregated position stores several, and their bonds are locked and released
    ///      independently. Junior tranches lose accounting priority on breach (paid to challenger
    ///      first), which is only observable through the emitted ContributorSlashed events since
    ///      the total bond leaves in one transfer.
    struct Contributor {
        address underwriter;
        uint256 bond;
        uint8 tranche;
    }

    IERC20 public immutable TOKEN;
    AttestcoinAdapter public immutable ADAPTER;

    address public market;
    address public challengeManager;
    address public lendingAdapter;

    /// @notice bond must be at least maxExposure * coverageRatioBps / BPS. 10_000 = bond covers the
    ///         exposure one-for-one. Below that, breaching on purpose is profitable.
    uint16 public coverageRatioBps = 10_000;

    /// @notice Source-chain blocks of slack after a window closes during which a position may still
    ///         gate exposure, so evidence has time to mature.
    uint64 public defaultGraceBlocks = 10_000;

    uint256 public nextCoverageId = 1;

    mapping(uint256 => Coverage) private _coverages;
    mapping(uint256 => Contributor[]) private _contributors;
    mapping(address => uint256) public underwriterBalance;
    mapping(address => uint256) public lockedBond;

    event CoverageCreated(uint256 indexed coverageId, address indexed borrower, address indexed underwriter);
    event CoverageConsumed(uint256 indexed coverageId, address indexed borrower, uint256 amount);
    event CoverageBreached(uint256 indexed coverageId, bytes32 challengeKey, address indexed challenger);
    event ContributorSlashed(
        uint256 indexed coverageId, address indexed underwriter, uint256 bond, uint8 tranche
    );
    event CoverageSettled(uint256 indexed coverageId, address indexed underwriter, uint256 bondReleased);
    event UnderwriterDeposited(address indexed underwriter, uint256 amount);
    event UnderwriterWithdrew(address indexed underwriter, uint256 amount);
    event ModulesWired(address market, address challengeManager, address lendingAdapter);

    error NotAuthorized();
    error ModulesAlreadyWired();
    error ZeroAddress();
    error ZeroAmount();
    error UnknownCoverage(uint256 coverageId);
    error OutstandingExposure(uint256 drawn);
    error BondBelowExposure(uint256 bond, uint256 required);
    error CapacityBelowExposure(uint256 capacity, uint256 maxExposure);
    error InsufficientFreeBalance(uint256 free, uint256 requested);
    error InvalidWindow();
    error AlreadyTerminal(Status status);
    error NotExpiredYet(Status status);
    error DrawingFrozen(Reason reason);
    error NoContributors();
    error BadTranche(uint8 tranche);
    error ContributorBondMismatch(uint256 sum, uint256 declared);

    constructor(IERC20 token, AttestcoinAdapter adapter) Ownable(msg.sender) {
        if (address(token) == address(0) || address(adapter) == address(0)) revert ZeroAddress();
        TOKEN = token;
        ADAPTER = adapter;
    }

    modifier onlyMarket() {
        if (msg.sender != market) revert NotAuthorized();
        _;
    }

    modifier onlyChallengeManager() {
        if (msg.sender != challengeManager) revert NotAuthorized();
        _;
    }

    modifier onlyLendingAdapter() {
        if (msg.sender != lendingAdapter) revert NotAuthorized();
        _;
    }

    // --------------------------------------------------------------------- wiring & configuration

    /// @notice One-time wiring of the three modules. There is no setter to re-wire later.
    function wireModules(address market_, address challengeManager_, address lendingAdapter_)
        external
        onlyOwner
    {
        if (market != address(0) || challengeManager != address(0) || lendingAdapter != address(0)) {
            revert ModulesAlreadyWired();
        }
        if (market_ == address(0) || challengeManager_ == address(0) || lendingAdapter_ == address(0)) {
            revert ZeroAddress();
        }
        market = market_;
        challengeManager = challengeManager_;
        lendingAdapter = lendingAdapter_;
        emit ModulesWired(market_, challengeManager_, lendingAdapter_);
    }

    /// @notice Risk parameters. None of these can change an existing position: they are read only at
    ///         creation time, and every position snapshots its own values.
    function setRiskParameters(uint16 coverageRatioBps_, uint64 defaultGraceBlocks_) external onlyOwner {
        require(coverageRatioBps_ >= BPS, "ratio below 100%");
        coverageRatioBps = coverageRatioBps_;
        defaultGraceBlocks = defaultGraceBlocks_;
    }

    // ------------------------------------------------------------------ underwriter capital layer

    /// @notice Deposit bond capital. Capacity is only ever created from a deposit: the protocol
    ///         cannot mint coverage out of nothing.
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        underwriterBalance[msg.sender] += amount;
        emit UnderwriterDeposited(msg.sender, amount);
    }

    /// @notice Withdraw capital that is not securing anything. Reverts when the requested amount
    ///         touches a locked bond — the single most important economic invariant of the system.
    function withdraw(uint256 amount) external nonReentrant {
        uint256 free = freeBalance(msg.sender);
        if (amount > free) revert InsufficientFreeBalance(free, amount);
        underwriterBalance[msg.sender] -= amount;
        TOKEN.safeTransfer(msg.sender, amount);
        emit UnderwriterWithdrew(msg.sender, amount);
    }

    function freeBalance(address underwriter) public view returns (uint256) {
        return underwriterBalance[underwriter] - lockedBond[underwriter];
    }

    // --------------------------------------------------------------------------- position creation

    /// @notice Create a coverage position. Called by the market, which has already collected the
    ///         premium and validated the quote. Shim: the position has one SENIOR contributor whose
    ///         bond is the whole bond — indistinguishable from the aggregated case at rest, so the
    ///         breach/settle code has one path.
    function createCoverage(CreateParams calldata p) external onlyMarket returns (uint256 id) {
        if (p.underwriter == address(0)) revert ZeroAddress();
        Contributor[] memory one = new Contributor[](1);
        one[0] = Contributor({underwriter: p.underwriter, bond: p.bond, tranche: TRANCHE_SENIOR});
        id = _createCoverage(p, one);
    }

    /// @notice Create a position backed by several underwriters, each contributing part of the bond
    ///         and either the SENIOR or JUNIOR tranche. `p.underwriter` MUST be address(0) — the
    ///         position has no single author — and `p.bond` MUST equal the sum of contributor bonds.
    function createAggregatedCoverage(CreateParams calldata p, Contributor[] calldata contributors)
        external
        onlyMarket
        returns (uint256 id)
    {
        if (p.underwriter != address(0)) revert ZeroAddress();
        if (contributors.length == 0) revert NoContributors();

        uint256 sum;
        for (uint256 i; i < contributors.length; ++i) {
            if (contributors[i].underwriter == address(0)) revert ZeroAddress();
            if (contributors[i].tranche > TRANCHE_JUNIOR) revert BadTranche(contributors[i].tranche);
            sum += contributors[i].bond;
        }
        if (sum != p.bond) revert ContributorBondMismatch(sum, p.bond);

        id = _createCoverage(p, _copyToMemory(contributors));
    }

    function _copyToMemory(Contributor[] calldata src) internal pure returns (Contributor[] memory out) {
        out = new Contributor[](src.length);
        for (uint256 i; i < src.length; ++i) out[i] = src[i];
    }

    /// @dev Shared post-validation body. Every contributor's bond is locked in the same pass, so a
    ///      contributor whose free balance is short reverts the whole creation atomically.
    function _createCoverage(CreateParams calldata p, Contributor[] memory contributors)
        internal
        returns (uint256 id)
    {
        if (p.startBlock >= p.endBlock) revert InvalidWindow();
        if (p.borrower == address(0) || p.predicate == address(0)) revert ZeroAddress();
        if (p.capacity < p.maxExposure) revert CapacityBelowExposure(p.capacity, p.maxExposure);

        uint256 requiredBond = (p.maxExposure * coverageRatioBps) / BPS;
        if (p.bond < requiredBond) revert BondBelowExposure(p.bond, requiredBond);

        for (uint256 i; i < contributors.length; ++i) {
            address u = contributors[i].underwriter;
            uint256 b = contributors[i].bond;
            if (freeBalance(u) < b) revert InsufficientFreeBalance(freeBalance(u), b);
            lockedBond[u] += b;
        }

        id = nextCoverageId++;
        // Fields are written one at a time rather than as one struct literal: a 17-field literal
        // pushes the EVM stack over the limit without --via-ir, and via-ir costs minutes of compile
        // time on every iteration. Same bytecode semantics, far cheaper to iterate on.
        Coverage storage c = _coverages[id];
        c.id = id;
        c.borrower = p.borrower;
        c.underwriter = p.underwriter;
        c.chainKey = p.chainKey;
        c.startBlock = p.startBlock;
        c.endBlock = p.endBlock;
        c.requiredDepth = p.requiredDepth;
        c.liveUntilHeight = p.endBlock + p.requiredDepth + defaultGraceBlocks;
        c.maxExposure = p.maxExposure;
        c.capacity = p.capacity;
        c.drawn = 0;
        c.bond = p.bond;
        c.premium = p.premium;
        c.predicate = p.predicate;
        c.predicateParams = p.predicateParams;
        c.sourceContract = p.sourceContract;
        c.eventSignature = p.eventSignature;
        c.status = Status.ACTIVE;
        c.createdAtBlock = uint64(block.number);
        c.challengeKey = bytes32(0);

        Contributor[] storage cs = _contributors[id];
        for (uint256 i; i < contributors.length; ++i) cs.push(contributors[i]);

        emit CoverageCreated(id, p.borrower, p.underwriter);
    }

    // ------------------------------------------------------------------------------- adjudication

    /// @notice Apply a verified counterexample. Called only by the ChallengeManager, after the
    ///         BlockProver precompile has verified inclusion and the predicate has confirmed the
    ///         violation. The bond moves to the challenger in this same call — atomic, no window
    ///         between "breached" and "paid".
    function applyBreach(uint256 coverageId, bytes32 challengeKey, address challenger)
        external
        onlyChallengeManager
    {
        Coverage storage c = _coverages[coverageId];
        if (c.id == 0) revert UnknownCoverage(coverageId);

        Status eff = effectiveStatus(coverageId);
        // A position that already expired cannot be breached: the exposure it gated has lapsed and
        // the bond is no longer at risk. A deterministic rule, not a discretionary one.
        if (eff != Status.ACTIVE) revert AlreadyTerminal(eff);

        c.status = Status.BREACHED;
        c.challengeKey = challengeKey;

        // JUNIOR tranches are slashed before SENIOR in the accounting pass — the total bond leaves
        // in a single transfer to the challenger, so ordering only shows up in per-contributor
        // events, but downstream reporting depends on it.
        Contributor[] storage cs = _contributors[coverageId];
        uint256 n = cs.length;
        uint256 totalBond;
        for (uint8 pass = TRANCHE_JUNIOR;; --pass) {
            for (uint256 i; i < n; ++i) {
                Contributor storage k = cs[i];
                if (k.tranche != pass) continue;
                lockedBond[k.underwriter] -= k.bond;
                underwriterBalance[k.underwriter] -= k.bond;
                totalBond += k.bond;
                emit ContributorSlashed(coverageId, k.underwriter, k.bond, k.tranche);
            }
            if (pass == TRANCHE_SENIOR) break;
        }

        if (totalBond > 0) {
            TOKEN.safeTransfer(challenger, totalBond);
        }

        emit CoverageBreached(coverageId, challengeKey, challenger);
    }

    /// @notice Release a bond whose window closed cleanly. Permissionless: there is no reason to gate
    ///         returning an underwriter's own capital, and no way to abuse it (the expiry condition
    ///         is computed from the attested frontier, not from the caller).
    function settle(uint256 coverageId) external nonReentrant {
        Coverage storage c = _coverages[coverageId];
        if (c.id == 0) revert UnknownCoverage(coverageId);
        if (c.drawn != 0) revert OutstandingExposure(c.drawn);

        Status eff = effectiveStatus(coverageId);
        if (eff == Status.BREACHED) revert AlreadyTerminal(eff);
        if (eff == Status.SETTLED) revert AlreadyTerminal(eff);
        if (eff != Status.EXPIRED && eff != Status.ACTIVE) revert NotExpiredYet(eff);

        // Only settle once the covered window is genuinely behind the frontier.
        if (eff == Status.ACTIVE) {
            (bool available,,) = ADAPTER.tryFrontier(c.chainKey);
            if (!available) revert NotExpiredYet(Status.ACTIVE);
            if (!_windowClosed(coverageId)) revert NotExpiredYet(Status.ACTIVE);
        }

        c.status = Status.SETTLED;
        uint256 released = c.bond;
        Contributor[] storage cs = _contributors[coverageId];
        for (uint256 i; i < cs.length; ++i) {
            lockedBond[cs[i].underwriter] -= cs[i].bond;
        }

        emit CoverageSettled(coverageId, c.underwriter, released);
    }

    // ------------------------------------------------------------------------------- consumption

    /// @notice Record unlocked exposure. Called by the lending adapter after it has checked
    ///         isValid() in the same transaction.
    function consume(uint256 coverageId, uint256 amount) external onlyLendingAdapter {
        (bool ok, Reason reason) = isValid(coverageId);
        if (!ok) revert DrawingFrozen(reason);

        Coverage storage c = _coverages[coverageId];
        if (c.drawn + amount > c.maxExposure) revert DrawingFrozen(Reason.CAPACITY_EXCEEDED);
        c.drawn += amount;

        emit CoverageConsumed(coverageId, c.borrower, amount);
    }

    /// @notice Repayment lowers the outstanding exposure so capacity becomes reusable.
    function release(uint256 coverageId, uint256 amount) external onlyLendingAdapter {
        Coverage storage c = _coverages[coverageId];
        if (c.id == 0) revert UnknownCoverage(coverageId);
        c.drawn = amount >= c.drawn ? 0 : c.drawn - amount;
    }

    // ------------------------------------------------------------------------------------ views

    /// @notice The stored status plus the two conditions that are computed rather than stored:
    ///         expiry, which follows from the attested frontier crossing liveUntilHeight.
    function effectiveStatus(uint256 coverageId) public view returns (Status) {
        Coverage storage c = _coverages[coverageId];
        if (c.id == 0) revert UnknownCoverage(coverageId);
        if (c.status == Status.BREACHED || c.status == Status.SETTLED) return c.status;

        (bool available, uint64 frontier,) = ADAPTER.tryFrontier(c.chainKey);
        if (!available) {
            // Fail closed on reads too: an unreachable frontier means "we cannot show this is live",
            // and the drawer must treat it as not live. isValid() reports FRONTIER_UNAVAILABLE.
            return c.status;
        }
        if (frontier > c.liveUntilHeight) return Status.EXPIRED;
        return Status.ACTIVE;
    }

    /// @notice The protocol's central predicate. True only while every condition holds at once.
    function isValid(uint256 coverageId) public view returns (bool ok, Reason reason) {
        Coverage storage c = _coverages[coverageId];
        if (c.id == 0) return (false, Reason.UNKNOWN_COVERAGE);

        if (c.status == Status.BREACHED) return (false, Reason.STATUS_BREACHED);
        if (c.status == Status.SETTLED) return (false, Reason.STATUS_SETTLED);

        (bool available, uint64 frontier,) = ADAPTER.tryFrontier(c.chainKey);
        if (!available) return (false, Reason.FRONTIER_UNAVAILABLE);
        if (frontier > c.liveUntilHeight) return (false, Reason.FRONTIER_PAST_LIVE_WINDOW);

        if (c.drawn >= c.maxExposure) return (false, Reason.CAPACITY_EXCEEDED);

        return (true, Reason.VALID);
    }

    /// @notice Preflight for a draw: the same checks the money path will repeat, plus the two that
    ///         depend on the caller (counterparty and amount). Never the source of truth — the
    ///         adapter rechecks everything on-chain in the drawing transaction.
    function previewDraw(uint256 coverageId, address borrower, uint256 amount)
        external
        view
        returns (bool ok, Reason reason)
    {
        Coverage storage c = _coverages[coverageId];
        if (c.id == 0) return (false, Reason.UNKNOWN_COVERAGE);
        if (c.borrower != borrower) return (false, Reason.WRONG_COUNTERPARTY);

        (bool valid, Reason r) = isValid(coverageId);
        if (!valid) return (false, r);
        if (c.drawn + amount > c.maxExposure) return (false, Reason.CAPACITY_EXCEEDED);

        return (true, Reason.VALID);
    }

    /// @notice Has the attested frontier closed the covered window at the required depth? This is the
    ///         evidentiary completeness condition: the window is only fully covered once the frontier
    ///         has passed endBlock by requiredDepth, which is what makes absence auditable.
    function windowClosed(uint256 coverageId) external view returns (bool) {
        return _windowClosed(coverageId);
    }

    function _windowClosed(uint256 coverageId) internal view returns (bool) {
        Coverage storage c = _coverages[coverageId];
        if (!ADAPTER.frontierReached(c.chainKey, c.endBlock + c.requiredDepth)) return false;
        return true;
    }

    /// @notice The lean surface the ChallengeManager adjudicates against.
    function adjudication(uint256 coverageId) external view returns (AdjudicationView memory v) {
        Coverage storage c = _coverages[coverageId];
        if (c.id == 0) revert UnknownCoverage(coverageId);
        v = AdjudicationView({
            chainKey: c.chainKey,
            startBlock: c.startBlock,
            endBlock: c.endBlock,
            predicate: c.predicate,
            predicateParams: c.predicateParams,
            sourceContract: c.sourceContract,
            eventSignature: c.eventSignature,
            status: effectiveStatus(coverageId)
        });
    }

    function getCoverage(uint256 coverageId) external view returns (Coverage memory) {
        Coverage memory c = _coverages[coverageId];
        if (c.id == 0) revert UnknownCoverage(coverageId);
        c.status = effectiveStatus(coverageId);
        return c;
    }

    function exposureOf(uint256 coverageId) external view returns (uint256 drawn, uint256 remaining) {
        Coverage storage c = _coverages[coverageId];
        if (c.id == 0) revert UnknownCoverage(coverageId);
        drawn = c.drawn;
        remaining = c.maxExposure - c.drawn;
    }

    function contributorsOf(uint256 coverageId) external view returns (Contributor[] memory list) {
        Coverage storage c = _coverages[coverageId];
        if (c.id == 0) revert UnknownCoverage(coverageId);
        Contributor[] storage cs = _contributors[coverageId];
        list = new Contributor[](cs.length);
        for (uint256 i; i < cs.length; ++i) list[i] = cs[i];
    }

    function contributorCount(uint256 coverageId) external view returns (uint256) {
        Coverage storage c = _coverages[coverageId];
        if (c.id == 0) revert UnknownCoverage(coverageId);
        return _contributors[coverageId].length;
    }
}
