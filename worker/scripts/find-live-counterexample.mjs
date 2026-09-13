/**
 * Find a live counterexample for a fresh coverage window.
 *
 * The original demo's Sepolia transaction is now ~24,000 attestation blocks old, which puts any
 * window around it past `liveUntilHeight` — a position bought over it is EXPIRED on arrival. So the
 * demo needs a counterexample near the CURRENT attested frontier.
 *
 * Rather than invent one, this reads the real frontier from ChainInfo, scans Sepolia USDC for a
 * recent real transfer, and declares THAT transfer's recipient prohibited. The mechanism is
 * unchanged and the evidence is a real transaction nobody staged: the position says "no transfer to
 * this address", and a transfer to that address exists inside the window.
 *
 * Two RPC details learned the slow way:
 *   - publicnode refuses a topic-only eth_getLogs ("specify an address"), so the query is scoped to
 *     the USDC contract. That is also what we want, because the position's sourceContract must be
 *     the token the evidence comes from.
 *   - ethers' network auto-detection hangs against this endpoint, so the network is pinned.
 *
 *   node scripts/find-live-counterexample.mjs [--lookback 1200] [--width 100]
 *
 * Writes worker/evidence/live-counterexample.json
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { ethers } from 'ethers';

mkdirSync(new URL('../evidence/', import.meta.url), { recursive: true });

function loadEnv() {
  if (process.env.ENGINE_ADDRESS) return process.env;
  const txt = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
  const out = { ...process.env };
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
const ENV = loadEnv();

const CC3_RPC = ENV.CC3_TESTNET_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const SEPOLIA_URL = ENV.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const CHAIN_KEY = Number(ENV.CHAIN_KEY ?? 1);

// The ERC-20 the evidence comes from. Sepolia USDC, six decimals, widely transferred.
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : Number(process.argv[i + 1]);
};
const LOOKBACK = arg('lookback', 1200);
const WIDTH = arg('width', 100);
const DEPTH = arg('depth', 32);

const cc3 = new ethers.JsonRpcProvider(CC3_RPC);
const sepolia = new ethers.JsonRpcProvider(SEPOLIA_URL, { chainId: 11155111, name: 'sepolia' }, { staticNetwork: true });

async function main() {
  // 1. the frontier the protocol actually attests to, read from ChainInfo — not guessed
  const adapter = new ethers.Contract(
    ENV.ADAPTER_ADDRESS,
    ['function tryFrontier(uint64 chainKey) view returns (bool available, uint64 height, bytes32 hash)'],
    cc3
  );
  const [available, height] = await adapter.tryFrontier(CHAIN_KEY);
  if (!available) throw new Error('ChainInfo did not answer — cannot pick a window');
  const frontier = Number(height);
  console.log(`attested frontier   ${frontier} (chainKey ${CHAIN_KEY})`);

  // 2. scan a band safely BELOW the frontier: far enough that endBlock + depth is already attested,
  //    close enough that endBlock + depth + grace is still ahead. Both must hold for the position
  //    to be drawable rather than expired on arrival.
  const from = frontier - LOOKBACK;
  const to = frontier - 300;
  console.log(`scanning USDC       [${from}, ${to}]`);

  const logs = await sepolia.getLogs({ address: USDC, fromBlock: from, toBlock: to, topics: [TRANSFER] });
  console.log(`  ${logs.length} transfer logs`);

  // a mint or a burn has a zero topic at one end; neither is a "transfer to a prohibited address"
  const usable = logs.filter((l) => {
    if (l.topics.length < 3) return false;
    const f = l.topics[1].slice(26);
    const t = l.topics[2].slice(26);
    if (/^0+$/.test(f) || /^0+$/.test(t)) return false;
    return BigInt(l.data === '0x' ? '0x0' : l.data) > 0n;
  });
  if (usable.length === 0) throw new Error('no usable transfer in that band; widen --lookback');

  const pick = usable[usable.length - 1]; // the newest real transfer in the band
  const toAddr = '0x' + pick.topics[2].slice(26);
  const fromAddr = '0x' + pick.topics[1].slice(26);
  const value = BigInt(pick.data);
  const startBlock = pick.blockNumber - Math.floor(WIDTH / 2);
  const endBlock = startBlock + WIDTH;
  const attestedBy = frontier - (endBlock + DEPTH);
  const remaining = endBlock + DEPTH + 10000 - frontier;

  console.log();
  console.log(`counterexample tx   ${pick.transactionHash}`);
  console.log(`  block             ${pick.blockNumber}`);
  console.log(`  from              ${fromAddr}`);
  console.log(`  to (prohibited)   ${toAddr}`);
  console.log(`  value             ${value} (${Number(value) / 1e6} USDC)`);
  console.log();
  console.log(`window              [${startBlock}, ${endBlock}]  depth ${DEPTH}`);
  console.log(`  attested by       ${attestedBy} blocks (must be > 0 to be valid)`);
  console.log(`  remaining life    ${remaining} blocks (must be > 0 to still be drawable)`);
  if (attestedBy <= 0) throw new Error('window not yet attested — increase --lookback');
  if (remaining <= 0) throw new Error('window already expired — decrease --lookback');

  const evidence = {
    tool: 'node scripts/find-live-counterexample.mjs',
    what: 'a real Sepolia USDC transfer inside a window that is attested but not yet expired',
    chainKey: CHAIN_KEY,
    frontier,
    sourceTx: pick.transactionHash,
    sourceBlock: pick.blockNumber,
    txIndex: pick.index,
    contract: pick.address,
    eventSignature: TRANSFER,
    eventName: 'Transfer(address,address,uint256)',
    from: fromAddr,
    to: toAddr,
    value: value.toString(),
    prohibitedRecipient: toAddr,
    startBlock,
    endBlock,
    requiredDepth: DEPTH,
    lookback: LOOKBACK,
    width: WIDTH,
  };
  writeFileSync(new URL('../evidence/live-counterexample.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
  console.log('\nwrote worker/evidence/live-counterexample.json');
}

main().catch((e) => {
  console.error('FAILED:', e.shortMessage || e.message);
  process.exit(1);
});
