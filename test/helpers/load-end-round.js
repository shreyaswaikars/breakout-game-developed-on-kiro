"use strict";

// Test helper: load the END-OF-ROUND ROUTING functions (endRound / beginEntry /
// confirmEntry) and the qualification predicate from index.html WITHOUT a DOM,
// WITHOUT a real Web Audio API, and WITHOUT a real localStorage.
//
// Task 6.4 — Write unit tests for end-of-round routing.
//
// Why this exists (and why it is a separate, uniquely-named helper):
//   endRound(reason) is a STATEFUL function inside the IIFE in index.html. It is
//   NOT published through the `module.exports` guard (only the pure core is),
//   and it closes over a cluster of module-level `let` bindings — `state`,
//   `leaderboard`, `score`, `entry`, `endingReason`, `highlightedEntry`,
//   `statusMessage` — plus the `STATE` enum, and it calls:
//     - the pure helper `qualifies`,
//     - the stateful `beginEntry` (which sets state = STATE.ENTRY), and
//     - the sound effects `sfxGameOver` / `sfxWin`.
//
//   To unit-test endRound in Node we slice the REAL shipping source for those
//   functions (and their dependencies) out of index.html by name — the exact
//   byte-for-byte text the browser ships — and evaluate it in an isolated vm
//   context. The module-level mutable bindings are declared ONCE inside that
//   same program so the extracted endRound/beginEntry/confirmEntry close over
//   the SAME `state`/`leaderboard`/`score`/… that our accessors read and write.
//
//   SOUND EFFECTS ARE STUBBED. sfxGameOver() and sfxWin() in index.html call
//   playTone(), which touches the browser Web Audio API (AudioContext /
//   oscillators). That API does not exist in Node and would throw. Because this
//   task is about *routing* (ENTRY vs OVER/WIN and the endingReason restore),
//   not about sound, we inject no-op `function sfxGameOver(){}` /
//   `function sfxWin(){}` into the vm preamble INSTEAD of extracting the real
//   ones. The real functions only produce sound, so stubbing them does not
//   affect the routing behavior under test.
//
//   index.html stays the single source of truth for the routing logic: no
//   endRound/beginEntry/confirmEntry/qualifies logic is copied here. We only
//   (a) extract the real function/const source by name and (b) provide the
//   surrounding environment (the `let` bindings, a `STATE` object that includes
//   ENTRY, no-op sound stubs, and an injected fake `localStorage`).
//
//   This helper deliberately does NOT depend on or edit index.html, any other
//   test file, or the shared load-* helpers.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const INDEX_HTML = path.join(__dirname, "..", "..", "index.html");

// Constants the routing functions + their pure/persistence dependencies rely on.
//   MAX_RECORDS / MAX_SCORE -> used by qualifies / addRecord / isValidRecord
//   LETTERS                 -> used by cycleLetter (reachable via applyEntryKey chain)
//   STORE_KEY               -> used by saveLeaderboard (called by confirmEntry)
const CONST_NAMES = ["MAX_RECORDS", "MAX_SCORE", "LETTERS", "STORE_KEY"];

// Functions to lift out, in dependency order so later ones can reference
// earlier ones:
//   isValidRecord          <- addRecord, confirmEntry
//   addRecord              <- confirmEntry
//   qualifies              <- endRound
//   serializeLeaderboard   <- saveLeaderboard
//   deserializeLeaderboard <- part of the real chain
//   saveLeaderboard        <- confirmEntry (writes to injected localStorage)
//   beginEntry             <- endRound (sets state = STATE.ENTRY)
//   confirmEntry           <- the round-trip restore under test
//   endRound               <- the function under test
//
// NOTE: sfxGameOver / sfxWin are NOT listed here — they are injected as no-op
// stubs in the preamble (see the big comment above).
const FUNC_NAMES = [
  "isValidRecord",
  "addRecord",
  "qualifies",
  "serializeLeaderboard",
  "deserializeLeaderboard",
  "saveLeaderboard",
  "beginEntry",
  "confirmEntry",
  "endRound"
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

// Build the end-of-round routing environment bound to the supplied fake
// `localStorage`. `fakeLocalStorage` must expose getItem(key) and
// setItem(key, value); setItem may throw to simulate a failed save.
//
// Returns:
//   - STATE                : the injected enum (includes ENTRY)
//   - endRound / beginEntry / confirmEntry / qualifies : the real extracted fns
//   - get(name) / set(name, value) : accessors for the shared module-level
//     bindings (state, leaderboard, score, entry, endingReason,
//     highlightedEntry, statusMessage)
function loadEndRound(fakeLocalStorage) {
  const store =
    fakeLocalStorage || {
      getItem() {
        return null;
      },
      setItem() {
        /* no-op: successful save */
      }
    };

  const src = readIndexSource();
  const pieces = [];
  for (const name of CONST_NAMES) pieces.push(extractConst(src, name));
  for (const name of FUNC_NAMES) pieces.push(extractFunction(src, name));

  // The module-level mutable bindings that the routing functions close over.
  // Declared ONCE here so the extracted functions and our get/set accessors
  // share the exact same bindings. `entry` mirrors index.html's initial shape.
  //
  // STATE: index.html's own enum does not necessarily include ENTRY yet (that
  // is a parallel task). We inject our OWN STATE object that always includes
  // ENTRY so beginEntry() can set `state = STATE.ENTRY` deterministically.
  //
  // sfxGameOver / sfxWin: injected as no-op stubs (see the header comment) —
  // the real ones only produce sound via the Web Audio API, which is absent in
  // Node.
  const preamble =
    'const STATE = { READY: "ready", PLAYING: "playing", PAUSED: "paused", ' +
    'OVER: "over", WIN: "win", ENTRY: "entry" };\n' +
    "function sfxGameOver() { /* stubbed: sound only, no Web Audio in Node */ }\n" +
    "function sfxWin() { /* stubbed: sound only, no Web Audio in Node */ }\n" +
    "let state = STATE.READY;\n" +
    "let leaderboard = [];\n" +
    "let score = 0;\n" +
    'let entry = { chars: ["A", "A", "A"], cursor: 0 };\n' +
    "let endingReason = null;\n" +
    "let highlightedEntry = null;\n" +
    "let statusMessage = null;\n";

  // get/set bridge the sandbox's lexical `let` bindings to the test realm.
  const accessors =
    "function __get(name) {\n" +
    "  switch (name) {\n" +
    "    case 'state': return state;\n" +
    "    case 'leaderboard': return leaderboard;\n" +
    "    case 'score': return score;\n" +
    "    case 'entry': return entry;\n" +
    "    case 'endingReason': return endingReason;\n" +
    "    case 'highlightedEntry': return highlightedEntry;\n" +
    "    case 'statusMessage': return statusMessage;\n" +
    "    default: throw new Error('unknown binding: ' + name);\n" +
    "  }\n" +
    "}\n" +
    "function __set(name, value) {\n" +
    "  switch (name) {\n" +
    "    case 'state': state = value; break;\n" +
    "    case 'leaderboard': leaderboard = value; break;\n" +
    "    case 'score': score = value; break;\n" +
    "    case 'entry': entry = value; break;\n" +
    "    case 'endingReason': endingReason = value; break;\n" +
    "    case 'highlightedEntry': highlightedEntry = value; break;\n" +
    "    case 'statusMessage': statusMessage = value; break;\n" +
    "    default: throw new Error('unknown binding: ' + name);\n" +
    "  }\n" +
    "}\n";

  const exportNames = [
    "STATE",
    "endRound",
    "beginEntry",
    "confirmEntry",
    "qualifies",
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

  const sandbox = { localStorage: store };
  const factory = vm.runInNewContext("(function () {\n" + program + "\n})", sandbox);
  const api = factory();

  return {
    STATE: api.STATE,
    endRound: api.endRound,
    beginEntry: api.beginEntry,
    confirmEntry: api.confirmEntry,
    qualifies: api.qualifies,
    get: api.__get,
    set: api.__set
  };
}

module.exports = { loadEndRound };
