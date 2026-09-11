// Complete ABIs for the Coverage Exchange protocol, written in human-readable form so the
// write surface and every custom error live in one file. Kept beside the app (rather than
// generated) because the frontend now SIGNs these calls — a drifting ABI is a failed
// transaction, not a cosmetic bug.

import { parseAbi } from "viem";

export const ERC20_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  // Testnet-only public faucet. Real transaction, real mint.
  "function faucet(address to, uint256 amount)",
]);

const ENGINE_ABI_PARSED = parseAbi([
  // reads
  "function TOKEN() view returns (address)",
  "function ADAPTER() view returns (address)",
  "function market() view returns (address)",
  "function challengeManager() view returns (address)",
  "function lendingAdapter() view returns (address)",
  "function coverageRatioBps() view returns (uint16)",
  "function defaultGraceBlocks() view returns (uint64)",
  "function nextCoverageId() view returns (uint256)",
  "function underwriterBalance(address) view returns (uint256)",
  "function lockedBond(address) view returns (uint256)",
  "function freeBalance(address) view returns (uint256)",
  "function isValid(uint256 coverageId) view returns (bool, uint8)",
  "function previewDraw(uint256 coverageId, address borrower, uint256 amount) view returns (bool, uint8)",
  "function windowClosed(uint256 coverageId) view returns (bool)",
  "function effectiveStatus(uint256 coverageId) view returns (uint8)",
  "function adjudication(uint256) view returns (uint64 chainKey, uint64 startBlock, uint64 endBlock, address predicate, bytes32 predicateParams, address sourceContract, bytes32 eventSignature, uint8 status)",
  "function exposureOf(uint256 coverageId) view returns (uint256, uint256)",

  // writes — the underwriter capital layer
  "function deposit(uint256 amount)",
  "function withdraw(uint256 amount)",
  "function settle(uint256 coverageId)",
  // events (for real activity history)
  "event CoverageCreated(uint256 indexed coverageId, address indexed borrower, address indexed underwriter)",
  "event CoverageConsumed(uint256 indexed coverageId, address indexed borrower, uint256 amount)",
  "event CoverageBreached(uint256 indexed coverageId, bytes32 challengeKey, address indexed challenger)",
  "event CoverageSettled(uint256 indexed coverageId, address indexed underwriter, uint256 bondReleased)",
  "event UnderwriterDeposited(address indexed underwriter, uint256 amount)",
  "event UnderwriterWithdrew(address indexed underwriter, uint256 amount)",
  // errors
  "error UnknownCoverage(uint256 coverageId)",
  "error OutstandingExposure(uint256 drawn)",
  "error BondBelowExposure(uint256 bond, uint256 required)",
  "error CapacityBelowExposure(uint256 capacity, uint256 maxExposure)",
  "error InsufficientFreeBalance(uint256 free, uint256 requested)",
  "error InvalidWindow()",
  "error AlreadyTerminal(uint8 status)",
  "error NotExpiredYet(uint8 status)",
  "error DrawingFrozen(uint8 reason)",
  "error NotAuthorized()",
  "error ZeroAmount()",
]);

/**
 * `getCoverage` is declared as JSON rather than human-readable ABI so its 20 tuple fields keep
 * their names — callers read `c.borrower`, `c.bond`, `c.status`, and viem only exposes named
 * properties when the components are named. The human-readable form collapses them to
 * positional-only access.
 */
const GET_COVERAGE = {
  type: "function",
  name: "getCoverage",
  stateMutability: "view",
  inputs: [{ name: "coverageId", type: "uint256" }],
  outputs: [
    {
      type: "tuple",
      components: [
        { name: "id", type: "uint256" },
        { name: "borrower", type: "address" },
        { name: "underwriter", type: "address" },
        { name: "chainKey", type: "uint64" },
        { name: "startBlock", type: "uint64" },
        { name: "endBlock", type: "uint64" },
        { name: "requiredDepth", type: "uint64" },
        { name: "liveUntilHeight", type: "uint64" },
        { name: "maxExposure", type: "uint256" },
        { name: "capacity", type: "uint256" },
        { name: "drawn", type: "uint256" },
        { name: "bond", type: "uint256" },
        { name: "premium", type: "uint256" },
        { name: "predicate", type: "address" },
        { name: "predicateParams", type: "bytes32" },
        { name: "sourceContract", type: "address" },
        { name: "eventSignature", type: "bytes32" },
        { name: "status", type: "uint8" },
        { name: "createdAtBlock", type: "uint64" },
        { name: "challengeKey", type: "bytes32" },
      ],
    },
  ],
} as const;

/** The engine ABI as viem consumes it: the parsed human-readable entries plus the JSON
 *  `getCoverage` fragment that preserves tuple field names for both read layers. */
export const ENGINE_ABI_FULL = [...ENGINE_ABI_PARSED, GET_COVERAGE] as const;

export const ENGINE_ABI = ENGINE_ABI_FULL;

export const MARKET_ABI = parseAbi([
  "function TOKEN() view returns (address)",
  "function ENGINE() view returns (address)",
  "function quote(uint256 maxExposure, uint64 windowBlocks, uint64 requiredDepth, address underwriter, address borrower) view returns (uint256)",
  "function durationMultiplierBps(uint64 windowBlocks) view returns (uint16)",
  "function depthMultiplierBps(uint64 requiredDepth) view returns (uint16)",
  "function counterpartyMultiplierBps(address underwriter, address borrower) view returns (uint16)",
  "function curve() view returns (uint16 baseRateBps, uint16 durationBaseBps, uint16 durationPerBlockBps, uint16 durationCapBps, uint16 depthBaseBps, uint16 depthPerBlockBps, uint16 depthCapBps)",
  "function purchase((address borrower, address underwriter, uint64 chainKey, uint64 startBlock, uint64 endBlock, uint64 requiredDepth, uint256 maxExposure, uint256 capacity, uint256 bond, uint256 premium, address predicate, bytes32 predicateParams, address sourceContract, bytes32 eventSignature)) returns (uint256)",
  "function setCounterpartyMultiplier(address borrower, uint16 bps)",
  "event CoveragePurchased(uint256 indexed coverageId, address indexed borrower, address indexed underwriter, uint256 premium, uint256 bond)",
  "event CounterpartyMultiplierSet(address indexed underwriter, address indexed borrower, uint16 bps)",
  "error NotTheCounterparty()",
  "error ZeroAddress()",
  "error MultiplierOutOfRange()",
]);

export const LENDING_ABI = parseAbi([
  "function TOKEN() view returns (address)",
  "function ENGINE() view returns (address)",
  "function totalLiquidity() view returns (uint256)",
  "function liquidityOf(address) view returns (uint256)",
  "function exposureOfCoverage(uint256) view returns (uint256)",
  "function previewDraw(uint256 coverageId, address borrower, uint256 amount) view returns (bool, uint8)",
  "function depositLiquidity(uint256 amount)",
  "function withdrawLiquidity(uint256 amount)",
  "function draw(uint256 coverageId, uint256 amount)",
  "function repay(uint256 coverageId, uint256 amount)",
  "event LiquidityDeposited(address indexed lender, uint256 amount)",
  "event LiquidityWithdrawn(address indexed lender, uint256 amount)",
  "event Drawn(uint256 indexed coverageId, address indexed borrower, uint256 amount)",
  "event Repaid(uint256 indexed coverageId, address indexed borrower, uint256 amount)",
  "error CoverageNotValid(uint8 reason)",
  "error NotTheCounterparty()",
  "error InsufficientLiquidity(uint256 available, uint256 requested)",
  "error InsufficientExposure(uint256 outstanding, uint256 requested)",
]);

export const CHALLENGE_ABI = parseAbi([
  "function usedChallengeKeys(bytes32) view returns (bool)",
  "function challengeKeyOf(uint256 coverageId, uint64 chainKey, uint64 blockHeight, uint64 txIndex) view returns (bytes32)",
  "function previewChallenge(uint256 coverageId, uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) view returns (bool, string)",
  "function challenge(uint256 coverageId, uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) returns (bool)",
  "event ChallengeSubmitted(uint256 indexed coverageId, bytes32 indexed challengeKey, address indexed challenger)",
  "error WrongChain(uint64 expected, uint64 supplied)",
  "error BlockOutsideWindow(uint64 blockHeight, uint64 startBlock, uint64 endBlock)",
  "error TransactionFailed(uint8 receiptStatus)",
  "error PredicateNotViolated(string reason)",
  "error ProofInvalid()",
  "error ChallengeReplayed(bytes32 challengeKey)",
  "error NotLive()",
]);

export const ADAPTER_ABI = parseAbi([
  "function tryFrontier(uint64 chainKey) view returns (bool, uint64, bytes32)",
  "function frontierReached(uint64 chainKey, uint64 minHeight) view returns (bool)",
]);

export const PREDICATE_ABI = parseAbi([
  "function id() view returns (bytes32)",
  "function evaluate(bytes32 params, address expectedEmitter, bytes32 expectedTopic0, (address address_, bytes32[] topics, bytes data)[] logs) view returns (bool, string)",
]);

/** Every error a wallet can see, in one interface, so a revert is named rather than "unknown". */
export const DECODE_ERRORS = [
  ...ENGINE_ABI,
  ...MARKET_ABI,
  ...LENDING_ABI,
  ...CHALLENGE_ABI,
] as const;
