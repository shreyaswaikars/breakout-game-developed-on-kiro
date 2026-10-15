"use strict";

// Test helper: load the RESET CONTROLLER (handleReadyKey) from index.html
// WITHOUT a DOM and WITHOUT a real localStorage.
//
// Task 7.2 — Property 11: Reset yields an empty leaderboard.
//
// Why this exists (and why it is a separate, uniquely-named helper):
//   handleReadyKey(e) is a STATEFUL function inside the IIFE in index.html. It
//   is NOT published through the `module.exports` guard (only the pure core
//   is), and it closes over a cluster of module-level `let` bindings —
//   `resetPending`, `leaderboard`, `highlightedEntry`, `statusMessage` — and it
//   calls `saveLeaderboard` (which touches `localStorage`).
//
//   To exercise it in Node we slice the REAL shipping source for that function
//   (and its dependencies) out of index.html by name — the exact byte-for-byte
//   text the browser ships — and evaluate it in an isolated vm context. We
//   declare the module-level mutable bindings ONCE, inside that same program,
//   so the extracted handleReadyKey closes over the SAME `resetPending`/
//   `leaderboard`/`highlightedEntry`/`statusMessage` that our accessors read
//   and write. That lets a test drive inputs (set leaderboard/resetPending)
//   before a call and observe outputs after it.
//
//   index.html stays the single source of truth: no controller logic is copied
//   here. We only (a) extract the real function/const source by name and
//   (b) provide the surrounding environment (the `let` bindings and an injected
//   fake `localStorage`).
//
//   This helper is modeled on test/helpers/load-entry-controller.js but is
//   self-contained and uniquely named so it does not depend on or modify any
//   existing helper or test file.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const INDEX_HTML = path.join(__dirname, "..", "..", "index.html");

// Constants the controller + its pure/persistence dependencies rely on.
//   MAX_RECORDS / MAX_SCORE -> used by addRecord / isValidRecord
//   STORE_KEY               -> used by saveLeaderboard
const CONST_NAMES = ["MAX_RECORDS", "MAX_SCORE", "STORE_KEY"];

// Functions to lift out, in dependency order so later ones can reference
// earlier ones:
//   isValidRecord          <- addRecord (and deserializeLeaderboard)
//   addRecord              <- deserializeLeaderboard; also used to build boards
//                             in tests so leaderboard invariants hold
//   serializeLeaderboard   <- saveLeaderboard
//   deserializeLeaderboard <- part of the real chain
//   saveLeaderboard        <- handleReadyKey (writes to injected localStorage)
//   handleReadyKey         <- the controller under test
const FUNC_NAMES = [
  "isValidRecord",
  "addRecord",
  "serializeLeaderboard",
  "deserializeLeaderboard",
  "saveLeaderboard",
  "handleReadyKey"
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

// Build the reset-controller environment bound to the supplied fake
// `localStorage`. `fakeLocalStorage` must expose getItem(key) and
// setItem(key, value); setItem may throw to simulate a failed save.
//
// Returns:
//   - handleReadyKey : the real extracted function
//   - addRecord      : the real extracted pure helper (so tests can build
//                      invariant-respecting boards without copying logic)
//   - get(name) / set(name, value) : accessors for the shared module-level
//     bindings (resetPending, leaderboard, highlightedEntry, statusMessage)
function loadResetController(fakeLocalStorage) {
  const src = readIndexSource();
  const pieces = [];
  for (const name of CONST_NAMES) pieces.push(extractConst(src, name));
  for (const name of FUNC_NAMES) pieces.push(extractFunction(src, name));

  // The module-level mutable bindings that handleReadyKey closes over.
  // Declared ONCE here so the extracted function and our get/set accessors
  // share the exact same bindings.
  const preamble =
    "let resetPending = false;\n" +
    "let leaderboard = [];\n" +
    "let highlightedEntry = null;\n" +
    "let statusMessage = null;\n";

  // get/set bridge the sandbox's lexical `let` bindings to the test realm.
  // A `let` at the top level of the vm program is NOT a property of the sandbox
  // global, so we expose explicit accessors that read/assign the live bindings.
  const accessors =
    "function __get(name) {\n" +
    "  switch (name) {\n" +
    "    case 'resetPending': return resetPending;\n" +
    "    case 'leaderboard': return leaderboard;\n" +
    "    case 'highlightedEntry': return highlightedEntry;\n" +
    "    case 'statusMessage': return statusMessage;\n" +
    "    default: throw new Error('unknown binding: ' + name);\n" +
    "  }\n" +
    "}\n" +
    "function __set(name, value) {\n" +
    "  switch (name) {\n" +
    "    case 'resetPending': resetPending = value; break;\n" +
    "    case 'leaderboard': leaderboard = value; break;\n" +
    "    case 'highlightedEntry': highlightedEntry = value; break;\n" +
    "    case 'statusMessage': statusMessage = value; break;\n" +
    "    default: throw new Error('unknown binding: ' + name);\n" +
    "  }\n" +
    "}\n";

  const exportNames = ["handleReadyKey", "addRecord", "__get", "__set"];

  const program =
    '"use strict";\n' +
    preamble +
    "\n" +
    pieces.join("\n\n") +
    "\n\n" +
    accessors +
    "\nreturn { " + exportNames.join(", ") + " };\n";

  // Inject the fake as the global `localStorage` that saveLeaderboard closes
  // over (runInNewContext uses the sandbox object as the global).
  const sandbox = { localStorage: fakeLocalStorage };
  const factory = vm.runInNewContext("(function () {\n" + program + "\n})", sandbox);
  const api = factory();

  return {
    handleReadyKey: api.handleReadyKey,
    addRecord: api.addRecord,
    get: api.__get,
    set: api.__set
  };
}

module.exports = { loadResetController };
