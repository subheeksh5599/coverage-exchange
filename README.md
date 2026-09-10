# Coverage Exchange

**Buy guarantees. Don't trust promises.**

Coverage Exchange lets capital providers sell **bonded, cross-chain coverage over a defined state window**. Attestcoin establishes the window's evidentiary frontier; a lender can unlock exposure only while that window remains valid, and any participant who proves one contradictory transaction inside it can atomically claim the coverage bond.

## The primitive

A coverage position is valid for exposure `E` over window `[startBlock, endBlock]` if and only if:

- the attested frontier covers the entire committed window at the required depth,
- the underwriter's bond covers the maximum exposure,
- coverage capacity covers the required exposure,
- the position is inside its window and not expired,
- and no counterexample has been proven against it.

## Status

**Scaffold — build not started.** No contracts, no deployment, no claims. This repository is being prepared for the BUIDL CTC 2026 Fall hackathon (Creditcoin & Credit Labs). Nothing here is a claim of working software yet.

## Planned stack

- Creditcoin CC3 testnet (chainId 102031) — settlement chain, Attestcoin Smart Contracts
- Ethereum Sepolia (chainKey 1) — source chain
- BlockProver precompile `0x0000000000000000000000000000000000000FD2` — inclusion + continuity proofs
- ChainInfo precompile `0x0000000000000000000000000000000000000fd3` — attested frontier
- `@gluwa/usc-sdk` — proof generation
- Solidity + Foundry · TypeScript worker + web app

## Licence

TBD.
