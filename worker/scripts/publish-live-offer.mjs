/**
 * Publish an underwriter offer whose terms match the live counterexample.
 *
 * The offer is the supply side: terms an underwriter will bond against. It fixes the depth, the
 * window LENGTH, the predicate and the source contract; the buyer supplies the window START at
 * purchase time (the contract has no startBlock field, by design — the borrower chooses which
 * window they need covered).
 *
 * For the demo to be challengeable, the window the buyer picks must contain a violating transfer.
 * So this publishes terms over the live counterexample and prints the exact startBlock that
 * reproduces it.
 *
 *   node scripts/publish-live-offer.mjs
 *
 * Writes worker/evidence/live-offer.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ethers } from 'ethers';

function loadEnv() {
  if (process.env.ALICE_PRIVATE_KEY) return process.env;
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
const UNITS = 1_000_000n;

const ce = JSON.parse(readFileSync(new URL('../evidence/live-counterexample.json', import.meta.url), 'utf8'));

const EXPOSURE = 10_000n * UNITS;
const BOND = 12_000n * UNITS;

const ABI = [
  'function publishOffer(address borrower, uint64 chainKey, uint64 requiredDepth, uint256 maxExposure, uint256 bond, uint64 windowBlocks, uint64 expiresAt, address sourceContract, bytes32 eventSignature, address predicate, bytes32 predicateParams, uint8 tranche) returns (uint256)',
  'function nextOfferId() view returns (uint256)',
  'function activeOfferCount() view returns (uint256)',
  'function getOffer(uint256 id) view returns (tuple(uint256 id, address underwriter, address borrower, uint64 chainKey, uint64 requiredDepth, uint256 maxExposure, uint256 bond, uint64 windowBlocks, uint64 expiresAt, address sourceContract, bytes32 eventSignature, address predicate, bytes32 predicateParams, uint8 tranche, bool cancelled, bool filled))',
];

const provider = new ethers.JsonRpcProvider(RPC);
const alice = new ethers.Wallet(ENV.ALICE_PRIVATE_KEY, provider);
const registry = new ethers.Contract(ENV.OFFER_REGISTRY, ABI, provider);

async function main() {
  // ProhibitedRecipient packs its parameter as the address in the low 160 bits.
  const params = ethers.zeroPadValue(ce.prohibitedRecipient, 32);

  console.log(`underwriter        ${alice.address}`);
  console.log(`predicate          ProhibitedRecipient (${ENV.PREDICATE_PROHIBITED})`);
  console.log(`prohibited address ${ce.prohibitedRecipient}`);
  console.log(`source contract    ${ce.contract} (Sepolia USDC)`);
  console.log(`window length      ${ce.width} blocks, depth ${ce.requiredDepth}`);
  console.log(`exposure / bond    ${Number(EXPOSURE) / 1e6} / ${Number(BOND) / 1e6} cxTUSD`);
  console.log();

  const id = await registry.nextOfferId();
  const gas = await registry.connect(alice).publishOffer.estimateGas(
    ethers.ZeroAddress, ce.chainKey, ce.requiredDepth, EXPOSURE, BOND, ce.width, 0,
    ce.contract, ce.eventSignature, ENV.PREDICATE_PROHIBITED, params, 0
  ).catch(() => 900000n);

  const tx = await registry.connect(alice).publishOffer(
    ethers.ZeroAddress, ce.chainKey, ce.requiredDepth, EXPOSURE, BOND, ce.width, 0,
    ce.contract, ce.eventSignature, ENV.PREDICATE_PROHIBITED, params, 0,
    { gasLimit: (gas * 130n) / 100n }
  );
  const rc = await tx.wait();
  console.log(`offer #${id} published  tx ${tx.hash}  status ${rc.status === 1 ? 'success' : 'FAILED'}`);
  console.log();

  const o = await registry.getOffer(id);
  console.log(`  underwriter   ${o.underwriter}`);
  console.log(`  maxExposure   ${o.maxExposure}`);
  console.log(`  bond          ${o.bond}`);
  console.log(`  windowBlocks  ${o.windowBlocks}`);
  console.log(`  requiredDepth ${o.requiredDepth}`);
  console.log(`  predicate     ${o.predicate}`);
  console.log(`  params        ${o.predicateParams}`);
  console.log(`  filled        ${o.filled}`);
  console.log(`  active offers ${await registry.activeOfferCount()}`);

  console.log();
  console.log(`REPRODUCE THE COUNTEREXAMPLE WINDOW: buy this offer with startBlock ${ce.startBlock}`);
  console.log(`  (window then covers [${ce.startBlock}, ${ce.startBlock + ce.width}], containing the`);
  console.log(`   violating transfer at block ${ce.sourceBlock})`);

  writeFileSync(
    new URL('../evidence/live-offer.json', import.meta.url),
    JSON.stringify({
      tool: 'node scripts/publish-live-offer.mjs',
      offerId: id.toString(),
      underwriter: alice.address,
      tx: tx.hash,
      terms: {
        chainKey: ce.chainKey,
        requiredDepth: ce.requiredDepth,
        maxExposure: EXPOSURE.toString(),
        bond: BOND.toString(),
        windowBlocks: ce.width,
        sourceContract: ce.contract,
        eventSignature: ce.eventSignature,
        predicate: ENV.PREDICATE_PROHIBITED,
        predicateParams: params,
        tranche: 0,
      },
      counterexample: {
        tx: ce.sourceTx,
        block: ce.sourceBlock,
        prohibitedRecipient: ce.prohibitedRecipient,
      },
      startBlockToReproduce: ce.startBlock,
    }, null, 2) + '\n'
  );
  console.log('\nwrote worker/evidence/live-offer.json');
}

main().catch((e) => { console.error('FAILED:', e.shortMessage || e.message); process.exit(1); });
