#!/usr/bin/env python3
"""Verify every transaction the README publishes is real, and report its on-chain status.

A README that cites a hash which does not resolve is worse than one that cites none: it looks like
evidence and is not. The receipts table claims specific outcomes, so the status is checked rather
than assumed — and a claim of "settling" must not sit on a failed transaction.
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path.home() / "coverage-exchange"
CC3 = "https://rpc.cc3-testnet.creditcoin.network"

s = (ROOT / "README.md").read_text()
blockscout = re.findall(r"blockscout\.com/tx/(0x[0-9a-fA-F]{64})", s)

print(f"{len(blockscout)} CC3 transaction(s) cited\n")
fails = []
for h in blockscout:
    out = subprocess.run(["cast", "receipt", h, "--rpc-url", CC3, "--json"],
                         capture_output=True, text=True).stdout
    try:
        d = json.loads(out)
        st = int(d["status"], 16)
        blk = int(d["blockNumber"], 16)
        print(f"  {'success' if st == 1 else 'FAILED ':8} block {blk:>9}  {h[:20]}…")
        if st != 1:
            fails.append(f"{h} is a failed transaction but is cited as a receipt")
    except Exception:
        print(f"  NOT FOUND          {h[:20]}…")
        fails.append(f"{h} does not resolve on CC3")

print()
if fails:
    print("FAIL")
    for f in fails:
        print("  - " + f)
    sys.exit(1)
print(f"PASS — all {len(blockscout)} cited transactions resolve and succeeded")
