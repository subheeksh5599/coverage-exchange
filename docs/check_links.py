"""Check every link in the README resolves: local files exist, anchors match headings, URLs answer.

A README whose navigation silently rots is the failure this catches. The TOC script covers
in-page anchors; this covers everything else, including badge link targets that a media scan
does not see (the badge IMAGE is on shields.io, but the badge LINK often points at a repo file).

Run: python3 check_links.py
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

README = Path("README.md")
text = README.read_text()

DROPPED = ("&", "'", "\u2019", "`", '"', ":", ".", ",", "(", ")", "?", "!", "/", "+")
DASHES = ("\u2014", "\u2013")


def slug(h: str) -> str:
    s = h.strip()
    for d in DASHES:
        s = s.replace(d, "")
    for c in DROPPED:
        s = s.replace(c, "")
    s = s.replace(" ", "-").lower()
    return re.sub(r"[^a-z0-9\-_]", "", s)


headings = {slug(m.group(1)) for m in re.finditer(r"^#{1,6}\s+(.+?)\s*$", text, re.M)}

# Inline links [text](target) AND the outer link of badge syntax [![img](a)](b).
# Matching on `](` rather than `[...](` is what catches the badge's outer target, which the
# `[text](url)` form misses because the inner `]` ends the text run first.
targets = re.findall(r"\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)", text)

local, anchors, remote = [], [], []
for t in targets:
    if t.startswith("#"):
        anchors.append(t[1:])
    elif t.startswith("http://") or t.startswith("https://"):
        remote.append(t)
    else:
        local.append(t)

fails = []

print(f"links found: {len(targets)}  (local {len(local)}, anchors {len(anchors)}, remote {len(remote)})")

print("\nlocal files:")
for p in sorted(set(local)):
    ok = Path(p).exists()
    print(f"  {'ok ' if ok else 'MISSING'} {p}")
    if not ok:
        fails.append(f"local file does not exist: {p}")

print("\nanchors:")
dead = sorted({a for a in anchors if a not in headings})
if dead:
    for a in dead:
        print(f"  DEAD #{a}")
        fails.append(f"dead anchor: #{a}")
else:
    print(f"  all {len(set(anchors))} unique anchors resolve")

print("\nremote URLs:")
for u in sorted(set(remote)):
    try:
        code = subprocess.run(
            ["curl", "-sL", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "20", u],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
    except Exception as e:  # noqa: BLE001
        code = f"ERR {e}"
    flag = "ok " if code.startswith("2") else ("auth" if code in ("401", "403", "404") else "?? ")
    print(f"  {flag} {code}  {u[:96]}")
    if not code.startswith("2"):
        fails.append(f"URL {u} -> {code}")

print()
if fails:
    print("FAIL")
    for f in fails:
        print("  - " + f)
    sys.exit(1)
print("PASS — every local file exists, every anchor resolves, every URL answers 2xx")
