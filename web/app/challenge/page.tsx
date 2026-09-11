"use client";

// Adjudication. Anyone may destroy a false claim by proving one contradicting transaction
// from inside the covered window. Two transactions make the whole product legible: buy
// coverage, then disprove it and watch the bond move. The counterexample is fetched from the
// public proof builder as a real Attestcoin proof — nothing is simulated, and the preview
// below is a free read that tells you whether the chain would accept it before you pay.

import { useMemo, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { useActions, fetchProof, previewChallenge, type ProofBundle } from "@/lib/actions";
import { SOURCE_CHAIN_LABEL } from "@/lib/chain";
import { useFrontier, usePositions, money } from "@/lib/protocol";
import { Panel, Field, Notice, TxButton, Loading, ReadError, Addr, Pill, StatusPill } from "@/components/ui";
import { predicateName } from "@/components/PositionsTable";

// The real counterexample from the recorded run: a Sepolia transfer to an address the
// position declared prohibited, at a block inside its window.
const RECORDED_TX = "0x19c528d3175bfc9d7cd0b1b7285fa07113054c5585eb8dead195b977edbc88a1";

export default function ChallengePage() {
  const { address } = useWallet();
  const actions = useActions();
  const positions = usePositions();
  const frontier = useFrontier();

  const [coverageId, setCoverageId] = useState("");
  const [txHash, setTxHash] = useState(RECORDED_TX);
  const [bundle, setBundle] = useState<ProofBundle | null>(null);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ ok: boolean; reason: string } | null>(null);

  const all = positions.data ?? [];
  const fh = frontier.data?.available ? frontier.data.height : null;

  /** ACTIVE positions whose window the frontier still covers — the only challengeable ones. */
  const challengeable = useMemo(
    () => all.filter((c) => c.status === 0),
    [all]
  );

  const selected = coverageId ? all.find((c) => c.id === BigInt(Number(coverageId) || 0)) ?? null : null;

  const doFetch = async (forId?: string) => {
    setBusy(true);
    setFetchErr(null);
    setPreview(null);
    try {
      const b = await fetchProof(1, txHash.trim());
      const id = forId ?? coverageId;
      const withId: ProofBundle = { ...b, coverageId: id ? Number(id) : 0 };
      setBundle(withId);
      setFetchedFor(txHash.trim());
      if (id) {
        const p = await previewChallenge(withId);
        setPreview(p);
      }
    } catch (e) {
      setBundle(null);
      setFetchErr(e instanceof Error ? e.message : "could not fetch a proof for that transaction");
    } finally {
      setBusy(false);
    }
  };

  const doPreview = async () => {
    if (!bundle) return;
    setBusy(true);
    setPreview(await previewChallenge({ ...bundle, coverageId: Number(coverageId) || bundle.coverageId }));
    setBusy(false);
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>Challenge a position</h1>
          <p>
            A coverage position is a claim about what did <em>not</em> happen inside a range of {SOURCE_CHAIN_LABEL}{" "}
            blocks. Prove that it happened, and the position dies and the bond moves — atomically, with no
            committee and no dispute window. No permission, no stake and no allowlist is required to try.
          </p>
        </div>
      </div>

      <div className="split">
        {/* ------------------------------------------------------------------- submit */}
        <Panel title="Submit a counterexample" hint="the proof is the only credential">
          <div className="stack" >
            <Field label="Coverage id" hint={selected ? `${predicateName(selected.predicate)} · window ${selected.startBlock.toLocaleString("en-US")}→${selected.endBlock.toLocaleString("en-US")}` : "which claim are you disproving"}>
              {positions.loading ? (
                <select disabled>
                  <option>reading positions…</option>
                </select>
              ) : challengeable.length === 0 ? (
                <select disabled>
                  <option>no challengeable position right now</option>
                </select>
              ) : (
                <select value={coverageId} onChange={(e) => { setCoverageId(e.target.value); setPreview(null); }}>
                  <option value="">Select a live position…</option>
                  {challengeable.map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>
                      #{String(c.id)} · {predicateName(c.predicate)} · {c.startBlock.toLocaleString("en-US")}→{c.endBlock.toLocaleString("en-US")}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            {!positions.loading && challengeable.length === 0 ? (
              <Notice tone="warn">
                <div>
                  <strong>Nothing is challengeable right now.</strong> Every position on this deployment is
                  already terminal, or the attested {SOURCE_CHAIN_LABEL} frontier has passed its window — a
                  position that expired can no longer be breached, because the exposure it gated has lapsed and
                  the bond is no longer at risk (a deterministic rule, not discretion).{" "}
                  <a className="txlink" href="/market">
                    Buy a position with a live window
                  </a>{" "}
                  and it becomes challengeable immediately.
                </div>
              </Notice>
            ) : null}

            <Field
              label={`${SOURCE_CHAIN_LABEL} transaction hash`}
              hint="the transaction you claim violates the position's invariant, inside its window"
            >
              <input
                value={txHash}
                onChange={(e) => {
                  setTxHash(e.target.value.trim());
                  setBundle(null);
                  setPreview(null);
                }}
                spellCheck={false}
                autoComplete="off"
                style={{ fontSize: 11.5, letterSpacing: "0.02em" }}
              />
            </Field>

            <div className="actions">
              <button
                className="act act-sm"
                type="button"
                disabled={challengeable.length === 0}
                title={challengeable.length === 0 ? "No live position to challenge" : undefined}
                onClick={() => { setTxHash(RECORDED_TX); setBundle(null); setPreview(null); }}
              >
                Use the recorded counterexample
              </button>
              <button
                className="act act-solid act-sm"
                type="button"
                disabled={busy || challengeable.length === 0 || !/^0x[0-9a-fA-F]{64}$/.test(txHash.trim())}
                title={challengeable.length === 0 ? "No live position to challenge" : undefined}
                onClick={() => doFetch()}
              >
                {busy ? "Fetching proof…" : "Fetch proof & preflight"}
              </button>
            </div>

            {fetchErr ? (
              <Notice tone="bad">
                <div>
                  <strong>No proof available.</strong>
                  <div className="mono" style={{ marginTop: 4 }}>{fetchErr}</div>
                  <div style={{ marginTop: 6, fontSize: "0.75rem" }}>
                    The public proof builder will only attest a transaction that is actually in a {SOURCE_CHAIN_LABEL} block.
                    It cannot be asked to fabricate one — which is the point.
                  </div>
                </div>
              </Notice>
            ) : null}

            {bundle ? (
              <div className="stack" >
                <div className="stat-k">Proof retrieved</div>
                <dl className="kv">
                  <dt>Source block</dt><dd>{bundle.blockHeight.toLocaleString("en-US")}</dd>
                  <dt>Merkle siblings</dt><dd>{bundle.merkleProof.siblings.length}</dd>
                  <dt>Continuity roots</dt><dd>{bundle.continuityProof.roots.length}</dd>
                  <dt>Tx hash</dt><dd>{(fetchedFor ?? "").slice(0, 12)}…</dd>
                </dl>

                {selected ? (
                  <Notice tone={bundle.blockHeight >= Number(selected.startBlock) && bundle.blockHeight <= Number(selected.endBlock) ? "ok" : "bad"}>
                    <div>
                      {bundle.blockHeight >= Number(selected.startBlock) && bundle.blockHeight <= Number(selected.endBlock) ? (
                        <>That block is <strong>inside</strong> the covered window {selected.startBlock.toLocaleString("en-US")}→{selected.endBlock.toLocaleString("en-US")}.</>
                      ) : (
                        <>That block is <strong>outside</strong> the covered window {selected.startBlock.toLocaleString("en-US")}→{selected.endBlock.toLocaleString("en-US")}. The chain will refuse it with <span className="mono">BlockOutsideWindow</span> — a real violation outside the range proves nothing about the range.</>
                      )}
                    </div>
                  </Notice>
                ) : null}
              </div>
            ) : null}

            {preview ? (
              <Notice tone={preview.ok ? "ok" : "bad"}>
                <div>
                  <strong>{preview.ok ? "This counterexample breaches the position." : "This counterexample would be refused."}</strong>
                  <div className="mono" style={{ marginTop: 4 }}>{preview.reason}</div>
                  <div style={{ marginTop: 6, fontSize: "0.75rem" }}>
                    Preflight is a free read on the deployed adjudicator. The money path re-runs every check in the
                    transaction itself.
                  </div>
                </div>
              </Notice>
            ) : null}

            <TxButton
              danger
              block
              disabled={!bundle || !coverageId || !preview?.ok || !address}
              onRun={() => actions.challenge({ ...bundle!, coverageId: Number(coverageId) })}
              confirmNote={<>Position breached. The bond has moved to your address in the same transaction, and any further draw against that position now reverts.</>}
              onDone={() => setTimeout(() => positions.refresh(), 1500)}
            >
              {!address ? "Connect a wallet to submit" : preview?.ok ? "Submit challenge — take the bond" : "Preflight must pass first"}
            </TxButton>

            {address ? null : (
              <div className="footnote">The challenge itself is a transaction, so it needs a wallet. Everything above it is readable without one.</div>
            )}
          </div>
        </Panel>

        {/* ------------------------------------------------------------------ context */}
        <div className="stack" style={{ gap: 16 }}>
          <Panel title="What the chain will check" hint="in this order, in one transaction">
            <ol className="footnote" style={{ lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
              <li>the position exists and is still live</li>
              <li>the proof is for <strong>this</strong> source chain</li>
              <li>the proven block is <strong>inside</strong> the covered window</li>
              <li>Attestcoin&apos;s Block Prover verifies inclusion and continuity</li>
              <li>the source transaction <strong>succeeded</strong> — inclusion is not success</li>
              <li>the emitting contract is the one the position named</li>
              <li>the invariant actually fires on that receipt&apos;s logs</li>
              <li>the same counterexample was never used on this position before</li>
            </ol>
            <div className="footnote" style={{ marginTop: 12 }}>
              Fail any one and the transaction reverts with a named error instead of paying a bond.
            </div>
          </Panel>

          <Panel title="Live positions" hint="ACTIVE and still inside an open window" flush>
            {positions.error ? (
              <div style={{ padding: 16 }}><ReadError error={positions.error} what="positions" /></div>
            ) : positions.loading ? (
              <Loading />
            ) : challengeable.length === 0 ? (
              <div className="empty-state">No challengeable positions right now.</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Invariant</th>
                    <th>Window</th>
                    <th className="num">Bond</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {challengeable.map((c) => (
                    <tr key={String(c.id)}>
                      <td className="mono">#{String(c.id)}</td>
                      <td>{predicateName(c.predicate)}</td>
                      <td className="mono" style={{ fontSize: "0.6875rem" }}>
                        {c.startBlock.toLocaleString("en-US")}→{c.endBlock.toLocaleString("en-US")}
                      </td>
                      <td className="num">{money(c.bond)}</td>
                      <td className="row-actions">
                        <button className="act act-sm" type="button" onClick={() => { setCoverageId(String(c.id)); setPreview(null); }}>
                          Target
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ padding: "12px 16px" }} className="footnote">
              The bond shown is what a successful challenge pays you. It is real capital the underwriter cannot
              withdraw while the position is live.
            </div>
          </Panel>

          {selected ? (
            <Panel title={`Position #${String(selected.id)}`} hint="the claim you are attacking">
              <dl className="kv">
                <dt>Status</dt><dd><StatusPill status={selected.status} /></dd>
                <dt>Borrower</dt><dd><Addr value={selected.borrower} chars={5} /></dd>
                <dt>Underwriter</dt><dd><Addr value={selected.underwriter} chars={5} /></dd>
                <dt>Exposure</dt><dd>{money(selected.maxExposure)}</dd>
                <dt>Bond</dt><dd>{money(selected.bond)}</dd>
                <dt>Drawn</dt><dd>{money(selected.drawn)}</dd>
                <dt>Frontier</dt><dd>{fh !== null ? fh.toLocaleString("en-US") : "—"}</dd>
                <dt>Live until</dt><dd>{selected.liveUntilHeight.toLocaleString("en-US")}</dd>
              </dl>
              {fh !== null && fh > selected.liveUntilHeight ? (
                <div style={{ marginTop: 12 }}>
                  <Notice tone="warn">
                    <div>The frontier has passed this window. The exposure lapsed, so the bond is no longer at risk and a breach is refused — a deterministic rule, not discretion.</div>
                  </Notice>
                </div>
              ) : (
                <div style={{ marginTop: 12 }}><Pill tone="warn">bond is live and claimable</Pill></div>
              )}
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
