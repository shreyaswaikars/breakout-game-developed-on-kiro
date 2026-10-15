"use strict";

// Test helper: load the PERSISTENCE module (loadLeaderboard / saveLeaderboard)
// from index.html WITHOUT a DOM and WITHOUT a real localStorage.
//
// Task 4.2 — Write unit tests for persistence wiring with a fake `localStorage`.
//
// Why this exists (and why it is separate from load-pure-core.js):
//   loadLeaderboard/saveLeaderboard live inside the IIFE in index.html but are
//   NOT published through the `module.exports` guard (only the pure core is).
//   They are side-effecting: they reference the global `localStorage`, the
//   `STORE_KEY` constant, and the pure serialize/deserialize helpers. To test
//   them in Node we must extract the real shipping source for those functions
//   plus their dependencies and evaluate them in a vm context where we inject a
//   fake `localStorage` we fully control (and can force to throw on read/write).
//
//   This keeps index.html as the single source of truth: no persistence logic
//   is duplicated here. We only slice the exact declarations out by name — the
//   same byte-for-byte source the browser ships — and run them against a fake
//   Store. The shared load-pure-core.js helper is intentionally left untouched.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const INDEX_HTML = path.join(__dirname, "..", "..", "index.html");

// Constants the persistence + serialize/deserialize chain depends on.
//   STORE_KEY           -> the single named key under which the board is stored
//   MAX_RECORDS/MAX_SCORE -> used by addRecord / isValidRecord (reachable via
//                            deserializeLeaderboard)
const CONST_NAMES = ["MAX_RECORDS", "MAX_SCORE", "STORE_KEY"];

// Functions to lift out, in dependency order:
//   isValidRecord            <- used by addRecord + deserializeLeaderboard
//   addRecord                <- used by deserializeLeaderboard
//   serializeLeaderboard     <- used by saveLeaderboard
//   deserializeLeaderboard   <- used by loadLeaderboard
//   loadLeaderboard / saveLeaderboard  <- the module under test
const FUNC_NAMES = [
  "isValidRecord",
  "addRecord",
  "serializeLeaderboard",
  "deserializeLeaderboard",
  "loadLeaderboard",
  "saveLeaderboard"
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

// Build the persistence API bound to the supplied fake `localStorage`.
// `fakeLocalStorage` must expose getItem(key) and setItem(key, value); either
// may throw to simulate an inaccessible / quota-exceeded Store. Returns the
// extracted STORE_KEY plus loadLeaderboard / saveLeaderboard closed over the
// fake.
function loadPersistence(fakeLocalStorage) {
  const src = readIndexSource();
  const pieces = [];
  for (const name of CONST_NAMES) pieces.push(extractConst(src, name));
  for (const name of FUNC_NAMES) pieces.push(extractFunction(src, name));

  const exportNames = ["STORE_KEY", "loadLeaderboard", "saveLeaderboard"];
  const program =
    '"use strict";\n' +
    pieces.join("\n\n") +
    "\n\nreturn { " + exportNames.join(", ") + " };\n";

  // Inject the fake as the global `localStorage` the extracted functions close
  // over. runInNewContext uses the sandbox object as the global, so a top-level
  // `localStorage` reference inside the extracted source resolves to our fake.
  const sandbox = { localStorage: fakeLocalStorage };
  const factory = vm.runInNewContext("(function () {\n" + program + "\n})", sandbox);
  return factory();
}

module.exports = { loadPersistence };
