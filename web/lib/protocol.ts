"use client";

// Live protocol reads. Everything here is a contract call against the deployed CC3
// contracts — there is no fixture file, no seeded array and no fallback value. When a read
// fails the hook reports `error` and the UI shows the failure rather than a plausible number.

import { formatUnits, type Abi } from "viem";
import {
  ADDR,
  ENGINE_ABI,
  ADAPTER_ABI,
  LENDING_ABI,
  MARKET_ABI,
  ERC20_ABI,
  STATUS_NAMES,
  REASON_NAMES,
  SOURCE_CHAIN_KEY,
  TOKEN_DECIMALS,
} from "./chain";
import { publicClient } from "./wallet";
import { usePoll } from "./usePoll";
import { latestBlock, scanContractEvents, spanFrom } from "./logs";


/** Decode a contract integer to bigint regardless of viem's width-dependent mapping
 *  (uint8..uint48 arrive as number, larger widths as bigint). */
function B(v: unknown): bigint {
  return typeof v === "bigint" ? v : BigInt(v as number | string);
}

export type Coverage = {
  id: bigint;
  borrower: `0x${string}`;
  underwriter: `0x${string}`;
  chainKey: bigint;
  startBlock: bigint;
  endBlock: bigint;
  requiredDepth: bigint;
  liveUntilHeight: bigint;
  maxExposure: bigint;
  capacity: bigint;
  drawn: bigint;
  bond: bigint;
  premium: bigint;
  predicate: `0x${string}`;
  predicateParams: `0x${string}`;
  sourceContract: `0x${string}`;
  eventSignature: `0x${string}`;
  status: number;
  createdAtBlock: bigint;
  challengeKey: `0x${string}`;
  /** Computed live by the engine, not stored: is this position gating exposure right now. */
  valid: boolean;
  reason: number;
};

/** The attested Sepolia frontier, read from the deployed adapter's precompile path. */
export function useFrontier() {
  return usePoll(async () => {
    const [available, height] = (await publicClient.readContract({
      address: ADDR.adapter,
      abi: ADAPTER_ABI,
      functionName: "tryFrontier",
      args: [BigInt(SOURCE_CHAIN_KEY)],
    })) as [boolean, bigint, `0x${string}`];
    return { available, height };
  }, []);
}

/** Everything about one connected account: token, bonds, capacity, lender position. */
export function useAccountState(address: `0x${string}` | null) {
  return usePoll(
    async () => {
      if (!address) return null;
      const [
        balance,
        engineAllowance,
        marketAllowance,
        poolAllowance,
        bondCapital,
        lockedBondPart,
        freeCapacity,
        lenderLiquidity,
      ] = await Promise.all([
        publicClient.readContract({ address: ADDR.token, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }),
        publicClient.readContract({ address: ADDR.token, abi: ERC20_ABI, functionName: "allowance", args: [address, ADDR.engine] }),
        publicClient.readContract({ address: ADDR.token, abi: ERC20_ABI, functionName: "allowance", args: [address, ADDR.market] }),
        publicClient.readContract({ address: ADDR.token, abi: ERC20_ABI, functionName: "allowance", args: [address, ADDR.lendingAdapter] }),
        publicClient.readContract({ address: ADDR.engine, abi: ENGINE_ABI, functionName: "underwriterBalance", args: [address] }),
        publicClient.readContract({ address: ADDR.engine, abi: ENGINE_ABI, functionName: "lockedBond", args: [address] }),
        publicClient.readContract({ address: ADDR.engine, abi: ENGINE_ABI, functionName: "freeBalance", args: [address] }),
        publicClient.readContract({ address: ADDR.lendingAdapter, abi: LENDING_ABI, functionName: "liquidityOf", args: [address] }),
      ]);
      const [ctc] = await Promise.all([
        publicClient.getBalance({ address }),
      ]);
      return {
        balance: B(balance),
        engineAllowance: B(engineAllowance),
        marketAllowance: B(marketAllowance),
        poolAllowance: B(poolAllowance),
        bondCapital: B(bondCapital),
        lockedBond: B(lockedBondPart),
        freeCapacity: B(freeCapacity),
        lenderLiquidity: B(lenderLiquidity),
        ctc,
      };
    },
    [address]
  );
}

/** Every coverage position that exists, with its live validity. */
export function usePositions() {
  return usePoll(async () => {
    const next = (await publicClient.readContract({
      address: ADDR.engine,
      abi: ENGINE_ABI,
      functionName: "nextCoverageId",
    })) as bigint;

    const ids: bigint[] = [];
    for (let i = 1n; i < next; i++) ids.push(i);

    const rows = await Promise.all(
      ids.map(async (id) => {
        const [c, v] = await Promise.all([
          publicClient.readContract({ address: ADDR.engine, abi: ENGINE_ABI, functionName: "getCoverage", args: [id] }),
          publicClient.readContract({ address: ADDR.engine, abi: ENGINE_ABI, functionName: "isValid", args: [id] }),
        ]);
        const tuple = c as unknown as readonly unknown[];
        const [valid, reason] = v as [boolean, number];
        const cov: Coverage = {
          id: B(tuple[0]),
          borrower: tuple[1] as `0x${string}`,
          underwriter: tuple[2] as `0x${string}`,
          chainKey: B(tuple[3]),
          startBlock: B(tuple[4]),
          endBlock: B(tuple[5]),
          requiredDepth: B(tuple[6]),
          liveUntilHeight: B(tuple[7]),
          maxExposure: B(tuple[8]),
          capacity: B(tuple[9]),
          drawn: B(tuple[10]),
          bond: B(tuple[11]),
          premium: B(tuple[12]),
          predicate: tuple[13] as `0x${string}`,
          predicateParams: tuple[14] as `0x${string}`,
          sourceContract: tuple[15] as `0x${string}`,
          eventSignature: tuple[16] as `0x${string}`,
          status: Number(tuple[17]),
          createdAtBlock: B(tuple[18]),
          challengeKey: tuple[19] as `0x${string}`,
          valid,
          reason,
        };
        return cov;
      })
    );
    return rows.sort((a, b) => Number(b.id - a.id));
  }, []);
}

/** Protocol-wide state, all computed from contract reads. */
export function useProtocolTotals() {
  return usePoll(async () => {
    const [next, ratio, grace, poolLiquidity, engineBalance, totalSupply, engineAddr] = await Promise.all([
      publicClient.readContract({ address: ADDR.engine, abi: ENGINE_ABI, functionName: "nextCoverageId" }),
      publicClient.readContract({ address: ADDR.engine, abi: ENGINE_ABI, functionName: "coverageRatioBps" }),
      publicClient.readContract({ address: ADDR.engine, abi: ENGINE_ABI, functionName: "defaultGraceBlocks" }),
      publicClient.readContract({ address: ADDR.lendingAdapter, abi: LENDING_ABI, functionName: "totalLiquidity" }),
      publicClient.readContract({ address: ADDR.token, abi: ERC20_ABI, functionName: "balanceOf", args: [ADDR.engine] }),
      publicClient.readContract({ address: ADDR.token, abi: ERC20_ABI, functionName: "totalSupply" }),
      publicClient.readContract({ address: ADDR.engine, abi: ENGINE_ABI, functionName: "market" }),
    ]);
    // Drawable liquidity is the pool's actual token balance, not its accounting total: the
    // difference is exposure already drawn out, and the pool can only lend what it holds.
    const poolBalance = (await publicClient.readContract({
      address: ADDR.token,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [ADDR.lendingAdapter],
    })) as bigint;

    return {
      positionCount: Number(B(next)) - 1,
      ratioBps: Number(B(ratio)),
      graceBlocks: Number(B(grace)),
      totalLiquidity: B(poolLiquidity),
      drawableLiquidity: poolBalance,
      engineBalance: B(engineBalance),
      totalSupply: B(totalSupply),
      engineAddr: engineAddr as `0x${string}`,
    };
  }, []);
}

/**
 * Underwriters discovered from the engine's own deposit logs.
 *
 * The log scan takes ~9s on a cold load (20k blocks in 4k chunks), which is too long to make a
 * user wait for, and the set changes only when someone deposits. So the result is cached per
 * tab: a repeat visit paints instantly from cache and then scans only the blocks since the
 * last scan. The cache is a latency optimisation, never a source of truth — the capacity shown
 * is always read live from the engine.
 */
const UW_CACHE = "cx.underwriters.v1";

type UwRow = {
  address: `0x${string}`;
  deposited: bigint;
  free: bigint;
  locked: bigint;
  total: bigint;
};

function readUwCache(): { rows: UwRow[]; lastBlock: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(UW_CACHE);
    if (!raw) return null;
    const d = JSON.parse(raw) as { rows: Record<string, string>[]; lastBlock: string };
    return {
      lastBlock: d.lastBlock,
      rows: d.rows.map((r) => ({
        address: r.address as `0x${string}`,
        deposited: BigInt(r.deposited),
        free: BigInt(r.free),
        locked: BigInt(r.locked),
        total: BigInt(r.total),
      })),
    };
  } catch {
    return null;
  }
}

function writeUwCache(rows: UwRow[], lastBlock: bigint) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      UW_CACHE,
      JSON.stringify({
        lastBlock: lastBlock.toString(),
        rows: rows.map((r) => ({
          address: r.address,
          deposited: r.deposited.toString(),
          free: r.free.toString(),
          locked: r.locked.toString(),
          total: r.total.toString(),
        })),
      })
    );
  } catch {
    /* storage full or blocked — the scan still works, it is just not cached */
  }
}

export function useUnderwriters() {
  return usePoll(async () => {
    const latest = await latestBlock();
    const cached = readUwCache();

    // Only scan what changed since the last look; fall back to the full span on a cold load.
    const from = cached ? BigInt(cached.lastBlock) + 1n : spanFrom(latest);
    const logs = await scanContractEvents(
      ADDR.engine,
      ENGINE_ABI as unknown as Abi,
      from,
      latest
    );

    const seen = new Map<string, { address: `0x${string}`; deposited: bigint }>();
    if (cached) {
      for (const r of cached.rows) seen.set(r.address.toLowerCase(), { address: r.address, deposited: r.deposited });
    }
    for (const l of logs) {
      if (l.name !== "UnderwriterDeposited") continue;
      const a = l.args.underwriter as `0x${string}`;
      const amt = l.args.amount as bigint;
      if (!a) continue;
      const cur = seen.get(a.toLowerCase());
      if (cur) cur.deposited += amt;
      else seen.set(a.toLowerCase(), { address: a, deposited: amt });
    }

    const rows: UwRow[] = await Promise.all(
      [...seen.values()].map(async (u) => {
        const [free, locked, total] = await Promise.all([
          publicClient.readContract({ address: ADDR.engine, abi: ENGINE_ABI, functionName: "freeBalance", args: [u.address] }),
          publicClient.readContract({ address: ADDR.engine, abi: ENGINE_ABI, functionName: "lockedBond", args: [u.address] }),
          publicClient.readContract({ address: ADDR.engine, abi: ENGINE_ABI, functionName: "underwriterBalance", args: [u.address] }),
        ]);
        return { address: u.address, deposited: u.deposited, free: B(free), locked: B(locked), total: B(total) };
      })
    );
    writeUwCache(rows, latest);
    return rows.sort((a, b) => Number(b.free - a.free));
  }, []);
}

/** A live premium quote from the market's on-chain pricing curve. */
export function useQuote(
  maxExposure: bigint,
  windowBlocks: bigint,
  requiredDepth: bigint,
  underwriter: `0x${string}` | null,
  borrower: `0x${string}` | null
) {
  return usePoll(
    async () => {
      if (!underwriter || !borrower || maxExposure <= 0n) return null;
      const [premium, durationM, depthM, cpm] = await Promise.all([
        publicClient.readContract({
          address: ADDR.market,
          abi: MARKET_ABI,
          functionName: "quote",
          args: [maxExposure, windowBlocks, requiredDepth, underwriter, borrower],
        }),
        publicClient.readContract({
          address: ADDR.market,
          abi: MARKET_ABI,
          functionName: "durationMultiplierBps",
          args: [windowBlocks],
        }),
        publicClient.readContract({
          address: ADDR.market,
          abi: MARKET_ABI,
          functionName: "depthMultiplierBps",
          args: [requiredDepth],
        }),
        publicClient.readContract({
          address: ADDR.market,
          abi: MARKET_ABI,
          functionName: "counterpartyMultiplierBps",
          args: [underwriter, borrower],
        }),
      ]);
      return {
        premium: B(premium),
        durationBps: Number(B(durationM)),
        depthBps: Number(B(depthM)),
        counterpartyBps: Number(B(cpm)) || 10_000,
      };
    },
    [maxExposure.toString(), windowBlocks.toString(), requiredDepth.toString(), underwriter, borrower]
  );
}

export { STATUS_NAMES, REASON_NAMES, TOKEN_DECIMALS };

export function unit(v: bigint): string {
  return formatUnits(v, TOKEN_DECIMALS);
}

export function money(v: bigint, dp = 2): string {
  const n = Number(formatUnits(v, TOKEN_DECIMALS));
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
