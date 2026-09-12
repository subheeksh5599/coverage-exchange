// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title OfferRegistry
/// @notice The supply side, published. An underwriter authors an Offer describing exactly which
///         risk they are willing to bond; a borrower buys against it. The registry stores nothing
///         about pricing (the market computes the premium from the offer's terms) and adjudicates
///         nothing — it is a canonical list of unfilled promises the market can consume atomically.
///
/// @dev Two invariants the code enforces rather than doc-promises:
///        - Only the underwriter that published an offer can cancel it.
///        - Only the wired CoverageMarket can flip `filled`. The market does so in the same
///          transaction that creates the position, so a filled offer cannot leak twice.
contract OfferRegistry {
    struct Offer {
        uint256 id;
        address underwriter;
        address borrower; // address(0) = open to any borrower
        uint64 chainKey;
        uint64 requiredDepth;
        uint256 maxExposure;
        uint256 bond;
        uint64 windowBlocks;
        uint64 expiresAt; // creditcoin block.timestamp; 0 = never
        address sourceContract;
        bytes32 eventSignature;
        address predicate;
        bytes32 predicateParams;
        uint8 tranche; // 0 = SENIOR, 1 = JUNIOR
        bool cancelled;
        bool filled;
    }

    uint8 public constant TRANCHE_SENIOR = 0;
    uint8 public constant TRANCHE_JUNIOR = 1;

    address public immutable OWNER;
    address public market;

    uint256 public nextOfferId = 1;
    mapping(uint256 => Offer) private _offers;
    uint256[] private _allIds;

    event OfferPublished(uint256 indexed id, address indexed underwriter, address indexed borrower);
    event OfferCancelled(uint256 indexed id);
    event OfferFilled(uint256 indexed id, uint256 indexed coverageId);
    event MarketWired(address market);

    error NotAuthorized();
    error MarketAlreadyWired();
    error ZeroAddress();
    error UnknownOffer(uint256 id);
    error OfferCancelledError(uint256 id);
    error OfferAlreadyFilled(uint256 id);
    error OfferExpired(uint256 id);
    error BadTranche(uint8 tranche);
    error BadOffer();

    constructor() {
        OWNER = msg.sender;
    }

    /// @notice One-time wiring of the market that may flip `filled`. There is no rewire path.
    function setMarket(address market_) external {
        if (msg.sender != OWNER) revert NotAuthorized();
        if (market != address(0)) revert MarketAlreadyWired();
        if (market_ == address(0)) revert ZeroAddress();
        market = market_;
        emit MarketWired(market_);
    }

    // -------------------------------------------------------------------------------- publish/cancel

    /// @notice Publish an offer. The publisher IS the underwriter — no delegation, no proxy.
    function publishOffer(
        address borrower,
        uint64 chainKey,
        uint64 requiredDepth,
        uint256 maxExposure,
        uint256 bond,
        uint64 windowBlocks,
        uint64 expiresAt,
        address sourceContract,
        bytes32 eventSignature,
        address predicate,
        bytes32 predicateParams,
        uint8 tranche
    ) external returns (uint256 id) {
        if (predicate == address(0) || sourceContract == address(0)) revert ZeroAddress();
        if (maxExposure == 0 || bond == 0 || windowBlocks == 0) revert BadOffer();
        if (tranche > TRANCHE_JUNIOR) revert BadTranche(tranche);

        id = nextOfferId++;
        Offer storage o = _offers[id];
        o.id = id;
        o.underwriter = msg.sender;
        o.borrower = borrower;
        o.chainKey = chainKey;
        o.requiredDepth = requiredDepth;
        o.maxExposure = maxExposure;
        o.bond = bond;
        o.windowBlocks = windowBlocks;
        o.expiresAt = expiresAt;
        o.sourceContract = sourceContract;
        o.eventSignature = eventSignature;
        o.predicate = predicate;
        o.predicateParams = predicateParams;
        o.tranche = tranche;

        _allIds.push(id);
        emit OfferPublished(id, msg.sender, borrower);
    }

    /// @notice Retract an offer that has not been filled yet. Only the author may cancel.
    function cancelOffer(uint256 id) external {
        Offer storage o = _offers[id];
        if (o.id == 0) revert UnknownOffer(id);
        if (msg.sender != o.underwriter) revert NotAuthorized();
        if (o.cancelled) revert OfferCancelledError(id);
        if (o.filled) revert OfferAlreadyFilled(id);
        o.cancelled = true;
        emit OfferCancelled(id);
    }

    /// @notice Called by the market in the same transaction that creates the coverage position.
    ///         Reverts if the offer is already unusable — the market re-checks so the caller sees
    ///         the actual reason, but this guard is the load-bearing one for concurrency.
    function markFilled(uint256 id, uint256 coverageId) external {
        if (msg.sender != market) revert NotAuthorized();
        Offer storage o = _offers[id];
        if (o.id == 0) revert UnknownOffer(id);
        if (o.cancelled) revert OfferCancelledError(id);
        if (o.filled) revert OfferAlreadyFilled(id);
        if (o.expiresAt != 0 && block.timestamp > o.expiresAt) revert OfferExpired(id);
        o.filled = true;
        emit OfferFilled(id, coverageId);
    }

    // ---------------------------------------------------------------------------------------- views

    function getOffer(uint256 id) external view returns (Offer memory) {
        Offer memory o = _offers[id];
        if (o.id == 0) revert UnknownOffer(id);
        return o;
    }

    /// @notice Returns every offer that is currently open (not cancelled, not filled, not expired).
    ///         O(n) in total offer count — this is a UX helper, not a hot path.
    function listActiveOffers() external view returns (Offer[] memory active) {
        uint256 count = _activeCount();
        active = new Offer[](count);
        uint256 j;
        uint256 len = _allIds.length;
        for (uint256 i; i < len; ++i) {
            Offer memory o = _offers[_allIds[i]];
            if (_isActive(o)) {
                active[j++] = o;
            }
        }
    }

    function activeOfferCount() external view returns (uint256) {
        return _activeCount();
    }

    function _activeCount() internal view returns (uint256 n) {
        uint256 len = _allIds.length;
        for (uint256 i; i < len; ++i) {
            if (_isActive(_offers[_allIds[i]])) ++n;
        }
    }

    function _isActive(Offer memory o) internal view returns (bool) {
        if (o.cancelled || o.filled) return false;
        if (o.expiresAt != 0 && block.timestamp > o.expiresAt) return false;
        return true;
    }
}
