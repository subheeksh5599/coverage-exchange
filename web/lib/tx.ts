"use client";

// The write path. Every state-changing button in this app goes through `send`, so three
// rules are enforced in exactly one place:
//
//   1. SIMULATE FIRST. The call is run against current chain state before a wallet prompt
//      appears, so a revert is reported as a sentence rather than a wallet that burns gas.
//   2. WAIT FOR THE RECEIPT. A hash is not a confirmation. Flows here chain transactions
//      (approve -> deposit, approve -> purchase), and returning on broadcast made the second
//      call simulate against pre-approval state and revert intermittently. Waiting also means
//      "Confirmed" in the UI is true.
//   3. NAME THE REVERT. The protocol reverts with custom errors, and errors cross contract
//      boundaries (the market's `purchase` reverts with the engine's `InsufficientFreeBalance`),
//      so decoding uses the union of every ABI in the protocol.

import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  type Abi,
  type WalletClient,
} from "viem";
import { DECODE_ERRORS } from "./abi";
import { publicClient } from "./wallet";

export type SendResult =
  | { ok: true; hash: `0x${string}` }
  | { ok: false; message: string; cancelled?: boolean };

/** Turn any thrown error into one honest sentence. */
export function explainError(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as
      | ContractFunctionRevertedError
      | null;

    // Try to decode the raw revert against the whole protocol, not just the called contract.
    const raw = (revert?.data as { data?: `0x${string}` } | undefined)?.data ?? revert?.raw;
    if (typeof raw === "string" && raw.startsWith("0x") && raw.length >= 10) {
      const named = decodeRevert(raw);
      if (named) return named;
    }

    if (revert?.data?.errorName) {
      const args = (revert.data.args ?? []) as unknown[];
      const pretty = args.map((a) => (typeof a === "bigint" ? a.toString() : String(a)));
      return pretty.length ? `${revert.data.errorName}(${pretty.join(", ")})` : `${revert.data.errorName}()`;
    }
    if (revert?.reason) return revert.reason;

    const msg = e.shortMessage || e.details || e.message;
    if (/user rejected|denied transaction/i.test(msg)) return "Transaction rejected in wallet.";
    if (/insufficient funds/i.test(msg)) return "Not enough CTC for gas — use the faucet.";
    if (/reverted with the following signature:\s*$/.test(msg)) {
      return "The call reverted with a custom error this build could not decode. Re-run it; if it persists, check the contract state (capacity, allowance, window).";
    }
    return msg.split("\n")[0];
  }
  if (e instanceof Error) {
    if (/user rejected|denied transaction/i.test(e.message)) return "Transaction rejected in wallet.";
    return e.message.split("\n")[0];
  }
  return "Unknown error.";
}

/**
 * Decode a raw revert against every error the protocol can raise. This matters because errors
 * cross contract boundaries: the market's `purchase` reverts with the engine's
 * `InsufficientFreeBalance`, which the market's own ABI cannot name.
 */
function decodeRevert(raw: `0x${string}`): string | null {
  try {
    const decoded = decodeErrorResult({ abi: DECODE_ERRORS, data: raw });
    const args = (decoded.args ?? []) as unknown as unknown[];
    const pretty = args.map((a) => (typeof a === "bigint" ? a.toString() : String(a)));
    return pretty.length ? `${decoded.errorName}(${pretty.join(", ")})` : `${decoded.errorName}()`;
  } catch {
    return null;
  }
}

type SendArgs = {
  walletClient: WalletClient;
  address: `0x${string}`;
  abi: Abi;
  address_: `0x${string}`;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

/**
 * Simulate, send, and WAIT for the receipt. The wait is what makes chained transactions
 * (approve then act) correct — and what makes the success reported to the user real rather
 * than merely broadcast.
 */
export async function send({
  walletClient,
  address,
  abi,
  address_: target,
  functionName,
  args = [],
  value,
}: SendArgs): Promise<SendResult> {
  try {
    await publicClient.simulateContract({
      account: address,
      address: target,
      abi,
      functionName,
      args: args as never,
      value,
    });
  } catch (e) {
    const message = explainError(e);
    return { ok: false, message, cancelled: /rejected in wallet/i.test(message) };
  }

  let hash: `0x${string}`;
  try {
    hash = await walletClient.writeContract({
      account: address,
      chain: walletClient.chain,
      address: target,
      abi,
      functionName,
      args: args as never,
      value,
    });
  } catch (e) {
    const message = explainError(e);
    return { ok: false, message, cancelled: /rejected in wallet/i.test(message) };
  }

  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });
    if (receipt.status === "reverted") {
      return { ok: false, message: `Transaction ${hash.slice(0, 12)}… reverted on chain.` };
    }
  } catch {
    // Mined but we could not confirm within the window — report honestly rather than
    // claiming a confirmation we did not observe.
    return {
      ok: false,
      message: `Broadcast (${hash.slice(0, 12)}…) but no confirmation observed yet. Check the explorer — it may still land.`,
    };
  }

  return { ok: true, hash };
}

/** Ask the wallet for an ERC-20 allowance and, when short, approve exactly what is needed. */
export async function ensureAllowance(
  walletClient: WalletClient,
  owner: `0x${string}`,
  token: `0x${string}`,
  spender: `0x${string}`,
  needed: bigint,
  abi: Abi,
  readAllowance: () => Promise<bigint>
): Promise<SendResult> {
  let current = 0n;
  try {
    current = await readAllowance();
  } catch {
    current = 0n;
  }
  if (current >= needed) return { ok: true, hash: "0x" };
  return send({
    walletClient,
    address: owner,
    abi,
    address_: token,
    functionName: "approve",
    args: [spender, needed],
  });
}

export { DECODE_ERRORS };
