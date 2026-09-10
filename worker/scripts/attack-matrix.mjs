#!/usr/bin/env node
/**
 * Hostile-judge mode: run every attack in the threat model against the LIVE deployment.
 *
 * This is the counterpart to demo.mjs. The demo proves the mechanism works; this proves the mechanism
 * refuses. Each attempt below is sent to the real Creditcoin CC3 testnet contracts — via eth_call where
 * the aim is to show a refusal (which costs nothing and cannot change state), and as a real transaction
 * where the refusal itself needs to be recorded on-chain.
 *
 * Every row prints REJECTED with the decoded custom error, so a reviewer can see not just that it fails
 * but WHY, in the protocol's own vocabulary.
 *
 * Usage:
 *   node scripts/attack-matrix.mjs                 # reads ../.env, uses the live deployment
 *   node scripts/attack-matrix.mjs --onchain       # also send the two interesting ones as transactions
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ethers } from 'ethers';

const ONCHAIN = process.argv.includes('--onchain');
const EVIDENCE = new URL('../evidence/', import.meta.url).pathname;
mkdirSync(EVIDENCE, { recursive: true });

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
const UNITS = 1_000_000n;

const ERRORS = new ethers.Interface([
  'error CoverageNotValid(uint8 reason)',
  'error NotTheCounterparty()',
  'error InsufficientFreeBalance(uint256 free, uint256 requested)',
  'error BondBelowExposure(uint256 bond, uint256 required)',
  'error CapacityBelowExposure(uint256 capacity, uint256 maxExposure)',
  'error InvalidWindow()',
  'error InsufficientLiquidity(uint256 available, uint256 requested)',
  'error InsufficientExposure(uint256 outstanding, uint256 requested)',
  'error DrawingFrozen(uint8 reason)',
  'error UnknownCoverage(uint256 coverageId)',
  'error NotLive()',
  'error WrongChain(uint64 expected, uint64 supplied)',
  'error BlockOutsideWindow(uint64 blockHeight, uint64 startBlock, uint64 endBlock)',
  'error TransactionFailed(uint8 receiptStatus)',
  'error PredicateNotViolated(string reason)',
  'error ProofInvalid()',
  'error ChallengeReplayed(bytes32 challengeKey)',
  'error AlreadyTerminal(uint8 status)',
  'error ModulesAlreadyWired()',
  'error NotAuthorized()',
  'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
  'error OutstandingExposure(uint256 drawn)',
  'error ZeroAmount()',
  'error UnknownCoverage(uint256 coverageId)',
  'error OwnableUnauthorizedAccount(address account)',
  'error OwnableInvalidOwner(address owner)'
]);
// selector -> name, so an error we forgot to list still reports as something readable
const SELECTOR_TO_NAME = {};
for (const frag of ERRORS.fragments) {
  if (frag.type === 'error') SELECTOR_TO_NAME[ERRORS.getError(frag.name).selector.toLowerCase()] = frag.name;
}
const REASON = ['VALID', 'UNKNOWN_COVERAGE', 'STATUS_BREACHED', 'STATUS_EXPIRED', 'STATUS_SETTLED',
  'FRONTIER_UNAVAILABLE', 'FRONTIER_PAST_LIVE_WINDOW', 'WRONG_COUNTERPARTY', 'CAPACITY_EXCEEDED', 'BOND_BELOW_EXPOSURE'];
const STATUS = ['ACTIVE', 'BREACHED', 'EXPIRED', 'SETTLED'];

const ABI = {
  engine: [
    'function deposit(uint256)',
    'function withdraw(uint256)',
    'function freeBalance(address) view returns (uint256)',
    'function isValid(uint256) view returns (bool, uint8)',
    'function getCoverage(uint256) view returns (tuple(uint256 id, address borrower, address underwriter, uint64 chainKey, uint64 startBlock, uint64 endBlock, uint64 requiredDepth, uint64 liveUntilHeight, uint256 maxExposure, uint256 capacity, uint256 drawn, uint256 bond, uint256 premium, address predicate, bytes32 predicateParams, address sourceContract, bytes32 eventSignature, uint8 status, uint64 createdAtBlock, bytes32 challengeKey))',
    'function wireModules(address,address,address)',
    'function settle(uint256)',
    'function nextCoverageId() view returns (uint256)',
    'function lockedBond(address) view returns (uint256)'
  ],
  market: [
    'function purchase((address borrower, address underwriter, uint64 chainKey, uint64 startBlock, uint64 endBlock, uint64 requiredDepth, uint256 maxExposure, uint256 capacity, uint256 bond, uint256 premium, address predicate, bytes32 predicateParams, address sourceContract, bytes32 eventSignature)) returns (uint256)',
    'function quote(uint256,uint64,uint64,address,address) view returns (uint256)'
  ],
  challenge: [
    'function challenge(uint256,uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[])) returns (bool)',
    'function previewChallenge(uint256,uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[])) view returns (bool, string)'
  ],
  lending: [
    'function draw(uint256,uint256)',
    'function repay(uint256,uint256)',
    'function depositLiquidity(uint256)',
    'function previewDraw(uint256,address,uint256) view returns (bool, uint8)'
  ]
};

const results = [];
function decode(err) {
  // ethers hides revert bytes in several places depending on the call path; try them all.
  let data = err.data ?? err.info?.error?.data ?? err.revert?.data ?? err.error?.data;
  if (!data || data === '0x') {
    const m = String(err.message ?? '').match(/data="(0x[0-9a-fA-F]+)"/);
    if (m) data = m[1];
  }
  if (data && data !== '0x') {
    try {
      const p = ERRORS.parseError(data);
      const args = p.args.map((a) => {
        const n = Number(a);
        if (p.name === 'CoverageNotValid' || p.name === 'DrawingFrozen') return REASON[n] ?? a;
        if (p.name === 'AlreadyTerminal') return STATUS[n] ?? a;
        return a;
      });
      return `${p.name}(${args.join(', ')})`;
    } catch {
      const name = SELECTOR_TO_NAME[data.slice(0, 10).toLowerCase()];
      if (name) return `${name}(<undecoded args>)`;
    }
  }
  return (err.shortMessage ?? err.message ?? 'reverted').slice(0, 120);
}

const ONCHAIN_ATTACKS = new Set([
  'draw against a breached position',
  'replay the counterexample on a breached position'
]);

async function attack(name, fn, onchainFn) {
  try {
    const out = await fn();
    // A refusal that does NOT happen is the only failure worth shouting about.
    console.log(`LEAKED    ${name.padEnd(46)} ${out ?? 'call succeeded'}`);
    results.push({ attack: name, refused: false, detail: String(out ?? 'succeeded') });
  } catch (err) {
    const reason = decode(err);
    let txHash = null;
    if (ONCHAIN && onchainFn && ONCHAIN_ATTACKS.has(name)) {
      // Send it for real: a reverted transaction on the explorer is stronger evidence than a
      // simulated one, because a reviewer can open it without trusting our script.
      try {
        const tx = await onchainFn();
        const rc = await tx.wait();
        txHash = tx.hash;
        console.log(`          (on-chain refusal status=${rc.status} tx=${tx.hash})`);
      } catch (e2) {
        txHash = e2.receipt?.hash ?? e2.transaction?.hash ?? null;
        if (txHash) console.log(`          (on-chain refusal tx=${txHash})`);
      }
    }
    console.log(`REJECTED  ${name.padEnd(46)} ${reason}${txHash ? `  tx=${txHash}` : ''}`);
    results.push({ attack: name, refused: true, reason, txHash });
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const alice = new ethers.Wallet(ENV.ALICE_PRIVATE_KEY, provider);
  const bob = new ethers.Wallet(ENV.BOB_PRIVATE_KEY, provider);
  const carol = new ethers.Wallet(ENV.CAROL_PRIVATE_KEY, provider);
  const lender = new ethers.Wallet(ENV.DEPLOYER_PRIVATE_KEY, provider);

  const engine = new ethers.Contract(ENV.ENGINE_ADDRESS, ABI.engine, provider);
  const market = new ethers.Contract(ENV.MARKET_ADDRESS, ABI.market, provider);
  const challenge = new ethers.Contract(ENV.CHALLENGE_MANAGER, ABI.challenge, provider);
  const lending = new ethers.Contract(ENV.LENDING_ADDRESS, ABI.lending, provider);

  console.log('Hostile-judge matrix against the live CC3 testnet deployment');
  console.log(`engine ${ENV.ENGINE_ADDRESS}\n`);

  // ---------------------------------------------------------------------------------------------
  // Find the breached position from the demo run (status 1) and a live one, using events is overkill;
  // scan ids from 1 upward and classify. Cheap: one view call each.
  const last = Number(await engine.nextCoverageId());
  let breached = null;
  let active = null;
  for (let id = 1n; id < BigInt(last); id++) {
    const c = await engine.getCoverage(id);
    const s = Number(c.status);
    if (s === 1 && breached === null) breached = { id, c };
    if (s === 0 && active === null) active = { id, c };
    if (breached && active) break;
  }
  console.log(`positions scanned: ${last - 1}`);
  console.log(`breached id ${breached?.id ?? 'none'} | active id ${active?.id ?? 'none'}\n`);

  // 1. draw against a position that does not exist
  await attack('draw against an unknown position', () =>
    lending.connect(alice).draw.staticCall(999999n, 1n * UNITS));

  // 2. draw as a wallet that is not the covered counterparty
  if (active) {
    await attack('draw as a different counterparty', () =>
      lending.connect(carol).draw.staticCall(active.id, 1n * UNITS));

    // 3. draw more than the position's maximum exposure
    await attack('draw above the position maximum', () =>
      lending.connect(alice).draw.staticCall(active.id, 10_000_000n * UNITS));

    // 4. underwriter withdraws the bond that secures a live position
    const free = await engine.freeBalance(bob.address);
    await attack('underwriter withdraws the locked bond', () =>
      engine.connect(bob).withdraw.staticCall(free + 1n));

    // 5. create a position whose bond does not cover the exposure
    const badExposure = 10_000n * UNITS;
    const badBond = { borrower: alice.address, underwriter: bob.address, chainKey: CHAIN_KEY,
      startBlock: active.c.startBlock, endBlock: active.c.endBlock, requiredDepth: active.c.requiredDepth,
      maxExposure: badExposure, capacity: badExposure, bond: 1n * UNITS,
      // correct premium, so the ONLY thing wrong is the bond: otherwise the premium check fires first
      // and we would be testing the wrong guard.
      premium: await market.quote(badExposure, active.c.endBlock - active.c.startBlock, active.c.requiredDepth, bob.address, alice.address),
      predicate: ENV.PREDICATE_PROHIBITED, predicateParams: active.c.predicateParams,
      sourceContract: active.c.sourceContract, eventSignature: active.c.eventSignature };
    await attack('create a position with bond < exposure', () =>
      market.connect(alice).purchase.staticCall(badBond));

    // 6. call a privileged function from an unrelated wallet
    await attack('stranger calls wireModules', () =>
      engine.connect(carol).wireModules.staticCall(carol.address, carol.address, carol.address));
  }

  // 7. challenge with a fabricated proof
  if (active) {
    await attack('challenge with a fabricated proof', () =>
      challenge.connect(carol).challenge.staticCall(
        active.id, CHAIN_KEY, active.c.startBlock, '0xdeadbeef',
        [ethers.ZeroHash, []], [ethers.ZeroHash, []]));

    // 8. challenge with a proof from the wrong source chain
    const ev = JSON.parse(readFileSync(`${EVIDENCE}source-evidence.json`, 'utf8'));
    const res = await fetch(`${PROOF_BUILDER}/api/v1/proof-by-tx/${CHAIN_KEY}/${ev.sourceTx}`);
    if (res.ok) {
      const proof = await res.json();
      const merkle = [proof.merkleProof.root, proof.merkleProof.siblings.map((s) => [s.hash, s.isLeft])];
      const continuity = [proof.continuityProof.lowerEndpointDigest, proof.continuityProof.roots];

      await attack('challenge with a real proof, wrong chainKey', () =>
        challenge.connect(carol).challenge.staticCall(
          active.id, 3, proof.headerNumber, proof.txBytes, merkle, continuity));

      // 9. challenge with a real, valid proof whose block is outside the covered window
      await attack('challenge with a valid proof outside the window', () =>
        challenge.connect(carol).challenge.staticCall(
          active.id, CHAIN_KEY, active.c.startBlock - 1n, proof.txBytes, merkle, continuity));

      // 10. real proof of a genuinely failing transaction cannot be evidence
      await attack('challenge with proof of a reverted source tx', async () => {
        const failing = await findRevertedSourceTx(Number(active.c.startBlock), Number(active.c.endBlock));
        if (!failing) return 'no reverted tx inside the covered window (skipped)';
        const r2 = await fetch(`${PROOF_BUILDER}/api/v1/proof-by-tx/${CHAIN_KEY}/${failing.hash}`);
        if (!r2.ok) return `proof builder HTTP ${r2.status} (skipped)`;
        const p2 = await r2.json();
        return challenge.connect(carol).challenge.staticCall(
          active.id, CHAIN_KEY, p2.headerNumber, p2.txBytes,
          [p2.merkleProof.root, p2.merkleProof.siblings.map((s) => [s.hash, s.isLeft])],
          [p2.continuityProof.lowerEndpointDigest, p2.continuityProof.roots]);
      });
    }
  }

  // 11. replay: the same counterexample against the position it already breached
  if (breached) {
    const ev = JSON.parse(readFileSync(`${EVIDENCE}source-evidence.json`, 'utf8'));
    const res = await fetch(`${PROOF_BUILDER}/api/v1/proof-by-tx/${CHAIN_KEY}/${ev.sourceTx}`);
    if (res.ok) {
      const proof = await res.json();
      const merkle = [proof.merkleProof.root, proof.merkleProof.siblings.map((s) => [s.hash, s.isLeft])];
      const continuity = [proof.continuityProof.lowerEndpointDigest, proof.continuityProof.roots];
      await attack('replay the counterexample on a breached position',
        () => challenge.connect(lender).challenge.staticCall(
          breached.id, CHAIN_KEY, proof.headerNumber, proof.txBytes, merkle, continuity),
        () => challenge.connect(lender).challenge(
          breached.id, CHAIN_KEY, proof.headerNumber, proof.txBytes, merkle, continuity, { gasLimit: 600_000 }));
    }

    // 12. draw against a breached position
    await attack('draw against a breached position',
      () => lending.connect(alice).draw.staticCall(breached.id, 1n * UNITS),
      () => lending.connect(alice).draw(breached.id, 1n * UNITS, { gasLimit: 400_000 }));

    // 13. settle a breached position so it looks clean
    await attack('settle a breached position', () =>
      engine.connect(lender).settle.staticCall(breached.id));
  }

  // 14. settle a position whose exposure is still outstanding
  if (active) {
    await attack('settle with exposure outstanding', () =>
      engine.connect(lender).settle.staticCall(active.id));
  }

  // 15. repeat the one-time module wiring
  await attack('re-run the one-time module wiring', () =>
    engine.connect(lender).wireModules.staticCall(ENV.MARKET_ADDRESS, ENV.CHALLENGE_MANAGER, ENV.LENDING_ADDRESS));

  const refused = results.filter((r) => r.refused).length;
  console.log(`\n${refused}/${results.length} attacks refused`);
  const leaked = results.filter((r) => !r.refused);
  if (leaked.length) {
    console.log('\nNOT REFUSED (investigate):');
    for (const l of leaked) console.log(`  - ${l.attack}: ${l.detail}`);
  }

  writeFileSync(`${EVIDENCE}attack-matrix.json`, JSON.stringify({
    generatedAt: new Date().toISOString(),
    target: { chainId: 102031, engine: ENV.ENGINE_ADDRESS, challengeManager: ENV.CHALLENGE_MANAGER },
    positions: { breached: breached?.id?.toString() ?? null, active: active?.id?.toString() ?? null },
    total: results.length, refused, leaked: leaked.map((l) => l.attack), results
  }, null, 2));
  console.log('evidence written to worker/evidence/attack-matrix.json');
  process.exit(leaked.length ? 1 : 0);
}

/**
 * Find a real Sepolia transaction that FAILED, inside a specific block range.
 * The range matters: a failure outside the covered window would be refused by the window guard, which
 * would prove nothing about the receiptStatus guard we are actually testing.
 */
async function findRevertedSourceTx(fromBlock, toBlock) {
  const source = new ethers.JsonRpcProvider(ENV.SEPOLIA_RPC_URL);
  for (let n = fromBlock; n <= toBlock; n++) {
    let b;
    try { b = await source.getBlock(n, true); } catch { continue; }
    if (!b) continue;
    for (const tx of b.transactions) {
      const r = await source.getTransactionReceipt(tx);
      if (r && r.status === 0) return { hash: tx, block: r.blockNumber };
    }
  }
  return null;
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
