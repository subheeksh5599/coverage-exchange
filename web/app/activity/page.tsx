"use client";

// Protocol activity, reconstructed from emitted events. Each row is a real transaction with
// its hash, so any claim on this page can be checked on the explorer independently.

import { useMemo, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { useActivity } from "@/lib/activity";
import { Card, Loading, ReadError, TxLink, Addr, Pill } from "@/components/ui";

const FILTERS = ["all", "coverage", "draw", "challenge", "breach", "capital"] as const;

export default function ActivityPage() {
  const { address } = useWallet();
  const act = useActivity();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [onlyMine, setOnlyMine] = useState(false);

  const rows = useMemo(() => {
    let r = act.data ?? [];
    if (filter !== "all") r = r.filter((x) => x.kind === filter);
    if (onlyMine && address) r = r.filter((x) => x.actor?.toLowerCase() === address.toLowerCase());
    return r;
  }, [act.data, filter, onlyMine, address]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of act.data ?? []) c[i.kind] = (c[i.kind] ?? 0) + 1;
    return c;
  }, [act.data]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p>
            Every state change this protocol has emitted, newest first, each with the transaction that caused it.
            This is built by reading the contracts&apos; own event logs — there is no local activity table to drift
            from the chain.
          </p>
        </div>
        <div className="actions">
          {address ? (
            <button className="btn" type="button" onClick={() => setOnlyMine((v) => !v)} aria-pressed={onlyMine}>
              {onlyMine ? "Showing mine" : "Only my activity"}
            </button>
          ) : null}
        </div>
      </div>

      <Card
        title="Event log"
        hint={act.error ? "read failed" : `${rows.length} event${rows.length === 1 ? "" : "s"}`}
        flush
        actions={
          <div className="tabs">
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? `All${act.data ? ` ${act.data.length}` : ""}` : `${f}${counts[f] ? ` ${counts[f]}` : ""}`}
              </button>
            ))}
          </div>
        }
      >
        {act.error ? (
          <div style={{ padding: 16 }}><ReadError error={act.error} what="activity" /></div>
        ) : act.loading ? (
          <Loading what="Scanning the protocol's event logs…" />
        ) : rows.length === 0 ? (
          <div className="empty">
            No events matching this filter.
            <div className="footnote" style={{ marginTop: 8 }}>
              An empty feed is a real answer: it means nothing has happened, not that the data failed to load.
            </div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Block</th>
                <th>Event</th>
                <th>Actor</th>
                <th>Detail</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.tx}-${i}`}>
                  <td className="mono">{r.block.toLocaleString("en-US")}</td>
                  <td>
                    <Pill tone={r.tone === "bad" ? "bad" : r.tone === "ok" ? "ok" : "neutral"}>{r.label}</Pill>
                  </td>
                  <td>{r.actor ? <Addr value={r.actor as `0x${string}`} chars={4} /> : <span className="footnote">—</span>}</td>
                  <td className="footnote">{r.detail ?? ""}</td>
                  <td><TxLink hash={r.tx} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="How this is built" hint="no local indexer">
        <div className="footnote" style={{ lineHeight: 1.7 }}>
          The feed is assembled from <code>UnderwriterDeposited</code>, <code>CoveragePurchased</code>,{" "}
          <code>CoverageCreated</code>, <code>CoverageConsumed</code>, <code>Drawn</code>, <code>Repaid</code>,{" "}
          <code>ChallengeSubmitted</code>, <code>CoverageBreached</code>, <code>CoverageSettled</code> and the
          liquidity events, across the last ~950,000 Creditcoin blocks. Reload the page after a transaction and it
          appears here, sourced from the receipt rather than from anything this app stored.
        </div>
      </Card>
    </div>
  );
}
