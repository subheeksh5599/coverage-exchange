/**
 * The market loop, end to end, on the live deployment — through the OFFER path.
 *
 * `demo.mjs` proves the direct-purchase lifecycle. This proves the marketplace one, which is the
 * layer that was previously undeployed:
 *
 *   ALICE publishes an offer            (done by contract/script/_seed.sh)
 *   BOB buys that offer                 -> purchaseOffer -> a position with the offer's terms
 *   BOB draws credit against it         -> the pool releases, gated on the claim
 *   CAROL proves a Sepolia counterexample -> the bond moves, exposure freezes
 *   BOB tries to draw again             -> refused on chain
 *
 *   node scripts/market-loop.mjs
 *
 * Every transaction hash it prints is real and openable. Evidence: worker/evidence/market-loop.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ethers } from 'ethers';

const EVIDENCE_DIR = new URL('../evidence/', import.meta.url).pathname;
mkdirSync(EVIDENCE_DIR, { recursive: true });

function loadEnv() {
  if (process.env.BOB_PRIVATE_KEY) return process.env;
  const txt = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
  const out = { ...process.env };
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
const ENV = loadEnv();

const RPC = ENV.CC3_TESTNET_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const PROOF_BUILDER = ENV.PROOF_BUILDER ?? 'https://prover.cc3-testnet.creditcoin.network';
const CHAIN_KEY = Number(ENV.CHAIN_KEY ?? 1);
const UNITS = 1_000_000n; // DemoToken, 6 decimals

const DRAW_AMOUNT = 500n * UNITS;

// The offer and the counterexample both come from the live evidence, not from constants: the
// window has to contain a real violating transfer AND sit inside the attested band, and both of
// those move forward with the chain.
const offerEnv = JSON.parse(readFileSync(new URL('../evidence/live-offer.json', import.meta.url), 'utf8'));
const evidence = JSON.parse(readFileSync(new URL('../evidence/live-counterexample.json', import.meta.url), 'utf8'));
const OFFER_ID = BigInt(offerEnv.offerId);
const START_BLOCK = BigInt(offerEnv.startBlockToReproduce);
const END_BLOCK = START_BLOCK + BigInt(offerEnv.terms.windowBlocks);

const ABI = {
  token: [
    'function faucet(address to, uint256 amount)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address) view returns (uint256)',
  ],
  engine: [
    'function nextCoverageId() view returns (uint256)',
    'function getCoverage(uint256 coverageId) view returns (tuple(uint256 id, address borrower, address underwriter, uint64 chainKey, uint64 startBlock, uint64 endBlock, uint64 requiredDepth, uint64 liveUntilHeight, uint256 maxExposure, uint256 capacity, uint256 drawn, uint256 bond, uint256 premium, address predicate, bytes32 predicateParams, address sourceContract, bytes32 eventSignature, uint8 status, uint64 createdAtBlock, bytes32 challengeKey))',
    'function isValid(uint256 coverageId) view returns (bool, uint8)',
    'function freeBalance(address) view returns (uint256)',
  ],
  market: [
    'function purchaseOffer(uint256 offerId, uint64 startBlock) returns (uint256)',
    'function quoteTranche(uint256 maxExposure, uint64 windowBlocks, uint64 requiredDepth, address underwriter, address borrower, uint8 tranche) view returns (uint256)',
  ],
  registry: [
    'function nextOfferId() view returns (uint256)',
    'function activeOfferCount() view returns (uint256)',
    'function getOffer(uint256 id) view returns (tuple(uint256 id, address underwriter, address borrower, uint64 chainKey, uint64 requiredDepth, uint256 maxExposure, uint256 bond, uint64 windowBlocks, uint64 expiresAt, address sourceContract, bytes32 eventSignature, address predicate, bytes32 predicateParams, uint8 tranche, bool cancelled, bool filled))',
  ],
  lending: [
    'function draw(uint256 coverageId, uint256 amount)',
    'function exposureOfCoverage(uint256) view returns (uint256)',
    'function totalLiquidity() view returns (uint256)',
  ],
  challenge: [
    'function challenge(uint256 coverageId, uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) returns (bool)',
    'function previewChallenge(uint256 coverageId, uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) view returns (bool, string)',
  ],
};

const STATUS = ['ACTIVE', 'BREACHED', 'EXPIRED', 'SETTLED'];
const REASON = ['VALID', 'WINDOW_NOT_ATTESTED', 'STATUS_BREACHED', 'WINDOW_CLOSED', 'FRONTIER_PAST_LIVE_WINDOW', 'NO_LIVE_WINDOW', 'EXPIRED'];

const provider = new ethers.JsonRpcProvider(RPC);
const token = new ethers.Contract(ENV.DEMO_TOKEN, ABI.token, provider);
const engine = new ethers.Contract(ENV.ENGINE_ADDRESS, ABI.engine, provider);
const market = new ethers.Contract(ENV.MARKET_ADDRESS, ABI.market, provider);
const registry = new ethers.Contract(ENV.REGISTRY ?? ENV.OFFER_REGISTRY, ABI.registry, provider);
const lending = new ethers.Contract(ENV.LENDING_ADDRESS, ABI.lending, provider);
const challenges = new ethers.Contract(ENV.CHALLENGE_MANAGER, ABI.challenge, provider);

const alice = new ethers.Wallet(ENV.ALICE_PRIVATE_KEY, provider);
const bob = new ethers.Wallet(ENV.BOB_PRIVATE_KEY, provider);
const carol = new ethers.Wallet(ENV.CAROL_PRIVATE_KEY, provider);

const txs = [];
const results = [];

async function send(label, contract, fn, args, signer) {
  const gas = await contract[fn].estimateGas(...args, { from: signer.address }).catch(() => 900000n);
  const tx = await contract.connect(signer)[fn](...args, { gasLimit: (gas * 130n) / 100n });
  const rc = await tx.wait();
  const ok = rc.status === 1;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}\n        ${tx.hash}`);
  txs.push({ label, hash: tx.hash, status: ok ? 'success' : 'failed', block: rc.blockNumber });
  results.push({ label, ok });
  return tx.hash;
}

async function mustRevert(label, promise) {
  try {
    await promise;
    console.log(`  FAIL ${label} — it did NOT revert`);
    results.push({ label, ok: false });
    return null;
  } catch (e) {
    const msg = (e.shortMessage || e.message || '').split('\n')[0].slice(0, 90);
    console.log(`  OK   ${label}\n        reverted: ${msg}`);
    results.push({ label, ok: true, reverted: msg });
    return msg;
  }
}

// A run that already bought can be continued with --coverage <id>, which skips the purchase and
// works the position that exists. Re-running the whole loop is not idempotent: the offer is
// consumed on the first pass.
const ci = process.argv.indexOf('--coverage');
const EXISTING = ci === -1 ? null : BigInt(process.argv[ci + 1]);

async function main() {
  console.log('\n=== market loop, offer path, live CC3 ===\n');
  console.log(`  offer        #${OFFER_ID}`);
  console.log(`  window       [${START_BLOCK}, ${END_BLOCK}] on chainKey ${CHAIN_KEY}`);
  console.log(`  counterexample tx ${evidence.sourceTx}`);
  console.log();

  const off = await registry.getOffer(OFFER_ID);
  console.log(`  offer terms  underwriter=${off.underwriter} exposure=${off.maxExposure} bond=${off.bond} window=${off.windowBlocks} filled=${off.filled}`);
  console.log();

  // ---- 1. BOB buys the offer -------------------------------------------------------------------
  let coverageId = EXISTING !== null ? EXISTING : await engine.nextCoverageId();
  let c;

  if (EXISTING !== null) {
    console.log(`--- 1. reusing position #${EXISTING} (purchase skipped) ---\n`);
  } else {
  console.log('--- 1. BOB buys the offer ---');
  await send('BOB faucet', token, 'faucet', [bob.address, 60_000n * UNITS], bob);
  await send('BOB approves the market', token, 'approve', [ENV.MARKET_ADDRESS, ethers.MaxUint256], bob);

  const premium = await market.quoteTranche(off.maxExposure, off.windowBlocks, off.requiredDepth, off.underwriter, bob.address, off.tranche);
  console.log(`  quoted premium ${Number(premium) / 1e6} cxTUSD, position will mint as #${coverageId}`);

  const bobBefore = await token.balanceOf(bob.address);
  await send(`BOB buys offer #${OFFER_ID}`, market, 'purchaseOffer', [OFFER_ID, START_BLOCK], bob);
  const bobAfter = await token.balanceOf(bob.address);
  console.log(`  BOB paid ${Number(bobBefore - bobAfter) / 1e6} cxTUSD (premium ${Number(premium) / 1e6})`);

  c = await engine.getCoverage(coverageId);
  console.log(`  position #${coverageId}: status=${STATUS[Number(c.status)]} bond=${c.bond} window=[${c.startBlock},${c.endBlock}]`);
  console.log(`  offer now filled: ${(await registry.getOffer(OFFER_ID)).filled}`);
  console.log(`  active offers remaining: ${await registry.activeOfferCount()}`);
  results.push({ label: 'offer filled by the market', ok: (await registry.getOffer(OFFER_ID)).filled });
  console.log();
  }

  // ---- 2. BOB draws ----------------------------------------------------------------------------
  console.log('--- 2. BOB draws credit against it ---');
  const poolBefore = await token.balanceOf(ENV.LENDING_ADDRESS);
  await send(`BOB draws ${Number(DRAW_AMOUNT) / 1e6}`, lending, 'draw', [coverageId, DRAW_AMOUNT], bob);
  const poolAfter = await token.balanceOf(ENV.LENDING_ADDRESS);
  console.log(`  pool released ${Number(poolBefore - poolAfter) / 1e6} cxTUSD; exposure now ${Number(await lending.exposureOfCoverage(coverageId)) / 1e6}`);
  results.push({ label: 'draw released credit', ok: poolBefore > poolAfter });
  console.log();

  // ---- 3. CAROL challenges ---------------------------------------------------------------------
  console.log('--- 3. CAROL proves the counterexample ---');
  const res = await fetch(`${PROOF_BUILDER}/api/v1/proof-by-tx/${CHAIN_KEY}/${evidence.sourceTx}`);
  if (!res.ok) throw new Error(`proof builder HTTP ${res.status}`);
  const proof = await res.json();
  const merkle = [proof.merkleProof.root, proof.merkleProof.siblings.map((s) => [s.hash, s.isLeft])];
  const continuity = [proof.continuityProof.lowerEndpointDigest, proof.continuityProof.roots];
  console.log(`  fetched real proof: block ${proof.headerNumber}, txIndex ${proof.txIndex}, ${proof.merkleProof.siblings.length} siblings, ${proof.continuityProof.roots.length} continuity roots`);

  const [wouldBreach, why] = await challenges.previewChallenge(coverageId, CHAIN_KEY, proof.headerNumber, proof.txBytes, merkle, continuity);
  console.log(`  previewChallenge -> ${wouldBreach} (${why})`);
  results.push({ label: 'preview says it would breach', ok: wouldBreach === true });

  const carolBefore = await token.balanceOf(carol.address);
  await send('CAROL challenges', challenges, 'challenge', [coverageId, CHAIN_KEY, proof.headerNumber, proof.txBytes, merkle, continuity], carol);
  const carolAfter = await token.balanceOf(carol.address);
  console.log(`  CAROL received ${Number(carolAfter - carolBefore) / 1e6} cxTUSD (the bond)`);

  c = await engine.getCoverage(coverageId);
  const [valid, reason] = await engine.isValid(coverageId);
  console.log(`  position #${coverageId}: status=${STATUS[Number(c.status)]} isValid=${valid} (${REASON[Number(reason)]})`);
  console.log(`  challengeKey ${c.challengeKey}`);
  results.push({ label: 'position breached', ok: Number(c.status) === 1 });
  results.push({ label: 'bond paid to challenger', ok: carolAfter > carolBefore });
  console.log();

  // ---- 4. the consequence ----------------------------------------------------------------------
  console.log('--- 4. BOB tries to draw again ---');
  await mustRevert('draw against a breached position', lending.connect(bob).draw.staticCall(coverageId, 100n * UNITS));
  console.log();

  const passed = results.filter((r) => r.ok).length;
  console.log(`=== ${passed}/${results.length} checks passed ===\n`);

  writeFileSync(
    new URL('../evidence/market-loop.json', import.meta.url),
    JSON.stringify({
      tool: 'node scripts/market-loop.mjs',
      what: 'the market loop through the offer path on the live deployment',
      deployment: {
        token: ENV.DEMO_TOKEN, engine: ENV.ENGINE_ADDRESS, market: ENV.MARKET_ADDRESS,
        registry: ENV.OFFER_REGISTRY, lending: ENV.LENDING_ADDRESS, challenge: ENV.CHALLENGE_MANAGER,
      },
      offerId: OFFER_ID.toString(),
      coverageId: coverageId.toString(),
      window: { startBlock: Number(START_BLOCK), endBlock: Number(END_BLOCK), chainKey: CHAIN_KEY },
      sourceTx: evidence.sourceTx,
      sourceBlock: evidence.sourceBlock,
      drawAmount: DRAW_AMOUNT.toString(),
      status: STATUS[Number(c.status)],
      challengeKey: c.challengeKey,
      transactions: txs,
      checks: results,
      checksPassed: passed,
      checksTotal: results.length,
    }, null, 2) + '\n'
  );
  console.log('wrote worker/evidence/market-loop.json');
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('FAILED:', e.shortMessage || e.message);
  process.exit(1);
});
