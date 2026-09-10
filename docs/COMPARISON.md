# Comparison with the nearest work in this field

The default shape in this event's field is a **credit passport**: prove a repayment on one chain, mint a
score or a better rate on Creditcoin. This project is deliberately not that — a score summarises the
past, whereas coverage prices a defined future exposure and can be attacked. This document records the
precise boundary against the neighbouring mechanisms, because a reviewer's first question will be "how
is this not just X?" and a vague answer is a lost point.

Descriptions below are of the mechanisms as their public repositories present them at the time of
writing; the point is to locate the boundary, not to grade anyone's work.

## 1. Event-set completeness bonding

**What it does.** Bonds the claim that a set of proven events is *complete* — that a submitter has not
quietly withheld part of the evidence. This is a real gap (a proof of inclusion says nothing about what
else exists) and it is handled with a bond on the completeness claim.

**The boundary.** Same tool, different object. Completeness bonding secures *a claim about the evidence
set*; this protocol secures **exposure gating**: coverage capacity is an instrument that a lender consumes
before releasing capital, it is priced by window length and attestation depth, and it is exhausted as
exposure is drawn. There is no concept of capacity, exposure, or a lender consuming either one, because
the bond is not standing behind anyone's credit line.

**What we would take from that direction if we continued:** its completeness proof is a natural second
predicate type here — a position whose covered window must be proven fully observed, rather than observed
at its endpoints.

## 2. Ordering bonds

**What it does.** Proves that transaction A executed before transaction B inside a source block — a fact
that lives in no payload and is readable by no oracle — and bonds a relay's promise about it, so breaking
the promise costs the relay.

**The boundary.** The resemblance is exact and worth naming: it is a bonded, falsifiable promise that
slashes on proof, which is the same *shape* as a coverage bond. What differs is what the bond secures.
There, the bond secures **a relay's honesty about ordering** for a party's own transactions; no credit
exposure is gated, no coverage is sold to a third party, and no capacity is priced or consumed. Here the
bond secures **a borrower's future compliance for a lender's benefit**, the position gates real exposure
in `LendingAdapter`, and breaching it freezes draws in the same transaction.

## 3. Covenant enforcement with hunter payouts

**What it does.** A proven violation of agreed covenants freezes undrawn credit and pays the permissionless
party who submitted the evidence. The proof changes credit *risk* rather than releasing an escrow — a
genuinely different application of the primitive from the escrow-shaped submissions around it.

**The boundary.** Enforcement is reactive: a violation has already happened, the penalty lands afterwards,
and the deliverable is punishment rather than protection. This protocol is preventive by construction —
the draw path refuses exposure unless coverage is valid *at that moment* — and it adds the element that
direction lacks: **a priced, consumable instrument**. Nobody buys a "covenant" there; here the premium,
the capacity and the coverage ratio are the product.

## 4. Proof-triggered parametric cover

**What it does.** A party buys protection against an event that would hurt *itself* — a liquidation, a
depeg, an oracle going quiet, a service failing, a delivery not arriving — and a proven event pays out
from a pool, with no claims adjuster.

**The boundary.** Same payout trigger, different risk. In all of these, the buyer and the beneficiary are
the same party, and the covered event is a fact about the world. Here the buyer (the borrower) is not the
beneficiary (the lender), and what is covered is **a third party's future behaviour over a window** —
which is why the mechanism needs a challenge, a bond sized against the exposure, and an expiry computed
from the attested frontier rather than a claim form.

**Where this idea would fail if it were only that:** if the market layer were removed and coverage were
just "pay out when a proven bad event happens", it would become a seventh entry in that cluster with a
ceiling far below the design's. The differentiation is the instrument, not the trigger — which is why the
instrument is the part that is built.

## 5. Credit passports and portable scores

**What it does.** Proves cross-chain repayment history and makes it readable on Creditcoin as a score or
credential that unlocks better terms.

**The boundary.** A score is a summary of the past and is unfalsifiable-by-construction at the moment it
is used: it cannot be wrong *later*, so nobody can be paid for catching it out. Coverage is a claim about
a specific window that can be destroyed by one transaction, and the party who destroys it is paid. The
two compose: a passport answers "has this borrower behaved?", coverage answers "what happens if they
stop, right now?".

## 6. Oracle substitution

**What it does.** Replaces a centralized oracle operator with attested source-chain facts.

**The boundary.** Complementary, and this protocol is a *consumer* of that substitution rather than a
competitor to it. The observation worth stating: substituting an oracle does not by itself make an
application honest, because a prover chooses *which* truths to prove. Attestation makes individual facts
trustworthy; it says nothing about what was left out. Coverage puts money on the omission — the underwriter
loses the bond if the withheld fact existed and someone proves it.

## Summary table

| Direction | Bond? | Prices anything? | Gates third-party exposure? | Challengeable at the moment of use? |
|---|---|---|---|---|
| Event-set completeness | yes | no | no | yes (completeness claim) |
| Ordering bonds | yes | no | no | yes (ordering claim) |
| Covenant enforcement | no (penalty) | no | freezes, reactively | after the fact |
| Proof-triggered cover | pool | premium | no (self-insurance) | payout only |
| Credit passports | no | rate | no | not falsifiable later |
| **Coverage Exchange** | **yes** | **premium + capacity** | **yes, in the draw path** | **yes, atomically** |
