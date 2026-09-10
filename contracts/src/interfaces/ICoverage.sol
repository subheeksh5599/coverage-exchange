// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ICoverage
/// @notice Shared types for Coverage Exchange. The coverage position is the protocol's primitive:
///         bonded capital standing behind a claim about a range of source-chain history, which any
///         participant can destroy by proving one counterexample inside that range.
interface ICoverage {
    /// @dev One-way state machine. ACTIVE is entered at creation (the covered window may lie in the
    ///      future, which is the point — a lender needs coverage before releasing capital).
    ///      EXPIRED is computed from the attested frontier, never flipped by a keeper.
    ///      BREACHED and SETTLED are terminal. Nothing transitions INTO ACTIVE and nothing leaves
    ///      BREACHED — asserted by tests, see test/StateMachine.t.sol.
    enum Status {
        ACTIVE,
        BREACHED,
        EXPIRED,
        SETTLED
    }

    /// @dev Every reason a draw can be refused. Returned by isValid/previewDraw so a caller never has
    ///      to guess, and mirrored by the revert in the money path.
    enum Reason {
        VALID,
        UNKNOWN_COVERAGE,
        STATUS_BREACHED,
        STATUS_EXPIRED,
        STATUS_SETTLED,
        FRONTIER_UNAVAILABLE,
        FRONTIER_PAST_LIVE_WINDOW,
        WRONG_COUNTERPARTY,
        CAPACITY_EXCEEDED,
        BOND_BELOW_EXPOSURE
    }

    struct Coverage {
        uint256 id;
        address borrower; // the only counterparty this position may cover
        address underwriter; // capacity provider whose bond secures it
        uint64 chainKey; // Attestcoin chain key of the source chain (Sepolia = 1, mainnet = 3)
        uint64 startBlock; // covered window, source-chain heights, inclusive
        uint64 endBlock;
        uint64 requiredDepth; // attestation depth the frontier must pass endBlock by
        uint64 liveUntilHeight; // endBlock + requiredDepth + grace: the last height at which this
        //                          position may still gate exposure
        uint256 maxExposure; // largest exposure this position can unlock (token units)
        uint256 capacity; // funded coverage capacity, >= maxExposure
        uint256 drawn; // exposure currently unlocked under this position
        uint256 bond; // collateral locked from the underwriter for this position
        uint256 premium; // paid by the borrower to the underwriter at purchase
        address predicate; // invariant module evaluated against proven logs
        bytes32 predicateParams; // module-specific packed parameters, snapshotted at purchase
        address sourceContract; // the only emitter accepted as evidence on the source chain
        bytes32 eventSignature; // expected topic0 for evidence logs
        Status status;
        uint64 createdAtBlock; // Creditcoin block of purchase
        bytes32 challengeKey; // replay key of the counterexample that breached it
    }

    /// @dev Everything needed to create a position. Snapshotted in full; no field is mutable later.
    struct CreateParams {
        address borrower;
        address underwriter;
        uint64 chainKey;
        uint64 startBlock;
        uint64 endBlock;
        uint64 requiredDepth;
        uint256 maxExposure;
        uint256 capacity;
        uint256 bond;
        uint256 premium;
        address predicate;
        bytes32 predicateParams;
        address sourceContract;
        bytes32 eventSignature;
    }

    /// @dev The fields an adjudicator needs, and nothing else. Materialising the full 17-field
    ///      position inside the challenge path overflows the EVM stack without --via-ir, and copying
    ///      fields a decision does not use is pure gas. This is the adjudication surface.
    struct AdjudicationView {
        uint64 chainKey;
        uint64 startBlock;
        uint64 endBlock;
        address predicate;
        bytes32 predicateParams;
        address sourceContract;
        bytes32 eventSignature;
        Status status;
    }

    function isValid(uint256 coverageId) external view returns (bool ok, Reason reason);

    function adjudication(uint256 coverageId) external view returns (AdjudicationView memory);

    function getCoverage(uint256 coverageId) external view returns (Coverage memory);

    function exposureOf(uint256 coverageId) external view returns (uint256 drawn, uint256 remaining);
}
