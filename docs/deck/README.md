# Project deck

`coverage-exchange-deck.pdf` — 9 slides, 16:9, built from `deck.typ`.

## Rebuild

```
typst compile deck.typ coverage-exchange-deck.pdf
```

Typst 0.13+ is enough. Nothing else is needed; the diagrams are plain SVG in `svg/`.

## Verify

```
uv run --with pypdfium2 python3 verify.py
```

A clean compile only proves the source parsed. The verifier checks the things a compile cannot:
that the page count is 9, the page geometry is 16:9, no page rendered near-blank, every slide
title survived, and no key figure was dropped. It is worth running after any edit, because Typst
overflows silently — a slide that grows past the page just becomes two pages, and the second one
can be almost empty.

## What is in here

    deck.typ                     the deck
    svg/problem.svg              hand-authored: the trust gap between the two chains
    svg/mechanism.svg            hand-authored: bond, window, challenger, precompiles
    img/01-landing.png           real captures of the deployed app
    img/02-console-overview.png
    img/03-position-breached.png
    img/04-activity.png
    verify.py                    render + text checks

The four images are screenshots of the live deployment, captured with the app connected to a
funded testnet wallet. They are compressed with ImageMagick (`-colors 220`) because the UI is
flat and dark, which keeps the PDF under 1 MB. There is no generated or illustrated artwork in
this deck: the diagrams are hand-written SVG and everything else is a capture.

## Keeping it honest

Every figure in the deck comes from the same source the site does, `web/lib/evidence.generated.ts`,
which is itself generated from `evidence.json`. If a measured number changes, it changes in the
manifest first and then here.

Two figures on the live-deployment and breach slides are read from the chain rather than from the
manifest, because they are current state and not measurements: the position counts and the
position #13 record. Re-check them against the app if the deployment is redeployed.

The deck deliberately does not claim the contracts are audited, the token is a stablecoin, or the
batching saving is an order of magnitude. `docs/DEMO.md` carries the same list for the video.
