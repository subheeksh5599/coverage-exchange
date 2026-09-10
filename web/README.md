# Coverage Exchange — web

The protocol's public surface: a marketing/landing page and a live read-only console.

## What it is

- `/` — the protocol story in enterprise form: hero, the mechanism, the block-window
  requirement, the adversarial record, what Attestcoin does and does not prove, the
  console, and a verify-it-yourself section. Includes three real screenshots of the
  console (see below).
- `/dashboard` — the console. Reads the deployed `CoverageEngine` on Creditcoin CC3
  (chainId 102031) over the public RPC — keyless, no wallet, no server, no cache.
  Four views: Overview (KPIs, status mix, bond-vs-exposure, covered windows), Positions
  (every position with its live `isValid` reason, bond, exposure, window), Attack matrix
  (all 15 attempts with their named revert reasons), Contracts (the 9 verified
  deployments).

If the RPC is unreachable the UI says so and renders nothing fabricated — the same
fail-closed posture as the protocol. There is no fixture file anywhere in this app.

## Numbers are generated, never typed

Every figure the UI displays — test counts, gas costs, attack counts, addresses,
transaction hashes, the coverage rows — comes from `lib/evidence.generated.ts`, which is
produced before every dev run and build by `scripts/gen-evidence.mjs` out of
`evidence.json` and `worker/evidence/*.json`.

That file is the single source of truth, and two guards keep it that way:

```bash
npm run check:evidence     # generator is idempotent + no hand-typed evidence values
npm run check:no-literals  # the second guard on its own
```

- **Drift guard** — regenerates the file and fails if the committed copy differs, so a
  manifest change the UI has not picked up breaks the build instead of shipping.
- **Literal guard** — scans `app/` and `components/` for comma-formatted evidence values
  appearing as string literals. The drift guard cannot catch a number that was typed into
  a component, because such a value never passes through the generated file. This is not
  hypothetical: two gas figures were hardcoded on the landing page and two more in the
  console, and this check is what found them.

`GENERATED_AT` is derived from the manifest, not the clock, so generation is
deterministic and a clean tree always passes.

## Screenshots

`public/product/*.png` are real captures of the console, not mockups. They are taken
from a locally served production build:

```bash
npm run build && npm run start -- -p 3133
```

Each is captured at 1440 CSS px wide, 2x device scale, full height. `components/Site.tsx`
requires each shot's intrinsic `w`/`h` — without them the frame collapses to zero height
and the browser never triggers the lazy load, so the image silently never appears.

## Design system

Light surface (`#f6f7f9`), near-black ink, one accent (`#1449e8`), hairline rules.
Inter for prose, JetBrains Mono for machine values (addresses, hashes, block heights,
gas). Colour is data-semantic and single-sourced: green = active/settled-ok,
red = breached, blue = settled, and a breach is never rendered in green.

`app/globals.css` holds the marketing tokens and layout; `app/dashboard/console.css`
holds the console shell. Both share the same token set.

Reveal animations are progressive-enhancement only: content is visible by default and is
hidden just for the animation once JavaScript has run (`html.js`), so a no-JS reader or a
failed hydration still gets the whole page rather than a blank one.

## Stack

Next.js 15 (App Router, static prerender) · React 19 · viem for chain reads · hand-written
CSS with custom-property tokens · hand-authored SVG diagrams (no image model, no
generated art).

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
npm run check:evidence
```

Contract addresses default to the live CC3 deployment and can be overridden through
`.env` (see `.env.example`). The UI is **read-only** — it renders state and recorded
evidence; the wallets and every state-changing script live in `worker/`.
