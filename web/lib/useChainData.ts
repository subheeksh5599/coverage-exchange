"use client";

// Live reads from Creditcoin CC3 testnet via public RPC. Read-only, keyless.
// No mock data anywhere: loading, empty and error states are rendered honestly.

import { useEffect, useRef, useState } from "react";
import { createPublicClient, http } from "viem";
import {
  ADDR,
  ADAPTER_ABI,
  ENGINE_ABI,
  ERC20_ABI,
  CC3_RPC,
  SOURCE_CHAIN_KEY,
  STATUS_NAMES,
  REASON_NAMES,
} from "./chain";

const client = createPublicClient({
  transport: http(CC3_RPC, { batch: true }),
});

// ---------------------------------------------------------------- frontier

export interface FrontierState {
  loading: boolean;
  available: boolean;
  height: bigint | null;
  hash: string | null;
  error: string | null;
}

export function useFrontier(pollMs = 15000): FrontierState {
  const [state, setState] = useState<FrontierState>({
    loading: true,
    available: false,
    height: null,
    hash: null,
    error: null,
  });

  useEffect(() => {
    let alive = true;
    async function read() {
      try {
        const [available, height, hash] = await client.readContract({
          address: ADDR.adapter,
          abi: ADAPTER_ABI,
          functionName: "tryFrontier",
          args: [BigInt(SOURCE_CHAIN_KEY)],
        });
        if (!alive) return;
        setState({
          loading: false,
          available,
          height: BigInt(height),
          hash,
          error: null,
        });
      } catch (e) {
        if (!alive) return;
        setState((s) => ({
          ...s,
          loading: false,
          available: false,
          error: e instanceof Error ? e.message : "rpc unreachable",
        }));
      }
    }
    read();
    const t = setInterval(read, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollMs]);

  return state;
}

// ---------------------------------------------------------------- positions

export interface Position {
  id: number;
  borrower: string;
  underwriter: string;
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
  predicate: string;
  sourceContract: string;
  status: (typeof STATUS_NAMES)[number];
  createdAtBlock: bigint;
  challengeKey: string;
  valid: boolean;
  reason: (typeof REASON_NAMES)[number];
}

export interface PositionsState {
  loading: boolean;
  error: string | null;
  total: number;
  positions: Position[];
  engineParams: { ratioBps: number; graceBlocks: bigint } | null;
  engineTvl: bigint | null;
}

export function usePositions(pollMs = 30000): PositionsState {
  const [state, setState] = useState<PositionsState>({
    loading: true,
    error: null,
    total: 0,
    positions: [],
    engineParams: null,
    engineTvl: null,
  });
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;

    async function read() {
      if (busy.current) return;
      busy.current = true;
      try {
        const [nextId, ratioBps, graceBlocks, tvl] = await Promise.all([
          client.readContract({
            address: ADDR.engine,
            abi: ENGINE_ABI,
            functionName: "nextCoverageId",
          }),
          client.readContract({
            address: ADDR.engine,
            abi: ENGINE_ABI,
            functionName: "coverageRatioBps",
          }),
          client.readContract({
            address: ADDR.engine,
            abi: ENGINE_ABI,
            functionName: "defaultGraceBlocks",
          }),
          client.readContract({
            address: ADDR.token,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [ADDR.engine],
          }),
        ]);

        const total = Number(nextId) - 1;
        const ids = Array.from({ length: total }, (_, i) => i + 1);

        const results = await Promise.all(
          ids.map(async (id) => {
            try {
              const [c, v] = await Promise.all([
                client.readContract({
                  address: ADDR.engine,
                  abi: ENGINE_ABI,
                  functionName: "getCoverage",
                  args: [BigInt(id)],
                }),
                client.readContract({
                  address: ADDR.engine,
                  abi: ENGINE_ABI,
                  functionName: "isValid",
                  args: [BigInt(id)],
                }),
              ]);
              const pos: Position = {
                id,
                borrower: c.borrower,
                underwriter: c.underwriter,
                chainKey: BigInt(c.chainKey),
                startBlock: BigInt(c.startBlock),
                endBlock: BigInt(c.endBlock),
                requiredDepth: BigInt(c.requiredDepth),
                liveUntilHeight: BigInt(c.liveUntilHeight),
                maxExposure: c.maxExposure,
                capacity: c.capacity,
                drawn: c.drawn,
                bond: c.bond,
                premium: c.premium,
                predicate: c.predicate,
                sourceContract: c.sourceContract,
                status: STATUS_NAMES[c.status] ?? "ACTIVE",
                createdAtBlock: BigInt(c.createdAtBlock),
                challengeKey: c.challengeKey,
                valid: v[0],
                reason: REASON_NAMES[v[1]] ?? "VALID",
              };
              return pos;
            } catch {
              return null;
            }
          })
        );

        if (!alive) return;
        setState({
          loading: false,
          error: null,
          total,
          positions: results.filter((p): p is Position => p !== null).reverse(),
          engineParams: { ratioBps: Number(ratioBps), graceBlocks: BigInt(graceBlocks) },
          engineTvl: tvl,
        });
      } catch (e) {
        if (!alive) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e.message : "rpc unreachable",
        }));
      } finally {
        busy.current = false;
      }
    }

    read();
    const t = setInterval(read, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollMs]);

  return state;
}
