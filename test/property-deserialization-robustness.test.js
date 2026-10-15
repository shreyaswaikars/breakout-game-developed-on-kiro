"use strict";

// Feature: high-score-leaderboard, Property 5: Deserialization of non-leaderboard input yields a valid board
//
// Property-based test for Task 2.11.
// **Validates: Requirements 1.2, 1.3**
//
// From design.md Property 5: For any string (including arbitrary/corrupt text,
// non-array JSON, and arrays containing malformed records),
// deserializeLeaderboard returns a leaderboard that satisfies the invariants
// (descending order, length <= 10, all records valid), returning the empty
// leaderboard when the input is not a parseable array of valid records.

const test = require("node:test");
const assert = require("node:assert/strict");
const fc = require("fast-check");

const {
  MAX_RECORDS,
  MAX_SCORE,
  isValidRecord,
  deserializeLeaderboard
} = require("./helpers/load-pure-core.js");

// Shared invariant check: a leaderboard is valid when every record passes
// isValidRecord, it is ordered by score non-increasing, and its length is
// within [0, MAX_RECORDS].
//
// Note: deserializeLeaderboard runs in a separate VM realm (see
// load-pure-core.js), so the arrays it returns have that realm's
// Array.prototype. We therefore check array-ness via length/structure rather
// than host-realm identity (Array.isArray and deepEqual against a host []
// would be realm-sensitive).
function assertValidBoard(board, context) {
  assert.ok(
    board != null && typeof board.length === "number",
    `${context}: result is not array-like`
  );
  assert.ok(
    board.length >= 0 && board.length <= MAX_RECORDS,
    `${context}: length ${board.length} out of [0, ${MAX_RECORDS}]`
  );
  for (const rec of board) {
    assert.ok(isValidRecord(rec), `${context}: result contains an invalid record`);
  }
  for (let i = 1; i < board.length; i++) {
    assert.ok(
      board[i - 1].score >= board[i].score,
      `${context}: result is not ordered by score non-increasing`
    );
  }
}

// Assert a board is the empty leaderboard without being sensitive to the VM
// realm the array came from (deepEqual against a host [] compares prototypes).
function assertEmptyBoard(board, message) {
  assert.ok(board != null && typeof board.length === "number", `${message} (not array-like)`);
  assert.equal(board.length, 0, message);
}

// --- Generators ---------------------------------------------------------

// A single valid Score_Record: three A-Z initials and an integer score in
// [0, MAX_SCORE]. Used inside mixed arrays so some records survive filtering.
const letter = fc.integer({ min: 0, max: 25 }).map((n) => String.fromCharCode(65 + n));
const initials = fc.tuple(letter, letter, letter).map(([a, b, c]) => a + b + c);
const validRecord = fc.record({
  initials,
  score: fc.integer({ min: 0, max: MAX_SCORE })
});

// Malformed records: objects/values that must be rejected by isValidRecord.
// Covers bad initials (lowercase, wrong length, non-string), bad scores
// (negative, non-integer, over MAX_SCORE, non-number), and non-object entries.
const malformedRecord = fc.oneof(
  fc.record({ initials: fc.string(), score: fc.integer() }),
  fc.record({ initials, score: fc.double() }),
  fc.record({ initials, score: fc.integer({ min: MAX_SCORE + 1 }) }),
  fc.record({ initials, score: fc.integer({ max: -1 }) }),
  fc.record({ initials: fc.constant("ab"), score: fc.integer({ min: 0, max: MAX_SCORE }) }),
  fc.record({ initials: fc.constant("ABCD"), score: fc.integer({ min: 0, max: MAX_SCORE }) }),
  fc.record({ score: fc.integer() }),
  fc.record({ initials }),
  fc.integer(),
  fc.string(),
  fc.boolean(),
  fc.constant(null),
  fc.constant({})
);

// Arbitrary strings: free-form text that is usually not valid JSON at all,
// exercising the JSON.parse try/catch path.
const arbitraryString = fc.string();

// JSON of non-array values: numbers, objects, strings, booleans, null. These
// parse successfully but are not arrays, so deserialize must return [].
const nonArrayJson = fc
  .oneof(
    fc.integer(),
    fc.double({ noNaN: true }),
    fc.string(),
    fc.boolean(),
    fc.constant(null),
    fc.object(),
    fc.record({ initials, score: fc.integer({ min: 0, max: MAX_SCORE }) })
  )
  .map((v) => JSON.stringify(v));

// JSON arrays mixing valid and malformed records. The valid subset should
// survive (re-ordered/trimmed); the malformed entries should be filtered out.
const mixedArrayJson = fc
  .array(fc.oneof(validRecord, malformedRecord), { maxLength: MAX_RECORDS + 8 })
  .map((arr) => JSON.stringify(arr));

// --- Properties ---------------------------------------------------------

test("Property 5: deserialize of arbitrary strings always yields a valid board", () => {
  fc.assert(
    fc.property(arbitraryString, (text) => {
      const board = deserializeLeaderboard(text);
      assertValidBoard(board, "arbitrary string");
    }),
    { numRuns: 200 }
  );
});

test("Property 5: deserialize of non-array JSON yields the empty board", () => {
  fc.assert(
    fc.property(nonArrayJson, (text) => {
      const board = deserializeLeaderboard(text);
      // Non-array (but parseable) input is not a leaderboard: must be []. (Req 1.3)
      assertEmptyBoard(board, "non-array JSON must deserialize to []");
    }),
    { numRuns: 200 }
  );
});

test("Property 5: deserialize of mixed valid/malformed arrays yields a valid board", () => {
  fc.assert(
    fc.property(mixedArrayJson, (text) => {
      const board = deserializeLeaderboard(text);
      // Even when the array mixes malformed records, the result keeps only the
      // valid ones and stays ordered/trimmed. (Req 1.3)
      assertValidBoard(board, "mixed array");
    }),
    { numRuns: 200 }
  );
});

test("Property 5: unparseable input returns the empty board", () => {
  // Strings that are never valid JSON exercise the JSON.parse catch path
  // explicitly, independent of fast-check's random strings. (Req 1.2, 1.3)
  const unparseable = fc
    .string()
    .filter((s) => {
      try {
        JSON.parse(s);
        return false;
      } catch (_) {
        return true;
      }
    });
  fc.assert(
    fc.property(unparseable, (text) => {
      assertEmptyBoard(
        deserializeLeaderboard(text),
        "unparseable input must deserialize to []"
      );
    }),
    { numRuns: 100 }
  );
});
