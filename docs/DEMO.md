# Demo script

For whoever records the video. This is the shot list and the words — nothing else. Every number, address
and hash below is real and already on chain; nothing needs to be set up or re-run before recording.

## Before you hit record

Open these tabs in order, so you never scroll while live:

1. `https://creditcoin-testnet.blockscout.com/tx/0x5930a7e3e29f6394839dd34c6688a501778ad2b928c6877b95a44ecdd326686f` — **the challenge** (the money shot)
2. `https://creditcoin-testnet.blockscout.com/tx/0x84c5783f762076fea37d6371c9ccd9ed7a926f7ad5124333392eed819dfe87be` — the draw that preceded it
3. `https://creditcoin-testnet.blockscout.com/tx/0xb62ce5ed691e7521c2c05430c1fc8c5069d42ff649dc0db7680056df8969fbfa` — a draw **refused on chain** after the breach (status: failed)
4. `https://creditcoin-testnet.blockscout.com/address/0xca5e3b0076673cd64a1655221305e66f2056d2bb?tab=read_contract` — CoverageEngine → read `getCoverage(10)`
5. `https://ethereum-sepolia.etherscan.io/tx/0x19c528d3175bfc9d7cd0b1b7285fa07113054c5585eb8dead195b977edbc88a1` — the real Sepolia transfer used as evidence
6. `https://creditcoin-testnet.blockscout.com/tx/0x508dc45c0a7b613813bec6f84aea4b4ca506f2b4a06fe0a7d3ebfeb78c5273b2` — the clean position settling

⚠️ A frontend does not exist — this repository is contracts, worker and docs only. So the demo shows the
state on the explorer, where the effects are public and verifiable, rather than in a product UI. If you
want a website demo instead, that is the one piece still missing; say so and it gets built.

---

## 0:00 – 0:20 — the problem

**On screen:** tab 6 (a settled transaction), then tab 1.

**Say:**
> "A lender is about to extend credit on Creditcoin. The collateral and the borrower's behaviour are on
> Ethereum. The lender cannot see Ethereum — so today it either trusts a report, or lends so little it
> doesn't matter. This is the missing third option: a claim about another chain that costs money when
> it's false."

## 0:20 – 0:45 — what a coverage position is

**On screen:** tab 4, read `getCoverage(10)`.

**Say:**
> "This is position ten. It says: this borrower may draw up to ten thousand, only while the attested
> frontier covers source blocks 11,671,130 to 11,671,230 to a depth of thirty-two, and only while no
> counterexample has been proven. Twelve thousand of bond is locked behind that claim — more than the
> exposure, so breaching it on purpose is never profitable."

## 0:45 – 1:15 — the honest path works

**On screen:** tab 2, then scroll to the token transfers at the bottom of tab 4's read page.

**Say:**
> "The borrower bought it, the lender released capital against it, and the draw succeeded — that
> transaction is thirty-nine thousand gas of real work on Creditcoin CC3. So far this is credit gated by
> a verifiable condition."

## 1:15 – 1:50 — the attack

**On screen:** tab 5 (the Sepolia transaction), then tab 1.

**Say:**
> "Now someone attacks it. On Ethereum, this transfer went to an address the position declared
> prohibited — a real transaction, nothing staged. Anybody can pull the Attestcoin proof for it. Nobody
> needs permission, no stake, no allowlist: the proof is the only credential."

## 1:50 – 2:20 — the breach, in one transaction

**On screen:** tab 1, scroll from the top: status **success**, then the internal transfer at the bottom.

**Say:**
> "One transaction. The Block Prover precompile verified the proof, the contract decoded the receipt,
> confirmed the transaction actually succeeded rather than merely being included, checked the emitter,
> and ran the invariant. The position flipped to BREACHED and the twelve thousand bond went to the
> challenger — in the same transaction, with no dispute window and no committee."

## 2:20 – 2:40 — the consequence

**On screen:** tab 3 — the failed transaction.

**Say:**
> "The borrower immediately tries to draw again. Refused on chain, status failed, and the reason is in
> the error: coverage not valid, status breached. A second challenger tries to replay the same proof:
> also refused."

## 2:40 – 3:00 — the other world

**On screen:** tab 6.

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
production, and do not claim the compression is order-of-magnitude — the measured saving is 30.1% and it
is published in `docs/GAS.md`. Every number in this script is verifiable from `evidence.json`.
