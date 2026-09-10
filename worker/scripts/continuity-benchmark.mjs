#!/usr/bin/env node
/**
 * Continuity compression benchmark — MEASURED, not asserted.
 *
 * The claim: verifying N cross-chain facts costs N continuity proofs in the naive shape, and ONE
 * continuity proof in this protocol's shape, because the expensive part of Attestcoin verification is
 * the continuity chain and the precompile's batch overload charges it once per window.
 *
 * This script measures, against the REAL CC3 testnet precompiles and the REAL public proof builder:
 *   - per-transaction proofs fetched individually      -> N separate verifyAndEmit calls, gas summed
 *   - the same transactions fetched as a batch proof    -> 1 shared-continuity verifyAndEmit call
 * plus the calldata each shape sends.
 *
 * Everything is eth_estimateGas / eth_call: no key, no funds, nothing deployed. Re-runnable by anyone.
 *
 * Usage: node scripts/continuity-benchmark.mjs [N]      (default 10)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { ethers } from 'ethers';

const CC3_RPC = process.env.CC3_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const PROOF_BUILDER = process.env.PROOF_BUILDER ?? 'https://prover.cc3-testnet.creditcoin.network';
const CHAIN_KEY = Number(process.env.CHAIN_KEY ?? 1);

const BLOCK_PROVER = '0x0000000000000000000000000000000000000FD2';
const CHAIN_INFO = '0x0000000000000000000000000000000000000fD3';

const IFACE = new ethers.Interface([
  'function get_latest_attestation_height_and_hash(uint64 chainKey) view returns (uint64 height, bytes32 hash, bool isAttestation, bool exists)',
  'function verifyAndEmit(uint64 chainKey, uint64 height, bytes encodedTransaction, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) returns (bool)',
  'function verifyAndEmit(uint64 chainKey, uint64[] heights, bytes[] encodedTransactions, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings)[] merkleProofs, (bytes32 lowerEndpointDigest, bytes32[] roots) sharedContinuityProof) returns (bool)'
]);

const N = Number(process.argv[2] ?? 10);

// Both overloads share a name, so ethers needs the full signature to disambiguate.
const SINGLE = 'verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))';
const BATCH = 'verifyAndEmit(uint64,uint64[],bytes[],(bytes32,(bytes32,bool)[])[],(bytes32,bytes32[]))';

const merkleArg = (mp) => [mp.root, mp.siblings.map((s) => [s.hash, s.isLeft])];
const continuityArg = (cp) => [cp.lowerEndpointDigest, cp.roots];

async function main() {
  const cc3 = new ethers.JsonRpcProvider(CC3_RPC);
  const sepolia = new ethers.JsonRpcProvider(SEPOLIA_RPC);

  const chainInfo = new ethers.Contract(
    CHAIN_INFO,
    new ethers.Interface(['function get_latest_attestation_height_and_hash(uint64) view returns (uint64,bytes32,bool,bool)']),
    cc3
  );
  const frontier = Number((await chainInfo.get_latest_attestation_height_and_hash(CHAIN_KEY))[0]);
  console.log(`attested frontier (chainKey ${CHAIN_KEY}): ${frontier}`);
  console.log(`measuring N=${N} …\n`);

  // --- pick N real Sepolia transactions from blocks below the frontier -------------------------
  const hashes = [];
  const proofs = [];
  for (let i = 0; i < N; i++) {
    const blockNumber = frontier - 5_000 - i * 37;
    const block = await sepolia.getBlock(blockNumber, false);
    if (!block || block.transactions.length === 0) continue;
    const txHash = block.transactions[0];

    const res = await fetch(`${PROOF_BUILDER}/api/v1/proof-by-tx/${CHAIN_KEY}/${txHash}`);
    if (!res.ok) continue;
    const proof = await res.json();
    if (!proof?.txBytes) continue;

    hashes.push(txHash);
    proofs.push(proof);
    process.stdout.write(`  proof ${proofs.length}/${N}: height ${proof.headerNumber}, ${proof.continuityProof.roots.length} continuity roots\n`);
  }
  if (proofs.length === 0) {
    console.error('no proofs fetched');
    process.exit(1);
  }

  // --- naive shape: N individual proofs, N calls ----------------------------------------------
  let naiveGas = 0n;
  let naiveCalldata = 0;
  for (const p of proofs) {
    const data = IFACE.encodeFunctionData(SINGLE, [
      CHAIN_KEY,
      p.headerNumber,
      p.txBytes,
      merkleArg(p.merkleProof),
      continuityArg(p.continuityProof)
    ]);
    naiveCalldata += (data.length - 2) / 2;
    const gas = await cc3.estimateGas({ to: BLOCK_PROVER, data });
    naiveGas += gas;
  }

  // --- batched shape: one continuity proof for the whole set ------------------------------------
  const batchRes = await fetch(`${PROOF_BUILDER}/api/v1/proof-batch-by-tx/${CHAIN_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(hashes)
  });
  let batchGas = null;
  let batchCalldata = 0;
  let batchDetail = '';
  let batchRoots = 0;
  if (batchRes.ok) {
    const batch = await batchRes.json();
    const heights = [];
    const txs = [];
    const merkleProofs = [];
    for (const [headerNumber, perIndex] of Object.entries(batch.merkleProofs)) {
      for (const entry of Object.values(perIndex)) {
        heights.push(Number(headerNumber));
        txs.push(entry.txBytes);
        merkleProofs.push(merkleArg(entry.merkleProof));
      }
    }
    const shared = continuityArg(batch.continuityProof);
    const data = IFACE.encodeFunctionData(BATCH, [CHAIN_KEY, heights, txs, merkleProofs, shared]);
    batchCalldata = (data.length - 2) / 2;
    batchRoots = batch.continuityProof.roots.length;
    batchDetail = `${heights.length} transactions, ${batchRoots} shared continuity roots (${batch.fromHeader}..${batch.toHeader})`;
    try {
      batchGas = await cc3.estimateGas({ to: BLOCK_PROVER, data });
    } catch (err) {
      batchDetail += ` — estimateGas reverted: ${String(err).slice(0, 120)}`;
    }
  } else {
    batchDetail = `batch endpoint HTTP ${batchRes.status}`;
  }

  const n = BigInt(proofs.length);
  console.log('\n--- measured -------------------------------------------------------------');
  console.log(`naive:  ${proofs.length} calls, total gas ${naiveGas}, calldata ${naiveCalldata} bytes`);
  if (batchGas !== null) {
    console.log(`batch:  1 call,  total gas ${batchGas}, calldata ${batchCalldata} bytes`);
    console.log(`saving: ${naiveGas - batchGas} gas (${(Number(naiveGas - batchGas) * 100 / Number(naiveGas)).toFixed(1)}%), calldata ${naiveCalldata - batchCalldata} bytes`);
  } else {
    console.log(`batch:  ${batchDetail}`);
  }
  console.log(`proof operations: naive ${proofs.length}, batch 1`);
  console.log(`continuity roots carried: naive ${proofs.reduce((a, p) => a + p.continuityProof.roots.length, 0)}, batch ${batchRoots || 'n/a'}`);

  const dir = new URL('../evidence/', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    `${dir}continuity-benchmark.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        network: { cc3Rpc: CC3_RPC, sepoliaRpc: SEPOLIA_RPC, chainKey: CHAIN_KEY },
        frontier,
        claims: proofs.length,
        naive: { calls: proofs.length, gas: naiveGas.toString(), calldataBytes: naiveCalldata },
        batch: batchGas === null ? null : { calls: 1, gas: batchGas.toString(), calldataBytes: batchCalldata, continuityRoots: batchRoots, detail: batchDetail },
        naiveContinuityRoots: proofs.reduce((a, p) => a + p.continuityProof.roots.length, 0),
        note: 'Either shape yields one verifyAndEmit call per claim; only the continuity evidence is shared.'
      },
      null,
      2
    )
  );
  console.log('\nevidence written to worker/evidence/continuity-benchmark.json');
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
