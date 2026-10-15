"use strict";

// Feature: high-score-leaderboard, Property 2: Equal scores keep insertion order
//
// Property-based test for Task 2.8.
// **Validates: Requirements 2.4**
//
// Property 2 (design.md): For any sequence of valid Score_Records that share
// the same score, inserting them one at a time with `addRecord` leaves them in
// insertion order relative to one another within the resulting leaderboard
// (earlier-added ranked ahead of later-added).
//
// The pure logic (addRecord, MAX_RECORDS) lives inside the IIFE in index.html;
// it is loaded without a DOM through test/helpers/load-pure-core.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const fc = require("fast-check");

const { addRecord, MAX_RECORDS } = require("./helpers/load-pure-core.js");

// A distinct initials generator: three uppercase letters. We tag each record
// with a monotonically increasing `seq` so we can track insertion identity even
// when two records happen to generate the same initials string.
const initialsArb = fc
  .array(fc.integer({ min: 0, max: 25 }), { minLength: 3, maxLength: 3 })
  .map((idxs) => idxs.map((i) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i]).join(""));

test.describe("Property 2: equal scores keep insertion order", () => {
  // Core property: all records share ONE score. After inserting them one at a
  // time, their relative order in the result must match insertion order.
  // Count stays within MAX_RECORDS so none are trimmed.
  test("equal-scored records retain insertion order (within bound)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 999999999 }),
        fc.array(initialsArb, { minLength: 1, maxLength: MAX_RECORDS }),
        (sharedScore, initialsList) => {
          // Build records tagged with insertion sequence for identity tracking.
          const records = initialsList.map((initials, seq) => ({
            initials,
            score: sharedScore,
            seq,
          }));

          let board = [];
          for (const rec of records) {
            board = addRecord(board, rec);
          }

          // No trimming expected here.
          assert.equal(board.length, records.length);

          // Every record present, in insertion (seq) order.
          const seqs = board.map((r) => r.seq);
          const expected = records.map((r) => r.seq);
          assert.deepEqual(seqs, expected);
        }
      ),
      { numRuns: 300 }
    );
  });

  // Trimming case: insert MORE equal-scored records than MAX_RECORDS. The first
  // MAX_RECORDS inserted (earliest) survive in insertion order; later-added
  // ones are dropped once the board is full, because a new equal-scored record
  // lands at the tail and is immediately trimmed off.
  test("equal-scored records beyond the bound are trimmed, keeping the earliest in order", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 999999999 }),
        fc.array(initialsArb, { minLength: MAX_RECORDS + 1, maxLength: MAX_RECORDS + 20 }),
        (sharedScore, initialsList) => {
          const records = initialsList.map((initials, seq) => ({
            initials,
            score: sharedScore,
            seq,
          }));

          let board = [];
          for (const rec of records) {
            board = addRecord(board, rec);
          }

          // Board is capped at MAX_RECORDS.
          assert.equal(board.length, MAX_RECORDS);

          // The survivors are exactly the first MAX_RECORDS inserted, in order.
          const seqs = board.map((r) => r.seq);
          const expected = records.slice(0, MAX_RECORDS).map((r) => r.seq);
          assert.deepEqual(seqs, expected);
        }
      ),
      { numRuns: 300 }
    );
  });

  // Mixed scores: equal-scored records interleaved with higher/lower scores.
  // Among any group of records sharing a score, insertion order must still be
  // preserved relative to one another in the final board.
  test("equal-scored subgroups keep insertion order among mixed scores", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            initials: initialsArb,
            score: fc.integer({ min: 1, max: 1000 }),
          }),
          { minLength: 1, maxLength: MAX_RECORDS }
        ),
        (recs) => {
          const records = recs.map((r, seq) => ({ ...r, seq }));

          let board = [];
          for (const rec of records) {
            board = addRecord(board, rec);
          }

          // No trimming (<= MAX_RECORDS inserted), so all records are present.
          assert.equal(board.length, records.length);

          // For each distinct score, the seq values of records with that score
          // must appear in ascending (insertion) order within the board.
          const byScore = new Map();
          for (const r of board) {
            if (!byScore.has(r.score)) byScore.set(r.score, []);
            byScore.get(r.score).push(r.seq);
          }
          for (const [, seqs] of byScore) {
            const sorted = seqs.slice().sort((a, b) => a - b);
            assert.deepEqual(seqs, sorted);
          }
        }
      ),
      { numRuns: 300 }
    );
  });
});
