"use strict";

// Test helper: load the ENTRY CONTROLLER (beginEntry / confirmEntry) from
// index.html WITHOUT a DOM and WITHOUT a real localStorage.
//
// Task 5.9 — Write unit tests for entry init and confirm.
//
// Why this exists (and why it is a separate, uniquely-named helper):
//   beginEntry() and confirmEntry() are STATEFUL functions inside the IIFE in
//   index.html. They are NOT published through the `module.exports` guard (only
//   the pure core is), and they close over a cluster of module-level `let`
//   bindings — `state`, `leaderboard`, `entry`, `endingReason`,
//   `highlightedEntry`, `statusMessage`, `score`, plus the `STATE` enum — and
//   they call the pure helpers (`isValidRecord`, `addRecord`) and the
//   side-effecting `saveLeaderboard` (which touches `localStorage`).
//
//   To unit-test them in Node we slice the REAL shipping source for those
//   functions (and their dependencies) out of index.html by name — the exact
//   byte-for-byte text the browser ships — and evaluate it in an isolated vm
//   context. Crucially, we declare the module-level mutable bindings ONCE,
//   inside that same program, so the extracted beginEntry/confirmEntry close
//   over the SAME `state`/`leaderboard`/`entry`/… that our accessors read and
//   write. That lets a test drive inputs (set score/endingReason/entry) before
//   a call and observe outputs (state/leaderboard/highlightedEntry/
//   statusMessage) after it.
//
//   index.html stays the single source of truth: no controller logic is copied
//   here. We only (a) extract the real function/const source by name and
//   (b) provide the surrounding environment (the `let` bindings, a `STATE`
//   object, and an injected fake `localStorage`).
//
//   NOTE on STATE: index.html's `STATE` enum does not yet contain `ENTRY` — that
//   is added by Task 6.1, which runs around the same time as this task. Rather
//   than depend on that parallel edit, this helper injects its OWN `STATE`
//   object that always includes `ENTRY` (alongside READY/PLAYING/PAUSED/OVER/
//   WIN) so `beginEntry()` can set `state = STATE.ENTRY` deterministically. We
//   deliberately do NOT extract the `STATE` const from index.html.
//
//   This helper does not touch the shared test/helpers/load-pure-core.js or
//   test/helpers/load-persistence.js helpers.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const INDEX_HTML = path.join(__dirname, "..", "..", "index.html");

// Constants the controller + its pure/persistence dependencies rely on.
//   MAX_RECORDS / MAX_SCORE -> used by addRecord / isValidRecord
//   LETTERS                 -> used by cycleLetter (reachable via applyEntryKey)
//   STORE_KEY               -> used by saveLeaderboard
// We intentionally do NOT extract `STATE` (see the note above — we inject our
// own with ENTRY).
const CONST_NAMES = ["MAX_RECORDS", "MAX_SCORE", "LETTERS", "STORE_KEY"];

// Functions to lift out, in dependency order so later ones can reference
// earlier ones:
//   isValidRecord          <- addRecord, confirmEntry
//   addRecord              <- confirmEntry
//   serializeLeaderboard   <- saveLeaderboard
//   deserializeLeaderboard <- (not strictly needed, but part of the real chain)
//   saveLeaderboard        <- confirmEntry (writes to injected localStorage)
//   cycleLetter            <- applyEntryKey
//   applyEntryKey          <- exposed so the cursor/stickiness assertions drive
//                             the real reducer rather than a copy
//   beginEntry / confirmEntry <- the controller under test
const FUNC_NAMES = [
  "isValidRecord",
  "addRecord",
  "serializeLeaderboard",
  "deserializeLeaderboard",
  "saveLeaderboard",
  "cycleLetter",
  "applyEntryKey",
  "beginEntry",
  "confirmEntry"
];

function readIndexSource() {
  return fs.readFileSync(INDEX_HTML, "utf8");
}

// Extract a `const NAME = ...;` single-line declaration (same technique as
// load-pure-core.js / load-persistence.js).
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

// Build the entry-controller environment bound to the supplied fake
// `localStorage`. `fakeLocalStorage` must expose getItem(key) and
// setItem(key, value); setItem may throw to simulate a failed save.
//
// Returns:
//   - STATE                : the injected enum (includes ENTRY)
//   - beginEntry / confirmEntry / applyEntryKey : the real extracted functions
//   - get(name) / set(name, value) : accessors for the shared module-level
//     bindings (state, leaderboard, entry, endingReason, highlightedEntry,
//     statusMessage, score)
function loadEntryController(fakeLocalStorage) {
  const src = readIndexSource();
  const pieces = [];
  for (const name of CONST_NAMES) pieces.push(extractConst(src, name));
  for (const name of FUNC_NAMES) pieces.push(extractFunction(src, name));

  // The module-level mutable bindings that beginEntry/confirmEntry close over.
  // Declared ONCE here so the extracted functions and our get/set accessors
  // share the exact same bindings. `entry` mirrors index.html's initial shape.
  const preamble =
    'const STATE = { READY: "ready", PLAYING: "playing", PAUSED: "paused", ' +
    'OVER: "over", WIN: "win", ENTRY: "entry" };\n' +
    "let state = STATE.READY;\n" +
    "let leaderboard = [];\n" +
    'let entry = { chars: ["A", "A", "A"], cursor: 0 };\n' +
    "let endingReason = null;\n" +
    "let highlightedEntry = null;\n" +
    "let statusMessage = null;\n" +
    "let score = 0;\n";

  // get/set bridge the sandbox's lexical `let` bindings to the test realm.
  // A `let` at the top level of the vm program is NOT a property of the sandbox
  // global, so we expose explicit accessors that read/assign the live bindings.
  const accessors =
    "function __get(name) {\n" +
    "  switch (name) {\n" +
    "    case 'state': return state;\n" +
    "    case 'leaderboard': return leaderboard;\n" +
    "    case 'entry': return entry;\n" +
    "    case 'endingReason': return endingReason;\n" +
    "    case 'highlightedEntry': return highlightedEntry;\n" +
    "    case 'statusMessage': return statusMessage;\n" +
    "    case 'score': return score;\n" +
    "    default: throw new Error('unknown binding: ' + name);\n" +
    "  }\n" +
    "}\n" +
    "function __set(name, value) {\n" +
    "  switch (name) {\n" +
    "    case 'state': state = value; break;\n" +
    "    case 'leaderboard': leaderboard = value; break;\n" +
    "    case 'entry': entry = value; break;\n" +
    "    case 'endingReason': endingReason = value; break;\n" +
    "    case 'highlightedEntry': highlightedEntry = value; break;\n" +
    "    case 'statusMessage': statusMessage = value; break;\n" +
    "    case 'score': score = value; break;\n" +
    "    default: throw new Error('unknown binding: ' + name);\n" +
    "  }\n" +
    "}\n";

  const exportNames = [
    "STATE",
    "beginEntry",
    "confirmEntry",
    "applyEntryKey",
    "__get",
    "__set"
  ];

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
    STATE: api.STATE,
    beginEntry: api.beginEntry,
    confirmEntry: api.confirmEntry,
    applyEntryKey: api.applyEntryKey,
    get: api.__get,
    set: api.__set
  };
}

module.exports = { loadEntryController };
