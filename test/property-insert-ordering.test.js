"use strict";

// Feature: high-score-leaderboard, Property 1: Insert preserves descending order and the length bound
//
// Property-based test for Task 2.7.
// **Validates: Requirements 1.7, 2.1, 2.2, 2.3, 6.2**
//
// From design.md Property 1: For any leaderboard that already satisfies the
// invariants (descending by score, length <= 10) and any valid Score_Record,
// the result of addRecord(board, rec) is ordered by score non-increasing and
// has length in [0, 10]; when the input board already held 10 records, every
// record remaining in the result has a score >= the score that was dropped.

const test = require("node:test");
const assert = require("node:assert/strict");
const fc = require("fast-check");

const {
  MAX_RECORDS,
  MAX_SCORE,
  isValidRecord,
  addRecord
} = require("./helpers/load-pure-core.js");

// Generator for a single valid Score_Record: three A-Z initials and an integer
// score within [0, MAX_SCORE]. These are the records addRecord is expected to
// accept and insert.
const letter = fc.integer({ min: 0, max: 25 }).map((n) => String.fromCharCode(65 + n));
const initials = fc
  .tuple(letter, letter, letter)
  .map(([a, b, c]) => a + b + c);
const validRecord = fc.record({
  initials,
  score: fc.integer({ min: 0, max: MAX_SCORE })
});

// Generator for an arbitrary valid board: start from empty and insert a list of
// arbitrary valid records via addRecord. Because addRecord is the only producer
// and it enforces the order + length invariants, the resulting board always
// satisfies them (descending by score, length <= MAX_RECORDS). Using up to a
// few more than MAX_RECORDS records exercises both the under-full and the
// full-board (trim) regimes.
const validBoard = fc
  .array(validRecord, { minLength: 0, maxLength: MAX_RECORDS + 5 })
  .map((recs) => recs.reduce((board, rec) => addRecord(board, rec), []));

function isNonIncreasingByScore(board) {
  for (let i = 1; i < board.length; i++) {
    if (board[i - 1].score < board[i].score) return false;
  }
  return true;
}

test("Property 1: addRecord preserves descending order and the length bound", () => {
  fc.assert(
    fc.property(validBoard, validRecord, (board, rec) => {
      // Precondition: the generated board already satisfies the invariants.
      assert.ok(board.length <= MAX_RECORDS, "generated board exceeds MAX_RECORDS");
      assert.ok(isNonIncreasingByScore(board), "generated board is not ordered");
      assert.ok(isValidRecord(rec), "generated record is not valid");

      const wasFull = board.length === MAX_RECORDS;
      const result = addRecord(board, rec);

      // Length bound: result length is within [0, MAX_RECORDS]. (Req 2.1, 1.7)
      assert.ok(
        result.length >= 0 && result.length <= MAX_RECORDS,
        `result length ${result.length} out of [0, ${MAX_RECORDS}]`
      );

      // Ordering invariant: non-increasing by score. (Req 2.2, 2.3, 6.2)
      assert.ok(
        isNonIncreasingByScore(result),
        "result is not ordered by score non-increasing"
      );

      // Non-mutation: addRecord must not change the input board length.
      assert.equal(board.length, wasFull ? MAX_RECORDS : board.length);

      // Full-board drop guarantee: when the input already held MAX_RECORDS,
      // exactly one record is dropped (we inserted one, then trimmed back to
      // MAX_RECORDS), and every record remaining in the result has a score
      // >= the score that was dropped. (Req 2.1, 1.7)
      if (wasFull) {
        assert.equal(result.length, MAX_RECORDS, "full board must stay at MAX_RECORDS");

        // Determine which record was dropped. The candidate set is the input
        // board plus the inserted record; the trim removes the lowest-scored
        // tail element. Compute the dropped record's score as the minimum of
        // the combined candidates that is not reflected by the surviving tail.
        const combined = board.concat([rec]);
        // combined, when inserted in order, yields a sequence sorted
        // non-increasing; the dropped element is the one with the smallest
        // score among the MAX_RECORDS + 1 candidates.
        const droppedScore = combined.reduce(
          (min, r) => Math.min(min, r.score),
          Infinity
        );

        for (const r of result) {
          assert.ok(
            r.score >= droppedScore,
            `remaining record score ${r.score} < dropped score ${droppedScore}`
          );
        }
      }
    }),
    { numRuns: 300 }
  );
});
