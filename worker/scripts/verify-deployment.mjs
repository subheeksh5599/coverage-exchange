#!/usr/bin/env node
/**
 * Deployment verification over JSON-RPC — the authoritative check.
 *
 * A Solidity verification script cannot do this job: Foundry's EVM does not implement Creditcoin's
 * native precompiles, so 0x0FD2 / 0x0FD3 never answer from inside it. This script sends eth_call to the
 * real node instead, which is the only place the precompiles actually execute.
 *
 * It verifies, without needing a key:
 *   1. every deployed address actually has bytecode,
 *   2. the engine is wired to the market, the challenge manager and the lending adapter,
 *   3. the adapter's baked-in precompile constants are the protocol's addresses,
 *   4. the live ChainInfo frontier answers for the configured chain key, and is_height_attested
 *      agrees with the height it just reported,
 *   5. a Solidity contract deployed on Creditcoin can read that frontier (the adapter itself is asked).
 *
 * Usage: node scripts/verify-deployment.mjs      (reads .env from the repository root)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ethers } from 'ethers';

// --- env: process.env wins, otherwise parse ../.env so the script runs with no setup -------------
function loadEnv() {
  if (process.env.ENGINE_ADDRESS) return process.env;
  try {
    const txt = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
    const out = { ...process.env };
    for (const line of txt.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  } catch {
    return process.env;
  }
}
const ENV = loadEnv();

const RPC = ENV.CC3_TESTNET_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const CHAIN_KEY = Number(ENV.CHAIN_KEY ?? 1);

const ADDR = {
  demoToken: ENV.DEMO_TOKEN,
  attestcoinAdapter: ENV.ADAPTER_ADDRESS,
  coverageEngine: ENV.ENGINE_ADDRESS,
  coverageMarket: ENV.MARKET_ADDRESS,
  challengeManager: ENV.CHALLENGE_MANAGER,
  lendingAdapter: ENV.LENDING_ADDRESS,
  predicateProhibited: ENV.PREDICATE_PROHIBITED,
  predicateAbove: ENV.PREDICATE_ABOVE,
  predicateBelow: ENV.PREDICATE_BELOW
};

const ENGINE_ABI = [
  'function market() view returns (address)',
  'function challengeManager() view returns (address)',
  'function lendingAdapter() view returns (address)',
  'function coverageRatioBps() view returns (uint16)',
  'function defaultGraceBlocks() view returns (uint64)',
  'function TOKEN() view returns (address)',
  'function ADAPTER() view returns (address)'
];
const ADAPTER_ABI = [
  'function BLOCK_PROVER_ADDRESS() view returns (address)',
  'function CHAIN_INFO_ADDRESS() view returns (address)',
  'function tryFrontier(uint64 chainKey) view returns (bool available, uint64 height, bytes32 hash)',
  'function frontierReached(uint64 chainKey, uint64 height) view returns (bool)'
];

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(38)} ${detail ?? ''}`);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const network = await provider.getNetwork();
  console.log(`chain ${network.chainId} @ ${RPC}\n`);

  // 1. bytecode present at every address we were given
  for (const [name, addr] of Object.entries(ADDR)) {
    if (!addr) {
      check(`${name}.code`, false, 'no address configured');
      continue;
    }
    const code = await provider.getCode(addr);
    check(`${name}.code`, code !== '0x', `${addr} (${(code.length - 2) / 2} bytes)`);
  }

  const engine = new ethers.Contract(ADDR.coverageEngine, ENGINE_ABI, provider);
  const adapter = new ethers.Contract(ADDR.attestcoinAdapter, ADAPTER_ABI, provider);

  // 2. wiring
  const [mkt, cm, la] = await Promise.all([
    engine.market(),
    engine.challengeManager(),
    engine.lendingAdapter()
  ]);
  check('engine.market', mkt.toLowerCase() === (ADDR.coverageMarket ?? '').toLowerCase(), mkt);
  check('engine.challengeManager', cm.toLowerCase() === (ADDR.challengeManager ?? '').toLowerCase(), cm);
  check('engine.lendingAdapter', la.toLowerCase() === (ADDR.lendingAdapter ?? '').toLowerCase(), la);

  // 3. constants and parameters
  const [bp, ci] = await Promise.all([adapter.BLOCK_PROVER_ADDRESS(), adapter.CHAIN_INFO_ADDRESS()]);
  check(
    'adapter.BLOCK_PROVER_ADDRESS',
    bp.toLowerCase() === '0x0000000000000000000000000000000000000fd2',
    bp
  );
  check(
    'adapter.CHAIN_INFO_ADDRESS',
    ci.toLowerCase() === '0x0000000000000000000000000000000000000fd3',
    ci
  );
  const [ratio, grace] = await Promise.all([engine.coverageRatioBps(), engine.defaultGraceBlocks()]);
  check('engine.coverageRatioBps >= 10000', Number(ratio) >= 10000, `${ratio}bips`);
  check('engine.defaultGraceBlocks', Number(grace) > 0, `${grace} source blocks`);

  // 4. the live frontier, read through the DEPLOYED adapter, by the real node
  const [available, height, hash] = await adapter.tryFrontier(CHAIN_KEY);
  check('adapter.tryFrontier (live precompile)', available && Number(height) > 0, `height=${height} hash=${hash}`);

  if (available) {
    const atFrontier = await adapter.frontierReached(CHAIN_KEY, height);
    check('frontierReached(reported height)', atFrontier === true, `-> ${atFrontier}`);
    const future = await adapter.frontierReached(CHAIN_KEY, BigInt(height) + 10_000_000n);
    check('frontierReached(height + 10M)', future === false, `-> ${future} (must be false)`);
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);

  const dir = new URL('../evidence/', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    `${dir}deployment-verification.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        chainId: Number(network.chainId),
        rpc: RPC,
        addresses: ADDR,
        chainKey: CHAIN_KEY,
        frontier: available ? { height: Number(height), hash } : null,
        checks
      },
      null,
      2
    )
  );
  console.log('evidence written to worker/evidence/deployment-verification.json');
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
