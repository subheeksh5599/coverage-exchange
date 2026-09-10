#!/usr/bin/env node
/**
 * One-command live demo of Coverage Exchange on Creditcoin CC3 testnet.
 *
 * Runs the full mechanism with four independent wallets and real Attestcoin proofs:
 *
 *   LENDER  funds the lending pool
 *   BOB     underwrites: deposits bond capital, backs a coverage position
 *   ALICE   borrows: buys the position, draws against it
 *   CAROL   challenges: submits a real source-chain counterexample and takes the bond
 *
 * Every step is a real transaction and every hash is recorded. No step is simulated, and no value is
 * written by hand: the counterexample proof comes from the public proof builder for a transaction that
 * genuinely exists on Sepolia.
 *
 * Usage:
 *   node scripts/demo.mjs                 # reads ../.env, uses evidence/source-evidence.json
 *   node scripts/demo.mjs --dry-run       # prints the plan, sends nothing
 *
 * Requires in the environment (or ../.env): CC3_TESTNET_RPC_URL, PROOF_BUILDER, DEMO_TOKEN,
 * ENGINE_ADDRESS, MARKET_ADDRESS, CHALLENGE_MANAGER, LENDING_ADDRESS, PREDICATE_PROHIBITED,
 * ALICE_PRIVATE_KEY, BOB_PRIVATE_KEY, CAROL_PRIVATE_KEY, DEPLOYER_PRIVATE_KEY.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ethers } from 'ethers';

const DRY = process.argv.includes('--dry-run');
const EVIDENCE_DIR = new URL('../evidence/', import.meta.url).pathname;
mkdirSync(EVIDENCE_DIR, { recursive: true });

function loadEnv() {
  if (process.env.ALICE_PRIVATE_KEY) return process.env;
  const txt = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
  const out = { ...process.env };
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const ENV = loadEnv();

const RPC = ENV.CC3_TESTNET_RPC_URL;
const PROOF_BUILDER = ENV.PROOF_BUILDER ?? 'https://prover.cc3-testnet.creditcoin.network';
const CHAIN_KEY = Number(ENV.CHAIN_KEY ?? 1);

const UNITS = 1_000_000n; // DemoToken has 6 decimals

const MAX_EXPOSURE = 10_000n * UNITS;
const BOND = 12_000n * UNITS;
const REQUIRED_DEPTH = 32n;
const BOND_DEPOSIT = 500_000n * UNITS;
const POOL_LIQUIDITY = 100_000n * UNITS;
const FAUCET_AMOUNT = 1_000_000n * UNITS;

const ABI = {
  token: [
    'function faucet(address to, uint256 amount)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address) view returns (uint256)'
  ],
  engine: [
    'function deposit(uint256 amount)',
    'function freeBalance(address) view returns (uint256)',
    'function lockedBond(address) view returns (uint256)',
    'function isValid(uint256 coverageId) view returns (bool, uint8)',
    'function getCoverage(uint256 coverageId) view returns (tuple(uint256 id, address borrower, address underwriter, uint64 chainKey, uint64 startBlock, uint64 endBlock, uint64 requiredDepth, uint64 liveUntilHeight, uint256 maxExposure, uint256 capacity, uint256 drawn, uint256 bond, uint256 premium, address predicate, bytes32 predicateParams, address sourceContract, bytes32 eventSignature, uint8 status, uint64 createdAtBlock, bytes32 challengeKey))',
    'function exposureOf(uint256 coverageId) view returns (uint256, uint256)',
    'function windowClosed(uint256 coverageId) view returns (bool)',
    'function nextCoverageId() view returns (uint256)',
    'function settle(uint256 coverageId)'
  ],
  market: [
    'function quote(uint256 maxExposure, uint64 windowBlocks, uint64 requiredDepth, address underwriter, address borrower) view returns (uint256)',
    'function purchase((address borrower, address underwriter, uint64 chainKey, uint64 startBlock, uint64 endBlock, uint64 requiredDepth, uint256 maxExposure, uint256 capacity, uint256 bond, uint256 premium, address predicate, bytes32 predicateParams, address sourceContract, bytes32 eventSignature)) returns (uint256)'
  ],
  challenge: [
    'error NotLive()',
    'error BlockOutsideWindow(uint64 blockHeight, uint64 startBlock, uint64 endBlock)',
    'error WrongChain(uint64 expected, uint64 supplied)',
    'error ChallengeReplayed(bytes32 challengeKey)',
    'error PredicateNotViolated(string reason)',
    'error TransactionFailed(uint8 receiptStatus)',
    'error ProofInvalid()',
    'function challenge(uint256 coverageId, uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) returns (bool)',
    'function previewChallenge(uint256 coverageId, uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) view returns (bool, string)'
  ],
  lending: [
    'error CoverageNotValid(uint8 reason)',
    'error NotTheCounterparty()',
    'error InsufficientLiquidity(uint256 available, uint256 requested)',
    'function depositLiquidity(uint256 amount)',
    'function draw(uint256 coverageId, uint256 amount)',
    'function repay(uint256 coverageId, uint256 amount)',
    'function previewDraw(uint256 coverageId, address borrower, uint256 amount) view returns (bool, uint8)'
  ]
};

// One interface holding every custom error the protocol can revert with, so a refusal is reported by
// name (CoverageNotValid(STATUS_BREACHED)) instead of "unknown custom error".
const ERRORS = new ethers.Interface([
  'error CoverageNotValid(uint8 reason)',
  'error NotTheCounterparty()',
  'error InsufficientLiquidity(uint256 available, uint256 requested)',
  'error InsufficientExposure(uint256 outstanding, uint256 requested)',
  'error DrawingFrozen(uint8 reason)',
  'error StatusBlocked(uint8 status)',
  'error NotLive()',
  'error ChallengeReplayed(bytes32 challengeKey)',
  'error BlockOutsideWindow(uint64 blockHeight, uint64 startBlock, uint64 endBlock)',
  'error WrongChain(uint64 expected, uint64 supplied)',
  'error PredicateNotViolated(string reason)',
  'error TransactionFailed(uint8 receiptStatus)',
  'error ProofInvalid()',
  'error AlreadyTerminal(uint8 status)'
]);
const REASON = ['VALID','UNKNOWN_COVERAGE','STATUS_BREACHED','STATUS_EXPIRED','STATUS_SETTLED',
  'FRONTIER_UNAVAILABLE','FRONTIER_PAST_LIVE_WINDOW','WRONG_COUNTERPARTY','CAPACITY_EXCEEDED','BOND_BELOW_EXPOSURE'];
const STATUS = ['ACTIVE','BREACHED','EXPIRED','SETTLED'];

const log = [];
async function record(step, tx, extra = '') {
  const line = `  ${step}${tx ? `  tx=${tx}` : ''}${extra ? `  ${extra}` : ''}`;
  console.log(line);
  log.push({ step, tx: tx ?? null, extra });
}
async function send(label, contract, method, args, wallet) {
  const tx = await contract.connect(wallet)[method](...args);
  const rc = await tx.wait();
  if (rc.status !== 1) throw new Error(`${label} reverted (tx ${tx.hash})`);
  await record(label, tx.hash, `block ${rc.blockNumber} gas ${rc.gasUsed}`);
  return tx.hash;
}
async function mustRevert(label, fn) {
  try {
    await fn();
    throw new Error(`EXPECTED REVERT BUT SUCCEEDED: ${label}`);
  } catch (err) {
    if (String(err.message).startsWith('EXPECTED REVERT')) throw err;
    let reason = err.shortMessage ?? err.reason ?? String(err.message).slice(0, 90);
    const data = err.data ?? err.info?.error?.data ?? err.revert?.data;
    if (data && data !== '0x') {
      try {
        const parsed = ERRORS.parseError(data);
        const args = parsed.args.map((a, i) => {
          const n = Number(a);
          const name = parsed.name === 'CoverageNotValid' || parsed.name === 'DrawingFrozen' ? REASON[n]
            : parsed.name === 'AlreadyTerminal' || parsed.name === 'StatusBlocked' ? STATUS[n] : a;
          return parsed.name.includes('reason') || name !== a ? `${n}=${name}` : a;
        });
        reason = `${parsed.name}(${args.join(', ')})`;
      } catch { /* not one of ours */ }
    }
    await record(`${label} -> reverted as designed`, null, reason);
    return reason;
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const lender = new ethers.Wallet(ENV.DEPLOYER_PRIVATE_KEY, provider);
  const alice = new ethers.Wallet(ENV.ALICE_PRIVATE_KEY, provider);
  const bob = new ethers.Wallet(ENV.BOB_PRIVATE_KEY, provider);
  const carol = new ethers.Wallet(ENV.CAROL_PRIVATE_KEY, provider);

  const token = new ethers.Contract(ENV.DEMO_TOKEN, ABI.token, provider);
  const engine = new ethers.Contract(ENV.ENGINE_ADDRESS, ABI.engine, provider);
  const market = new ethers.Contract(ENV.MARKET_ADDRESS, ABI.market, provider);
  const challenge = new ethers.Contract(ENV.CHALLENGE_MANAGER, ABI.challenge, provider);
  const lending = new ethers.Contract(ENV.LENDING_ADDRESS, ABI.lending, provider);

  // The real source-chain transaction this demo proves.
  const evidence = JSON.parse(readFileSync(`${EVIDENCE_DIR}source-evidence.json`, 'utf8'));
  const START_BLOCK = evidence.sourceBlock - 50;
  const END_BLOCK = evidence.sourceBlock + 50;

  console.log('Coverage Exchange — live demo on Creditcoin CC3 testnet');
  console.log(`  lender   ${lender.address}`);
  console.log(`  borrower ${alice.address} (ALICE)`);
  console.log(`  underwriter ${bob.address} (BOB)`);
  console.log(`  challenger  ${carol.address} (CAROL)`);
  console.log(`\n  covered window   [${START_BLOCK}, ${END_BLOCK}] on chainKey ${CHAIN_KEY}`);
  console.log(`  counterexample   ${evidence.sourceTx}`);
  console.log(`  prohibited recipient ${evidence.to}`);
  console.log(`  exposure ${Number(MAX_EXPOSURE) / 1e6} bond ${Number(BOND) / 1e6}\n`);
  if (DRY) return finish(null);

  // ---- 1. testnet assets -------------------------------------------------------------------
  for (const [name, w] of [['ALICE', alice], ['BOB', bob], ['LENDER', lender]]) {
    await send(`faucet ${name}`, token, 'faucet', [w.address, FAUCET_AMOUNT], w);
  }

  // ---- 2. supply side ----------------------------------------------------------------------
  await send('BOB approves the engine', token, 'approve', [ENV.ENGINE_ADDRESS, ethers.MaxUint256], bob);
  await send('BOB deposits bond capital', engine, 'deposit', [BOND_DEPOSIT], bob);

  // Repayment moves tokens from the borrower back into the pool, so the pool needs its own allowance.
  await send('ALICE approves the pool (for repayment)', token, 'approve', [ENV.LENDING_ADDRESS, ethers.MaxUint256], alice);
  await send('LENDER approves the pool (for repayment)', token, 'approve', [ENV.LENDING_ADDRESS, ethers.MaxUint256], lender);
  await send('LENDER funds liquidity', lending, 'depositLiquidity', [POOL_LIQUIDITY], lender);

  // ---- 3. the coverage position ------------------------------------------------------------
  const premium = await market.quote(MAX_EXPOSURE, BigInt(END_BLOCK - START_BLOCK), REQUIRED_DEPTH, bob.address, alice.address);
  console.log(`\n  quoted premium ${Number(premium) / 1e6} cxTUSD (reproducible from public inputs)\n`);

  const params = {
    borrower: alice.address,
    underwriter: bob.address,
    chainKey: CHAIN_KEY,
    startBlock: START_BLOCK,
    endBlock: END_BLOCK,
    requiredDepth: REQUIRED_DEPTH,
    maxExposure: MAX_EXPOSURE,
    capacity: MAX_EXPOSURE,
    bond: BOND,
    premium,
    predicate: ENV.PREDICATE_PROHIBITED,
    // ProhibitedRecipient packs its parameter as the address in the low 160 bits.
    predicateParams: '0x' + BigInt(evidence.to).toString(16).padStart(64, '0'),
    sourceContract: evidence.contract,
    eventSignature: evidence.eventSignature
  };

  // The id the purchase will mint is readable before it happens, so no event parsing is needed.
  const coverageId = await engine.nextCoverageId();

  await send('ALICE approves the market', token, 'approve', [ENV.MARKET_ADDRESS, ethers.MaxUint256], alice);
  const purchaseTx = await send('ALICE buys coverage', market, 'purchase', [params], alice);
  let c = await engine.getCoverage(coverageId);
  await record('coverage created', null, `id=${coverageId} status=${c.status} window=[${c.startBlock},${c.endBlock}] bond=${c.bond} predicateParams=${c.predicateParams}`);

  let [valid, reason] = await engine.isValid(coverageId);
  await record('isValid', null, `${valid} (${REASON[Number(reason)]})`);

  // ---- 4. the honest use of it --------------------------------------------------------------
  let [canDraw, drawReason] = await lending.previewDraw(coverageId, alice.address, MAX_EXPOSURE);
  await record('previewDraw', null, `${canDraw} (${REASON[Number(drawReason)]})`);
  await send('ALICE draws against coverage', lending, 'draw', [coverageId, MAX_EXPOSURE], alice);
  const [drawn] = await engine.exposureOf(coverageId);
  await record('exposure recorded', null, `${drawn}`);

  // ---- 5. the attack -------------------------------------------------------------------------
  const res = await fetch(`${PROOF_BUILDER}/api/v1/proof-by-tx/${CHAIN_KEY}/${evidence.sourceTx}`);
  if (!res.ok) throw new Error(`proof builder HTTP ${res.status} for ${evidence.sourceTx}`);
  const proof = await res.json();
  const merkle = [proof.merkleProof.root, proof.merkleProof.siblings.map((s) => [s.hash, s.isLeft])];
  const continuity = [proof.continuityProof.lowerEndpointDigest, proof.continuityProof.roots];
  await record('fetched real proof', null, `height ${proof.headerNumber}, ${proof.merkleProof.siblings.length} siblings, ${proof.continuityProof.roots.length} continuity roots`);

  const [wouldBreach, why] = await challenge.previewChallenge(
    coverageId, CHAIN_KEY, proof.headerNumber, proof.txBytes, merkle, continuity
  );
  await record('previewChallenge (free, read-only)', null, `${wouldBreach} — "${why}"`);
  if (!wouldBreach) throw new Error(`preflight says no breach: ${why}`);

  const carolBefore = await token.balanceOf(carol.address);
  await send('CAROL challenges with the counterexample', challenge, 'challenge',
    [coverageId, CHAIN_KEY, proof.headerNumber, proof.txBytes, merkle, continuity], carol);
  const carolAfter = await token.balanceOf(carol.address);
  await record('bond paid to the challenger', null, `+${(carolAfter - carolBefore) / UNITS} cxTUSD`);

  // ---- 6. the consequence --------------------------------------------------------------------
  c = await engine.getCoverage(coverageId);
  await record('coverage status', null, `status=${c.status} (${STATUS[Number(c.status)]}) challengeKey=${c.challengeKey}`);
  [valid, reason] = await engine.isValid(coverageId);
  await record('isValid after breach', null, `${valid} (${REASON[Number(reason)]})`);
  await mustRevert('draw after breach', () => lending.connect(alice).draw.staticCall(coverageId, 1n * UNITS));
  await mustRevert('second challenger with the same counterexample',
    () => challenge.connect(lender).challenge.staticCall(coverageId, CHAIN_KEY, proof.headerNumber, proof.txBytes, merkle, continuity));

  // ---- 7. the honest world: a position nobody breaches settles and returns the bond -----------
  console.log('\n--- honest path: a second position that is never breached ---');
  const id2 = await engine.nextCoverageId();
  await send('ALICE buys a second position', market, 'purchase', [params], alice);
  const lockedBefore = await engine.lockedBond(bob.address);
  const bondBefore = await engine.freeBalance(bob.address);
  await send('ALICE draws part of it', lending, 'draw', [id2, 4_000n * UNITS], alice);
  await send('ALICE repays, freeing capacity', lending, 'repay', [id2, 4_000n * UNITS], alice);

  const closed = await engine.windowClosed(id2);
  await record('window attested at the required depth', null, `${closed} (frontier has passed endBlock + depth)`);

  await send('anyone settles the clean position', engine, 'settle', [id2], lender);
  const bondAfter = await engine.freeBalance(bob.address);
  const lockedAfter = await engine.lockedBond(bob.address);
  await record('bond released back to the underwriter', null,
    `free balance +${(bondAfter - bondBefore) / UNITS} cxTUSD, locked bond ${Number(lockedBefore) / 1e6} -> ${Number(lockedAfter) / 1e6}`);
  const c2 = await engine.getCoverage(id2);
  await record('second position status', null, `status=${c2.status} (${STATUS[Number(c2.status)]})`);

  finish({ coverageId: coverageId.toString(), purchaseTx, coverage: {
    borrower: c.borrower, underwriter: c.underwriter, window: [Number(c.startBlock), Number(c.endBlock)],
    maxExposure: c.maxExposure.toString(), bond: c.bond.toString(), premium: c.premium.toString(),
    status: Number(c.status), challengeKey: c.challengeKey
  }, evidence, proof: { headerNumber: proof.headerNumber, txIndex: proof.txIndex, merkleRoot: proof.merkleProof.root },
    settlement: { coverageId: id2.toString(), status: Number(c2.status) } });
}

function finish(extra) {
  const out = { generatedAt: new Date().toISOString(), dryRun: DRY, steps: log };
  if (extra) Object.assign(out, extra);
  writeFileSync(`${EVIDENCE_DIR}demo-run.json`, JSON.stringify(out, null, 2));
  console.log(`\nevidence written to worker/evidence/demo-run.json`);
}

main().catch((e) => {
  console.error('\nFATAL:', e.message ?? e);
  process.exit(1);
});
