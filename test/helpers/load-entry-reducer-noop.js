"use strict";

// Test helper (Task 5.8 — Property 9): load the pure initials-entry reducer
// from index.html WITHOUT a DOM.
//
// Why this helper exists separately from load-pure-core.js:
//   The pure reducer `applyEntryKey` (and its dependency `cycleLetter` plus the
//   `LETTERS` constant) lives inside the single IIFE in index.html. At the time
//   this test was written, `applyEntryKey` was not yet listed in the shared
//   helper's FUNC_NAMES. Rather than edit the shared helper (which other
//   parallel tasks also depend on), this file lifts exactly the declarations it
//   needs out of index.html by name — the real shipping source, no copies — and
//   evaluates them in an isolated, DOM-free scope. index.html stays the single
//   source of truth.
//
//   The extraction technique mirrors test/helpers/load-pure-core.js: match the
//   `const NAME = ...;` / `function NAME(...) { ... }` declarations in the
//   index.html source text and run just those in a fresh vm context.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const INDEX_HTML = path.join(__dirname, "..", "..", "index.html");

// Only what the unrecognized-key no-op property needs, in dependency order:
// applyEntryKey references cycleLetter, which references LETTERS.
const CONST_NAMES = ["LETTERS"];
const FUNC_NAMES = ["cycleLetter", "applyEntryKey"];

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

function loadEntryReducer() {
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

module.exports = loadEntryReducer();
