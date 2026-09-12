"use client";

// Offer registry. Underwriters publish terms; borrowers pick one, or aggregate several
// compatible offers into a single position backed by all their bonds. The registry stores
// no capital of its own — every bond is still locked from the underwriter's engine deposit
// at the moment `purchaseOffer` is executed.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { useActions } from "@/lib/actions";
import {
  useOffers,
  useFrontier,
  useProtocolTotals,
  offerRegistryDeployed,
  money,
  type Offer,
} from "@/lib/protocol";
import { SOURCE_CHAIN_LABEL, TOKEN_SYMBOL } from "@/lib/chain";
import {
  Panel,
  Notice,
  Loading,
  ReadError,
  Addr,
  Pill,
  TxButton,
  Field,
  AmountInput,
} from "@/components/ui";

function trancheLabel(t: number): string {
  return t === 0 ? "senior" : "junior";
}

function windowBlocksOf(o: Offer): string {
  return o.windowBlocks.toLocaleString("en-US");
}

/** Offers can only aggregate when their non-numeric terms match exactly. Explicit here so
 *  the UI's "aggregate" toggle refuses a basket the contract would refuse anyway. */
function offersAggregate(a: Offer, b: Offer): boolean {
  return (
    a.chainKey === b.chainKey &&
    a.requiredDepth === b.requiredDepth &&
    a.windowBlocks === b.windowBlocks &&
    a.sourceContract.toLowerCase() === b.sourceContract.toLowerCase() &&
    a.eventSignature.toLowerCase() === b.eventSignature.toLowerCase() &&
    a.predicate.toLowerCase() === b.predicate.toLowerCase() &&
    a.predicateParams.toLowerCase() === b.predicateParams.toLowerCase() &&
    (a.borrower === b.borrower ||
      a.borrower === "0x0000000000000000000000000000000000000000" ||
      b.borrower === "0x0000000000000000000000000000000000000000")
  );
}

export default function OffersPage() {
  const { address } = useWallet();
  const actions = useActions();
  const offers = useOffers();
  const frontier = useFrontier();
  const totals = useProtocolTotals();

  const [startBlock, setStartBlock] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const registryLive = offerRegistryDeployed();

  const rows = useMemo(() => {
    return (offers.data ?? []).filter((o) => {
      if (o.cancelled || o.filled) return false;
      if (!address) return true;
      return (
        o.borrower === "0x0000000000000000000000000000000000000000" ||
        o.borrower.toLowerCase() === address.toLowerCase()
      );
    });
  }, [offers.data, address]);

  const selectedOffers = useMemo(
    () => rows.filter((o) => selected.has(o.id.toString())),
    [rows, selected]
  );

  // Toggling picks up the first offer's shape and refuses any subsequent one whose
  // non-numeric terms disagree — the same rule `purchaseAggregated` enforces on chain.
  const toggle = (o: Offer) => {
    const key = o.id.toString();
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      const anchor = selectedOffers[0];
      if (anchor && !offersAggregate(anchor, o)) return;
      next.add(key);
    }
    setSelected(next);
  };

  const aggregateOk = selectedOffers.length >= 2;
  const bondSum = selectedOffers.reduce((a, o) => a + o.bond, 0n);
  const exposureSum = selectedOffers.reduce((a, o) => a + o.maxExposure, 0n);

  const defaultStart = frontier.data?.available ? String(frontier.data.height) : "";
  const startBig = (() => {
    try {
      return BigInt(startBlock || defaultStart || "0");
    } catch {
      return 0n;
    }
  })();

  if (!registryLive) {
    return (
      <div className="stack" style={{ gap: 16 }}>
        <div className="page-head">
          <div>
            <h1>Offers</h1>
            <p>
              Competing underwriters publish coverage terms; borrowers fill one, or aggregate several with
              compatible terms into a single position backed by all their bonds.
            </p>
          </div>
        </div>
        <Notice tone="warn">
          <div>
            <strong>OfferRegistry is not deployed on this network yet.</strong> The recorded 2026-09-10
            deployment predates this module. Run{" "}
            <code>forge script script/Deploy.s.sol --broadcast</code> and set{" "}
            <code>NEXT_PUBLIC_OFFER_REGISTRY_ADDRESS</code> to enable this page. The contract
            (<code>contracts/src/OfferRegistry.sol</code>) and its tests are already in the repo.
          </div>
        </Notice>
        <Panel title="What this page would show" hint="on a redeploy">
          <ul className="stack" style={{ gap: 6, paddingLeft: 18 }}>
            <li>Every active offer with underwriter, exposure, bond, tranche, and window length.</li>
            <li>A single-offer <em>Fill</em> button that calls <code>purchaseOffer(id, startBlock)</code>.</li>
            <li>
              A multi-select that gates on the on-chain aggregation rule (same chain, depth, window
              length, source contract, predicate and params) and calls
              <code> purchaseAggregated(ids, startBlock)</code>.
            </li>
          </ul>
        </Panel>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Offers</h1>
          <p>
            Underwriters publish terms; you fill one, or aggregate several compatible ones into one
            position backed by all their bonds. Every bond is real: it is locked from the underwriter&apos;s
            engine deposit at the moment the offer is filled, and the protocol refuses aggregation
            when the non-numeric terms do not match.
          </p>
        </div>
        <div className="actions">
          <Link className="act" href="/underwrite">Publish an offer</Link>
        </div>
      </div>

      {!address ? (
        <Notice tone="info">
          <div><strong>Connect a wallet to fill or aggregate.</strong> The list is readable without one.</div>
        </Notice>
      ) : null}

      <Panel
        title="Fill parameters"
        hint="applied to whichever offer(s) you fill"
      >
        <div className="cols-2">
          <Field
            label={`Window start block (${SOURCE_CHAIN_LABEL})`}
            hint={frontier.data?.available ? `attested frontier ${frontier.data.height.toLocaleString("en-US")}` : "frontier unavailable"}
          >
            <input
              value={startBlock || defaultStart}
              onChange={(e) => setStartBlock(e.target.value)}
              inputMode="numeric"
            />
          </Field>
          {aggregateOk ? (
            <div>
              <div className="stat-k">Aggregated basket</div>
              <div className="stat-v" style={{ fontSize: "1rem" }}>
                {selectedOffers.length} offers · {money(bondSum)} bond · {money(exposureSum)} exposure
              </div>
              <div className="footnote">
                All offers share the same chain, depth, window length, source contract, and predicate — the
                only rule the contract enforces for a valid aggregation.
              </div>
            </div>
          ) : (
            <div>
              <div className="stat-k">Aggregation</div>
              <div className="footnote">Pick two or more compatible offers to combine their bonds into one position.</div>
            </div>
          )}
        </div>
        {aggregateOk ? (
          <div className="actions" style={{ marginTop: 12 }}>
            <TxButton
              solid
              disabled={!address || startBig === 0n}
              onRun={() =>
                actions.purchaseAggregated(
                  selectedOffers.map((o) => o.id),
                  startBig
                )
              }
              confirmNote={<>Aggregated position created. It is backed by every contributor&apos;s bond.</>}
            >
              Aggregate {selectedOffers.length} offers
            </TxButton>
            <button
              type="button"
              className="act act-sm"
              onClick={() => setSelected(new Set())}
            >
              clear selection
            </button>
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Active offers"
        hint={offers.error ? "read failed" : `${rows.length} offer${rows.length === 1 ? "" : "s"}`}
        flush
      >
        {offers.error ? (
          <div style={{ padding: 16 }}><ReadError error={offers.error} what="offers" /></div>
        ) : offers.loading ? (
          <Loading what="Reading offers…" />
        ) : rows.length === 0 ? (
          <div className="empty-state">
            No active offers targeted at your address. Ask an underwriter to publish one, or provide coverage yourself
            from <Link href="/underwrite">Provide coverage</Link>.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th></th>
                <th>Offer</th>
                <th>Underwriter</th>
                <th>Borrower</th>
                <th>Tranche</th>
                <th className="num">Exposure</th>
                <th className="num">Bond</th>
                <th className="num">Window</th>
                <th className="num">Depth</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const key = o.id.toString();
                const chosen = selected.has(key);
                const anchor = selectedOffers[0];
                const compatible = !anchor || anchor.id === o.id || offersAggregate(anchor, o);
                const isMine = address && o.underwriter.toLowerCase() === address.toLowerCase();
                return (
                  <tr key={key} style={chosen ? { background: "var(--panel-2)" } : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={chosen}
                        disabled={!compatible}
                        onChange={() => toggle(o)}
                        aria-label={compatible ? "select for aggregation" : "incompatible with current basket"}
                      />
                    </td>
                    <td className="mono">#{key}</td>
                    <td><Addr value={o.underwriter} chars={5} /></td>
                    <td>
                      {o.borrower === "0x0000000000000000000000000000000000000000" ? (
                        <Pill tone="accent">open</Pill>
                      ) : (
                        <Addr value={o.borrower} chars={5} />
                      )}
                    </td>
                    <td>
                      <Pill tone={o.tranche === 0 ? "ok" : "warn"}>{trancheLabel(o.tranche)}</Pill>
                    </td>
                    <td className="num">{money(o.maxExposure)}</td>
                    <td className="num">{money(o.bond)}</td>
                    <td className="num">{windowBlocksOf(o)}</td>
                    <td className="num">{o.requiredDepth.toString()}</td>
                    <td className="row-actions">
                      {isMine ? (
                        <TxButton
                          onRun={() => actions.cancelOffer(o.id)}
                          confirmNote={<>Offer cancelled.</>}
                        >
                          Cancel
                        </TxButton>
                      ) : (
                        <TxButton
                          onRun={() => actions.purchaseOffer(o.id, startBig)}
                          disabled={!address || startBig === 0n}
                          confirmNote={<>Offer filled. Position is live and can be drawn against.</>}
                        >
                          Fill
                        </TxButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="footnote" style={{ padding: "12px 16px" }}>
          The premium the market requires is <em>quoted at fill time</em> and includes the underwriter&apos;s
          live utilization multiplier — so a lightly utilized underwriter is cheaper, and the number moves as
          the book fills.
        </div>
      </Panel>
    </div>
  );
}
