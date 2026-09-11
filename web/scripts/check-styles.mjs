// Guard: the stylesheet must style bare form elements.
//
// Why this exists. While porting the landing's stylesheet into the console, the carry-over
// only looked at CLASS selectors, so every rule written as a bare element selector
// (`input, select, textarea { … }`) was silently dropped. The build stayed green, typecheck
// stayed green, and the console shipped with browser-default form controls — the one class of
// defect that is invisible to every other check here because it is not a missing class, a
// missing type, or a missing number.
//
// So: assert the presence of the element-level rules directly. These are not style opinions,
// they are the difference between a designed control and an <input> straight out of 1998.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");

/** Strip comments so a rule discussed in prose does not satisfy the check. */
const code = css.replace(/\/\*[\s\S]*?\*\//g, "");

const REQUIRED = [
  {
    what: "base form control styling",
    // a rule whose selector list includes input/select/textarea
    test: (c) => /(^|[\s,}])(input|select|textarea)\s*[,{]/.test(c),
  },
  {
    what: "focus state on controls",
    test: (c) => /input:focus|select:focus|textarea:focus/.test(c),
  },
  {
    what: "custom select chevron (select is not left native)",
    test: (c) => /select\s*\{[^}]*background-image/s.test(c),
  },
  {
    what: "native appearance removed on controls",
    test: (c) => /appearance:\s*none/.test(c),
  },
  {
    what: "placeholder styling",
    test: (c) => /input::placeholder|textarea::placeholder/.test(c),
  },
  {
    what: "dark option list",
    test: (c) => /select\s+option\s*\{/.test(c),
  },
];

const failures = REQUIRED.filter((r) => !r.test(code));

if (failures.length > 0) {
  console.error("Form controls are not styled. Missing:\n");
  for (const f of failures) console.error("  - " + f.what);
  console.error(
    "\nA stylesheet rebuild with a class-only carry-over drops bare element rules. " +
      "Check that input/select/textarea rules survived before shipping."
  );
  process.exit(1);
}

console.log(`styles: ${REQUIRED.length} form-control rules present — clean`);
