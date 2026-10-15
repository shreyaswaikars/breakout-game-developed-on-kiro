"use strict";

// Test helper (Task 5.7 — Property 8): load the pure entry reducer from
// index.html WITHOUT a DOM.
//
// Why this exists:
//   The pure `applyEntryKey(entryState, keyEvent)` reducer lives inside the IIFE
//   in index.html, but it is NOT yet published through the `module.exports`
//   guard (that happens in Task 5.5) and it is NOT part of the shared
//   `load-pure-core.js` helper. Rather than modify those existing, shared files,
//   this dedicated helper lifts the real `applyEntryKey` (plus its `cycleLetter`
//   and `LETTERS` dependencies) out of index.html by name and evaluates just
//   those declarations in an isolated DOM-free scope. index.html therefore
//   stays the single source of truth — this helper copies no logic, it slices
//   the exact source text the browser ships and runs it.
//
//   The extraction technique mirrors test/helpers/load-pure-core.js (vm +
//   brace-balancing), kept standalone here so no shared helper is touched. The
//   filename is intentionally unique to avoid colliding with any similarly
//   purposed helper a parallel task might create.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const INDEX_HTML = path.join(__dirname, "..", "..", "index.html");

// Pure declarations to lift out of the IIFE, in dependency order:
// `applyEntryKey` references `cycleLetter`, which references `LETTERS`.
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
    throw new Error(
      "Could not find const declaration for '" + name + "' in index.html"
    );
  }
  return m[0];
}

// Extract a `function NAME(...) { ... }` declaration by balancing braces from
// the first `{` after the signature.
function extractFunction(src, name) {
  const sigRe = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{");
  const m = sigRe.exec(src);
  if (!m) {
    throw new Error(
      "Could not find function declaration for '" + name + "' in index.html"
    );
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
