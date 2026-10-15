"use strict";

// Test helper: load the pure initials-entry reducer from index.html WITHOUT a
// DOM, ahead of Task 5.5 wiring `applyEntryKey` into the shared pure-core
// export.
//
// Why this exists separately from load-pure-core.js:
//   `applyEntryKey` already lives inside the IIFE in index.html, but it is not
//   yet published through the `module.exports` guard (that is Task 5.5) and so
//   it is not yet exposed by the shared load-pure-core helper. Rather than
//   duplicate the reducer's logic into a test — which would break index.html as
//   the single source of truth — this helper slices the real `applyEntryKey`
//   declaration (and its dependencies `cycleLetter` and `LETTERS`) out of
//   index.html by name and evaluates just those in an isolated vm context with
//   no DOM. It uses the identical extraction technique as load-pure-core.js.
//
//   Once Task 5.5 adds `applyEntryKey` to the shared export, these property
//   tests can switch to require("./load-pure-core.js") and this helper can be
//   retired.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const INDEX_HTML = path.join(__dirname, "..", "..", "index.html");

// Pure declarations to lift out of the IIFE, in dependency order. `LETTERS` and
// `cycleLetter` are the dependencies of `applyEntryKey`; each is matched from
// the index.html source by name so the extracted code is the real shipping
// implementation rather than a copy.
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
