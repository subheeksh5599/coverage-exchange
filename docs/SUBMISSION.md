# Submission text

Copy-paste blocks for the DoraHacks form. Every fact here is verifiable from `evidence.json`; nothing is
rounded up.

## Project name

Coverage Exchange

## Sector

DeFi (secondary: RWA, AI)

## Short description (one paragraph, for the BUIDL card)

Coverage Exchange is a market for bonded coverage over a range of cross-chain state. An underwriter locks
a bond behind a claim about a window of source-chain blocks; a lender releases exposure only while that
claim remains valid; and any participant who proves a single contradicting transaction inside the window
takes the bond — atomically, in one transaction, with no committee, no dispute window and no admin. No
credit score is issued: a score summarises the past, whereas coverage prices a defined future exposure and
can be destroyed by anyone who finds the counterexample. Live on Creditcoin CC3 testnet, all nine contracts
verified, with a real Attestcoin proof of a real Sepolia transaction having breached a real position.

## Attestcoin Protocol integration summary

The protocol's entire Attestcoin dependency is one file, `contracts/src/AttestcoinAdapter.sol`, which calls
both precompiles on Creditcoin CC3 testnet:

- **ChainInfo (`0x0000000000000000000000000000000000000fD3`)** — `is_height_attested` and
  `get_latest_attestation_height_and_hash`. This establishes the *attested frontier*, which is what makes a
  coverage window auditable: `CoverageEngine.isValid` refuses a draw unless the frontier is readable and
  inside the position's live band, and `windowClosed` requires the frontier to have passed
  `endBlock + requiredDepth`. Reads go through a `staticcall` and **fail closed** — if the precompile is
  unreachable the position is not valid, with no fallback to a locally stored height.
- **Block Prover (`0x0000000000000000000000000000000000000FD2`)** — `verifyAndEmit` (single and batch, the
  batch overload sharing one continuity proof), the free `verify` view for preflight, and
  `calculateTxIndex`, which recovers a transaction's ordinal position from its merkle path so the replay
  key cannot be forged by a submitter.

Depth beyond the basic call, each of which exists because the naive version is wrong:

1. **Inclusion is not success.** A reverted source transaction is still validly included and still yields
   a valid proof, so the proven receipt is decoded with the protocol's own `EvmV1Decoder` (vendored
   byte-identical) and `receiptStatus == 1` is required before any invariant is evaluated.
2. **topic0 is not authorship.** Every predicate is gated on the emitting contract address, not just the
   event signature, so a lookalike event from another contract cannot fire an invariant.
3. **Replay keys are derived from the proof, not from a claim** —
   `keccak256(coverageId, chainKey, blockHeight, txIndex)` — and are scoped per coverage, so one violating
   transaction may legitimately breach several positions while the same counterexample can never breach
   the same position twice.
4. **chainKey is modelled separately from chainId**, and a proof carrying the wrong key reverts.
5. **Batch continuity.** The batch `verifyAndEmit` path is used and *measured* rather than asserted:
   419,994 gas naive vs 293,781 gas batched across 5 claims — a real 30.1% saving, published as 30%
   rather than as an order of magnitude.

Live evidence, keyless and reproducible: `worker/scripts/live-precompile-check.mjs` (7/7 — a real proof
from the public proof builder accepted by the real precompile, then the same proof with one bit flipped
rejected with "Merkle proof validation failed") and the deployed `AttestcoinAdapter` reading the live
frontier in `worker/scripts/verify-deployment.mjs` (19/19).

## GitHub repository

https://github.com/subheeksh5599/coverage-exchange

## Deck / whitepaper

> TODO — needs a PDF. The content already exists in `README.md`, `INVARIANTS.md`, `SECURITY.md` and
> `docs/` (ATTESTCOIN, ECONOMICS, COMPARISON, INTEGRATION, GAS, JUDGE-PACKET); it needs laying out, not
> writing.

## Prototype demo video

> TODO — the shot list and narration are written in `docs/DEMO.md`; the recording is the missing step.

## Deployed addresses (CC3 testnet, chainId 102031, all verified)

| Contract | Address |
|---|---|
| DemoToken (cxTUSD, faucet) | `0x7bde1e22355677cf4ac461fec92f534dda2117b7` |
| AttestcoinAdapter | `0x5800fe651f37fc22ba0ce5e5b407c0b88a59ca63` |
| CoverageEngine | `0xca5e3b0076673cd64a1655221305e66f2056d2bb` |
| CoverageMarket | `0xb4569dc8827a8e573f2bb34b7f68a7ecf078b0e1` |
| ChallengeManager | `0x5218279fd26e9b544c27e21acb1bfc9e325a5937` |
| LendingAdapter | `0xf6931e84078c7fffc4f24c18bb15850ce7a1d967` |
| ProhibitedRecipient | `0x52a200d46c73695c746c31d76f9150a22c20fca1` |
| AmountAboveLimit | `0xba7469150da333bb8d2848e1a86aa80c212011ef` |
| AmountBelowFloor | `0x6728d18271470ea888ae23df99fcf4a70f3a3b2b` |

Explorer: `https://creditcoin-testnet.blockscout.com/address/<address>`

## Headline transactions

| What | Transaction |
|---|---|
| Borrower buys coverage | `0x1a9aece9e5b5cfea1ca86554ea6d02d73f427fdfce8ecee05b302dbb1a9ed0a5` |
| Draw against valid coverage | `0x84c5783f762076fea37d6371c9ccd9ed7a926f7ad5124333392eed819dfe87be` |
| **Challenge — real proof, bond seized** | `0x5930a7e3e29f6394839dd34c6688a501778ad2b928c6877b95a44ecdd326686f` |
| **Draw refused after breach** (status failed) | `0xb62ce5ed691e7521c2c05430c1fc8c5069d42ff649dc0db7680056df8969fbfa` |
| **Replayed challenge refused** (status failed) | `0x65a8bc7f34a90538964342617ca75cc097f7d1bc3cbdd1c6e650898cb9772be7` |
| Clean position settles, bond returned | `0x508dc45c0a7b613813bec6f84aea4b4ca506f2b4a06fe0a7d3ebfeb78c5273b2` |
| Counterexample source (Sepolia) | `0x19c528d3175bfc9d7cd0b1b7285fa07113054c5585eb8dead195b977edbc88a1` |

## Team

> TODO — name, email, Telegram/X/LinkedIn, short bio, role and country for each member, per the form.
