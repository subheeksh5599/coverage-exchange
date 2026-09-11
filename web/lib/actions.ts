"use client";

// Every state-changing operation the product exposes. Each one is a real transaction
// against the deployed CC3 contracts, and each goes through `send` (simulate → sign →
// confirm) so a refusal is reported by name before the wallet is ever opened.

import { useCallback, useMemo } from "react";
import { parseUnits, type Abi } from "viem";
import { ADDR, CHALLENGE_ABI, ENGINE_ABI, ERC20_ABI, LENDING_ABI, MARKET_ABI } from "./chain";
import { send, ensureAllowance, type SendResult } from "./tx";
import { publicClient, useWallet } from "./wallet";
import { TOKEN_DECIMALS } from "./chain";

const UNITS = 10n ** BigInt(TOKEN_DECIMALS);

export function toUnits(s: string): bigint {
  const clean = (s || "").trim();
  if (!clean || Number.isNaN(Number(clean))) return 0n;
  return parseUnits(clean, TOKEN_DECIMALS);
}

export type ProofBundle = {
  coverageId: number;
  chainKey: number;
  blockHeight: number;
  encodedTransaction: `0x${string}`;
  merkleProof: { root: `0x${string}`; siblings: { hash: `0x${string}`; isLeft: boolean }[] };
  continuityProof: { lowerEndpointDigest: `0x${string}`; roots: `0x${string}`[] };
};

/** Fetch a real inclusion proof for a source-chain transaction from the public prover. */
export async function fetchProof(chainKey: number, txHash: string): Promise<ProofBundle> {
  const res = await fetch(
    `https://prover.cc3-testnet.creditcoin.network/api/v1/proof-by-tx/${chainKey}/${txHash}`
  );
  if (!res.ok) throw new Error(`proof builder returned HTTP ${res.status} for ${txHash}`);
  const d = await res.json();
  return {
    // coverageId is filled in by the caller — the proof itself does not depend on it.
    coverageId: 0,
    chainKey: Number(d.chainKey),
    blockHeight: Number(d.headerNumber),
    encodedTransaction: d.txBytes,
    merkleProof: { root: d.merkleProof.root, siblings: d.merkleProof.siblings },
    continuityProof: {
      lowerEndpointDigest: d.continuityProof.lowerEndpointDigest,
      roots: d.continuityProof.roots,
    },
  };
}

/** Read-only: would this counterexample breach that position right now? Costs nothing. */
export async function previewChallenge(bundle: ProofBundle): Promise<{ ok: boolean; reason: string }> {
  try {
    const [ok, reason] = (await publicClient.readContract({
      address: ADDR.challengeManager,
      abi: CHALLENGE_ABI,
      functionName: "previewChallenge",
      args: [
        BigInt(bundle.coverageId),
        BigInt(bundle.chainKey),
        BigInt(bundle.blockHeight),
        bundle.encodedTransaction,
        bundle.merkleProof,
        bundle.continuityProof,
      ],
    })) as [boolean, string];
    return { ok, reason };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message.split("\n")[0] : "preflight failed" };
  }
}

export function useActions() {
  const { walletClient, address } = useWallet();

  const ready = Boolean(walletClient && address);

  const guard = useCallback((): SendResult | null => {
    if (!walletClient || !address) {
      return { ok: false, message: "Connect a wallet first." };
    }
    return null;
  }, [walletClient, address]);

  const allowanceOf = useCallback(
    (spender: `0x${string}`) => async (): Promise<bigint> => {
      if (!address) return 0n;
      return (await publicClient.readContract({
        address: ADDR.token,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, spender],
      })) as bigint;
    },
    [address]
  );

  const call = useCallback(
    async (
      abi: Abi,
      target: `0x${string}`,
      functionName: string,
      args: readonly unknown[] = []
    ): Promise<SendResult> => {
      const g = guard();
      if (g) return g;
      return send({
        walletClient: walletClient!,
        address: address!,
        abi,
        address_: target,
        functionName,
        args,
      });
    },
    [guard, walletClient, address]
  );

  return useMemo(
    () => ({
      ready,

      /** Public faucet on the testnet demo asset — one real mint. */
      faucet: (amountWhole: string) =>
        call(ERC20_ABI, ADDR.token, "faucet", [address, toUnits(amountWhole)]),

      // ---------------------------------------------------------------- underwriter side

      depositBond: (amountWhole: string) =>
        (async (): Promise<SendResult> => {
          const g = guard();
          if (g) return g;
          const amt = toUnits(amountWhole);
          const a = await ensureAllowance(
            walletClient!,
            address!,
            ADDR.token,
            ADDR.engine,
            amt,
            ERC20_ABI,
            allowanceOf(ADDR.engine)
          );
          if (!a.ok) return a;
          return call(ENGINE_ABI, ADDR.engine, "deposit", [amt]);
        })(),

      withdrawBond: (amountWhole: string) =>
        call(ENGINE_ABI, ADDR.engine, "withdraw", [toUnits(amountWhole)]),

      /** Underwriter's published price for one borrower. Real on-chain tx. */
      setCounterpartyMultiplier: (borrower: `0x${string}`, bps: number) =>
        call(MARKET_ABI, ADDR.market, "setCounterpartyMultiplier", [borrower, bps]),

      // ------------------------------------------------------------------- borrower side

      /** Buy coverage. Premium leaves the borrower; the bond is locked from the underwriter. */
      buyCoverage: (params: {
        underwriter: `0x${string}`;
        chainKey: bigint;
        startBlock: bigint;
        endBlock: bigint;
        requiredDepth: bigint;
        maxExposure: bigint;
        capacity: bigint;
        bond: bigint;
        premium: bigint;
        predicate: `0x${string}`;
        predicateParams: `0x${string}`;
        sourceContract: `0x${string}`;
        eventSignature: `0x${string}`;
      }) =>
        (async (): Promise<SendResult> => {
          const g = guard();
          if (g) return g;
          const a = await ensureAllowance(
            walletClient!,
            address!,
            ADDR.token,
            ADDR.market,
            params.premium,
            ERC20_ABI,
            allowanceOf(ADDR.market)
          );
          if (!a.ok) return a;
          return call(MARKET_ABI, ADDR.market, "purchase", [
            {
              borrower: address!,
              underwriter: params.underwriter,
              chainKey: params.chainKey,
              startBlock: params.startBlock,
              endBlock: params.endBlock,
              requiredDepth: params.requiredDepth,
              maxExposure: params.maxExposure,
              capacity: params.capacity,
              bond: params.bond,
              premium: params.premium,
              predicate: params.predicate,
              predicateParams: params.predicateParams,
              sourceContract: params.sourceContract,
              eventSignature: params.eventSignature,
            },
          ]);
        })(),

      /** Draw against coverage. The pool re-checks validity on chain in this transaction. */
      draw: (coverageId: bigint, amountWhole: string) =>
        call(LENDING_ABI, ADDR.lendingAdapter, "draw", [coverageId, toUnits(amountWhole)]),

      repay: (coverageId: bigint, amountWhole: string) =>
        (async (): Promise<SendResult> => {
          const g = guard();
          if (g) return g;
          const amt = toUnits(amountWhole);
          const a = await ensureAllowance(
            walletClient!,
            address!,
            ADDR.token,
            ADDR.lendingAdapter,
            amt,
            ERC20_ABI,
            allowanceOf(ADDR.lendingAdapter)
          );
          if (!a.ok) return a;
          return call(LENDING_ABI, ADDR.lendingAdapter, "repay", [coverageId, amt]);
        })(),

      // ------------------------------------------------------------------- lender side

      depositLiquidity: (amountWhole: string) =>
        (async (): Promise<SendResult> => {
          const g = guard();
          if (g) return g;
          const amt = toUnits(amountWhole);
          const a = await ensureAllowance(
            walletClient!,
            address!,
            ADDR.token,
            ADDR.lendingAdapter,
            amt,
            ERC20_ABI,
            allowanceOf(ADDR.lendingAdapter)
          );
          if (!a.ok) return a;
          return call(LENDING_ABI, ADDR.lendingAdapter, "depositLiquidity", [amt]);
        })(),

      withdrawLiquidity: (amountWhole: string) =>
        call(LENDING_ABI, ADDR.lendingAdapter, "withdrawLiquidity", [toUnits(amountWhole)]),

      // --------------------------------------------------------------------- adjudication

      settle: (coverageId: bigint) =>
        call(ENGINE_ABI, ADDR.engine, "settle", [coverageId]),

      /** Submit a proven counterexample. Permissionless; the proof is the only credential. */
      challenge: (b: ProofBundle) =>
        call(CHALLENGE_ABI, ADDR.challengeManager, "challenge", [
          BigInt(b.coverageId),
          BigInt(b.chainKey),
          BigInt(b.blockHeight),
          b.encodedTransaction,
          b.merkleProof,
          b.continuityProof,
        ]),
    }),
    [ready, call, guard, walletClient, address, allowanceOf]
  );
}

export { UNITS };
