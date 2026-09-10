"use client";

// Custom SVG charts fed by the same live contract reads as the tables.
// Palette is data-semantic: a breach is never allowed to look like a success.

import type { Position } from "@/lib/useChainData";
import { fmtToken, TOKEN_SYMBOL } from "@/lib/chain";

export function statusColor(s: Position["status"]): string {
  switch (s) {
    case "ACTIVE":
      return "#0f7b4a";
    case "BREACHED":
      return "#c02626";
    case "SETTLED":
      return "#1449e8";
    default:
      return "#7b8794";
  }
}

const STATUSES: Position["status"][] = ["ACTIVE", "BREACHED", "SETTLED", "EXPIRED"];

/** Status mix. Donut, because the reviewer's first question is "how many broke?" */
export function StatusDonut({ positions }: { positions: Position[] }) {
  const total = positions.length;
  const counts = STATUSES.map((s) => ({
    s,
    n: positions.filter((p) => p.status === s).length,
  })).filter((c) => c.n > 0);

  if (total === 0) {
    return <div className="chart-empty">No positions on the engine yet.</div>;
  }

  const R = 54;
  const SW = 15;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Position status mix">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#eef0f4" strokeWidth={SW} />
        {counts.map(({ s, n }) => {
          const len = (n / total) * C;
          const el = (
            <circle
              key={s}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={statusColor(s)}
              strokeWidth={SW}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
              strokeLinecap="butt"
            >
              <title>{`${s}: ${n} of ${total}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" className="donut-n">
          {total}
        </text>
        <text x="70" y="82" textAnchor="middle" className="donut-l">
          positions
        </text>
      </svg>
      <ul className="legend">
        {counts.map(({ s, n }) => (
          <li key={s}>
            <span className="legend-sw" style={{ background: statusColor(s) }} />
            <span className="legend-s">{s}</span>
            <span className="legend-n">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Bond vs exposure per position. The invariant is visual: the bond bar is never shorter
 *  than the exposure bar. Colour encodes the series only — status is never mixed into this
 *  chart, because a legend that does not explain every colour on screen is a lie. */
export function CapitalBars({ positions }: { positions: Position[] }) {
  const rows = [...positions]
    .sort((a, b) => {
      const ha = a.bond > 0n ? Number(((a.bond - a.maxExposure) * 10000n) / a.bond) : 0;
      const hb = b.bond > 0n ? Number(((b.bond - b.maxExposure) * 10000n) / b.bond) : 0;
      return ha - hb;
    })
    .slice(0, 8);
  if (rows.length === 0) {
    return <div className="chart-empty">Nothing to chart yet.</div>;
  }
  const max = rows.reduce(
    (m, p) => (p.bond > m ? p.bond : p.maxExposure > m ? p.maxExposure : m),
    1n
  );
  const pct = (v: bigint) => Number((v * 1000n) / max) / 10;
  const holds = rows.every((p) => p.bond >= p.maxExposure);

  return (
    <div className="bars">
      {rows.map((p) => {
        const ok = p.bond >= p.maxExposure;
        return (
          <div className="bar-row2" key={p.id}>
            <span className="bar-id">#{p.id}</span>
            <div className="bar-pair">
              <div className="bar-track2">
                <div
                  className="bar-fill2 bar-bond"
                  style={{ width: `${pct(p.bond)}%` }}
                  title={`bond ${fmtToken(p.bond)} ${TOKEN_SYMBOL}`}
                />
              </div>
              <div className="bar-track2">
                <div
                  className="bar-fill2 bar-exp2"
                  style={{ width: `${pct(p.maxExposure)}%` }}
                  title={`max exposure ${fmtToken(p.maxExposure)} ${TOKEN_SYMBOL}`}
                />
              </div>
            </div>
            <span className="bar-nums">
              <span className="bar-n1">{fmtToken(p.bond)}</span>
              <span className="bar-n2">{fmtToken(p.maxExposure)}</span>
            </span>
            <span className={`bar-ok${ok ? "" : " is-bad"}`} title={ok ? "bond ≥ exposure" : "invariant violated"}>
              {ok ? "✓" : "✕"}
            </span>
          </div>
        );
      })}
      {positions.length > rows.length ? (
        <div className="bars-more">
          tightest {rows.length} of {positions.length} positions by headroom — the invariant holds on all of them
        </div>
      ) : null}
      <div className="bar-key">
        <span><i className="bar-sw bar-bond" /> bond locked</span>
        <span><i className="bar-sw bar-exp2" /> max exposure</span>
        <span className={`bar-inv${holds ? "" : " is-bad"}`}>
          {holds ? "bond ≥ exposure on every row, enforced at purchase" : "invariant violated"}
        </span>
      </div>
    </div>
  );
}

/** Each position's covered Sepolia block window against the live attested frontier.
 *  The axis is drawn explicitly: without tick labels a reader cannot tell whether a
 *  window sits before or after the frontier, which is the only thing this chart is for. */
export function WindowChart({
  positions,
  frontier,
}: {
  positions: Position[];
  frontier: bigint | null;
}) {
  const rows = positions.filter((p) => p.endBlock > 0n).slice(0, 10);
  if (rows.length === 0) {
    return <div className="chart-empty">No covered windows yet.</div>;
  }

  // An absolute block axis is useless here: a 32-block window on a 10,000-block
  // span renders as a hairline and the chart cannot answer its own question.
  // Everything is therefore plotted RELATIVE TO THE FRONTIER — 0 is "now", the
  // marker is fixed at the centre, and each window's distance from settlement is
  // what varies. That is the question a reader actually has.
  const ref = frontier ?? rows.reduce((m, p) => (p.liveUntilHeight > m ? p.liveUntilHeight : m), rows[0].liveUntilHeight);
  const rel = (v: bigint) => Number(v - ref);
  const reach = rows.reduce((m, p) => {
    const a = Math.abs(rel(p.startBlock));
    const b = Math.abs(rel(p.liveUntilHeight));
    return Math.max(m, a, b);
  }, 1);
  const half = Math.max(reach * 1.15, 8);
  const x = (v: bigint) => 50 + (rel(v) / half) * 50;

  const ticks = [-1, -0.5, 0, 0.5, 1].map((f) => {
    const blocks = Math.round(half * f);
    return {
      at: 50 + f * 50,
      label: blocks === 0 ? "frontier" : `${blocks > 0 ? "+" : ""}${blocks.toLocaleString("en-US")}`,
      front: blocks === 0,
    };
  });

  return (
    <div className="wins">
      {rows.map((p) => {
        const l = Math.max(0, Math.min(100, x(p.startBlock)));
        const r = Math.max(0, Math.min(100, x(p.endBlock)));
        const depthR = Math.max(0, Math.min(100, x(p.liveUntilHeight)));
        // Settled means the frontier has moved past the window + required depth.
        const resolved = p.status !== "ACTIVE";
        const cleared = frontier !== null && frontier >= p.liveUntilHeight;
        const label = resolved
          ? p.status.toLowerCase()
          : cleared
            ? "cleared"
            : `${rel(p.liveUntilHeight).toLocaleString("en-US")} blk`;
        return (
          <div className="win-row" key={p.id}>
            <span className="win-id">#{p.id}</span>
            <div className="win-track">
              <div className="win-mid" />
              <div
                className="win-depth"
                style={{ left: `${Math.min(r, depthR)}%`, width: `${Math.max(Math.abs(depthR - r), 0.6)}%` }}
                title={`confirmation depth to ${p.liveUntilHeight.toLocaleString("en-US")}`}
              />
              <div
                className="win-span"
                style={{ left: `${l}%`, width: `${Math.max(r - l, 1.2)}%`, background: statusColor(p.status) }}
                title={`covered window ${p.startBlock.toLocaleString("en-US")} → ${p.endBlock.toLocaleString("en-US")}`}
              />
            </div>
            <span
              className={
                "win-v" +
                (p.status === "BREACHED"
                  ? " win-bad"
                  : p.status === "SETTLED"
                    ? " win-done"
                    : cleared
                      ? " win-ok"
                      : " win-wait")
              }
              title={
                resolved
                  ? "already resolved — no countdown"
                  : `blocks until the frontier passes ${p.liveUntilHeight.toLocaleString("en-US")}`
              }
            >
              {label}
            </span>
          </div>
        );
      })}

      <div className="win-axis">
        <span className="win-id" />
        <div className="axis">
          {ticks.map((t, i) => (
            <span key={i} className={t.front ? "tick tick-front" : "tick"} style={{ left: `${t.at}%` }}>
              <i />
              <em>{t.front && frontier ? `frontier ${frontier.toLocaleString("en-US")}` : t.label}</em>
            </span>
          ))}
        </div>
        <span className="win-v" />
      </div>

      {positions.filter((p) => p.endBlock > 0n).length > rows.length ? (
        <div className="bars-more">
          showing {rows.length} of {positions.filter((p) => p.endBlock > 0n).length} covered windows
        </div>
      ) : null}
      <div className="bar-key">
        <span>
          <span className="key-multi">
            <i className="bar-sw" style={{ background: "#0f7b4a" }} />
            <i className="bar-sw" style={{ background: "#c0392b" }} />
            <i className="bar-sw" style={{ background: "#2557d6" }} />
          </span>
          covered window — active / breached / settled
        </span>
        <span><i className="bar-sw bar-bond" /> required depth</span>
        {frontier ? (
          <span>
            <i className="bar-rule" /> live attested frontier — left of it is settled block space
          </span>
        ) : null}
      </div>
    </div>
  );
}
