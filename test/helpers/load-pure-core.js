"use strict";

// Test helper: load the pure leaderboard logic from index.html WITHOUT a DOM.
//
// Why this exists:
//   The entire game lives inside a single IIFE in index.html that touches the
//   DOM at module scope (`document.getElementById`, `canvas.getContext`),
//   registers event listeners, and boots a render loop. Task 2.6 added a
//   conditional `module.exports` guard at the end of that IIFE so the pure core
//   is the single source of truth for both the browser and Node — but Node
//   still cannot `require("index.html")` directly, because evaluating the IIFE
//   would run that DOM/boot code and throw outside a browser.
//
//   So this helper keeps index.html as the one source of truth WITHOUT copying
//   any logic: it slices the real pure declarations out of index.html by name
//   (the exact source text the browser ships) and evaluates just those in an
//   isolated function scope with no DOM. The names mirror the `module.exports`
//   guard, so the helper and the guard expose the identical pure API.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const INDEX_HTML = path.join(__dirname, "..", "..", "index.html");

// Pure declarations to lift out of the IIFE, in dependency order. Each entry is
// matched from the index.html source by name so the extracted code is the real
// shipping implementation rather than a copy.
const CONST_NAMES = ["MAX_RECORDS", "MAX_SCORE", "LETTERS"];
// Mirrors the pure functions published by the `module.exports` guard in
// index.html (Task 2.6). Listed in dependency order so later functions can
// reference earlier ones (e.g. addRecord -> isValidRecord,
// deserializeLeaderboard -> addRecord, applyEntryKey -> cycleLetter). Added by
// Task 5.5 after cycleLetter so its dependency precedes it.
const FUNC_NAMES = [
  "isValidRecord",
  "addRecord",
  "qualifies",
  "serializeLeaderboard",
  "deserializeLeaderboard",
  "cycleLetter",
  "applyEntryKey"
];

function readIndexSource() {
  return fs.readFileSync(INDEX_HTML, "utf8");
}

// Extract a `const NAME = ...;` single-line declaration.
function extractConst(src, name) {
  const re = new RegExp("const\\s+" + name + "\\s*=\\s*[^;]+;");
  const m = src.match(re);
  if (!m) {
    throw new Error("Could not find const declaration for '" + name + "' in index.html");
  }
  return m[0];
}

// Extract a `function NAME(...) { ... }` declaration by balancing braces from
// the first `{` after the signature.
function extractFunction(src, name) {
  const sigRe = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{");
  const m = sigRe.exec(src);
  if (!m) {
    throw new Error("Could not find function declaration for '" + name + "' in index.html");
  }
  const start = m.index;
  let i = m.index + m[0].length; // position just after the opening brace
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  if (depth !== 0) {
    throw new Error("Unbalanced braces while extracting function '" + name + "'");
  }
  return src.slice(start, i);
}

function loadPureCore() {
  const src = readIndexSource();
  const pieces = [];
  for (const name of CONST_NAMES) pieces.push(extractConst(src, name));
  for (const name of FUNC_NAMES) pieces.push(extractFunction(src, name));

  const exportNames = [...CONST_NAMES, ...FUNC_NAMES];
  const program =
    '"use strict";\n' +
    pieces.join("\n\n") +
    "\n\nreturn { " + exportNames.join(", ") + " };\n";

  const factory = vm.runInNewContext("(function () {\n" + program + "\n})", {});
  return factory();
}

module.exports = loadPureCore();
