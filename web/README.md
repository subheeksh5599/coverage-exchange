# Coverage Exchange — web

A transactional client for the protocol. Not a landing page: every page performs an operation
against the deployed contracts on Creditcoin CC3, and every button signs a transaction.

## Pages

| Route | What you do there |
|---|---|
| `/` | Dashboard — connect a wallet, read balances and capacity, see your positions |
| `/market` | Buy coverage: pick an underwriter with real free capacity, set the window, get an on-chain quote, purchase |
| `/underwrite` | Provide coverage: deposit capital, price a borrower, withdraw free capacity |
| `/positions` | Draw against coverage, repay, settle, and inspect any position by id |
| `/challenge` | Fetch a real Attestcoin proof and breach a false claim |
| `/activity` | The protocol's event log, reconstructed from emitted logs |
| `/protocol` | Protocol-wide state, underwriters, deployment addresses |
| `/docs` | The only prose page. Deliberately short. |

## How the write path works

Everything routes through `lib/tx.ts`:

1. **Simulate first** against current chain state, so a revert is reported as a sentence
   (`CoverageNotValid(2)`) before the wallet opens.
2. **Send** through the browser wallet via plain EIP-1193.
3. **Wait for the receipt.** A hash is not a confirmation, and flows here chain transactions
   (approve → deposit, approve → purchase). Returning on broadcast made the second call
   simulate against pre-approval state and revert intermittently.

Errors decode against the union of the protocol's ABIs, because they cross contract
boundaries: the market's `purchase` reverts with the engine's `InsufficientFreeBalance`, which
the market's own ABI cannot name.

## Reading state

`lib/protocol.ts` holds the live reads. There is no fixture file, no seeded array and no
fallback value anywhere: when a read fails the hook surfaces `error` and the page says so
rather than rendering a plausible number.

`lib/activity.ts` reconstructs history from emitted events. Note `lib/logs.ts`: the CC3 public
RPC caps the block range of a single `eth_getLogs` call (a 60,000-block window returns an
EMPTY result after ~11s rather than an error), so scanning walks the range in 4,000-block
chunks with bounded concurrency. Without that, a busy protocol looks dormant.

## Generated constants

Contract addresses come from `lib/evidence.generated.ts`, produced before every dev run and
build by `scripts/gen-evidence.mjs` from `evidence.json` and `worker/evidence/*.json`.

```bash
npm run check:evidence     # generator is idempotent + no hand-typed evidence values
```

Two guards run in CI: a **drift** check (regenerate and diff) and a **literal** check
(`scripts/check-no-literals.mjs`, which scans `app/` and `components/` for comma-formatted
evidence numbers typed by hand — the drift check cannot catch a value that never passed
through the generated file).

## What is not here

No mock data, no simulated transactions, no seeded positions, no TVL/APY/user-count figures.
The UI holds no state you cannot read from the chain yourself.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
npm run check:evidence
```

## Deployment

Live at **<https://coverage-exchange.vercel.app>** (Vercel project `coverage-exchange`).

This directory is the Vercel project root, so only it is uploaded. That matters:
`scripts/gen-evidence.mjs` reads `../evidence.json` and `../worker/evidence/*.json`, which live
outside this directory and do not exist in the build sandbox, so `vercel.json` pins
`buildCommand` to `next build` to skip the `prebuild` hook.

Skipping it is safe rather than convenient: `lib/evidence.generated.ts` is committed and CI
fails the build if it ever disagrees with the manifest, so the deployed file is exactly the
file CI verified. Running `npm run build` locally still regenerates it, as it should.

Deploying from `web/` without an explicit `--name` would attach to this account's existing
project called `web`, so:

```bash
cd web && vercel deploy --prod --yes --name coverage-exchange
```
