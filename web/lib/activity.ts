"use client";

// Activity history built from the protocol's own event logs. Every row is a real emitted
// event with its transaction hash — there is no synthetic "activity" array anywhere in the
// app, so an empty protocol shows an empty feed rather than sample data.
//
// Scanning is chunked (see lib/logs): a single wide eth_getLogs against this RPC returns an
// empty result instead of failing, which would make a busy protocol look dormant.

import { usePoll } from "./usePoll";
import { ADDR, CHALLENGE_ABI, ENGINE_ABI, LENDING_ABI, MARKET_ABI } from "./chain";
import { latestBlock, scanContractEvents, spanFrom, type DecodedLog } from "./logs";
import type { Abi } from "viem";

export type ActivityItem = {
  kind: string;
  label: string;
  tx: `0x${string}`;
  block: bigint;
  actor?: string;
  detail?: string;
  tone?: "ok" | "bad" | "neutral";
};

/**
 * Every event this app renders, keyed by name. A name absent from this map is simply not
 * shown — which keeps the feed honest about what it understands rather than guessing.
 */
const LABELS: Record<
  string,
  { kind: string; label: (a: Record<string, unknown>) => string; actor?: string; detail?: (a: Record<string, unknown>) => string; tone?: ActivityItem["tone"] }
> = {
  UnderwriterDeposited: { kind: "capital", label: () => "Underwriter deposited capacity", actor: "underwriter" },
  UnderwriterWithdrew: { kind: "capital", label: () => "Underwriter withdrew free capital", actor: "underwriter" },
  CoveragePurchased: {
    kind: "coverage",
    label: (a) => `Coverage #${a.coverageId} purchased`,
    actor: "borrower",
    detail: () => "premium paid, bond locked",
  },
  CounterpartyMultiplierSet: {
    kind: "pricing",
    label: () => "Pricing set for a borrower",
    actor: "underwriter",
    detail: (a) => `${a.bps} bps`,
  },
  LiquidityDeposited: { kind: "liquidity", label: () => "Lender supplied drawable liquidity", actor: "lender" },
  LiquidityWithdrawn: { kind: "liquidity", label: () => "Lender withdrew liquidity", actor: "lender" },
  Drawn: { kind: "draw", label: (a) => `Draw executed against coverage #${a.coverageId}`, actor: "borrower" },
  Repaid: { kind: "repay", label: (a) => `Repaid exposure on coverage #${a.coverageId}`, actor: "borrower" },
  CoverageCreated: { kind: "coverage", label: (a) => `Position #${a.coverageId} created`, actor: "borrower" },
  CoverageConsumed: {
    kind: "draw",
    label: (a) => `Exposure recorded on #${a.coverageId}`,
    actor: "borrower",
    detail: (a) => `${a.amount} units`,
  },
  ChallengeSubmitted: {
    kind: "challenge",
    label: (a) => `Counterexample submitted against #${a.coverageId}`,
    actor: "challenger",
    tone: "bad",
  },
  CoverageBreached: {
    kind: "breach",
    label: (a) => `Coverage #${a.coverageId} breached — bond moved`,
    actor: "challenger",
    tone: "bad",
  },
  CoverageSettled: {
    kind: "settle",
    label: (a) => `Coverage #${a.coverageId} settled — bond released`,
    actor: "underwriter",
    tone: "ok",
  },
};

function toItems(logs: DecodedLog[]): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const l of logs) {
    const spec = LABELS[l.name];
    if (!spec) continue;
    items.push({
      kind: spec.kind,
      label: spec.label(l.args),
      tx: l.tx,
      block: l.block,
      actor: spec.actor ? (l.args[spec.actor] as string | undefined) : undefined,
      detail: spec.detail?.(l.args),
      tone: spec.tone,
    });
  }
  return items;
}

export function useActivity() {
  return usePoll(async () => {
    const latest = await latestBlock();
    const from = spanFrom(latest);

    const [engine, market, lending, challenge] = await Promise.all([
      scanContractEvents(ADDR.engine, ENGINE_ABI as unknown as Abi, from, latest),
      scanContractEvents(ADDR.market, MARKET_ABI as unknown as Abi, from, latest),
      scanContractEvents(ADDR.lendingAdapter, LENDING_ABI as unknown as Abi, from, latest),
      scanContractEvents(ADDR.challengeManager, CHALLENGE_ABI as unknown as Abi, from, latest),
    ]);

    const items = toItems([...engine, ...market, ...lending, ...challenge]);
    // Stable, newest-first, and deterministic when several events share a block.
    items.sort((a, b) => Number(b.block - a.block) || (a.tx < b.tx ? 1 : -1));
    return items;
  }, []);
}
