# Coverage Exchange — Frontend

Landing page + read-only live dashboard for Coverage Exchange (BUIDL CTC 2026 Fall).
Kept in its own folder by design; merge into the protocol repo whenever ready.

## What it is

- `/` — the protocol story: problem, primitive, coverage invariant, the live demo run
  (every transaction hash links to the CC3 explorer), the 15/15 attack matrix, and the
  measured evidence wall.
- `/dashboard` — live read-only terminal. Every position card is read directly from the
  deployed CoverageEngine on Creditcoin CC3 testnet through the public RPC (keyless,
  no wallet). Status badges, isValid reasons, draw bars, bonds, windows — all computed
  from chain state on every poll. The attested Sepolia frontier in the header and left
  rail comes from the deployed AttestcoinAdapter calling the real ChainInfo precompile,
  polled every 15 seconds.

No mock data anywhere. If the RPC is unreachable the page says so and renders nothing
fabricated — the same fail-closed posture as the protocol.

## Stack

Next.js (App Router, static prerender) · viem for chain reads · animejs v4 +
IntersectionObserver for scroll reveals · Lenis smooth scroll · Bricolage Grotesque /
Spline Sans Mono / Pixelify Sans.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build (static)
```

Contract addresses default to the live CC3 deployment and can be overridden through
`.env` (see `.env.example`).
