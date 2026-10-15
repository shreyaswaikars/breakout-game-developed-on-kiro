"use strict";

// Feature: high-score-leaderboard, Property 11: Reset yields an empty leaderboard
//
// Property-based test for Task 7.2.
// **Validates: Requirements 9.6, 9.11**
//
// From design.md Property 11: For any leaderboard, performing the reset
// operation produces the empty leaderboard containing 0 Score_Records.
//
// The reset operation lives in handleReadyKey(e) inside the IIFE in index.html.
// When a Reset_Confirmation is pending (resetPending === true) and the player
// presses "y"/"Y", the handler clears the in-memory leaderboard to [], clears
// highlightedEntry, dismisses the confirmation (resetPending = false), and
// persists the empty board. We drive the REAL extracted handler (via the
// uniquely-named load-reset-controller helper) against a fake localStorage and
// assert the empty-board outcome holds for ANY starting leaderboard.

const test = require("node:test");
const assert = require("node:assert/strict");
const fc = require("fast-check");

const { loadResetController } = require("./helpers/load-reset-controller.js");

const EXPECTED_STORE_KEY = "brickBuster.leaderboard.v1";

// In-memory fake localStorage so the real saveLeaderboard has something to
// write to. getItem/setItem are the only methods the controller touches.
function makeFakeLocalStorage() {
  const store = new Map();
  return {
    store,
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    }
  };
}

// Generator for a single valid Score_Record: three A-Z initials and an integer
// score within [0, MAX_SCORE]. MAX_SCORE is 999,999,999.
const MAX_SCORE = 999999999;
const letter = fc.integer({ min: 0, max: 25 }).map((n) => String.fromCharCode(65 + n));
const initials = fc.tuple(letter, letter, letter).map(([a, b, c]) => a + b + c);
const validRecord = fc.record({
  initials,
  score: fc.integer({ min: 0, max: MAX_SCORE })
});

// Generator for an arbitrary valid board: start from empty and insert a list of
// arbitrary valid records via the REAL addRecord. Because addRecord is the only
// producer and it enforces the order + length invariants, the resulting board
// always satisfies them (descending by score, length <= MAX_RECORDS). We allow
// up to 14 records so full (10) and over-the-trim cases are exercised alongside
// the empty board.
function makeBoardArb(ctl) {
  return fc.array(validRecord, { minLength: 0, maxLength: 14 }).map((recs) => {
    let board = [];
    for (const rec of recs) board = ctl.addRecord(board, rec);
    return board;
  });
}

test.describe("Property 11: Reset yields an empty leaderboard (Req 9.6, 9.11)", () => {
  // A single confirm key ("Y" or "y") must empty the board regardless of what
  // the board held and regardless of case.
  for (const confirmKey of ["Y", "y"]) {
    test(`confirming the reset with "${confirmKey}" empties any leaderboard`, () => {
      const fake = makeFakeLocalStorage();
      const ctl = loadResetController(fake);
      const boardArb = makeBoardArb(ctl);

      fc.assert(
        fc.property(boardArb, (board) => {
          // Arrange: seed an arbitrary (invariant-respecting) leaderboard and
          // open the Reset_Confirmation, as the READY screen would after "R".
          ctl.set("leaderboard", board);
          ctl.set("resetPending", true);
          // Give highlightedEntry a non-null value so clearing it is observable.
          ctl.set("highlightedEntry", board.length > 0 ? board[0] : { initials: "ZZZ", score: 1 });

          // Act: the player confirms the reset.
          const handled = ctl.handleReadyKey({ key: confirmKey });

          // Assert (Req 9.6, 9.11): the leaderboard now contains 0 records.
          const after = ctl.get("leaderboard");
          assert.ok(Array.isArray(after), "leaderboard should still be an array");
          assert.equal(after.length, 0, "reset must leave 0 Score_Records");

          // The confirmation is dismissed and the highlight is cleared, and the
          // handler reports it consumed the key.
          assert.equal(ctl.get("resetPending"), false, "confirmation should be dismissed");
          assert.equal(ctl.get("highlightedEntry"), null, "highlighted entry should be cleared");
          assert.equal(handled, true, "handleReadyKey should report it handled the confirm key");

          // A successful save persisted the empty board under the single key.
          assert.equal(
            fake.store.get(EXPECTED_STORE_KEY),
            "[]",
            "the empty board should be persisted under the single STORE_KEY"
          );
        }),
        { numRuns: 150 }
      );
    });
  }
});
