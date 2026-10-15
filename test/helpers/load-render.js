"use strict";

// Test helper: load the REAL rendering functions `render()` and
// `drawLeaderboard()` from index.html WITHOUT a DOM, so Task 10.5 can assert
// what the shipping source draws via spies on `glowText` / `drawLeaderboard`.
//
// Task 10.5 — Write unit tests for rendering via render-helper spies.
//
// Why this exists (and why it is a separate, uniquely-named helper):
//   `render()` and `drawLeaderboard()` are large STATEFUL functions inside the
//   IIFE in index.html. They are NOT published through the `module.exports`
//   guard (only the pure core is), and they close over a big cluster of
//   module-level bindings and sibling helper functions:
//     drawing helpers : glowText, drawCenterText, drawBricks, drawParticles,
//                       drawPaddle, drawBall, drawHUD, drawScanlines,
//                       drawPauseOverlay, drawLeaderboard
//     canvas / consts : ctx, THEME, W, H
//     mutable state   : state, leaderboard, highlightedEntry, resetPending,
//                       statusMessage, entry, score
//     state enum      : STATE
//
//   Duplicating render()/drawLeaderboard() into the test would break
//   index.html as the single source of truth. Instead we slice the REAL
//   function text out of index.html by name (balanced-brace extraction, the
//   same technique used by load-update.js / load-entry-controller.js /
//   load-reset-flow.js) and evaluate it in an isolated vm context. We also
//   extract the REAL `THEME` const object so color assertions compare against
//   the exact shipping THEME.cyan / THEME.yellow / THEME.dim / THEME.pink —
//   keeping THEME single-source-of-truth rather than mirroring its values here.
//
//   Everything render() does NOT need in order to exercise the leaderboard /
//   entry drawing paths is replaced by a controllable environment:
//     - `glowText` and `drawCenterText` are SPIES that record their args
//       instead of touching a canvas. glowText records
//       { text, x, y, color, font, blur }.
//     - the other draw* helpers (drawBricks, drawParticles, drawPaddle,
//       drawBall, drawHUD, drawScanlines, drawPauseOverlay) are recording
//       no-op stubs — unrelated to leaderboard rendering, so stubbing them is
//       safe and keeps the harness DOM-free.
//     - `ctx` is a tolerant Proxy: every method is a no-op function and every
//       property assignment (fillStyle, font, textAlign, shadowBlur, ...) is
//       accepted and ignored.
//     - `W` / `H` are injected (800 / 600).
//
//   The module-level mutable bindings are declared ONCE inside the same
//   program so the extracted render()/drawLeaderboard() close over the SAME
//   state/leaderboard/highlightedEntry/... that our accessors read and write.
//
//   For the drawLeaderboard-focused tests we use the REAL extracted
//   drawLeaderboard (to assert the rank + initials + score rows and the one
//   THEME.yellow highlighted row). For the render()-branch tests the caller can
//   instead install a SPY drawLeaderboard (loadRender({ spyDrawLeaderboard:
//   true })) so render() invocations can be observed by argument.
//
//   This helper does not touch any of the other test/helpers/* loaders.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const INDEX_HTML = path.join(__dirname, "..", "..", "index.html");

function readIndexSource() {
  return fs.readFileSync(INDEX_HTML, "utf8");
}

// Extract a `const NAME = { ... };` object declaration by balancing braces from
// the first `{` after the `=`. THEME is a simple const object; this keeps it as
// the single source of truth for color values.
function extractConstObject(src, name) {
  const sigRe = new RegExp("const\\s+" + name + "\\s*=\\s*\\{");
  const m = sigRe.exec(src);
  if (!m) {
    throw new Error(
      "Could not find const object declaration for '" + name + "' in index.html"
    );
  }
  const braceStart = m.index + m[0].length - 1; // index of the opening `{`
  let i = braceStart + 1;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  if (depth !== 0) {
    throw new Error("Unbalanced braces while extracting const object '" + name + "'");
  }
  // Return just the object literal text, e.g. "{ bg: ..., cyan: ... }".
  return src.slice(braceStart, i);
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

// Build the rendering environment.
//
// opts.spyDrawLeaderboard : when true, install a recording SPY in place of the
//   real drawLeaderboard (used by render()-branch tests). When false/omitted,
//   the REAL extracted drawLeaderboard is used (used by drawLeaderboard tests).
//
// Returns:
//   - render()                 : the real extracted render
//   - drawLeaderboard(...)      : the real extracted drawLeaderboard (always
//                                 returned so drawLeaderboard tests can call it
//                                 directly even when render() uses a spy)
//   - THEME                     : the real extracted THEME object
//   - STATE                     : the state enum
//   - glowCalls                 : array of { text, x, y, color, font, blur }
//   - drawLeaderboardCalls      : array of { board, x, topY, opts } (populated
//                                 only when spyDrawLeaderboard is true)
//   - drawCalls                 : { name -> count } for the stubbed draw helpers
//   - resetSpies()              : clear glowCalls / drawLeaderboardCalls / drawCalls
//   - get(name) / set(name, v)  : accessors for the module-level bindings
//                                 (state, leaderboard, highlightedEntry,
//                                  resetPending, statusMessage, entry, score)
function loadRender(opts) {
  opts = opts || {};
  const src = readIndexSource();

  const themeLiteral = extractConstObject(src, "THEME");
  const renderSrc = extractFunction(src, "render");
  const drawLeaderboardSrc = extractFunction(src, "drawLeaderboard");

  // Preamble: THEME (real), canvas dims, STATE enum, module-level mutable
  // bindings, the tolerant ctx Proxy, the spy glowText/drawCenterText, and the
  // recording no-op draw* stubs render() calls at the top.
  const preamble = [
    '"use strict";',
    "const THEME = " + themeLiteral + ";",
    "const W = 800, H = 600;",
    // Mirror index.html's STATE enum (we inject our own so the helper does not
    // depend on the exact source text of the enum).
    'const STATE = { READY: "ready", PLAYING: "playing", PAUSED: "paused", ' +
      'ENTRY: "entry", OVER: "over", WIN: "win" };',
    // Module-level mutable bindings render()/drawLeaderboard() close over.
    "let state = STATE.READY;",
    "let leaderboard = [];",
    "let highlightedEntry = null;",
    "let resetPending = false;",
    "let statusMessage = null;",
    'let entry = { chars: ["A", "A", "A"], cursor: 0 };',
    "let score = 0;",
    // Tolerant canvas stub: any method call is a no-op, any property set is
    // accepted and ignored. A Proxy makes this robust to whatever ctx surface
    // render() happens to touch.
    "const __ctxTarget = {};",
    "const ctx = new Proxy(__ctxTarget, {",
    "  get(target, prop) {",
    "    if (prop in target) return target[prop];",
    "    return function () {};", // no-op for any method (save, fillRect, ...)
    "  },",
    "  set(target, prop, value) { target[prop] = value; return true; }",
    "});",
    // Spies: record calls instead of drawing.
    "const glowCalls = [];",
    "function glowText(text, x, y, color, font, blur) {",
    "  glowCalls.push({ text: text, x: x, y: y, color: color, font: font, blur: blur });",
    "}",
    "const drawCenterCalls = [];",
    "function drawCenterText(lines) { drawCenterCalls.push(lines); }",
    // Recording no-op stubs for the unrelated top-of-render draw helpers.
    "const drawCalls = Object.create(null);",
    "function __rec(name) { drawCalls[name] = (drawCalls[name] || 0) + 1; }",
    "function drawBricks() { __rec('drawBricks'); }",
    "function drawParticles() { __rec('drawParticles'); }",
    "function drawPaddle() { __rec('drawPaddle'); }",
    "function drawBall() { __rec('drawBall'); }",
    "function drawHUD() { __rec('drawHUD'); }",
    "function drawScanlines() { __rec('drawScanlines'); }",
    "function drawPauseOverlay() { __rec('drawPauseOverlay'); }"
  ].join("\n");

  // drawLeaderboard: the real extracted one is ALWAYS defined (as
  // __realDrawLeaderboard). When spyDrawLeaderboard is requested, the name
  // `drawLeaderboard` that render() closes over is bound to a recording spy;
  // otherwise it is bound to the real function.
  const drawLeaderboardReal =
    drawLeaderboardSrc.replace(
      /function\s+drawLeaderboard\s*\(/,
      "function __realDrawLeaderboard("
    );

  const drawLeaderboardCallsDecl = "const drawLeaderboardCalls = [];";
  const drawLeaderboardBinding = opts.spyDrawLeaderboard
    ? "function drawLeaderboard(board, x, topY, opts) {\n" +
      "  drawLeaderboardCalls.push({ board: board, x: x, topY: topY, opts: opts });\n" +
      "}"
    : "function drawLeaderboard(board, x, topY, opts) {\n" +
      "  drawLeaderboardCalls.push({ board: board, x: x, topY: topY, opts: opts });\n" +
      "  return __realDrawLeaderboard(board, x, topY, opts);\n" +
      "}";

  const accessors = [
    "function __get(name) {",
    "  switch (name) {",
    "    case 'state': return state;",
    "    case 'leaderboard': return leaderboard;",
    "    case 'highlightedEntry': return highlightedEntry;",
    "    case 'resetPending': return resetPending;",
    "    case 'statusMessage': return statusMessage;",
    "    case 'entry': return entry;",
    "    case 'score': return score;",
    "    default: throw new Error('unknown binding: ' + name);",
    "  }",
    "}",
    "function __set(name, value) {",
    "  switch (name) {",
    "    case 'state': state = value; break;",
    "    case 'leaderboard': leaderboard = value; break;",
    "    case 'highlightedEntry': highlightedEntry = value; break;",
    "    case 'resetPending': resetPending = value; break;",
    "    case 'statusMessage': statusMessage = value; break;",
    "    case 'entry': entry = value; break;",
    "    case 'score': score = value; break;",
    "    default: throw new Error('unknown binding: ' + name);",
    "  }",
    "}",
    "function __resetSpies() {",
    "  glowCalls.length = 0;",
    "  drawLeaderboardCalls.length = 0;",
    "  drawCenterCalls.length = 0;",
    "  for (const k of Object.keys(drawCalls)) delete drawCalls[k];",
    "}",
    // Expose the real drawLeaderboard directly so drawLeaderboard tests can
    // call it without going through render()'s binding/spy wrapper.
    "function __callRealDrawLeaderboard(board, x, topY, opts) {",
    "  return __realDrawLeaderboard(board, x, topY, opts);",
    "}"
  ].join("\n");

  const exportNames = [
    "render",
    "THEME",
    "STATE",
    "glowCalls",
    "drawLeaderboardCalls",
    "drawCenterCalls",
    "drawCalls",
    "__get",
    "__set",
    "__resetSpies",
    "__callRealDrawLeaderboard"
  ];

  const program =
    preamble +
    "\n\n" +
    drawLeaderboardReal +
    "\n\n" +
    drawLeaderboardCallsDecl +
    "\n" +
    drawLeaderboardBinding +
    "\n\n" +
    renderSrc +
    "\n\n" +
    accessors +
    "\n\nreturn { " + exportNames.join(", ") + " };\n";

  // `Date` is used by render()'s READY branch (Date.now()). It is available on
  // the vm global by default, but inject it explicitly to be safe/deterministic.
  const sandbox = { Date: Date };
  const factory = vm.runInNewContext("(function () {\n" + program + "\n})", sandbox);
  const api = factory();

  return {
    render: api.render,
    // Always expose the real drawLeaderboard for the drawLeaderboard tests.
    drawLeaderboard: api.__callRealDrawLeaderboard,
    THEME: api.THEME,
    STATE: api.STATE,
    glowCalls: api.glowCalls,
    drawLeaderboardCalls: api.drawLeaderboardCalls,
    drawCenterCalls: api.drawCenterCalls,
    drawCalls: api.drawCalls,
    get: api.__get,
    set: api.__set,
    resetSpies: api.__resetSpies
  };
}

module.exports = { loadRender };
