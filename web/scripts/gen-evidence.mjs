#!/usr/bin/env node
/**
 * Generate web/lib/evidence.generated.ts from the repository's evidence.json.
 *
 * Why this exists: before the frontend lived in this repo it carried its own copy of the deployed
 * addresses, the transaction hashes and the measured numbers. Two copies of the same facts drift —
 * a redeploy or a re-run of the demo would leave the UI quietly asserting numbers that no longer
 * match the evidence manifest, which is the exact failure this project is about.
 *
 * So the UI does not get to have its own opinion about what happened on chain. It reads the manifest
 * the scripts write. `npm run gen:evidence` runs automatically before dev and build, and CI fails if
 * the generated file is stale.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const source = join(repoRoot, "evidence.json");
const target = join(repoRoot, "web", "lib", "evidence.generated.ts");

const e = JSON.parse(readFileSync(source, "utf8"));

const need = (obj, path) => {
  const v = path.split(".").reduce((a, k) => (a == null ? a : a[k]), obj);
  if (v === undefined || v === null) {
    throw new Error(`evidence.json is missing ${path} — the UI depends on it, so this is a hard fail`);
  }
  return v;
};

const c = need(e, "contracts");
const t = need(e, "transactions");
const m = need(e, "measured");

// Attack rows come from the attack matrix the script actually ran, not from a list typed by hand.
const attackRaw = JSON.parse(
  readFileSync(join(repoRoot, "worker", "evidence", "attack-matrix.json"), "utf8")
);
const attacks = attackRaw.results.map((r) => ({
  what: r.attack,
  err: r.reason,
  tx: r.txHash ?? null,
}));

const refused = attackRaw.results.filter((r) => r.refused).length;
if (refused !== attackRaw.results.length) {
  throw new Error(
    `attack matrix has ${attackRaw.results.length - refused} unrefused attack(s) — refusing to ` +
      `generate a UI that claims otherwise`
  );
}

const src = JSON.parse(
  readFileSync(join(repoRoot, "worker", "evidence", "source-evidence.json"), "utf8")
);
const sourceEvidence = {
  tx: src.sourceTx,
  block: Number(src.sourceBlock),
  explorer: "https://sepolia.etherscan.io/tx/",
};
if (!sourceEvidence.tx) throw new Error("source-evidence.json has no transaction hash");

const deployVerification = JSON.parse(
  readFileSync(join(repoRoot, "worker", "evidence", "deployment-verification.json"), "utf8")
);
const deployChecks = Array.isArray(deployVerification.checks)
  ? deployVerification.checks.filter((c) => c.ok !== false && c.pass !== false).length
  : Number(deployVerification.checks);

// The demo's own numbers, read from the run log rather than typed into the UI.
const demoRun = JSON.parse(
  readFileSync(join(repoRoot, "worker", "evidence", "demo-run.json"), "utf8")
);
const fmtUnits = (raw, decimals = 6) => {
  const v = BigInt(raw) / 10n ** BigInt(decimals);
  return v.toLocaleString("en-US");
};

const timing = JSON.parse(
  readFileSync(join(repoRoot, "worker", "evidence", "timing.json"), "utf8")
);

// Pull the four headline legs out of the recorded rows by matching the step label, so the numbers
// come from the run rather than from a constant somebody has to remember to update.
const leg = (needle) => {
  const row = timing.rows.find((r) => r.step.toLowerCase().includes(needle));
  if (!row) throw new Error(`timing.json has no step matching "${needle}"`);
  return row.gas;
};

const out = `// GENERATED FILE — DO NOT EDIT.
// Written by web/scripts/gen-evidence.mjs from evidence.json + worker/evidence/*.json.
// Regenerate with: npm run gen:evidence   (runs automatically on dev and build)
//
// Every value below was produced by a command in this repository. The UI has no hardcoded
// on-chain facts of its own, so it cannot drift from what was actually measured.

// Sourced from evidence.json, NOT from the clock: the output must be byte-identical for identical
// inputs, or the CI staleness gate would fail on every run and teach everyone to ignore it.
export const GENERATED_AT = ${JSON.stringify(e.generatedAt)} as const;

export const CONTRACTS = {
  token: ${JSON.stringify(need(c, "demoToken"))},
  adapter: ${JSON.stringify(need(c, "attestcoinAdapter"))},
  engine: ${JSON.stringify(need(c, "coverageEngine"))},
  market: ${JSON.stringify(need(c, "coverageMarket"))},
  challengeManager: ${JSON.stringify(need(c, "challengeManager"))},
  lendingAdapter: ${JSON.stringify(need(c, "lendingAdapter"))},
  predicateProhibitedRecipient: ${JSON.stringify(need(c, "predicateProhibitedRecipient"))},
  predicateAmountAboveLimit: ${JSON.stringify(need(c, "predicateAmountAboveLimit"))},
  predicateAmountBelowFloor: ${JSON.stringify(need(c, "predicateAmountBelowFloor"))},
} as const;

export const EXPLORER_ADDRESS = ${JSON.stringify(c._explorer)} as const;
export const EXPLORER_TX = ${JSON.stringify(t._explorer)} as const;

export const DEMO_TXS = {
  underwriterDeposit: ${JSON.stringify(need(t, "underwriterDeposit"))},
  liquidityDeposit: ${JSON.stringify(need(t, "liquidityDeposit"))},
  purchase: ${JSON.stringify(need(t, "purchase"))},
  draw: ${JSON.stringify(need(t, "draw"))},
  counterexample: ${JSON.stringify(need(t, "counterexample"))},
  secondPurchase: ${JSON.stringify(need(t, "secondPurchase"))},
  repay: ${JSON.stringify(need(t, "repay"))},
  settlement: ${JSON.stringify(need(t, "settlement"))},
  failedDrawAfterBreach: ${JSON.stringify(
    need(m, "attackMatrix.onChainRefusals.drawAgainstBreachedPosition")
  )},
  failedReplay: ${JSON.stringify(
    need(m, "attackMatrix.onChainRefusals.replayedCounterexample")
  )},
} as const;

export const COVERAGE_IDS = {
  breached: ${JSON.stringify(need(t, "coverageIdBreached"))},
  settled: ${JSON.stringify(need(t, "coverageIdSettled"))},
} as const;

export const ATTACKS = ${JSON.stringify(attacks, null, 2)} as const;

export const MEASURED = {
  forgeTests: ${need(m, "contractTests.passed")},
  attackCount: ${attackRaw.total},
  attacksRefused: ${attackRaw.refused},
  liveChecks: ${need(m, "liveAttestcoinVerification.checksPassed")},
  liveChecksTotal: ${need(m, "liveAttestcoinVerification.checksTotal")},
  deployChecks: ${deployChecks},
  contractsVerified: ${need(m, "explorerVerification.contractsVerified")},
  contractsTotal: ${need(m, "explorerVerification.contractsDeployed")},
  batchSaving5: ${need(m, "continuityCompression.saving.gasPercent")},
  batchSaving10: ${need(m, "continuityCompression.secondRun10Claims.savingPercent")},
  demoSeconds: ${need(m, "timing.endToEndSeconds")},
  demoTxCount: ${need(m, "timing.transactions")},
  demoTotalGas: ${need(m, "timing.totalGas")},
  refusedDrawGas: ${need(m, "gasReport.failurePath.drawAgainstBreachedPosition")},
  refusedReplayGas: ${need(m, "gasReport.failurePath.replayedCounterexample")},
  gasDraw: ${need(m, "timing.keyLegs.draw")},
  gasChallenge: ${need(m, "timing.keyLegs.challenge")},
  gasPurchase: ${need(m, "timing.keyLegs.purchase")},
  gasSettlement: ${need(m, "timing.keyLegs.settlement")},
  /** Bond seized by the challenger in the recorded demo, in whole tokens. */
  bondPaid: ${JSON.stringify(fmtUnits(demoRun.coverage.bond))},
  maxExposure: ${JSON.stringify(fmtUnits(demoRun.coverage.maxExposure))},
  premium: ${JSON.stringify(fmtUnits(demoRun.coverage.premium))},
} as const;

export const SOURCE_EVIDENCE = ${JSON.stringify(sourceEvidence, null, 2)} as const;
`;

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, out);
console.log(
  `web/lib/evidence.generated.ts written — ${Object.keys(c).filter((k) => !k.startsWith("_")).length} contracts, ` +
    `${attacks.length} attacks (${attackRaw.refused} refused), ${Object.keys(DEMOKEYS()).length} transactions`
);
function DEMOKEYS() {
  return Object.fromEntries(Object.entries(t).filter(([k]) => !k.startsWith("_")));
}
