"use strict";

// Feature: high-score-leaderboard, Property 4: Persistence round-trips a valid leaderboard
// Task 2.10 — Write property test for serialization round-trip
// **Validates: Requirements 1.3, 1.4, 6.4**
//
// Property 4 (design.md): For any leaderboard satisfying the invariants,
// deserializeLeaderboard(serializeLeaderboard(board)) produces a leaderboard
// equal to the original (same records in the same order).
//
// The pure core (serializeLeaderboard, deserializeLeaderboard, addRecord) lives
// inside the IIFE in index.html and is loaded without a DOM via the shared
// test helper.

const test = require("node:test");
const assert = require("node:assert/strict");
const fc = require("fast-check");

const {
  serializeLeaderboard,
  deserializeLeaderboard,
  addRecord
} = require("./helpers/load-pure-core.js");

// Arbitrary for a valid Score_Record: 3 uppercase A–Z initials and an integer
// score within the valid range [0, 999999999].
const recordArb = fc.record({
  initials: fc
    .array(fc.integer({ min: 0, max: 25 }), { minLength: 3, maxLength: 3 })
    .map((codes) => codes.map((c) => String.fromCharCode(65 + c)).join("")),
  score: fc.integer({ min: 0, max: 999999999 })
});

// Build an arbitrary leaderboard that satisfies the invariants by inserting a
// list of valid records one at a time through addRecord (the only producer that
// enforces descending order + the length bound). This guarantees the generated
// board is always ordered and length <= 10, matching the property's precondition.
const validBoardArb = fc
  .array(recordArb, { minLength: 0, maxLength: 25 })
  .map((recs) => recs.reduce((board, rec) => addRecord(board, rec), []));

test("Property 4: serialize -> deserialize round-trips a valid leaderboard", () => {
  fc.assert(
    fc.property(validBoardArb, (board) => {
      const roundTripped = deserializeLeaderboard(serializeLeaderboard(board));

      // Same number of records.
      assert.equal(roundTripped.length, board.length);

      // Same records, in the same order (compare initials + score positionally).
      for (let i = 0; i < board.length; i++) {
        assert.equal(roundTripped[i].initials, board[i].initials);
        assert.equal(roundTripped[i].score, board[i].score);
      }
    }),
    { numRuns: 200 }
  );
});
