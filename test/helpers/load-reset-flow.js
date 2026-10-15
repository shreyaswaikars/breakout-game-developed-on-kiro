"use strict";

// Test helper: load the RESET CONTROLLER (handleReadyKey) from index.html
// WITHOUT a DOM and WITHOUT a real localStorage.
//
// Task 7.3 — Write unit tests for the reset flow.
//
// Why this exists (and why it is a separate, uniquely-named helper):
//   handleReadyKey(e) is a STATEFUL function inside the IIFE in index.html. It
//   is NOT published through the `module.exports` guard (only the pure core is),
//   and it closes over a cluster of module-level mutable bindings —
//   `resetPending`, `leaderboard`, `highlightedEntry`, `statusMessage` — and it
//   calls the side-effecting `saveLeaderboard` (which touches `localStorage`).
//
//   To unit-test it in Node we slice the REAL shipping source for that function
//   (and its dependencies) out of index.html by name — the exact byte-for-byte
//   text the browser ships — and evaluate it in an isolated vm context. The
//   module-level mutable bindings are declared ONCE inside that same program so
//   the extracted handleReadyKey closes over the SAME `resetPending`/
//   `leaderboard`/`highlightedEntry`/`statusMessage` that our accessors read and
//   write. That lets a test drive inputs (set leaderboard/resetPending) before a
//   call and observe outputs (resetPending/leaderboard/highlightedEntry/
//   statusMessage/return value) after it.
//
//   index.html stays the single source of truth: no controller logic is copied
//   here. We only (a) extract the real function/const source by name and (b)
//   provide the surrounding environment (the `let` bindings and an injected fake
//   `localStorage`).
//
//   This helper does not touch the shared test/helpers/load-pure-core.js,
//   test/helpers/load-persistence.js, or test/helpers/load-entry-controller.js
//   helpers.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const INDEX_HTML = path.join(__dirname, "..", "..", "index.html");

// Constants the controller + its persistence dependencies rely on.
//   MAX_RECORDS / MAX_SCORE -> used by addRecord / isValidRecord (part of the
//                              real chain pulled in via saveLeaderboard's
//                              serialize dependency and defensive validation)
//   STORE_KEY               -> used by saveLeaderboard
const CONST_NAMES = ["MAX_RECORDS", "MAX_SCORE", "STORE_KEY"];

// Functions to lift out, in dependency order so later ones can reference
// earlier ones:
//   isValidRecord          <- addRecord
//   addRecord              <- deserializeLeaderboard (part of the real chain)
//   serializeLeaderboard   <- saveLeaderboard
//   deserializeLeaderboard <- (part of the real chain)
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

// Extract a `const NAME = ...;` single-line declaration (same technique as
// load-pure-core.js / load-persistence.js / load-entry-controller.js).
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
//   - handleReadyKey(e)            : the real extracted function (returns bool)
//   - get(name) / set(name, value) : accessors for the shared module-level
//     bindings (resetPending, leaderboard, highlightedEntry, statusMessage)
function loadResetFlow(fakeLocalStorage) {
  const src = readIndexSource();
  const pieces = [];
  for (const name of CONST_NAMES) pieces.push(extractConst(src, name));
  for (const name of FUNC_NAMES) pieces.push(extractFunction(src, name));

  // The module-level mutable bindings handleReadyKey closes over, declared ONCE
  // here so the extracted function and our get/set accessors share the exact
  // same bindings. We declare them here (rather than extracting index.html's own
  // `let resetPending`/`let leaderboard`/... lines) so this helper is
  // self-contained and does not depend on the exact placement of those
  // declarations relative to the function.
  const preamble =
    "let resetPending = false;\n" +
    "let leaderboard = [];\n" +
    "let highlightedEntry = null;\n" +
    "let statusMessage = null;\n";

  // get/set bridge the sandbox's lexical `let` bindings to the test realm. A
  // `let` at the top level of the vm program is NOT a property of the sandbox
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

  const exportNames = ["handleReadyKey", "__get", "__set"];

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
    get: api.__get,
    set: api.__set
  };
}

module.exports = { loadResetFlow };
