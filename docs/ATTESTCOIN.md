# Attestcoin integration

Everything this protocol asks of Attestcoin, exactly, with the real addresses, the real ABI shapes and
the evidence that it works against the live network.

## The two precompiles

| | Block Prover | ChainInfo |
|---|---|---|
| Address | `0x0000000000000000000000000000000000000FD2` (4050 decimal) | `0x0000000000000000000000000000000000000fD3` |
| Answers | "did this exact transaction happen in this block?" | "how far has the attested frontier reached?" |
| Used by | `ChallengeManager` (evidence), `AttestcoinAdapter` (preflight) | `CoverageEngine` (validity, expiry, window closure) |
| Our call | `verify` (view), `verifyAndEmit` (single + batch), `calculateTxIndex` | `is_height_attested`, `get_latest_attestation_height_and_hash` |

Both are **native runtime code in the Creditcoin node**, not deployed contracts. `eth_getCode` returns
`0x` at both addresses. Treating that as "not deployed" is the single most common misreading of this
protocol.

Calls are wrapped in one file — `contracts/src/AttestcoinAdapter.sol` — so the protocol's entire
Attestcoin surface is auditable in one place and business logic never touches an address directly.

## Chains and keys

| Environment | Settlement chain | Source chains |
|---|---|---|
| CC3 testnet (chainId `102031`) | this is where our contracts live | Ethereum Sepolia — `chainKey 1`; Ethereum mainnet — `chainKey 3` |
| CC3 mainnet (chainId `102030`) | same code, different addresses | Ethereum mainnet — `chainKey 1` |

**`chainKey` is not `chainId`.** Attestcoin maintains its own key space. The key is part of every proof,
every frontier query and every replay key, and a proof from one key can never satisfy another (asserted
in `AttackMatrixTest.test_D_WrongChainIsRefused`).

Endpoints used by the worker:

```
CC3 testnet RPC       https://rpc.cc3-testnet.creditcoin.network
CC3 mainnet RPC       https://rpc.cc3-mainnet-usc.creditcoin.network
Proof builder         https://proof-gen-api.cc3-testnet.creditcoin.network
                      https://prover.cc3-testnet.creditcoin.network      (serves the same proofs)
Decoder contract      0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f        (CC3 testnet)
SDK                   @gluwa/usc-sdk 0.18.0 · @gluwa/asc-contracts 0.2.1
```

## The three things we ask Attestcoin to do

### 1. Establish the frontier (ChainInfo)

A coverage position is only meaningful if the window it claims to cover has actually been observed. So
every validity read asks the protocol, not a local variable:

```solidity
// AttestcoinAdapter
(bool ok, bytes memory ret) =
    CHAIN_INFO_ADDRESS.staticcall(abi.encodeCall(IChainInfo.is_height_attested, (chainKey, height)));
```

`is_height_attested(chainKey, height)` is exactly the predicate we need: the frontier has reached
`height`. That single call is what makes "the window was actually covered" checkable rather than
asserted. It is used twice:

- **drawable?** — `isValid()` requires the frontier to be readable and inside the live band, so a
  position cannot be drawn against a window nobody observed.
- **closed?** — `windowClosed()` requires `is_height_attested(endBlock + requiredDepth)`, which is the
  completeness condition: the window is only fully evidentiary once the frontier has moved past its end
  by the required depth.

Both are read through a `staticcall` whose failure returns `available = false`, and the engine then
refuses to treat the position as valid. **Fail closed, always** (I-13). There is deliberately no
fallback that substitutes `block.number` or a stored height.

### 2. Prove inclusion and continuity (Block Prover)

A challenge is only admissible if the underlying source transaction is real and inside a finalized
block:

```solidity
bool verified = INativeQueryVerifier(BLOCK_PROVER_ADDRESS).verifyAndEmit(
    chainKey, height, encodedTransaction, merkleProof, continuityProof
);
if (!verified) revert ProofInvalid();
```

`verifyAndEmit` (not `verify`) is used on the money path so the precompile's own `TransactionVerified`
event lands in the same Creditcoin transaction — on-chain proof that Attestcoin, not this protocol, did
the checking. `verify` is used for the free preflight path (`previewChallenge`), so a challenger can
learn the outcome without spending anything.

The batch overload is exposed and used by the benchmark:

```solidity
// N transactions, ONE continuity proof — the expensive part of verification is shared.
verifyAndEmit(chainKey, heights[], encodedTransactions[], merkleProofs[], sharedContinuityProof)
```

Measured on the live network: 30% gas and 3,856 bytes of calldata saved over 5 claims. Real, modest, and
documented as such in the README rather than dressed up.

### 3. Derive the replay key from the proof itself (calculateTxIndex)

The most interesting surface. `calculateTxIndex(merkleProof)` recovers a transaction's ordinal position
inside its source block **purely from the left/right shape of its merkle path** — the position is carried
in no payload and cannot be claimed by a submitter. That is why the replay key is trustworthy:

```solidity
bytes32 key = keccak256(abi.encodePacked(
    coverageId, chainKey, blockHeight, ADAPTER.transactionIndex(merkleProof)
));
```

It is scoped per coverage, so one violating transaction may legitimately breach several positions, while
the same counterexample can never breach the same position twice (I-11).

## What we do NOT ask Attestcoin to do

- **No writability.** The protocol never sends messages out to a source chain; it only reads proven facts.
- **No attestor operation.** We consume the public attestation set rather than running attestors.
- **No claim to prove an arbitrary invariant.** See `SECURITY.md` §"What a predicate cannot see" — a
  predicate sees one proven transaction, and the protocol says so instead of pretending otherwise.

## Reading a proof: the payload format

`encodedTransaction` is not raw RLP. It is the protocol's chunked form, which the vendored
`EvmV1Decoder` (byte-identical to `@gluwa/asc-contracts@0.2.1`) decodes:

```
abi.encode(uint8 txType, bytes[] chunks)
  chunks[0]      = (uint64 nonce, uint64 gasLimit, address from, bool toIsNull, address to, uint256 value, bytes data)
  chunks[1]      = type-specific (type 0: gasPrice, v, r, s)
  chunks[2]      = receipt, for types 0..2: (uint8 status, uint64 gasUsed, LogEntry[] logs, bytes logsBloom)
  chunks[3]      = receipt, for types 3..4
LogEntry = (address emitter, bytes32[] topics, bytes data)
```

The protocol reads exactly two things out of that: **`receiptStatus`** (a reverted source transaction is
not state-changing evidence, I-07) and **the logs** (which the position's predicate evaluates, with the
emitter gate in `PredicateLib`).

`test/helpers/ProvenTx.sol` builds this format in tests, so the decoder path is exercised with real
format data rather than a stub.

## Live evidence (reproduce it yourself)

```bash
cd worker && npm install
node scripts/live-precompile-check.mjs
```

Actual output from a run on 2026-09-10:

```
PASS  chaininfo.frontier                      frontier=11673770 hash=0xe44a92d95d74f2baa8f400d217bcb0d6578c9db25025f7a29cbadf2251b889cd
PASS  chaininfo.is_height_attested(frontier)  -> true
PASS  chaininfo.is_height_attested(+10M)      -> false (must be false)
PASS  sepolia.pickTransaction                 block 11653808 tx 0x167938545c8d4fffc3701b51fe655e003157d6a0b1b6e1b2426201331aa3f7cc
PASS  proofBuilder.fetchProof                 height=11653808 txIndex=0 siblings=7 roots=93
PASS  blockprover.verify(realProof)           -> true
PASS  blockprover.verify(tamperedPayload)     reverted as expected: "Merkle proof validation failed"
7/7 checks passed
```

Raw JSON: `worker/evidence/live-precompile.json`. The benchmark's raw output:
`worker/evidence/continuity-benchmark.json`.

Two operational notes learned the hard way and worth passing on:

1. **A Foundry fork cannot verify Attestcoin proofs.** `vm.createSelectFork` copies *state*; the
   precompiles are implemented in the node. On a fork, calls to `0x0FD2`/`0x0FD3` hit an empty account,
   which makes a "fabricated proof is rejected" test pass for the wrong reason. Live checks belong in
   `eth_call` — which is what our script does.
2. **CC3 headers do not populate `prevrandao`.** A default (Cancun) fork fails header validation with
   `prevrandao not set`. The `live` Foundry profile sets `evm_version = "london"` for that reason.

## Deploying

```bash
cd contracts
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $CC3_TESTNET_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY

# then verify what is actually deployed, including that the frontier answers:
ENGINE_ADDRESS=0x… ADAPTER_ADDRESS=0x… RPC_URL=$CC3_TESTNET_RPC_URL \
  forge script script/VerifyDeployment.s.sol --rpc-url $CC3_TESTNET_RPC_URL
```

No deployment is claimed by this repository yet; `VerifyDeployment` exists so that the claim, when it is
made, is checkable in one command.
