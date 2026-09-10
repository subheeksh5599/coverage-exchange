# Demo script

For whoever records the video. This is the shot list and the words — nothing else. Every number, address
and hash below is real and already on chain; nothing needs to be set up or re-run before recording.

The demo is **website-first**: the app at `web/` is the stage, and the explorer is where each claim gets
checked. No terminal on screen, no GitHub.

## Before you hit record

Start the app:

```
cd web && npm install && npm run dev      # http://localhost:3000
```

Then open these tabs in order, so you never scroll while live. The landing page also carries three real
screenshots of the console — you never have to describe what the product looks like:

1. `http://localhost:3000/` — **the landing**, with the Sepolia frontier live in the header
2. `http://localhost:3000/dashboard` — **the console**. Four views, click them in this order:
   - **Overview** — bond locked, covered exposure, drawn, the invariant per position, covered windows against the live frontier
   - **Positions** — every position with its live `isValid` reason; filter to ACTIVE for the two still in flight
   - **Attack matrix** — all 15 attempts, each with the revert reason it hit
   - **Contracts** — the 9 verified deployments on CC3
3. `https://creditcoin-testnet.blockscout.com/tx/0x5930a7e3e29f6394839dd34c6688a501778ad2b928c6877b95a44ecdd326686f` — **the challenge** (the money shot)
4. `https://creditcoin-testnet.blockscout.com/tx/0xb62ce5ed691e7521c2c05430c1fc8c5069d42ff649dc0db7680056df8969fbfa` — a draw **refused on chain** after the breach (status: failed)
5. `https://ethereum-sepolia.etherscan.io/tx/0x19c528d3175bfc9d7cd0b1b7285fa07113054c5585eb8dead195b977edbc88a1` — the real Sepolia transfer used as evidence
6. `https://creditcoin-testnet.blockscout.com/tx/0x508dc45c0a7b613813bec6f84aea4b4ca506f2b4a06fe0a7d3ebfeb78c5273b2` — the clean position settling

One honest note to have ready if a judge asks: **the site is read-only.** It reads Creditcoin CC3 live
and every number on it is generated from the evidence manifest, but the transactions were sent by the
scripts in `worker/`, where the wallets are. Don't imply you're clicking to send money.

---

## 0:00 – 0:20 — the problem

**On screen:** tab 1, the landing. Let the frontier number in the header sit visible for a beat.

**Say:**
> "A lender is about to extend credit on Creditcoin. The collateral and the borrower's behaviour are on
> Ethereum. The lender cannot see Ethereum — so today it either trusts a report, or lends so little it
> doesn't matter. This is the missing third option: a claim about another chain that costs money when
> it's false. That number in the corner is Ethereum's attested frontier, read live."

## 0:20 – 0:45 — what a coverage position is

**On screen:** tab 2, the console. Open **Overview**, then point at the breached position's row.

**Say:**
> "This is a coverage position. It says: this borrower may draw up to ten thousand, only while the
> attested frontier covers source blocks 11,671,130 to 11,671,230 to a depth of thirty-two, and only
> while no counterexample has been proven. Twelve thousand of bond is locked behind that claim — more
> than the exposure, so breaching it on purpose is never profitable. Every row here is read from the
> deployed contract right now, including whether it's currently valid and why."

## 0:45 – 1:15 — the honest path works

**On screen:** stay on tab 2. Click **Positions**, filter to **ACTIVE**, and show the draw that succeeded.

**Say:**
> "The borrower bought coverage, the lender released capital against it, and the draw succeeded — two
> hundred and eighty-eight thousand gas of real work on Creditcoin CC3. So far this is credit gated by a
> verifiable condition rather than by a promise."

## 1:15 – 1:50 — the attack

**On screen:** tab 5 (the Sepolia transaction), then back to tab 2.

**Say:**
> "Now someone attacks it. On Ethereum, this transfer went to an address the position declared
> prohibited — a real transaction, nothing staged. Anybody can pull the Attestcoin proof for it. Nobody
> needs permission, no stake, no allowlist: the proof is the only credential."

## 1:50 – 2:20 — the breach, in one transaction

**On screen:** tab 3, scroll from the top: status **success**, then the token transfer at the bottom.

**Say:**
> "One transaction. The Block Prover precompile verified the proof, the contract decoded the receipt,
> confirmed the transaction actually succeeded rather than merely being included, checked the emitter,
> and ran the invariant. The position flipped to BREACHED and the twelve thousand bond went to the
> challenger — in the same transaction, with no dispute window and no committee."

## 2:20 – 2:45 — the consequence

**On screen:** tab 2, click **Attack matrix**; then tab 4, the failed transaction.

**Say:**
> "The borrower immediately tries to draw again. Refused on chain — status failed, and the reason is in
> the error: coverage not valid, status breached. That's one row of fifteen. Every attack we could think
> of was run against this deployment and every one was refused, and two of them are real failed
> transactions you can open, not simulations."

## 2:45 – 3:00 — the other world

**On screen:** tab 6, then back to tab 2 → **Positions** → **SETTLED**.

**Say:**
> "And the honest case: a second position nobody breached. The window closed, the frontier covered it,
> the position settled and the bond went back to the underwriter. That matters — this is not a machine
> that only takes bonds away, and the same code path decides both outcomes."

---

## 60-second version (if you only get one minute)

> "Credit on Creditcoin against collateral that lives on Ethereum. Instead of trusting a report, an
> underwriter locks a bond behind a claim about a range of Ethereum blocks. The lender will only release
> money while that claim holds. Anyone who can prove one contradicting transaction inside the range
> takes the bond — here, in a single transaction, with the real proof, and the borrower's next draw was
> refused on chain. If nobody finds a contradiction, the bond goes back."

## What NOT to say

Do not call the demo asset a stablecoin (it is a faucet token), do not call the deployment audited or
production, do not imply the site sends transactions (it is read-only), and do not claim the compression
is order-of-magnitude — the measured saving is 30.1% over five claims and 22.5% over ten, both published
in `docs/GAS.md`. Every number in this script is verifiable from `evidence.json`.
