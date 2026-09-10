"use client";

// Hand-authored diagrams. These are not decoration: each one is the actual mechanism,
// drawn to the same numbers the contracts enforce.

export function FlowDiagram() {
  const boxes = [
    { x: 8, y: 86, w: 150, h: 62, t: "Borrower", s: "wants credit on the\nstrength of behaviour" },
    { x: 196, y: 20, w: 164, h: 62, t: "Underwriter", s: "posts a bond against\na claim about a wallet" },
    { x: 196, y: 152, w: 164, h: 62, t: "Challenger", s: "hunts for a single\ncounterexample" },
    { x: 402, y: 86, w: 166, h: 62, t: "Coverage Engine", s: "holds the bond, gates\nthe draw, pays out" },
    { x: 612, y: 86, w: 150, h: 62, t: "Lender", s: "releases credit only\nwhile coverage is valid" },
  ];

  return (
    <svg viewBox="0 0 780 240" className="dgm" role="img" aria-label="Coverage Exchange participant flow">
      <defs>
        <marker id="ah" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
          <path d="M0 1 L8 4.5 L0 8 z" fill="var(--ink-3)" />
        </marker>
        <marker id="ahb" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
          <path d="M0 1 L8 4.5 L0 8 z" fill="var(--bad)" />
        </marker>
      </defs>

      <path d="M158 117 H196" stroke="var(--ink-3)" strokeWidth="1.5" markerEnd="url(#ah)" fill="none" />
      <path d="M360 51 H382 Q402 51 402 71 V86" stroke="var(--ink-3)" strokeWidth="1.5" markerEnd="url(#ah)" fill="none" />
      <path d="M360 183 H382 Q402 183 402 163 V148" stroke="var(--bad)" strokeWidth="1.5" markerEnd="url(#ahb)" fill="none" strokeDasharray="4 3" />
      <path d="M568 117 H612" stroke="var(--ink-3)" strokeWidth="1.5" markerEnd="url(#ah)" fill="none" />

      <text x="168" y="110" className="dgm-e">buys coverage</text>
      <text x="372" y="44" className="dgm-e">bond</text>
      <text x="372" y="205" className="dgm-e" fill="var(--bad)">counterexample</text>
      <text x="578" y="110" className="dgm-e">isValid()</text>

      {boxes.map((b) => (
        <g key={b.t}>
          <rect
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx="8"
            fill="var(--surface)"
            stroke={b.t === "Coverage Engine" ? "var(--accent)" : "var(--line)"}
            strokeWidth={b.t === "Coverage Engine" ? 1.6 : 1}
          />
          <text x={b.x + 14} y={b.y + 24} className="dgm-t">
            {b.t}
          </text>
          {b.s.split("\n").map((line, i) => (
            <text key={i} x={b.x + 14} y={b.y + 40 + i * 13} className="dgm-s">
              {line}
            </text>
          ))}
        </g>
      ))}
    </svg>
  );
}

export function WindowDiagram() {
  // A covered window, the attested frontier, and where a counterexample lands.
  const x0 = 60;
  const x1 = 700;
  const winA = 150;
  const winB = 520;
  const cex = 372;

  return (
    <svg viewBox="0 0 760 190" className="dgm" role="img" aria-label="Covered window against the attested frontier">
      <text x={x0} y="26" className="dgm-t">
        Source-chain block space
      </text>

      <line x1={x0} y1="70" x2={x1} y2="70" stroke="var(--line)" strokeWidth="2" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
        const x = x0 + ((x1 - x0) / 8) * i;
        return <line key={i} x1={x} y1="64" x2={x} y2="76" stroke="var(--line)" strokeWidth="1" />;
      })}

      <rect x={winA} y="56" width={winB - winA} height="28" rx="4" fill="var(--accent-wash)" stroke="var(--accent)" strokeWidth="1.2" />
      <text x={(winA + winB) / 2} y="48" className="dgm-s" textAnchor="middle" fill="var(--accent)">
        covered window — the claim applies only here
      </text>

      <line x1={cex} y1="40" x2={cex} y2="104" stroke="var(--bad)" strokeWidth="2" />
      <circle cx={cex} cy="70" r="5" fill="var(--bad)" />
      <text x={cex} y="122" className="dgm-s" textAnchor="middle" fill="var(--bad)">
        one prohibited transfer
      </text>
      <text x={cex} y="136" className="dgm-s" textAnchor="middle" fill="var(--bad)">
        = coverage void, bond seized
      </text>

      <line x1={620} y1="44" x2={620} y2="96" stroke="var(--ink)" strokeWidth="2" strokeDasharray="3 3" />
      <text x={628} y="52" className="dgm-s" fill="var(--ink)">
        attested frontier
      </text>
      <text x={628} y="66" className="dgm-s">
        proofs accepted
      </text>
      <text x={628} y="80" className="dgm-s">
        below this height
      </text>

      <text x={x0} y="168" className="dgm-s">
        A settlement is only allowed once the window has closed
      </text>
      <text x={x0} y="182" className="dgm-s">
        and the frontier has moved past it — never before.
      </text>
    </svg>
  );
}

export function TrustDiagram() {
  const rows = [
    { t: "Attested by the Attestcoin Protocol", s: "block headers, transaction inclusion, ordering", ok: true },
    { t: "Enforced by these contracts", s: "bond ≥ exposure, one draw per window, counterparty check", ok: true },
    { t: "Assumed", s: "the attestation set is honest", ok: false },
  ];

  return (
    <svg viewBox="0 0 700 200" className="dgm" role="img" aria-label="What is proven and what is assumed">
      {rows.map((r, i) => {
        const y = 16 + i * 62;
        return (
          <g key={r.t}>
            <rect
              x="8"
              y={y}
              width="684"
              height="50"
              rx="8"
              fill={r.ok ? "var(--ok-wash)" : "var(--surface-2)"}
              stroke={r.ok ? "rgba(15,122,74,0.28)" : "var(--line)"}
            />
            <circle cx="34" cy={y + 25} r="8" fill={r.ok ? "var(--ok)" : "var(--ink-3)"} />
            <path
              d={r.ok ? `M30 ${y + 25} l3 3 l6 -7` : `M31 ${y + 25} h6`}
              stroke="#fff"
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
            />
            <text x="54" y={y + 21} className="dgm-t">
              {r.t}
            </text>
            <text x="54" y={y + 38} className="dgm-s">
              {r.s}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
