"use strict";

// Feature: high-score-leaderboard, Property 3: Qualification predicate is correct across all branches
//
// Property-based test for Task 2.9.
// **Validates: Requirements 3.3, 3.4, 3.5**
//
// Design Property 3: For any leaderboard satisfying the invariants and any
// integer Final_Score, qualifies(board, finalScore) returns true exactly when
// the score is > 0 AND (board.length < MAX_RECORDS OR the score is strictly
// greater than the lowest record's score); and returns false for every score
// <= 0. For a full board the predicate is monotonic in the score: if a score
// qualifies, every larger score also qualifies.
//
// The pure core (qualifies, addRecord, MAX_RECORDS) is loaded from index.html
// without a DOM via test/helpers/load-pure-core.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const fc = require("fast-check");

const { qualifies, addRecord, MAX_RECORDS } = require("./helpers/load-pure-core.js");

// A generator for a single valid Score_Record: 3 uppercase letters + an integer
// score within the valid range. Scores are kept well below MAX_SCORE so tests
// can probe scores larger than any record without hitting the range bound.
const recordArb = fc.record({
  initials: fc
    .array(fc.integer({ min: 0, max: 25 }), { minLength: 3, maxLength: 3 })
    .map((idxs) => idxs.map((i) => String.fromCharCode(65 + i)).join("")),
  score: fc.integer({ min: 0, max: 1000000 })
});

// Build a valid leaderboard by inserting records one at a time through the real
// addRecord, so the ordering + length invariants always hold. `count` controls
// whether we exercise the empty, partial, or full (>= MAX_RECORDS) branches.
function boardFromRecords(records) {
  let board = [];
  for (const rec of records) board = addRecord(board, rec);
  return board;
}

// Reference specification of the predicate, straight from the acceptance
// criteria — intentionally independent of the implementation under test.
function expectedQualifies(board, finalScore) {
  if (!Number.isInteger(finalScore) || finalScore <= 0) return false; // Req 3.5
  if (board.length < MAX_RECORDS) return true; // Req 3.3
  return finalScore > board[board.length - 1].score; // Req 3.4
}

test("Property 3: qualifies matches the specification across all board sizes and scores", () => {
  fc.assert(
    fc.property(
      // Boards of 0..MAX_RECORDS+5 records exercise empty, partial, and full
      // (post-trim length exactly MAX_RECORDS) branches.
      fc.array(recordArb, { minLength: 0, maxLength: MAX_RECORDS + 5 }),
      fc.integer({ min: -1000, max: 2000000 }),
      (records, finalScore) => {
        const board = boardFromRecords(records);
        assert.equal(
          qualifies(board, finalScore),
          expectedQualifies(board, finalScore)
        );
      }
    ),
    { numRuns: 300 }
  );
});

test("Property 3: scores <= 0 never qualify, regardless of board state", () => {
  fc.assert(
    fc.property(
      fc.array(recordArb, { minLength: 0, maxLength: MAX_RECORDS + 5 }),
      fc.integer({ min: -1000000, max: 0 }),
      (records, nonPositive) => {
        const board = boardFromRecords(records);
        assert.equal(qualifies(board, nonPositive), false); // Req 3.5
      }
    ),
    { numRuns: 300 }
  );
});

test("Property 3: boundary at the lowest record's score on a full board", () => {
  fc.assert(
    fc.property(
      // Force a full board: at least MAX_RECORDS records so length === MAX_RECORDS.
      fc.array(recordArb, { minLength: MAX_RECORDS, maxLength: MAX_RECORDS + 5 }),
      (records) => {
        const board = boardFromRecords(records);
        assert.equal(board.length, MAX_RECORDS); // precondition: full board
        const lowest = board[board.length - 1].score;

        // Equal to the lowest score: not qualifying (Req 3.4), but only when
        // the lowest score is positive (a non-positive score fails Req 3.5
        // first). addRecord allows score 0, so guard the equality probe.
        if (lowest > 0) {
          assert.equal(qualifies(board, lowest), false);
        }
        // Strictly below the lowest: not qualifying when positive.
        if (lowest - 1 > 0) {
          assert.equal(qualifies(board, lowest - 1), false);
        }
        // Strictly above the lowest: qualifying (lowest + 1 is always > 0).
        assert.equal(qualifies(board, lowest + 1), true);
      }
    ),
    { numRuns: 300 }
  );
});

test("Property 3: on a full board qualification is monotonic in the score", () => {
  fc.assert(
    fc.property(
      fc.array(recordArb, { minLength: MAX_RECORDS, maxLength: MAX_RECORDS + 5 }),
      fc.integer({ min: -1000, max: 2000000 }),
      fc.integer({ min: 0, max: 2000000 }),
      (records, score, delta) => {
        const board = boardFromRecords(records);
        assert.equal(board.length, MAX_RECORDS); // full board
        // If a score qualifies, every larger (or equal) score also qualifies.
        if (qualifies(board, score)) {
          assert.equal(qualifies(board, score + delta), true);
        }
      }
    ),
    { numRuns: 300 }
  );
});
