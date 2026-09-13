# Demo script

For whoever records the video. Clicks and words only. Every number below was read off the live
deployment on 13 Sep 2026; the frontier figure moves, so say it as "about" if it has drifted by the
time you record. Nothing needs to be set up or re-run.

Open one tab: **https://coverage-exchange.vercel.app**

Click **Connect wallet** once at the start. It asks for no signature and sends nothing. You need it
because the premium is priced per borrower, so the quote stays blank until the page knows who is
buying. Everything else on the site works without it.

No terminal. No GitHub. If a judge asks where the code is, answer out loud and keep the screen on
the site.

---

## 0:00 – 0:25 — the problem

**Click:** nothing. Land on the page and let the frontier number in the top right tick for a few
seconds.

**Say:**

> "A lender on Creditcoin is about to extend credit against collateral that lives on Ethereum. It
> can't see Ethereum. So today it either trusts a report, or it lends so little that it doesn't
> matter. And a report costs the person writing it nothing when it's wrong. This turns that report
> into a bond. If the claim is false, someone loses money, and the loss is automatic."

## 0:25 – 0:55 — the state of the thing

**Click:** `LIVE POSITIONS →` in the middle of the page. That lands on the console overview.

**Say:**

> "Thirteen positions exist on this deployment. Seven were breached, three expired, three settled,
> and none are active, so nothing here is gating credit right now. Those counts come from the
> contracts, not a database. Down the side, two point nine million of underwriter capital and about
> five hundred and thirty thousand the pool can actually release. The number up top is Sepolia's
> attested frontier, and it moves while I talk, because it's read live."

## 0:55 – 1:30 — what a position costs

**Click:** `02 BUY COVERAGE`. Choose the underwriter in the dropdown. Then click the `25,000` chip
next to Covered exposure.

**Say:**

> "To buy coverage you pick an underwriter with capital free, set the exposure, and set the window
> of Sepolia blocks you want covered. Watch the quote change. At twenty-five thousand of exposure
> the premium is a hundred and forty, and the underwriter has to lock twenty-five thousand of bond
> behind it. That ratio is the floor: the bond always covers the exposure, so breaching on purpose
> never pays. The premium moves with the terms because it's priced against the real window and
> depth, on chain."

## 1:30 – 2:00 — a position that died

**Click:** `05 POSITIONS`. Scroll to `COVERAGE EXPLORER`, then click `#13` in the row of position
ids.

**Say:**

> "Any position is public. Type an id or click one. Number thirteen was breached. Status breached,
> validity invalid, and then it tells you why. The predicate was ProhibitedRecipient. The covered
> window was Sepolia 11,671,130 to 11,671,230. A thousand of bond was locked, five hundred was
> drawn against it, and the position is dead. This record is read from the contract, not written by
> us."

## 2:00 – 2:20 — who is allowed to attack it

**Click:** `06 CHALLENGE`.

**Say:**

> "Anyone can challenge. There's no stake and no allowlist, and nobody has to approve you. This page
> says nothing is challengeable right now, and it tells you why. Every position here is terminal, or
> the frontier has already passed its window. An expired position can't be breached, because the
> exposure it gated has lapsed and the bond is no longer at risk. That's a line in the contract, not
> a decision somebody makes."

## 2:20 – 2:45 — the receipt

**Click:** `07 ACTIVITY`. Then click `CHALLENGE` in the filter row.

**Say:**

> "This is built by reading the contracts' own event logs, so there's no local table to drift out of
> sync with the chain. Eighty-two events. Filter to challenges and there are seven. The top one is
> the breach of position thirteen, and the transaction that did it is real, so we can open it."

**Click:** the `0x2f864705…b70647` transaction link. Let the explorer load and sit on the page.

**Say:**

> "One transaction. Success. The Block Prover precompile checked the proof, the contract decoded the
> receipt, confirmed the source transaction actually succeeded instead of just being included,
> checked the emitter, ran the invariant, and moved the bond. No dispute window, no committee."

## 2:45 – 3:05 — the deployment

**Click:** `08 PROTOCOL`.

**Say:**

> "Nine contracts, chain 102031, every one verified on Blockscout. This panel is the part I'd point a
> sceptic at. The bond-to-exposure floor is a hundred percent, enforced at purchase on every single
> position, and validity is recomputed on every call. The engine stores no valid flag that a keeper
> could quietly expire. Fifteen attacks were run against this deployment and fifteen were refused.
> Two of them are failed transactions on the explorer you can open yourself."

---

## 45-second cut

Use this if you only get one slot. Same clicks, three stops: overview, positions, activity.

> "Credit on Creditcoin against collateral that lives on Ethereum, where the lending chain can't see
> the collateral chain. Instead of trusting a report, an underwriter locks a bond behind a claim
> about a range of Ethereum blocks, and a lender releases money only while that claim holds. Anyone
> who can prove one contradicting transaction inside the range takes the whole bond, in a single
> transaction. Here are thirteen positions, seven of them breached. This one shows the predicate it
> violated and the exact block window. And this is the event log, read from the contracts, with the
> transaction that killed it. If nobody finds a contradiction, the bond goes back to the
> underwriter. That code path runs every time too."

---

## Do not say

- Don't call cxTUSD a stablecoin. It's a faucet token on a testnet.
- Don't call any of this audited, production-ready, or mainnet.
- Don't say the batching is an order of magnitude cheaper. The measured saving is 30.1% over five
  claims and 22.5% over ten, both in `docs/GAS.md`.
- Don't call the pricing coefficients "AI" anything. They're a published protocol curve.
- The landing's breach animation is a scroll animation, not live chain data. If you narrate it,
  don't read its numbers as current state. The console is where live numbers live.
- Don't mention the grants or the submission itself. Just the protocol.
