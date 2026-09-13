// Guard against numbers being typed into the UI by hand.
//
// The staleness gate compares lib/evidence.generated.ts against a fresh run, which
// catches a manifest change the UI has not picked up — but it cannot catch a value
// that was hardcoded in a .tsx file in the first place, because such a value never
// touches the generated file. That is exactly what happened with two gas figures on
// the landing page: the generator knew 195,748 and 266,336, and the page typed them
// out again, so the gate had nothing to compare.
//
// Two rules, because one shape of hardcoding slips past the other:
//
//   1. Comma-formatted numbers >= 1000. Distinctive enough to have almost no false
//      positives.
//   2. Small evidence-shaped claims, e.g. "48 passing", "15/15 refused", "9/9". These
//      only became a problem once the suite grew: the landing marquee advertised a
//      hardcoded "48 passing" while the identically-worded figure further down the same
//      page read from the manifest. A two-digit claim is still a claim.
//
// Numbers rendered from a constant are invisible to this check, which is the point:
// the only way to display them is to import them.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const GENERATED = join(ROOT, "lib", "evidence.generated.ts");

const generated = readFileSync(GENERATED, "utf8");
const measured = generated.slice(
  generated.indexOf("export const MEASURED"),
  generated.indexOf("export const SOURCE_EVIDENCE")
);

// Every integer >= 1000 in the measured block, in its comma-formatted display form.
const values = new Set();
for (const m of measured.matchAll(/(\d{4,})/g)) {
  const n = Number(m[1]);
  if (Number.isFinite(n) && n >= 1000) values.add(n.toLocaleString("en-US"));
}

// Files that are allowed to contain these numbers: the generated file itself.
const SKIP = new Set(["lib/evidence.generated.ts", "scripts/check-no-literals.mjs"]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "public") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))];
const hits = [];

// Display shapes that make a claim about measured work.
const SMALL_CLAIM = [
  />\s*\d+\s*(passing|refused|keyless|failing|tests?)\b/i, // "> 48 passing"
  />\s*\d+\s*\/\s*\d+\s*(refused|keyless|passing)?\s*</i, // ">15/15<"  ">9/9<"
];

for (const file of files) {
  const rel = relative(ROOT, file);
  if (SKIP.has(rel)) continue;
  const src = readFileSync(file, "utf8");
  src.split("\n").forEach((line, i) => {
    const code = line.split("//")[0];
    if (/from ["']@\/lib\/evidence\.generated/.test(code)) return;

    for (const v of values) {
      const quote = String.fromCharCode(34);
      const apos = String.fromCharCode(39);
      const tick = String.fromCharCode(96);
      if (
        code.includes(quote + v) ||
        code.includes(">" + v) ||
        code.includes(apos + v) ||
        code.includes(tick + v)
      ) {
        hits.push(`${rel}:${i + 1}  literal ${v}  ->  ${line.trim().slice(0, 90)}`);
      }
    }

    for (const re of SMALL_CLAIM) {
      if (re.test(code)) {
        hits.push(`${rel}:${i + 1}  typed claim  ->  ${line.trim().slice(0, 90)}`);
        break;
      }
    }
  });
}

if (hits.length > 0) {
  console.error("Hardcoded evidence values found in the UI:\n");
  for (const h of hits) console.error("  " + h);
  console.error(
    `\n${hits.length} value(s). Import them from @/lib/evidence.generated instead — ` +
      "the CI staleness gate cannot catch a number that was never generated."
  );
  process.exit(1);
}

console.log(
  `no-literals: ${files.length} UI files scanned against ${values.size} evidence values — clean`
);
