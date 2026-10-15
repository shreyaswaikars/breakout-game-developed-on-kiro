"use strict";

// Feature: high-score-leaderboard
// Task 6.4 — Write unit tests for end-of-round routing.
// Requirements: 3.1, 3.2, 3.6, 3.7, 4.1, 4.6, 6.6
//
// These example/edge-case tests drive the REAL endRound(reason) routing from
// index.html (extracted via test/helpers/load-end-round.js — see that file for
// why the sound effects are stubbed and how the module-level bindings are
// shared). They assert:
//   - a non-qualifying score routes straight to OVER / WIN without entering
//     ENTRY (Req 3.1, 3.2, 3.7, 4.6),
//   - a qualifying score routes into ENTRY and records endingReason (Req 3.6,
//     4.1), and
//   - after confirmEntry() the game restores the correct terminal state from
//     endingReason (Req 6.6).

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEndRound } = require("./helpers/load-end-round.js");

// Build a full (10-record) leaderboard whose lowest score is `lowest`, in
// descending order, so we can exercise the "full board, not qualifying" branch
// of qualifies().
function fullBoard(lowest) {
  const board = [];
  for (let i = 0; i < 10; i++) {
    // Scores strictly descending; the 10th (last) record is the lowest.
    board.push({ initials: "AAA", score: lowest + (9 - i) * 10 });
  }
  return board;
}

test("endRound('over') with a non-qualifying score (empty board, score 0) -> OVER, not ENTRY", () => {
  const g = loadEndRound();
  g.set("leaderboard", []);
  g.set("score", 0); // score <= 0 never qualifies (Req 3.5)

  g.endRound("over");

  // Req 3.7 / 4.6: not qualifying -> terminal state directly, no ENTRY.
  assert.equal(g.get("state"), g.STATE.OVER);
  assert.notEqual(g.get("state"), g.STATE.ENTRY);
  // endingReason is still recorded (Req 3.1).
  assert.equal(g.get("endingReason"), "over");
});

test("endRound('over') with a non-qualifying score on a FULL board (score <= lowest) -> OVER", () => {
  const g = loadEndRound();
  const board = fullBoard(500); // lowest retained score is 500
  g.set("leaderboard", board);
  g.set("score", 500); // equal to the lowest -> not strictly greater (Req 3.4)

  g.endRound("over");

  assert.equal(g.get("state"), g.STATE.OVER);
  assert.notEqual(g.get("state"), g.STATE.ENTRY);
  // The board is left unchanged (no record added for a non-qualifying score).
  assert.equal(g.get("leaderboard").length, 10);
});

test("endRound('win') with a non-qualifying score -> WIN, not ENTRY", () => {
  const g = loadEndRound();
  g.set("leaderboard", []);
  g.set("score", 0);

  g.endRound("win");

  // Req 3.7 / 4.6: not qualifying -> WIN directly.
  assert.equal(g.get("state"), g.STATE.WIN);
  assert.notEqual(g.get("state"), g.STATE.ENTRY);
  assert.equal(g.get("endingReason"), "win");
});

test("endRound('over') with a qualifying score (empty board, score > 0) -> ENTRY, endingReason 'over'", () => {
  const g = loadEndRound();
  g.set("leaderboard", []); // length < 10 -> any score > 0 qualifies (Req 3.3)
  g.set("score", 1234);

  g.endRound("over");

  // Req 3.6 / 4.1: qualifying -> ENTRY (via beginEntry).
  assert.equal(g.get("state"), g.STATE.ENTRY);
  // Req 6.6 setup: endingReason preserved so the terminal state can be restored.
  assert.equal(g.get("endingReason"), "over");
  // beginEntry() reset the entry buffer (Req 4.4).
  // NOTE: objects/arrays created inside the vm realm carry that realm's
  // prototypes, so deepStrictEqual's reference-equal prototype check fails
  // across the boundary. Compare the primitive contents instead.
  assert.deepEqual([...g.get("entry").chars], ["A", "A", "A"]);
  assert.equal(g.get("entry").cursor, 0);
});

test("endRound('win') with a qualifying score -> ENTRY, endingReason 'win'", () => {
  const g = loadEndRound();
  const board = fullBoard(500); // lowest is 500
  g.set("leaderboard", board);
  g.set("score", 100000); // strictly greater than the lowest -> qualifies (Req 3.4)

  g.endRound("win");

  assert.equal(g.get("state"), g.STATE.ENTRY);
  assert.equal(g.get("endingReason"), "win");
});

test("round-trip: endRound('over') -> ENTRY -> confirmEntry() restores OVER (Req 6.6)", () => {
  const g = loadEndRound();
  g.set("leaderboard", []);
  g.set("score", 4242);

  g.endRound("over");
  assert.equal(g.get("state"), g.STATE.ENTRY);

  // Player picks initials, then confirms.
  g.get("entry").chars = ["Z", "X", "Y"];
  g.confirmEntry();

  // Req 6.6: endingReason "over" restores the OVER terminal state.
  assert.equal(g.get("state"), g.STATE.OVER);
  // The confirmed record was added and highlighted (sanity on the restore path).
  const board = g.get("leaderboard");
  assert.equal(board.length, 1);
  assert.equal(board[0].initials, "ZXY");
  assert.equal(board[0].score, 4242);
  assert.equal(g.get("highlightedEntry"), board[0]);
});

test("round-trip: endRound('win') -> ENTRY -> confirmEntry() restores WIN (Req 6.6)", () => {
  const g = loadEndRound();
  g.set("leaderboard", []);
  g.set("score", 777);

  g.endRound("win");
  assert.equal(g.get("state"), g.STATE.ENTRY);

  g.get("entry").chars = ["A", "B", "C"];
  g.confirmEntry();

  // Req 6.6: endingReason "win" restores the WIN terminal state.
  assert.equal(g.get("state"), g.STATE.WIN);
  const board = g.get("leaderboard");
  assert.equal(board.length, 1);
  assert.equal(board[0].initials, "ABC");
  assert.equal(board[0].score, 777);
});
