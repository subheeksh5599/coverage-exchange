#!/usr/bin/env node
/**
 * Challenger watcher.
 *
 * The mechanism's claim is that a false coverage position can be destroyed by ANYONE with a proof.
 * This is what "anyone" looks like in practice: a small process that watches a source-chain window
 * for the contracted evidence event, fetches the Attestcoin proof for anything it finds, asks the
 * protocol (read-only) whether that evidence breaches the position, and only then submits a
 * challenge — a normal transaction, signed by an ordinary key.
 *
 * Two modes, and the difference matters:
 *
 *   DRY RUN (no CHALLENGER_PRIVATE_KEY set)
 *     scans, fetches proofs, calls previewChallenge over eth_call, writes findings, submits nothing.
 *
 *   LIVE (CHALLENGER_PRIVATE_KEY set)
 *     does the same, then sends challenge(...) for anything the preview says would breach.
 *
 * It is a convenience, not the mechanism: the contract path it calls is permissionless and takes the
 * proof as the only credential. Deleting this file changes nothing about who may challenge.
 *
 * Env:
 *   CC3_RPC_URL              Creditcoin RPC            (default https://rpc.cc3-testnet.creditcoin.network)
 *   PROOF_BUILDER            proof builder base URL    (default https://prover.cc3-testnet.creditcoin.network)
 *   CHALLENGE_MANAGER        deployed ChallengeManager address (required for live previews)
 *   CHAIN_KEY                source chain key          (default 1 = Sepolia)
 *   SOURCE_RPC_URL           source chain RPC          (default https://ethereum-sepolia-rpc.publicnode.com)
 *   COVERAGE_IDS             comma-separated ids to watch (required)
 *   FROM_BLOCK / TO_BLOCK    scan range override; otherwise each position's own window
 *   CHALLENGER_PRIVATE_KEY   optional; presence enables submission
 *   POLL_SECONDS             default 60
 */
import { ethers } from 'ethers';
import { appendFileSync, mkdirSync } from 'node:fs';

const CC3_RPC = process.env.CC3_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const SOURCE_RPC = process.env.SOURCE_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const PROOF_BUILDER = process.env.PROOF_BUILDER ?? 'https://prover.cc3-testnet.creditcoin.network';
const CHAIN_KEY = Number(process.env.CHAIN_KEY ?? 1);
const POLL_SECONDS = Number(process.env.POLL_SECONDS ?? 60);

const CHALLENGE_MANAGER = process.env.CHALLENGE_MANAGER ?? '';
const COVERAGE_IDS = (process.env.COVERAGE_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const KEY = process.env.CHALLENGER_PRIVATE_KEY ?? '';

const ENGINE_ABI = [
  'function adjudication(uint256 coverageId) view returns (uint64 chainKey, uint64 startBlock, uint64 endBlock, address predicate, bytes32 predicateParams, address sourceContract, bytes32 eventSignature, uint8 status)',
  'function isValid(uint256 coverageId) view returns (bool, uint8)'
];

const CHALLENGE_ABI = [
  'function ENGINE() view returns (address)',
  'function ADAPTER() view returns (address)',
  'function previewChallenge(uint256 coverageId, uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) view returns (bool, string)',
  'function challenge(uint256 coverageId, uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) returns (bool)'
];

const EVIDENCE_DIR = new URL('../evidence/', import.meta.url).pathname;

function merkleArg(mp) {
  return [mp.root, mp.siblings.map((s) => [s.hash, s.isLeft])];
}
function continuityArg(cp) {
  return [cp.lowerEndpointDigest, cp.roots];
}
function log(record) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...record });
  console.log(line);
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  appendFileSync(`${EVIDENCE_DIR}watcher.jsonl`, line + '\n');
}

async function proofFor(txHash) {
  const res = await fetch(`${PROOF_BUILDER}/api/v1/proof-by-tx/${CHAIN_KEY}/${txHash}`);
  if (!res.ok) return null;
  return res.json();
}

async function scanOne(id, engineAddr, engine, source, challenges, wallet) {
  let a;
  try {
    a = await engine.adjudication(id);
  } catch (err) {
    log({ coverageId: id, event: 'adjudication_failed', detail: String(err).slice(0, 140) });
    return;
  }
  const [chainKey, startBlock, endBlock, , , sourceContract, eventSignature, status] = a;
  if (Number(status) !== 0) {
    // 0 = ACTIVE. Anything else is terminal or expired: nothing left to challenge.
    return;
  }

  // Look for the contracted evidence event inside the covered window, on the real source chain.
  const from = Number(process.env.FROM_BLOCK ?? startBlock);
  const to = Number(process.env.TO_BLOCK ?? endBlock);
  const logs = await source.getLogs({ address: sourceContract, topics: [eventSignature], fromBlock: from, toBlock: to });
  if (logs.length === 0) return;

  log({ coverageId: id, event: 'candidate_evidence', window: [from, to], matches: logs.length });

  for (const l of logs.slice(0, 10)) {
    const proof = await proofFor(l.transactionHash);
    if (!proof?.txBytes) continue;

    const args = [id, chainKey, proof.headerNumber, proof.txBytes, merkleArg(proof.merkleProof), continuityArg(proof.continuityProof)];
    const [wouldBreach, reason] = await challenges.previewChallenge.staticCall(...args);
    log({ coverageId: id, event: 'preview', txHash: l.transactionHash, height: Number(proof.headerNumber), wouldBreach, reason });

    if (wouldBreach && wallet) {
      const tx = await challenges.connect(wallet).challenge(...args);
      const receipt = await tx.wait();
      log({ coverageId: id, event: 'challenge_submitted', txHash: tx.hash, block: receipt.blockNumber, status: receipt.status });
    }
  }
}

async function tick(state) {
  const engine = state.engine;
  const source = state.source;
  const challenges = state.challenges;
  const wallet = state.wallet;
  for (const id of COVERAGE_IDS) {
    try {
      await scanOne(id, CHALLENGE_MANAGER, engine, source, challenges, wallet);
    } catch (err) {
      log({ coverageId: id, event: 'scan_error', detail: String(err).slice(0, 200) });
    }
  }
}

async function main() {
  if (!CHALLENGE_MANAGER) {
    console.error('CHALLENGE_MANAGER is required (we read coverage positions from its engine).');
    process.exit(1);
  }
  if (COVERAGE_IDS.length === 0) {
    console.error('COVERAGE_IDS is required, e.g. COVERAGE_IDS=1,2,3');
    process.exit(1);
  }

  const cc3 = new ethers.JsonRpcProvider(CC3_RPC);
  const source = new ethers.JsonRpcProvider(SOURCE_RPC);
  const challenges = new ethers.Contract(CHALLENGE_MANAGER, CHALLENGE_ABI, cc3);

  // The engine address is read from the deployed challenge manager, never trusted from config.
  const engineAddr = await challenges.ENGINE();
  const adapterAddr = await challenges.ADAPTER();
  const engine = new ethers.Contract(engineAddr, ENGINE_ABI, cc3);
  log({ event: 'wiring_resolved', challengeManager: CHALLENGE_MANAGER, engine: engineAddr, adapter: adapterAddr });
  const wallet = KEY ? new ethers.Wallet(KEY, cc3) : null;

  log({
    event: 'watcher_started',
    mode: wallet ? 'LIVE (will submit challenges)' : 'DRY RUN (previews only)',
    cc3Rpc: CC3_RPC,
    sourceRpc: SOURCE_RPC,
    chainKey: CHAIN_KEY,
    coverageIds: COVERAGE_IDS
  });

  const state = { engine, source, challenges, wallet };
  await tick(state);
  if (POLL_SECONDS > 0) {
    setInterval(() => tick(state).catch((e) => log({ event: 'tick_error', detail: String(e).slice(0, 200) })), POLL_SECONDS * 1000);
  }
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
