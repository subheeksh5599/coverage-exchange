#!/usr/bin/env node
/**
 * Keyless live verification of the Attestcoin integration.
 *
 * What it does, against the REAL Creditcoin CC3 testnet and the REAL Sepolia chain:
 *   1. reads the attested frontier from the ChainInfo precompile (0x0FD3),
 *   2. asks the public proof builder for a Merkle + continuity proof of a real Sepolia transaction,
 *   3. calls the Block Prover precompile (0x0FD2) verify() with that proof over eth_call,
 *   4. tampers with the proven bytes and calls it again, expecting rejection.
 *
 * No key, no funds, no deployment: everything is a read. If step 3 returns true and step 4 is
 * rejected, the protocol's Attestcoin dependency is demonstrated end to end by the live nodes.
 *
 * Usage:
 *   node scripts/live-precompile-check.mjs [sepoliaTxHash]
 *
 * Env overrides:
 *   CC3_RPC_URL     (default https://rpc.cc3-testnet.creditcoin.network)
 *   SEPOLIA_RPC_URL (default https://ethereum-sepolia-rpc.publicnode.com)
 *   PROOF_BUILDER   (default https://prover.cc3-testnet.creditcoin.network)
 *   CHAIN_KEY       (default 1 = Ethereum Sepolia)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { ethers } from 'ethers';

const CC3_RPC = process.env.CC3_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const PROOF_BUILDER = process.env.PROOF_BUILDER ?? 'https://prover.cc3-testnet.creditcoin.network';
const CHAIN_KEY = Number(process.env.CHAIN_KEY ?? 1);

const BLOCK_PROVER = '0x0000000000000000000000000000000000000FD2';
const CHAIN_INFO = '0x0000000000000000000000000000000000000fD3';

const CHAIN_INFO_ABI = [
  'function get_latest_attestation_height_and_hash(uint64 chainKey) view returns (uint64 height, bytes32 hash, bool isAttestation, bool exists)',
  'function is_height_attested(uint64 chainKey, uint64 height) view returns (bool)'
];

const BLOCK_PROVER_ABI = [
  'function verify(uint64 chainKey, uint64 height, bytes encodedTransaction, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) view returns (bool)'
];

const results = [];
function record(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}  ${detail ?? ''}`);
}

async function main() {
  const cc3 = new ethers.JsonRpcProvider(CC3_RPC);
  const sepolia = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const chainInfo = new ethers.Contract(CHAIN_INFO, CHAIN_INFO_ABI, cc3);
  const prover = new ethers.Contract(BLOCK_PROVER, BLOCK_PROVER_ABI, cc3);

  // --- 1. the attested frontier, straight from the precompile -------------------------------
  let frontier;
  try {
    const [height, hash, isAttestation, exists] = await chainInfo.get_latest_attestation_height_and_hash(CHAIN_KEY);
    frontier = { height: Number(height), hash, isAttestation, exists };
    record('chaininfo.frontier', exists && Number(height) > 0, `frontier=${height} hash=${hash}`);
  } catch (err) {
    record('chaininfo.frontier', false, String(err).slice(0, 160));
    return finish();
  }

  const attestedBool = await chainInfo.is_height_attested(CHAIN_KEY, frontier.height);
  record('chaininfo.is_height_attested(frontier)', attestedBool === true, `-> ${attestedBool}`);

  const futureBool = await chainInfo.is_height_attested(CHAIN_KEY, BigInt(frontier.height) + 10_000_000n);
  record('chaininfo.is_height_attested(frontier + 10M)', futureBool === false, `-> ${futureBool} (must be false)`);

  // --- 2. a real proof of a real source-chain transaction ------------------------------------
  let txHash = process.argv[2];
  if (!txHash) {
    // Pick a block comfortably below the frontier so its proof is already available.
    const target = frontier.height - 10_000;
    const block = await sepolia.getBlock(target, false);
    if (!block || block.transactions.length === 0) {
      record('sepolia.pickTransaction', false, `no transactions in block ${target}`);
      return finish();
    }
    txHash = block.transactions[0];
    record('sepolia.pickTransaction', true, `block ${target} tx ${txHash}`);
  } else {
    record('sepolia.pickTransaction', true, `supplied ${txHash}`);
  }

  const url = `${PROOF_BUILDER}/api/v1/proof-by-tx/${CHAIN_KEY}/${txHash}`;
  const res = await fetch(url);
  if (!res.ok) {
    record('proofBuilder.fetchProof', false, `HTTP ${res.status}`);
    return finish();
  }
  const proof = await res.json();
  const ok = proof.txBytes && proof.merkleProof?.root && Array.isArray(proof.continuityProof?.roots);
  record('proofBuilder.fetchProof', ok, `height=${proof.headerNumber} txIndex=${proof.txIndex} siblings=${proof.merkleProof?.siblings?.length} roots=${proof.continuityProof?.roots?.length}`);
  if (!ok) return finish();

  const merkleProof = [proof.merkleProof.root, proof.merkleProof.siblings.map((s) => [s.hash, s.isLeft])];
  const continuityProof = [proof.continuityProof.lowerEndpointDigest, proof.continuityProof.roots];

  // --- 3. the REAL precompile must accept it -------------------------------------------------
  let accepted = null;
  try {
    accepted = await prover.verify(CHAIN_KEY, proof.headerNumber, proof.txBytes, merkleProof, continuityProof);
    record('blockprover.verify(realProof)', accepted === true, `-> ${accepted}`);
  } catch (err) {
    record('blockprover.verify(realProof)', false, `reverted: ${String(err).slice(0, 160)}`);
  }

  // --- 4. a tampered payload must be rejected -----------------------------------------------
  const tampered = tamper(proof.txBytes);
  let tamperRejected = false;
  let tamperDetail = '';
  try {
    const bad = await prover.verify(CHAIN_KEY, proof.headerNumber, tampered, merkleProof, continuityProof);
    tamperRejected = bad === false;
    tamperDetail = `-> ${bad} (must be false)`;
  } catch (err) {
    tamperRejected = true;
    tamperDetail = `reverted as expected: ${String(err).slice(0, 80)}`;
  }
  record('blockprover.verify(tamperedPayload)', tamperRejected, tamperDetail);

  finish({
    network: { cc3Rpc: CC3_RPC, sepoliaRpc: SEPOLIA_RPC, chainKey: CHAIN_KEY },
    proofBuilder: PROOF_BUILDER,
    frontier,
    proof: {
      txHash: proof.txHash,
      headerNumber: proof.headerNumber,
      txIndex: proof.txIndex,
      merkleRoot: proof.merkleProof.root,
      siblings: proof.merkleProof.siblings.length,
      continuityRoots: proof.continuityProof.roots.length
    },
    claimed: {
      realProofAccepted: accepted === true,
      tamperedProofRejected: tamperRejected
    }
  });
}

/** Flip one bit in the transaction payload without changing its length. */
function tamper(hex) {
  const body = hex.slice(2);
  const idx = body.length - 2;
  const nibble = (parseInt(body[idx], 16) ^ 0x1).toString(16);
  return '0x' + body.slice(0, idx) + nibble + body.slice(idx + 1);
}

function finish(evidence) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (evidence) {
    const dir = new URL('../evidence/', import.meta.url).pathname;
    mkdirSync(dir, { recursive: true });
    const out = { generatedAt: new Date().toISOString(), ...evidence, checks: results };
    writeFileSync(`${dir}live-precompile.json`, JSON.stringify(out, null, 2));
    console.log('evidence written to worker/evidence/live-precompile.json');
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
