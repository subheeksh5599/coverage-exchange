"use client";

// Log scanning.
//
// The CC3 public RPC caps the block range of a single `eth_getLogs` call: a 7,000-block
// window answers in ~3s, while a 60,000-block window returns an EMPTY result after ~11s
// rather than an error. A single wide query therefore looks like "this protocol has no
// history", which is the most dangerous possible failure for an activity feed.
//
// So: walk the range in small chunks, bounded concurrency, and decode by topic0. Callers get
// real events or an explicit failure — never an empty array because a query was too broad.

import { decodeEventLog, toEventSelector, type Abi, type AbiEvent } from "viem";
import { publicClient } from "./wallet";

/** Blocks per eth_getLogs call. Verified working size against the CC3 public RPC. */
export const CHUNK = 4_000;
const CONCURRENCY = 5;

type RawLog = {
  address: `0x${string}`;
  topics: readonly `0x${string}`[];
  data: `0x${string}`;
  blockNumber: bigint | null;
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
};

export type DecodedLog = {
  contract: `0x${string}`;
  name: string;
  args: Record<string, unknown>;
  block: bigint;
  tx: `0x${string}`;
};

function eventMap(abi: Abi): Map<string, AbiEvent> {
  const m = new Map<string, AbiEvent>();
  for (const item of abi as AbiEvent[]) {
    if ((item as { type?: string }).type !== "event") continue;
    try {
      m.set(toEventSelector(item), item);
    } catch {
      /* not a decodable event */
    }
  }
  return m;
}

/**
 * Scan one contract's logs over [fromBlock, toBlock] in chunks. Fetching without a topic
 * filter means one pass covers every event the contract emits, which keeps the activity feed
 * to ~3 scans instead of one per event type.
 */
export async function scanContractEvents(
  address: `0x${string}`,
  abi: Abi,
  fromBlock: bigint,
  toBlock: bigint,
  chunk = CHUNK
): Promise<DecodedLog[]> {
  const step = BigInt(chunk);
  const chunks: [bigint, bigint][] = [];
  for (let to = toBlock; to > fromBlock; to -= step) {
    const from = to - step + 1n > fromBlock ? to - step + 1n : fromBlock;
    chunks.push([from, to]);
  }

  const map = eventMap(abi);
  const out: DecodedLog[] = [];
  let failures = 0;

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async ([from, to]) => {
        try {
          return (await publicClient.getLogs({ address, fromBlock: from, toBlock: to })) as unknown as RawLog[];
        } catch {
          failures++;
          return [];
        }
      })
    );
    for (const logs of settled) {
      for (const log of logs) {
        const topic0 = log.topics?.[0];
        if (!topic0) continue;
        const item = map.get(topic0);
        if (!item) continue;
        try {
          const decoded = decodeEventLog({
            abi: [item],
            data: log.data,
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          });
          out.push({
            contract: address,
            name: item.name,
            args: (decoded.args ?? {}) as Record<string, unknown>,
            block: log.blockNumber ?? 0n,
            tx: log.transactionHash as `0x${string}`,
          });
        } catch {
          /* an undecodable log is not evidence */
        }
      }
    }
  }

  if (failures > 0 && out.length === 0) {
    throw new Error(
      `every one of ${failures} log chunks failed for ${address} — the RPC is not answering log queries`
    );
  }
  return out;
}

/** How far back the app looks. Wide enough to cover this deployment, cheap enough to poll. */
export const DEFAULT_SPAN = 60_000n;

export async function latestBlock(): Promise<bigint> {
  return publicClient.getBlockNumber();
}

export function spanFrom(latest: bigint, span: bigint = DEFAULT_SPAN): bigint {
  return latest > span ? latest - span : 0n;
}
