#!/usr/bin/env python3
"""Validate every address in evidence.json against the broadcast artifact and the chain.

I hand-transcribed the ChallengeManager address and dropped a character, which produced a
39-character "address" that typechecked, built, deployed, and only failed at runtime inside a viem
call. That is the exact failure mode the project's generated-evidence discipline exists to prevent,
so this checks the addresses the same way: mechanically, against the source of truth.

Two independent checks:
  1. every address is 40 hex characters
  2. every address matches the broadcast artifact's record of what was deployed
  3. every address has code on chain
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path.home() / "coverage-exchange"
RPC = "https://rpc.cc3-testnet.creditcoin.network"

ev = json.loads((ROOT / "evidence.json").read_text())
bc = json.loads((ROOT / "contracts/broadcast/Deploy.s.sol/102031/run-latest.json").read_text())

# what the deploy actually produced, keyed by contract name
deployed = {}
for r in bc["transactions"]:
    n, a = r.get("contractName"), r.get("contractAddress")
    if n and a:
        deployed[n] = a

# evidence key -> deploy contract name
MAP = {
    "demoToken": "DemoToken",
    "attestcoinAdapter": "AttestcoinAdapter",
    "coverageEngine": "CoverageEngine",
    "coverageMarket": "CoverageMarket",
    "challengeManager": "ChallengeManager",
    "lendingAdapter": "LendingAdapter",
    "offerRegistry": "OfferRegistry",
    "predicateProhibitedRecipient": "ProhibitedRecipient",
    "predicateAmountAboveLimit": "AmountAboveLimit",
    "predicateAmountBelowFloor": "AmountBelowFloor",
}

contracts = {k: v for k, v in ev["contracts"].items() if not k.startswith("_")}
fails = []

print(f"{'evidence key':32} {'chars':>5}  {'matches artifact':17} {'code on chain':13}")
print("-" * 78)

for key, addr in sorted(contracts.items()):
    n = len(addr) - 2
    ok_len = n == 40

    want = deployed.get(MAP.get(key, ""), "")
    ok_art = addr.lower() == want.lower()

    code = subprocess.run(
        ["cast", "code", addr, "--rpc-url", RPC], capture_output=True, text=True
    ).stdout.strip()
    ok_code = len(code) > 2

    print(f"{key:32} {n:>5}  {('yes' if ok_art else 'NO -> ' + (want[:20] or '?')):17} "
          f"{('yes' if ok_code else 'NO'):13}")

    if not ok_len:
        fails.append(f"{key}: {n} hex chars, expected 40")
    if not ok_art:
        fails.append(f"{key}: {addr} != artifact {want}")
    if not ok_code:
        fails.append(f"{key}: no code on chain")

# and every 0x-hash the manifest publishes must be 64 hex chars
print()
print("transaction hashes:")
txs = ev["transactions"]
for k, v in txs.items():
    if k.startswith("_") or k in ("previousDeployment", "sourceChain"):
        continue
    vals = v if isinstance(v, list) else [v]
    for h in vals:
        if not isinstance(h, str) or not h.startswith("0x"):
            continue
        n = len(h) - 2
        flag = "ok" if n == 64 else f"WRONG ({n})"
        if n != 64:
            fails.append(f"{k}: hash {h} is {n} chars, expected 64")
        print(f"  {k:26} {n:>3}  {flag}")

print()
if fails:
    print("FAIL")
    for f in fails:
        print("  - " + f)
    sys.exit(1)
print(f"PASS — {len(contracts)} addresses are 40 hex, match the artifact, and have code; "
      "all hashes are 64 hex")
