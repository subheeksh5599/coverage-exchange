// Chain constants for Coverage Exchange — Creditcoin CC3 testnet.
//
// Addresses, transaction hashes, attack rows and every measured number are IMPORTED from
// lib/evidence.generated.ts, which web/scripts/gen-evidence.mjs writes from the repository's
// evidence.json and worker/evidence/*.json. The UI keeps no on-chain facts of its own, so it
// cannot disagree with what the scripts actually recorded. Override addresses via NEXT_PUBLIC_*
// only if you redeploy.

import {
  CONTRACTS,
  DEMO_TXS as GEN_DEMO_TXS,
  ATTACKS as GEN_ATTACKS,
  MEASURED as GEN_MEASURED,
  SOURCE_EVIDENCE as GEN_SOURCE,
  COVERAGE_IDS,
  EXPLORER_TX,
  EXPLORER_ADDRESS,
} from "./evidence.generated";

export const CC3_RPC =
  process.env.NEXT_PUBLIC_CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";

export const EXPLORER = "https://creditcoin-testnet.blockscout.com";

export const CHAIN_ID = 102031;
export const SOURCE_CHAIN_KEY = 1; // Ethereum Sepolia in Attestcoin's key space

export const ADDR = {
  engine: (process.env.NEXT_PUBLIC_ENGINE_ADDRESS ?? CONTRACTS.engine) as `0x${string}`,
  adapter: (process.env.NEXT_PUBLIC_ADAPTER_ADDRESS ?? CONTRACTS.adapter) as `0x${string}`,
  market: (process.env.NEXT_PUBLIC_MARKET_ADDRESS ?? CONTRACTS.market) as `0x${string}`,
  challengeManager: (process.env.NEXT_PUBLIC_CHALLENGE_MANAGER_ADDRESS ??
    CONTRACTS.challengeManager) as `0x${string}`,
  lendingAdapter: (process.env.NEXT_PUBLIC_LENDING_ADAPTER_ADDRESS ??
    CONTRACTS.lendingAdapter) as `0x${string}`,
  token: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? CONTRACTS.token) as `0x${string}`,
  predicates: {
    prohibitedRecipient: CONTRACTS.predicateProhibitedRecipient as `0x${string}`,
    amountAboveLimit: CONTRACTS.predicateAmountAboveLimit as `0x${string}`,
    amountBelowFloor: CONTRACTS.predicateAmountBelowFloor as `0x${string}`,
  },
} as const;

/** Which coverage ids the recorded demo produced — used to deep-link the two outcomes. */
export const DEMO_COVERAGE = COVERAGE_IDS;

export const EXPLORER_TX_BASE = EXPLORER_TX;
export const EXPLORER_ADDR_BASE = EXPLORER_ADDRESS;

export const TOKEN_DECIMALS = 6;
export const TOKEN_SYMBOL = "cxTUSD";

export const STATUS_NAMES = ["ACTIVE", "BREACHED", "EXPIRED", "SETTLED"] as const;

export const REASON_NAMES = [
  "VALID",
  "UNKNOWN_COVERAGE",
  "STATUS_BREACHED",
  "STATUS_EXPIRED",
  "STATUS_SETTLED",
  "FRONTIER_UNAVAILABLE",
  "FRONTIER_PAST_LIVE_WINDOW",
  "WRONG_COUNTERPARTY",
  "CAPACITY_EXCEEDED",
  "BOND_BELOW_EXPOSURE",
] as const;

// Minimal read ABIs — mirrors contracts/src (CoverageEngine, AttestcoinAdapter).
export const ENGINE_ABI = [
  {
    type: "function",
    name: "nextCoverageId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "coverageRatioBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }],
  },
  {
    type: "function",
    name: "defaultGraceBlocks",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "isValid",
    stateMutability: "view",
    inputs: [{ name: "coverageId", type: "uint256" }],
    outputs: [
      { name: "ok", type: "bool" },
      { name: "reason", type: "uint8" },
    ],
  },
  {
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
  },
] as const;

export const ADAPTER_ABI = [
  {
    type: "function",
    name: "tryFrontier",
    stateMutability: "view",
    inputs: [{ name: "chainKey", type: "uint64" }],
    outputs: [
      { name: "available", type: "bool" },
      { name: "height", type: "uint64" },
      { name: "hash", type: "bytes32" },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

// ---------------------------------------------------------------------------
// Measured evidence, re-exported from the generated file. Every value was produced by a command
// in this repository and every hash resolves on the explorer. Nothing here is an estimate, and
// nothing here can be edited into disagreeing with evidence.json — it is generated.
// ---------------------------------------------------------------------------

export const DEMO_TXS = GEN_DEMO_TXS;

/** The Sepolia transfer that breached the covenant — the counterexample the challenger proved. */
export const SEPOLIA_COUNTEREXAMPLE = GEN_SOURCE;

/** Every attack the matrix ran against the live deployment, with the on-chain refusal reason. */
export const ATTACKS = GEN_ATTACKS;

export const MEASURED = GEN_MEASURED;

export function short(hash: string, lead = 8, tail = 6): string {
  return `${hash.slice(0, lead)}…${hash.slice(-tail)}`;
}

export function fmtToken(raw: bigint): string {
  const denom = 10n ** BigInt(TOKEN_DECIMALS);
  const whole = raw / denom;
  const frac = raw % denom;
  const wholeStr = whole.toLocaleString("en-US");
  if (frac === 0n) return wholeStr;
  const fracStr = frac.toString().padStart(TOKEN_DECIMALS, "0").replace(/0+$/, "");
  return `${wholeStr}.${fracStr}`;
}
