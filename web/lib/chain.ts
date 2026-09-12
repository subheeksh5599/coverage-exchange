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
export const SOURCE_CHAIN_LABEL = "Sepolia";
export const CHAIN_LABEL = "Creditcoin CC3 testnet";
export const REPO = "https://github.com/subheeksh5599/coverage-exchange";

export const ADDR = {
  engine: (process.env.NEXT_PUBLIC_ENGINE_ADDRESS ?? CONTRACTS.engine) as `0x${string}`,
  adapter: (process.env.NEXT_PUBLIC_ADAPTER_ADDRESS ?? CONTRACTS.adapter) as `0x${string}`,
  market: (process.env.NEXT_PUBLIC_MARKET_ADDRESS ?? CONTRACTS.market) as `0x${string}`,
  challengeManager: (process.env.NEXT_PUBLIC_CHALLENGE_MANAGER_ADDRESS ??
    CONTRACTS.challengeManager) as `0x${string}`,
  lendingAdapter: (process.env.NEXT_PUBLIC_LENDING_ADAPTER_ADDRESS ??
    CONTRACTS.lendingAdapter) as `0x${string}`,
  // Offer registry is a new module — the current recorded deployment predates it, so the address
  // defaults to the zero address until a redeploy. Guard call sites against this in the UI.
  offerRegistry: (process.env.NEXT_PUBLIC_OFFER_REGISTRY_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`,
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

// The full ABIs live in lib/abi.ts. They are re-exported here so pages have one import
// site, and so the write surface (purchase, draw, challenge, deposit) cannot drift from the
// read surface — the app signs the same definitions it reads with.
export {
  ERC20_ABI,
  ENGINE_ABI,
  ADAPTER_ABI,
  LENDING_ABI,
  MARKET_ABI,
  CHALLENGE_ABI,
  OFFER_REGISTRY_ABI,
} from "./abi";

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
