"use strict";

// Test helper: load the REAL game-simulation step `update()` from index.html
// WITHOUT a DOM, so Property 10 (Task 6.3) can call the exact shipping source
// under a non-PLAYING state and observe whether it mutates ball/paddle/bricks.
//
// Why this is a separate, uniquely-named helper (not load-pure-core.js):
//   `update()` is a large STATEFUL function inside the IIFE in index.html. It
//   is NOT published through the `module.exports` guard (only the pure core
//   is), and it closes over a big cluster of module-level bindings and helper
//   functions:
//     mutable state : state, keys, paddle, ball, bricks, combo, destroyed,
//                     score, lives
//     constants     : STATE, W, H, BRICK, totalBricks, START_LIVES (indirect)
//     helpers       : circleRectHit, sfxPaddle, sfxBrick, spawnParticles,
//                     setBallSpeed, endRound, resetBallOnPaddle, launchBall
//
//   Duplicating `update()` into the test would break index.html as the single
//   source of truth. Instead we slice the REAL `update` function text out of
//   index.html by name (balanced-brace extraction, identical technique to
//   load-pure-core.js / load-entry-controller.js) and evaluate it in an
//   isolated vm context, declaring the module-level bindings ONCE in that same
//   program so the extracted `update` closes over the SAME ball/paddle/bricks
//   our accessors read.
//
//   index.html stays the single source of truth: no simulation logic is copied
//   here. We only (a) extract the real `function update()` text by name and
//   (b) provide a surrounding environment (the mutable `let` bindings plus the
//   helper functions `update` would call IF it did not early-return).
//
// CRITICAL — the harness must be able to OBSERVE a mutation:
//   Property 10 is only meaningful if, were the guard
//   (`if (state !== STATE.PLAYING) return;`) absent, the test WOULD detect a
//   change. So every helper that `update()` calls past the guard is injected as
//   a working (not inert) stub, and the physics variables are real mutable
//   objects. In particular `ball.dx`/`ball.dy` are non-zero and `keys` can be
//   set, so an un-guarded `update()` would move the ball and paddle and the
//   snapshot comparison would fail. The companion test proves this by also
//   extracting update() with the guard stripped and asserting it DOES mutate.
//
//   To exercise that negative control, `loadUpdate({ stripGuard: true })`
//   removes the leading `if (state !== STATE.PLAYING) return;` from the real
//   source before evaluation.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const INDEX_HTML = path.join(__dirname, "..", "..", "index.html");

function readIndexSource() {
  return fs.readFileSync(INDEX_HTML, "utf8");
}

// Extract a `function NAME(...) { ... }` declaration by balancing braces from
// the first `{` after the signature. Same approach as the sibling helpers.
function extractFunction(src, name) {
  const sigRe = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{");
  const m = sigRe.exec(src);
  if (!m) {
    throw new Error(
      "Could not find function declaration for '" + name + "' in index.html"
    );
  }
  const start = m.index;
  let i = m.index + m[0].length; // just after the opening brace
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

// The exact early-return guard the design relies on (design.md Property 10:
// "update() early-returns unless state === STATE.PLAYING"). Stripping it gives
// us the negative control that proves the harness can see a mutation.
const GUARD_RE = /if\s*\(\s*state\s*!==\s*STATE\.PLAYING\s*\)\s*return\s*;?/;

// Build an environment that holds the extracted `update` plus every binding it
// closes over. `opts.stripGuard` removes the PLAYING guard for the negative
// control.
//
// Returns:
//   - update()            : the real extracted simulation step
//   - setState(name)       : set the module-level `state` (e.g. STATE.ENTRY)
//   - STATE                : the state enum used inside update
//   - get(name)/set(name)  : accessors for the mutable physics bindings
//                            (ball, paddle, bricks, keys, combo, destroyed,
//                             score, lives)
//   - guardPresent         : whether the real source contained the guard
function loadUpdate(opts) {
  opts = opts || {};
  const src = readIndexSource();
  let updateSrc = extractFunction(src, "update");

  const guardPresent = GUARD_RE.test(updateSrc);
  if (!guardPresent) {
    throw new Error(
      "update() in index.html no longer contains the expected " +
        "'if (state !== STATE.PLAYING) return;' guard"
    );
  }
  if (opts.stripGuard) {
    updateSrc = updateSrc.replace(GUARD_RE, "/* guard stripped for test */");
  }

  // Preamble: declare the module-level bindings update() closes over, and
  // provide working (not inert) stubs for the helpers it calls PAST the guard.
  // The stubs are deliberately mutation-capable so that, with the guard
  // stripped, update() can actually change ball/paddle/bricks — otherwise the
  // negative control could not detect anything and the positive property would
  // be meaningless.
  const preamble = [
    '"use strict";',
    // State enum (mirror of index.html; ENTRY included so we can set a
    // non-PLAYING state). We inject our own rather than extract it so this
    // helper is independent of the enum's exact source text.
    'const STATE = { READY: "ready", PLAYING: "playing", PAUSED: "paused", ' +
      'ENTRY: "entry", OVER: "over", WIN: "win" };',
    "let state = STATE.ENTRY;",
    // Canvas dimensions and brick geometry (constants update() reads).
    "const W = 800, H = 600;",
    "const BRICK = { w: 60, h: 24 };",
    // Mutable physics/game bindings.
    "let keys = { left: false, right: false };",
    "let paddle = null;",
    "let ball = null;",
    "let bricks = [];",
    "let combo = 0;",
    "let destroyed = 0;",
    "let score = 0;",
    "let lives = 3;",
    "let totalBricks = 0;",
    // Helpers update() would invoke after the guard. All are mutation-capable
    // so an un-guarded update() produces observable change.
    "function circleRectHit() { return true; }",
    "function sfxPaddle() {}",
    "function sfxBrick() {}",
    "function spawnParticles() {}",
    "function setBallSpeed(v) { if (ball) ball.speed = v; }",
    "function resetBallOnPaddle() { if (ball && paddle) { ball.x = paddle.x; ball.y = paddle.y - 10; } }",
    "function launchBall() { if (ball) { ball.dx = 3; ball.dy = -3; } }",
    // endRound would normally route to ENTRY/OVER/WIN; here it just records the
    // reason and flips state so an un-guarded win/lose path is observable.
    "let endRoundReason = null;",
    "function endRound(reason) { endRoundReason = reason; state = STATE.OVER; }"
  ].join("\n");

  const accessors = [
    "function __get(name) {",
    "  switch (name) {",
    "    case 'state': return state;",
    "    case 'keys': return keys;",
    "    case 'paddle': return paddle;",
    "    case 'ball': return ball;",
    "    case 'bricks': return bricks;",
    "    case 'combo': return combo;",
    "    case 'destroyed': return destroyed;",
    "    case 'score': return score;",
    "    case 'lives': return lives;",
    "    case 'totalBricks': return totalBricks;",
    "    case 'endRoundReason': return endRoundReason;",
    "    default: throw new Error('unknown binding: ' + name);",
    "  }",
    "}",
    "function __set(name, value) {",
    "  switch (name) {",
    "    case 'state': state = value; break;",
    "    case 'keys': keys = value; break;",
    "    case 'paddle': paddle = value; break;",
    "    case 'ball': ball = value; break;",
    "    case 'bricks': bricks = value; break;",
    "    case 'combo': combo = value; break;",
    "    case 'destroyed': destroyed = value; break;",
    "    case 'score': score = value; break;",
    "    case 'lives': lives = value; break;",
    "    case 'totalBricks': totalBricks = value; break;",
    "    default: throw new Error('unknown binding: ' + name);",
    "  }",
    "}"
  ].join("\n");

  const exportNames = ["update", "STATE", "__get", "__set"];
  const program =
    preamble +
    "\n\n" +
    updateSrc +
    "\n\n" +
    accessors +
    "\n\nreturn { " + exportNames.join(", ") + " };\n";

  const factory = vm.runInNewContext("(function () {\n" + program + "\n})", {});
  const api = factory();

  return {
    update: api.update,
    STATE: api.STATE,
    get: api.__get,
    set: api.__set,
    setState: function (value) { api.__set("state", value); },
    guardPresent: guardPresent
  };
}

module.exports = { loadUpdate };
