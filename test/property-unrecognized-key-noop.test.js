"use strict";

// Feature: high-score-leaderboard, Property 9: Non-recognized entry keys leave entry state unchanged
// Task 5.8 — Write property test for unrecognized-key no-op
// **Validates: Requirements 5.9**
//
// Property 9 (design.md): For any key that is neither an A–Z letter, an arrow
// key, nor Space, applying it in the Entry_State leaves both the Initials
// characters and the Initial_Cursor unchanged.
//
// Contract of the pure reducer under test (from index.html):
//   applyEntryKey({ chars, cursor }, { key }) -> { chars, cursor }  (+ confirm
//   on Space). Recognized keys are "ArrowUp"/"ArrowDown"/"ArrowLeft"/
//   "ArrowRight", any single A–Z/a–z letter, and " "/"Space". Everything else
//   is unrecognized and must be a no-op: the returned chars deep-equal the
//   input chars, the returned cursor equals the input cursor, and no `confirm`
//   flag is set.
//
// The pure reducer lives inside the IIFE in index.html and is loaded without a
// DOM via a dedicated extraction helper (so no existing shared helper or test
// file is modified).

const test = require("node:test");
const assert = require("node:assert/strict");
const fc = require("fast-check");

const { applyEntryKey } = require("./helpers/load-entry-reducer-noop.js");

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// The exact set of recognized non-letter keys.
const RECOGNIZED_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  " ",
  "Space"
]);

// A key is recognized when it is one of the arrow/space keys above OR a single
// A–Z / a–z letter. Everything else is unrecognized and must be a no-op.
function isRecognizedKey(key) {
  if (typeof key !== "string") return false;
  if (RECOGNIZED_KEYS.has(key)) return true;
  return /^[a-zA-Z]$/.test(key);
}

// Arbitrary initial entry state: chars = 3 single A–Z letters, cursor in [0,2].
const letterArb = fc
  .integer({ min: 0, max: 25 })
  .map((i) => LETTERS[i]);

const entryStateArb = fc.record({
  chars: fc.tuple(letterArb, letterArb, letterArb).map((t) => t.slice()),
  cursor: fc.integer({ min: 0, max: 2 })
});

// Arbitrary UNRECOGNIZED key. We generate a broad pool of candidate strings —
// named keys, digits, punctuation, multi-char strings, empty string — then
// filter out everything the reducer recognizes (arrows, Space, single letters).
const candidateKeyArb = fc.oneof(
  // Common named keys that are NOT recognized.
  fc.constantFrom(
    "Enter",
    "Escape",
    "Tab",
    "Backspace",
    "Delete",
    "Shift",
    "Control",
    "Alt",
    "Meta",
    "CapsLock",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Insert",
    "F1",
    "ArrowUpLeft", // close to a recognized key but not equal
    "Spacebar", // not the recognized "Space"/" " token
    "space" // lowercase, not recognized
  ),
  // Digits and punctuation (single characters that aren't letters).
  fc.constantFrom("0", "1", "9", "!", "@", "#", "-", "+", ".", ",", "/", "~", "`"),
  // Multi-character strings like "ab" (two letters is NOT a single letter).
  fc.constantFrom("ab", "AB", "Zz", "aa", "zzz", "A1", "1A"),
  // Arbitrary strings from the full unicode-ish space.
  fc.string(),
  // Empty string (not a recognized key).
  fc.constant("")
);

// Keep only unrecognized keys.
const unrecognizedKeyArb = candidateKeyArb.filter((k) => !isRecognizedKey(k));

test("Property 9: unrecognized keys leave chars and cursor unchanged (no confirm)", () => {
  fc.assert(
    fc.property(entryStateArb, unrecognizedKeyArb, (entryState, key) => {
      const before = {
        chars: entryState.chars.slice(),
        cursor: entryState.cursor
      };

      const result = applyEntryKey(entryState, { key: key });

      // chars unchanged (deep equal) and cursor unchanged.
      assert.deepEqual(result.chars, before.chars);
      assert.equal(result.cursor, before.cursor);

      // No confirm signal for an unrecognized key.
      assert.ok(
        !result.confirm,
        `unrecognized key ${JSON.stringify(key)} should not set confirm`
      );

      // The reducer must not mutate the input entry state.
      assert.deepEqual(entryState.chars, before.chars);
      assert.equal(entryState.cursor, before.cursor);
    }),
    { numRuns: 300 }
  );
});

test("Property 9: a key descriptor with no `key` property is a no-op", () => {
  fc.assert(
    fc.property(entryStateArb, (entryState) => {
      const before = {
        chars: entryState.chars.slice(),
        cursor: entryState.cursor
      };
      const result = applyEntryKey(entryState, {});
      assert.deepEqual(result.chars, before.chars);
      assert.equal(result.cursor, before.cursor);
      assert.ok(!result.confirm);
    }),
    { numRuns: 100 }
  );
});
