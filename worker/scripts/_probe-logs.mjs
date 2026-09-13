import { ethers } from 'ethers';
const T = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const SEPOLIA = { chainId: 11155111, name: 'sepolia' };
const HEAD = Number(process.argv[2] ?? 11696100);
const p = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com', SEPOLIA, { staticNetwork: true });
for (const span of [5, 25, 100, 500]) {
  const t0 = Date.now();
  try {
    const logs = await p.getLogs({ fromBlock: HEAD - span, toBlock: HEAD, topics: [T] });
    console.log(`span ${String(span).padStart(4)}  OK   ${String(logs.length).padStart(4)} logs  ${Date.now() - t0}ms`);
  } catch (e) {
    console.log(`span ${String(span).padStart(4)}  FAIL ${String(e.shortMessage || e.message).slice(0, 60)}  ${Date.now() - t0}ms`);
  }
}
