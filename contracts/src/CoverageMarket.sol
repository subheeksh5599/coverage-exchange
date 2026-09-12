// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ICoverage} from "./interfaces/ICoverage.sol";
import {CoverageEngine} from "./CoverageEngine.sol";
import {OfferRegistry} from "./OfferRegistry.sol";

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
        uint16 trancheJuniorMultiplierBps; // JUNIOR-tranche premium multiplier
        uint16 utilBaseBps; // utilization multiplier at zero locked bond
        uint16 utilPerBpsUtilBps; // added per 1 bps of underwriter utilization
        uint16 utilCapBps; // ceiling for the utilization multiplier
    }

    PricingCurve public curve = PricingCurve({
        baseRateBps: 50, // 0.50% of exposure at 1.0x multipliers
        durationBaseBps: 10_000, // 1.00x
        durationPerBlockBps: 5, // +0.05% per block, so 100 blocks -> 1.05x
        durationCapBps: 30_000, // 3.00x ceiling
        depthBaseBps: 10_000, // 1.00x
        depthPerBlockBps: 25, // +0.25% per block of depth, so depth 32 -> 1.08x
        depthCapBps: 20_000, // 2.00x ceiling
        trancheJuniorMultiplierBps: 15_000, // 1.50x on JUNIOR tranche
        utilBaseBps: 10_000, // 1.00x at zero utilization
        utilPerBpsUtilBps: 10_000, // +1.0x at full utilization -> 2.00x
        utilCapBps: 25_000 // 2.50x ceiling
    });

    OfferRegistry public offerRegistry;

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
    error OfferRegistryAlreadySet();
    error OfferRegistryNotSet();
    error OfferUnavailable();
    error OfferExpired();
    error EmptyBasket();
    error OffersDoNotAggregate();
    error ContributorMisreported();

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
        if (
            c.durationBaseBps == 0 || c.depthBaseBps == 0 || c.baseRateBps == 0
                || c.trancheJuniorMultiplierBps == 0 || c.utilBaseBps == 0 || c.utilCapBps == 0
        ) revert BadCurve();
        curve = c;
    }

    /// @notice One-time wiring of the offer registry that publishes underwriter capacity.
    function setOfferRegistry(address registry) external onlyOwner {
        if (address(offerRegistry) != address(0)) revert OfferRegistryAlreadySet();
        if (registry == address(0)) revert ZeroAddress();
        offerRegistry = OfferRegistry(registry);
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

    /// @notice Utilization multiplier for an underwriter. `u = lockedBond * BPS / balance`, then
    ///         `base + perBpsUtil * u / BPS`, capped. Fully reproducible from on-chain state.
    function utilizationMultiplierBps(address underwriter) public view returns (uint16) {
        uint256 bal = ENGINE.underwriterBalance(underwriter);
        uint256 locked = ENGINE.lockedBond(underwriter);
        // Fresh underwriters with zero deposit are priced at the base rate rather than divided by
        // zero — the InsufficientFreeBalance check at creation still refuses the actual bond lock.
        uint256 u = bal == 0 ? 0 : (locked * BPS) / bal;
        uint256 m = uint256(curve.utilBaseBps) + uint256(curve.utilPerBpsUtilBps) * u / BPS;
        return m > curve.utilCapBps ? curve.utilCapBps : uint16(m);
    }

    /// @notice Reproducible premium quote. Anyone can recompute this from public inputs.
    function quote(
        uint256 maxExposure,
        uint64 windowBlocks,
        uint64 requiredDepth,
        address underwriter,
        address borrower
    ) public view returns (uint256 premium) {
        return _quote(maxExposure, windowBlocks, requiredDepth, underwriter, borrower, 0);
    }

    /// @notice Tranche-aware quote — SENIOR (0) charges the base curve, JUNIOR (1) adds a fixed
    ///         multiplier that reflects loss-priority under aggregation.
    function quoteTranche(
        uint256 maxExposure,
        uint64 windowBlocks,
        uint64 requiredDepth,
        address underwriter,
        address borrower,
        uint8 tranche
    ) public view returns (uint256 premium) {
        return _quote(maxExposure, windowBlocks, requiredDepth, underwriter, borrower, tranche);
    }

    function _quote(
        uint256 maxExposure,
        uint64 windowBlocks,
        uint64 requiredDepth,
        address underwriter,
        address borrower,
        uint8 tranche
    ) internal view returns (uint256 premium) {
        uint16 cpm = counterpartyMultiplierBps[underwriter][borrower];
        if (cpm == 0) cpm = BPS;
        uint16 tm = tranche == 1 ? curve.trancheJuniorMultiplierBps : BPS;
        uint16 um = utilizationMultiplierBps(underwriter);

        uint256 risk = uint256(curve.baseRateBps) * durationMultiplierBps(windowBlocks) / BPS
            * depthMultiplierBps(requiredDepth) / BPS * cpm / BPS * tm / BPS * um / BPS;

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

    // ------------------------------------------------------------------------- offer-driven paths

    /// @notice Buy a coverage position by accepting a specific published offer. The offer's terms
    ///         are the ones snapshotted into the position — the caller supplies only startBlock
    ///         so the window can float within the offer's promised duration.
    function purchaseOffer(uint256 offerId, uint64 startBlock)
        external
        nonReentrant
        returns (uint256 coverageId)
    {
        if (address(offerRegistry) == address(0)) revert OfferRegistryNotSet();
        OfferRegistry.Offer memory o = offerRegistry.getOffer(offerId);
        if (o.cancelled || o.filled) revert OfferUnavailable();
        if (o.expiresAt != 0 && block.timestamp > o.expiresAt) revert OfferExpired();
        if (o.borrower != address(0) && o.borrower != msg.sender) revert NotTheCounterparty();

        ICoverage.CreateParams memory p = _paramsFromOffer(o, msg.sender, startBlock);
        p.premium =
            quoteTranche(o.maxExposure, o.windowBlocks, o.requiredDepth, o.underwriter, msg.sender, o.tranche);

        if (p.premium > 0) TOKEN.safeTransferFrom(msg.sender, o.underwriter, p.premium);

        coverageId = ENGINE.createCoverage(p);
        offerRegistry.markFilled(offerId, coverageId);
        emit CoveragePurchased(coverageId, p.borrower, p.underwriter, p.premium, p.bond);
    }

    /// @notice Buy one position backed by a basket of offers. All offers must be identical on the
    ///         terms that define the covered risk (chain, depth, window, source, event, predicate,
    ///         params, borrower target). Exposures and bonds sum; the premium is the sum of the
    ///         per-contributor quotes, each priced against its own underwriter's utilization.
    function purchaseAggregated(uint256[] calldata offerIds, uint64 startBlock)
        external
        nonReentrant
        returns (uint256 coverageId)
    {
        if (address(offerRegistry) == address(0)) revert OfferRegistryNotSet();
        if (offerIds.length == 0) revert EmptyBasket();

        OfferRegistry.Offer memory head = offerRegistry.getOffer(offerIds[0]);
        _validateOfferForPurchase(head, msg.sender);

        uint256 totalExposure = head.maxExposure;
        uint256 totalBond = head.bond;
        uint256 totalPremium = quoteTranche(
            head.maxExposure, head.windowBlocks, head.requiredDepth, head.underwriter, msg.sender, head.tranche
        );

        CoverageEngine.Contributor[] memory contributors =
            new CoverageEngine.Contributor[](offerIds.length);
        contributors[0] = CoverageEngine.Contributor({
            underwriter: head.underwriter,
            bond: head.bond,
            tranche: head.tranche
        });

        for (uint256 i = 1; i < offerIds.length; ++i) {
            OfferRegistry.Offer memory o = offerRegistry.getOffer(offerIds[i]);
            _validateOfferForPurchase(o, msg.sender);
            if (
                o.chainKey != head.chainKey || o.requiredDepth != head.requiredDepth
                    || o.windowBlocks != head.windowBlocks || o.sourceContract != head.sourceContract
                    || o.eventSignature != head.eventSignature || o.predicate != head.predicate
                    || o.predicateParams != head.predicateParams || o.borrower != head.borrower
            ) revert OffersDoNotAggregate();

            totalExposure += o.maxExposure;
            totalBond += o.bond;
            totalPremium += quoteTranche(
                o.maxExposure, o.windowBlocks, o.requiredDepth, o.underwriter, msg.sender, o.tranche
            );
            contributors[i] = CoverageEngine.Contributor({
                underwriter: o.underwriter,
                bond: o.bond,
                tranche: o.tranche
            });
        }

        // Aggregated position has no single underwriter — the engine keys off address(0) and reads
        // contributors instead. All bonds are locked in the same call, atomically.
        ICoverage.CreateParams memory p = ICoverage.CreateParams({
            borrower: msg.sender,
            underwriter: address(0),
            chainKey: head.chainKey,
            startBlock: startBlock,
            endBlock: startBlock + head.windowBlocks,
            requiredDepth: head.requiredDepth,
            maxExposure: totalExposure,
            capacity: totalExposure,
            bond: totalBond,
            premium: totalPremium,
            predicate: head.predicate,
            predicateParams: head.predicateParams,
            sourceContract: head.sourceContract,
            eventSignature: head.eventSignature
        });

        // The premium is split across underwriters proportional to the quote each earned, so nobody
        // subsidises another underwriter's utilization.
        if (totalPremium > 0) {
            TOKEN.safeTransferFrom(msg.sender, address(this), totalPremium);
            uint256 paid;
            for (uint256 i; i < offerIds.length; ++i) {
                OfferRegistry.Offer memory o = offerRegistry.getOffer(offerIds[i]);
                uint256 share = (i == offerIds.length - 1)
                    ? totalPremium - paid
                    : quoteTranche(o.maxExposure, o.windowBlocks, o.requiredDepth, o.underwriter, msg.sender, o.tranche);
                if (share > 0) TOKEN.safeTransfer(o.underwriter, share);
                paid += share;
            }
        }

        coverageId = ENGINE.createAggregatedCoverage(p, contributors);
        for (uint256 i; i < offerIds.length; ++i) {
            offerRegistry.markFilled(offerIds[i], coverageId);
        }

        emit CoveragePurchased(coverageId, msg.sender, address(0), totalPremium, totalBond);
    }

    function _validateOfferForPurchase(OfferRegistry.Offer memory o, address buyer) internal view {
        if (o.cancelled || o.filled) revert OfferUnavailable();
        if (o.expiresAt != 0 && block.timestamp > o.expiresAt) revert OfferExpired();
        if (o.borrower != address(0) && o.borrower != buyer) revert NotTheCounterparty();
    }

    function _paramsFromOffer(OfferRegistry.Offer memory o, address buyer, uint64 startBlock)
        internal
        pure
        returns (ICoverage.CreateParams memory p)
    {
        p = ICoverage.CreateParams({
            borrower: buyer,
            underwriter: o.underwriter,
            chainKey: o.chainKey,
            startBlock: startBlock,
            endBlock: startBlock + o.windowBlocks,
            requiredDepth: o.requiredDepth,
            maxExposure: o.maxExposure,
            capacity: o.maxExposure,
            bond: o.bond,
            premium: 0,
            predicate: o.predicate,
            predicateParams: o.predicateParams,
            sourceContract: o.sourceContract,
            eventSignature: o.eventSignature
        });
    }
}
