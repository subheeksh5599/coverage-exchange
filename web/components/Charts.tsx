"use client";

// Custom SVG charts in the site's design language. No chart library —
// bone/blood/settle on void, mono labels, hairline grid. All data comes from
// live chain reads passed in by the dashboard.

import { useMemo, useState } from "react";
import type { Position } from "@/lib/useChainData";
import { fmtToken, TOKEN_SYMBOL } from "@/lib/chain";

const C = {
  bone: "#eae6de",
  dim: "#7b766c",
  blood: "#ff3527",
  settle: "#4fbf7a",
  line: "rgba(234,230,222,0.13)",
  lineSoft: "rgba(234,230,222,0.07)",
  panel: "#121214",
};

export function statusColor(s: Position["status"]): string {
  switch (s) {
    case "ACTIVE":
      return C.settle;
    case "BREACHED":
      return C.blood;
    case "SETTLED":
      return C.bone;
    default:
      return C.dim;
  }
}

// ---------------------------------------------------------------- status donut

export function StatusDonut({ positions }: { positions: Position[] }) {
  const mix = useMemo(() => {
    const order: Position["status"][] = ["ACTIVE", "BREACHED", "SETTLED", "EXPIRED"];
    return order
      .map((s) => ({ s, n: positions.filter((p) => p.status === s).length }))
      .filter((x) => x.n > 0);
  }, [positions]);

  const total = positions.length;
  const R = 62;
  const CIRC = 2 * Math.PI * R;
  let acc = 0;

  return (
    <div className="chart-flex">
      <svg viewBox="0 0 160 160" className="donut-svg" role="img" aria-label="positions by status">
        <circle cx="80" cy="80" r={R} fill="none" stroke={C.lineSoft} strokeWidth="14" />
        {mix.map(({ s, n }) => {
          const frac = n / total;
          const dash = frac * CIRC;
          const el = (
            <circle
              key={s}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={statusColor(s)}
              strokeWidth="14"
              strokeDasharray={`${dash - 2} ${CIRC - dash + 2}`}
              strokeDashoffset={-acc * CIRC + CIRC / 4}
              opacity={s === "SETTLED" ? 0.8 : 1}
            >
              <title>{`${s}: ${n} of ${total}`}</title>
            </circle>
          );
          acc += frac;
          return el;
        })}
        <text
          x="80"
          y="76"
          textAnchor="middle"
          fill={C.bone}
          style={{ font: "700 34px var(--font-display), sans-serif" }}
        >
          {total}
        </text>
        <text
          x="80"
          y="96"
          textAnchor="middle"
          fill={C.dim}
          style={{ font: "9px var(--font-mono), monospace", letterSpacing: "0.2em" }}
        >
          POSITIONS
        </text>
      </svg>
      <div className="donut-legend">
        {mix.map(({ s, n }) => (
          <div key={s} className="legend-row">
            <span className="legend-dot" style={{ background: statusColor(s) }} />
            <span className="legend-k">{s}</span>
            <span className="legend-v mono-tab">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- capital bars

export function CapitalBars({ positions }: { positions: Position[] }) {
  const rows = useMemo(
    () => [...positions].sort((a, b) => a.id - b.id),
    [positions]
  );
  const max = useMemo(
    () => rows.reduce((m, p) => (p.bond > m ? p.bond : m), 1n),
    [rows]
  );

  const W = 520;
  const ROW = 26;
  const LABEL = 44;
  const H = rows.length * ROW + 6;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="bars-svg"
      role="img"
      aria-label="bond and drawn exposure per position"
    >
      {rows.map((p, i) => {
        const y = i * ROW + 4;
        const usable = W - LABEL - 8;
        const bondW = Number((p.bond * 10000n) / max) / 10000 * usable;
        const drawnW =
          p.maxExposure > 0n
            ? (Number((p.drawn * 10000n) / max) / 10000) * usable
            : 0;
        const col = statusColor(p.status);
        return (
          <g key={p.id}>
            <text
              x={LABEL - 10}
              y={y + 13}
              textAnchor="end"
              fill={C.dim}
              style={{ font: "10px var(--font-mono), monospace" }}
            >
              #{p.id}
            </text>
            {/* bond track */}
            <rect x={LABEL} y={y + 4} width={usable} height={10} fill={C.lineSoft} />
            <rect x={LABEL} y={y + 4} width={Math.max(bondW, 1)} height={10} fill={col} opacity={0.32}>
              <title>{`#${p.id} bond: ${fmtToken(p.bond)} ${TOKEN_SYMBOL} (${p.status})`}</title>
            </rect>
            {/* drawn overlay */}
            {drawnW > 0 ? (
              <rect x={LABEL} y={y + 4} width={Math.max(drawnW, 1)} height={10} fill={col}>
                <title>{`#${p.id} drawn: ${fmtToken(p.drawn)} ${TOKEN_SYMBOL}`}</title>
              </rect>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- windows vs frontier

export function WindowChart({
  positions,
  frontier,
}: {
  positions: Position[];
  frontier: bigint | null;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const rows = useMemo(
    () => [...positions].sort((a, b) => a.id - b.id),
    [positions]
  );

  const domain = useMemo(() => {
    if (rows.length === 0) return null;
    let lo = rows[0].startBlock;
    let hi = rows[0].liveUntilHeight;
    for (const p of rows) {
      if (p.startBlock < lo) lo = p.startBlock;
      if (p.liveUntilHeight > hi) hi = p.liveUntilHeight;
    }
    if (frontier !== null && frontier > hi) hi = frontier;
    if (frontier !== null && frontier < lo) lo = frontier;
    const span = hi - lo;
    const pad = span / 18n > 0n ? span / 18n : 1n;
    return { lo: lo - pad, hi: hi + pad };
  }, [rows, frontier]);

  if (!domain || rows.length === 0) return null;

  const W = 1000;
  const ROW = 34;
  const TOP = 26;
  const BOT = 30;
  const LABEL = 46;
  const H = TOP + rows.length * ROW + BOT;
  const span = Number(domain.hi - domain.lo);
  const x = (v: bigint) => LABEL + (Number(v - domain.lo) / span) * (W - LABEL - 12);

  const fx = frontier !== null ? x(frontier) : null;
  const hovered = hover !== null ? rows.find((p) => p.id === hover) : null;

  // axis ticks: 4 evenly spaced heights
  const ticks = [0, 1, 2, 3].map((i) => {
    const v = domain.lo + ((domain.hi - domain.lo) * BigInt(i)) / 3n;
    return { v, px: x(v) };
  });

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="win-svg"
        role="img"
        aria-label="coverage windows against the attested frontier"
        onMouseLeave={() => setHover(null)}
      >
        {/* grid + axis */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={t.px} y1={TOP - 8} x2={t.px} y2={H - BOT + 6} stroke={C.lineSoft} />
            <text
              x={t.px}
              y={H - 8}
              textAnchor="middle"
              fill={C.dim}
              style={{ font: "9.5px var(--font-mono), monospace" }}
            >
              {Number(t.v).toLocaleString("en-US")}
            </text>
          </g>
        ))}

        {rows.map((p, i) => {
          const y = TOP + i * ROW;
          const x0 = x(p.startBlock);
          const x1 = x(p.endBlock);
          const xl = x(p.liveUntilHeight);
          const col = statusColor(p.status);
          const isHover = hover === p.id;
          const behindFrontier = frontier !== null && p.liveUntilHeight < frontier;
          return (
            <g
              key={p.id}
              onMouseEnter={() => setHover(p.id)}
              style={{ cursor: "default" }}
              opacity={hover === null || isHover ? 1 : 0.3}
            >
              <text
                x={LABEL - 10}
                y={y + 15}
                textAnchor="end"
                fill={isHover ? C.bone : C.dim}
                style={{ font: "10.5px var(--font-mono), monospace" }}
              >
                #{p.id}
              </text>
              {/* row hairline */}
              <line x1={LABEL} y1={y + 11} x2={W - 12} y2={y + 11} stroke={C.lineSoft} />
              {/* grace + depth tail: window end -> liveUntil */}
              <line
                x1={x1}
                y1={y + 11}
                x2={xl}
                y2={y + 11}
                stroke={col}
                strokeOpacity={0.35}
                strokeDasharray="2 4"
                strokeWidth={2}
              />
              <line x1={xl} y1={y + 5} x2={xl} y2={y + 17} stroke={col} strokeOpacity={0.5} />
              {/* covered window bar */}
              <rect
                x={x0}
                y={y + 5}
                width={Math.max(x1 - x0, 2)}
                height={12}
                fill={col}
                opacity={behindFrontier && p.status !== "BREACHED" ? 0.45 : 0.95}
              >
                <title>{`#${p.id} ${p.status} · window ${p.startBlock.toLocaleString(
                  "en-US"
                )} → ${p.endBlock.toLocaleString("en-US")} · live until ${p.liveUntilHeight.toLocaleString("en-US")}`}</title>
              </rect>
              {/* breach mark */}
              {p.status === "BREACHED" ? (
                <text
                  x={(x0 + x1) / 2}
                  y={y + 15.5}
                  textAnchor="middle"
                  fill="#0a0a0b"
                  style={{ font: "700 9px var(--font-mono), monospace" }}
                >
                  ✕
                </text>
              ) : null}
            </g>
          );
        })}

        {/* attested frontier line */}
        {fx !== null ? (
          <g>
            <line
              x1={fx}
              y1={TOP - 14}
              x2={fx}
              y2={H - BOT + 6}
              stroke={C.blood}
              strokeWidth={1.5}
            />
            <text
              x={Math.min(fx + 7, W - 190)}
              y={TOP - 4}
              fill={C.blood}
              style={{ font: "9.5px var(--font-mono), monospace", letterSpacing: "0.16em" }}
            >
              ATTESTED FRONTIER {frontier !== null ? Number(frontier).toLocaleString("en-US") : ""}
            </text>
          </g>
        ) : null}
      </svg>

      <div className="win-caption">
        {hovered ? (
          <>
            <span style={{ color: statusColor(hovered.status) }}>
              #{hovered.id} {hovered.status}
            </span>{" "}
            · window {hovered.startBlock.toLocaleString("en-US")} →{" "}
            {hovered.endBlock.toLocaleString("en-US")} · gates exposure until{" "}
            {hovered.liveUntilHeight.toLocaleString("en-US")} · bond {fmtToken(hovered.bond)}{" "}
            {TOKEN_SYMBOL}
          </>
        ) : (
          <>
            solid bar = covered window · dashed tail = depth + grace · when the{" "}
            <span className="blood">red frontier</span> passes a tail, that position expires —
            computed on every read, no keeper
          </>
        )}
      </div>
    </div>
  );
}
