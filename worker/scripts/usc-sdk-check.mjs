/**
 * Verify the USC integration through the OFFICIAL SDK, and assert it agrees with our recorded
 * evidence.
 *
 * The rest of the worker talks to the USC protocol directly: the precompiles via ethers, and the
 * proof builder over HTTP. That is deliberate — it keeps the proof path explicit — but it means
 * `@gluwa/usc-sdk` was a declared dependency that nothing exercised. A dependency nobody runs is a
 * claim nobody can check, so this script runs the same proof through the SDK and fails loudly if
 * the two ever disagree.
 *
 *   node scripts/usc-sdk-check.mjs
 *
 * Exit 0 only when every check passes. Output: worker/evidence/usc-sdk.json
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { proofProvider, blockProver, chainInfo } from '@gluwa/usc-sdk';
import { ethers } from 'ethers';

const CC3_RPC = process.env.CC3_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const BUILDER = process.env.PROOF_BUILDER ?? 'https://prover.cc3-testnet.creditcoin.network';
const CHAIN_KEY = Number(process.env.CHAIN_KEY ?? 1);

// The transaction our demo used as a counterexample, and the proof attributes recorded from the
// hand-rolled path at the time. If the SDK disagrees with these, one of the two paths is wrong.
const recorded = JSON.parse(readFileSync(new URL('../evidence/source-evidence.json', import.meta.url), 'utf8'));
const TX = recorded.sourceTx;
const EXPECT_BLOCK = recorded.sourceBlock;
const EXPECT_TX_INDEX = recorded.txIndex;
const EXPECT_STATUS = recorded.status;

const results = [];
function record(step, ok, detail) {
  results.push({ step, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}  ${detail ?? ''}`);
}

async function main() {
  // 1. The SDK's own precompile constants must be the ones the contracts use. If these ever move,
  //    the Solidity addresses are stale and every proof call fails for a reason nobody would guess.
  record(
    'sdk.blockProver.address',
    blockProver.BLOCK_PROVER_PRECOMPILE_ADDRESS.toLowerCase() === '0x0000000000000000000000000000000000000fd2',
    `-> ${blockProver.BLOCK_PROVER_PRECOMPILE_ADDRESS}`
  );
  record(
    'sdk.chainInfo.address',
    chainInfo.CHAIN_INFO_PRECOMPILE_ADDRESS.toLowerCase() === '0x0000000000000000000000000000000000000fd3',
    `-> ${chainInfo.CHAIN_INFO_PRECOMPILE_ADDRESS}`
  );

  // 2. Fetch the proof through the SDK.
  const builder = new proofProvider.service.ProofBuilder(CHAIN_KEY, BUILDER);
  let proof;
  try {
    const res = await builder.getProof(TX);
    if (!res?.success) throw new Error(`success=${res?.success}`);
    proof = res.data;
    record('sdk.getProof', true, `block=${proof.headerNumber} txIndex=${proof.txIndex}`);
  } catch (e) {
    record('sdk.getProof', false, String(e).slice(0, 200));
    return finish();
  }

  // 3. The SDK proof must agree with what we recorded. This is the whole point of the script.
  record('sdk.proof.matchesRecordedBlock', proof.headerNumber === EXPECT_BLOCK, `sdk=${proof.headerNumber} recorded=${EXPECT_BLOCK}`);
  record('sdk.proof.matchesRecordedTxIndex', proof.txIndex === EXPECT_TX_INDEX, `sdk=${proof.txIndex} recorded=${EXPECT_TX_INDEX}`);
  record('sdk.proof.chainKey', proof.chainKey === CHAIN_KEY, `-> ${proof.chainKey}`);
  record('sdk.proof.hasMerkleSiblings', (proof.merkleProof?.siblings?.length ?? 0) > 0, `siblings=${proof.merkleProof?.siblings?.length}`);
  record('sdk.proof.hasContinuityRoots', (proof.continuityProof?.roots?.length ?? 0) > 0, `roots=${proof.continuityProof?.roots?.length}`);

  // 4. Feed the SDK's proof straight into the real precompile. This is the step that matters: it
  //    proves the SDK's output is accepted by the same verifier the contracts call.
  const provider = new ethers.JsonRpcProvider(CC3_RPC);
  const prover = new ethers.Contract(
    blockProver.BLOCK_PROVER_PRECOMPILE_ADDRESS,
    [
      'function verify(uint64 chainKey, uint64 height, bytes encodedTransaction, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) view returns (bool)',
    ],
    provider
  );

  const merkleProof = [
    proof.merkleProof.root,
    proof.merkleProof.siblings.map((s) => [s.hash, s.isLeft]),
  ];
  const continuityProof = [proof.continuityProof.lowerEndpointDigest, proof.continuityProof.roots];

  try {
    const accepted = await prover.verify(CHAIN_KEY, proof.headerNumber, proof.txBytes, merkleProof, continuityProof);
    record('blockprover.verify(sdkProof)', accepted === true, `-> ${accepted}`);
  } catch (e) {
    record('blockprover.verify(sdkProof)', false, `reverted: ${String(e).slice(0, 160)}`);
  }

  // 5. And that a tampered payload is still rejected, so this script also proves the verifier is
  //    not simply answering true.
  try {
    const tampered = proof.txBytes.replace(/[0-9a-f]$/, (c) => (c === '0' ? '1' : '0'));
    const accepted = await prover.verify(CHAIN_KEY, proof.headerNumber, tampered, merkleProof, continuityProof);
    record('blockprover.verify(tamperedPayload)', accepted === false, `-> ${accepted} (must be false)`);
  } catch {
    record('blockprover.verify(tamperedPayload)', true, 'reverted as expected');
  }

  record('sourceTx.receiptStatus', EXPECT_STATUS === 1, `status=${EXPECT_STATUS} (1 = the source tx succeeded)`);

  finish();
}

function finish() {
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n${passed}/${total} checks passed`);

  mkdirSync(new URL('../evidence/', import.meta.url), { recursive: true });
  writeFileSync(
    new URL('../evidence/usc-sdk.json', import.meta.url),
    JSON.stringify(
      {
        tool: 'node scripts/usc-sdk-check.mjs',
        sdk: '@gluwa/usc-sdk',
        sdkVersion: JSON.parse(readFileSync(new URL('../node_modules/@gluwa/usc-sdk/package.json', import.meta.url), 'utf8')).version,
        what: 'the same source transaction, proved through the official USC SDK and then verified by the real precompile',
        sourceTx: TX,
        checksPassed: passed,
        checksTotal: total,
        results,
      },
      null,
      2
    ) + '\n'
  );
  console.log('wrote worker/evidence/usc-sdk.json');
  process.exit(passed === total ? 0 : 1);
}

main();
