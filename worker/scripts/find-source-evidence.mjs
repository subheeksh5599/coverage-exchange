#!/usr/bin/env node
/**
 * Find a real source-chain transaction to use as counterexample evidence.
 *
 * The predicate this protocol ships asserts "no transfer to address X from the contracted source
 * contract inside the covered window". To demonstrate that on a live network we need a REAL source-chain
 * transaction that genuinely violates such a term — not a synthetic one. This script locates one:
 *
 *   - scans Sepolia blocks below the attested frontier (so the proof is already available),
 *   - looks for a canonical ERC-20 Transfer log emitted by a known token contract,
 *   - reports the transaction, its block and the recipient, which becomes the prohibited address.
 *
 * Nothing here fabricates evidence: the chosen transaction exists on Ethereum, and the invariant that it
 * violates is a real term someone could write into a coverage position.
 *
 * Usage: node scripts/find-source-evidence.mjs [blocksToScan] [tokenAddress]
 */
import { ethers } from 'ethers';

const SOURCE_RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const CC3_RPC = process.env.CC3_TESTNET_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network';
const CHAIN_KEY = Number(process.env.CHAIN_KEY ?? 1);

// Sepolia USDC — a real token contract that emits canonical Transfer logs.
const DEFAULT_TOKEN = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

const BLOCKS = Number(process.argv[2] ?? 300);
const TOKEN = (process.argv[3] ?? DEFAULT_TOKEN).toLowerCase();

async function frontier() {
  const cc3 = new ethers.JsonRpcProvider(CC3_RPC);
  const chainInfo = new ethers.Contract(
    '0x0000000000000000000000000000000000000fD3',
    new ethers.Interface([
      'function get_latest_attestation_height_and_hash(uint64) view returns (uint64,bytes32,bool,bool)'
    ]),
    cc3
  );
  return Number((await chainInfo.get_latest_attestation_height_and_hash(CHAIN_KEY))[0]);
}

async function main() {
  const source = new ethers.JsonRpcProvider(SOURCE_RPC);
  const f = await frontier();
  console.log(`attested frontier (chainKey ${CHAIN_KEY}): ${f}`);
  console.log(`token under test: ${TOKEN}`);
  console.log(`scanning ${BLOCKS} blocks below the frontier...\n`);

  const head = await source.getBlockNumber();
  const start = Math.min(f, head) - 3_000;

  for (let i = 0; i < BLOCKS; i++) {
    const blockNumber = start - i;
    if (blockNumber < 1) break;

    const logs = await source.getLogs({
      address: TOKEN,
      topics: [TRANSFER_TOPIC],
      fromBlock: blockNumber,
      toBlock: blockNumber
    });
    if (logs.length === 0) continue;

    const log = logs[0];
    const from = ethers.getAddress('0x' + log.topics[1].slice(26));
    const to = ethers.getAddress('0x' + log.topics[2].slice(26));
    const value = BigInt(log.data);

    const receipt = await source.getTransactionReceipt(log.transactionHash);
    const tx = await source.getTransaction(log.transactionHash);

    const evidence = {
      sourceTx: log.transactionHash,
      sourceBlock: blockNumber,
      txIndex: receipt.index,
      status: receipt.status,
      contract: TOKEN,
      eventSignature: TRANSFER_TOPIC,
      eventName: 'Transfer(address,address,uint256)',
      from,
      to,
      value: value.toString(),
      toAddressLabel: 'candidate prohibited recipient',
      tokenDecimals: null,
      gasUsed: receipt.gasUsed.toString(),
      sender: tx.from
    };

    console.log('FOUND a real Transfer log on Sepolia');
    console.log(JSON.stringify(evidence, null, 2));
    console.log(
      `\nThis is the evidence a coverage position over window [${blockNumber - 50}, ${blockNumber + 50}] ` +
        `would use, with the prohibited recipient set to ${to}.`
    );

    const { writeFileSync, mkdirSync } = await import('node:fs');
    const dir = new URL('../evidence/', import.meta.url).pathname;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}source-evidence.json`, JSON.stringify(evidence, null, 2));
    console.log('written to worker/evidence/source-evidence.json');
    return;
  }
  console.log('no Transfer logs found in the scanned range; widen the scan');
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
