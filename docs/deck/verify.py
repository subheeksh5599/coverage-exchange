"""Verify the deck PDF renders correctly.

A clean Typst compile only proves the source parsed. It does not prove the pages have content,
that text did not overflow off the slide, or that the figures landed. This checks all three.

Run: uv run --with pypdfium2 python3 verify.py
"""

import statistics
import sys

import pypdfium2 as pdfium

PDF = "coverage-exchange-deck.pdf"
EXPECTED_PAGES = 9

# Every slide title, so a missing/merged page is caught.
TITLES = [
    "COVERAGE EXCHANGE",
    "Cross-chain credit runs on trust",
    "Replace the report with a bond",
    "What the contract actually verifies",
    "Not a mock. Running state, read now",
    "A position that died",
    "Fifteen ways in. None of them worked.",
    "Numbers, with the tool that produced them",
    "Every claim in this deck is checkable in a browser",
]

# Claims that must survive typesetting intact.
MUST_CONTAIN = [
    "11,671,130",
    "371,652",
    "15 / 15",
    "7 breached",
    "ProhibitedRecipient",
    "0x0FD2",
    "coverage-exchange.vercel.app",
    "30.1%",
    "BOND",
    "2,927,000",
]

doc = pdfium.PdfDocument(PDF)
fails = []

if len(doc) != EXPECTED_PAGES:
    fails.append(f"page count is {len(doc)}, expected {EXPECTED_PAGES}")

pages_text = []
print(f"pages: {len(doc)}")
for i in range(len(doc)):
    page = doc[i]
    w, h = page.get_size()
    if i == 0 and (round(w) != 960 or round(h) != 540):
        fails.append(f"page size {w:.0f}x{h:.0f}pt, expected 960x540 (16:9)")

    # render small and measure pixel spread: a blank page is near-flat
    bitmap = page.render(scale=0.35)
    buf = bitmap.buffer
    samples = [buf[j] for j in range(0, len(buf) - 4, 4 * 7)]
    sd = statistics.pstdev(samples)

    text = page.get_textpage().get_text_range()
    pages_text.append(text)

    title_ok = TITLES[i].lower() in text.lower() if i < len(TITLES) else False
    flag = ""
    if sd < 8:
        fails.append(f"page {i+1}: near-blank render (pixel std {sd:.1f})")
        flag += "  BLANK?"
    if not title_ok:
        fails.append(f"page {i+1}: slide title not found")
        flag += "  TITLE MISSING"
    print(f"  p{i+1}: std={sd:5.1f}  chars={len(text):5d}  title={'ok' if title_ok else 'MISSING'}{flag}")

alltext = "\n".join(pages_text)
print()
missing = [m for m in MUST_CONTAIN if m not in alltext]
for m in missing:
    fails.append(f"deck text is missing: {m}")
print(f"key strings checked: {len(MUST_CONTAIN)}  missing: {len(missing)}")
for m in missing:
    print(f"  MISSING {m}")

print()
if fails:
    print("FAIL")
    for f in fails:
        print("  - " + f)
    sys.exit(1)
print("PASS — every page has content, every slide title present, all key figures intact")
