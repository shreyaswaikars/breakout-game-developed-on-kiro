"use strict";

// Unit tests for leaderboard / entry rendering via render-helper spies.
// Feature: high-score-leaderboard, Task 10.5
// **Validates: Requirements 4.2, 4.3, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4,
//   8.6, 9.1, 9.3, 9.11**
//
// render() and drawLeaderboard() are stateful functions inside the IIFE in
// index.html. They are not exported; they close over module-level bindings
// (state, leaderboard, highlightedEntry, resetPending, statusMessage, entry,
// score), the STATE enum, the THEME const, W/H, a canvas ctx, and the sibling
// draw helpers (glowText, drawCenterText, drawBricks, ...). These tests drive
// the REAL shipping source — extracted from index.html by the load-render
// helper — against those shared bindings, with glowText / drawCenterText /
// drawLeaderboard replaced by recording spies and ctx replaced by a tolerant
// no-op stub. index.html stays the single source of truth; no rendering logic
// is duplicated here, and color assertions compare against the REAL extracted
// THEME values.
//
// Coverage:
//   - drawLeaderboard empty board -> single "NO HIGH SCORES YET" in THEME.dim
//                                                            (Req 7.2, 8.3, 9.11)
//   - drawLeaderboard rows -> one glowText per row; each carries rank +
//     initials + zero-padded score; non-highlighted rows in THEME.cyan
//                                        (Req 7.1, 7.3, 7.4, 8.1, 8.2, 8.6)
//   - drawLeaderboard highlight -> exactly one row in THEME.yellow        (Req 8.4)
//   - render READY -> drawLeaderboard invoked with the leaderboard; reset hint
//     vs Y/N confirmation by resetPending                       (Req 7.1, 9.1, 9.3)
//   - render OVER / WIN -> drawLeaderboard invoked                    (Req 8.1, 8.2)
//   - render ENTRY -> glowText shows the zero-padded score and the cursor
//     emphasis (active slot + "^" marker in THEME.yellow)           (Req 4.2, 4.3)

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadRender } = require("./helpers/load-render.js");

// Zero-pad a score to 6 digits, matching index.html's
// String(score).padStart(6, "0") in both drawLeaderboard and the ENTRY branch.
function pad6(n) {
  return String(n).padStart(6, "0");
}

// A glowText call's `text` contains a given substring.
function someGlowTextContains(glowCalls, substr) {
  return glowCalls.some((c) => typeof c.text === "string" && c.text.includes(substr));
}

// ---------------------------------------------------------------------------
// drawLeaderboard — empty board
// Req 7.2 / 8.3 / 9.11: render the no-high-scores message for an empty board.
// ---------------------------------------------------------------------------
test("drawLeaderboard: empty board draws the no-high-scores message once in THEME.dim", () => {
  const h = loadRender();
  h.resetSpies();

  h.drawLeaderboard([], 100, 200);

  // Exactly one glowText call, carrying the no-high-scores message in THEME.dim.
  assert.equal(h.glowCalls.length, 1, "empty board should draw exactly one row of text");
  const call = h.glowCalls[0];
  assert.ok(
    /NO HIGH SCORES/i.test(call.text),
    "expected a no-high-scores message, got: " + call.text
  );
  assert.equal(call.color, h.THEME.dim, "empty-board message should use THEME.dim");
});

// ---------------------------------------------------------------------------
// drawLeaderboard — populated board
// Req 7.1/7.3/7.4/8.1/8.2/8.6: one row per record with rank + initials +
// zero-padded score, drawn via glowText + THEME; non-highlighted rows cyan.
// ---------------------------------------------------------------------------
test("drawLeaderboard: each row carries rank + initials + zero-padded score in THEME.cyan", () => {
  const h = loadRender();
  const board = [
    { initials: "AAA", score: 5000 },
    { initials: "BOB", score: 1200 },
    { initials: "ZZZ", score: 42 }
  ];
  h.set("highlightedEntry", null);
  h.resetSpies();

  h.drawLeaderboard(board, 100, 200);

  // One glowText call per record (no empty-board message).
  assert.equal(h.glowCalls.length, board.length, "one glowText row per record");

  for (let i = 0; i < board.length; i++) {
    const rec = board[i];
    const call = h.glowCalls[i];
    const rank = String(i + 1).padStart(2, "0");

    assert.ok(
      call.text.includes(rank),
      "row " + i + " should include rank " + rank + ", got: " + call.text
    );
    assert.ok(
      call.text.includes(rec.initials),
      "row " + i + " should include initials " + rec.initials + ", got: " + call.text
    );
    assert.ok(
      call.text.includes(pad6(rec.score)),
      "row " + i + " should include zero-padded score " + pad6(rec.score) + ", got: " + call.text
    );
    // Nothing highlighted -> every row uses THEME.cyan.
    assert.equal(call.color, h.THEME.cyan, "non-highlighted row " + i + " should use THEME.cyan");
  }
});

// ---------------------------------------------------------------------------
// drawLeaderboard — highlight
// Req 8.4: the Highlighted_Entry is the ONLY record drawn in the distinct
// highlight color (THEME.yellow); all others use THEME.cyan.
// ---------------------------------------------------------------------------
test("drawLeaderboard: exactly one row (the Highlighted_Entry) is drawn in THEME.yellow", () => {
  const h = loadRender();
  const highlighted = { initials: "BOB", score: 1200 };
  const board = [
    { initials: "AAA", score: 5000 },
    highlighted, // same reference the code compares with ===
    { initials: "ZZZ", score: 42 }
  ];
  // Highlight is matched by reference identity (rec === highlightedEntry).
  h.set("highlightedEntry", highlighted);
  h.resetSpies();

  h.drawLeaderboard(board, 100, 200);

  assert.equal(h.glowCalls.length, board.length, "one glowText row per record");

  const yellowRows = h.glowCalls.filter((c) => c.color === h.THEME.yellow);
  const cyanRows = h.glowCalls.filter((c) => c.color === h.THEME.cyan);

  assert.equal(yellowRows.length, 1, "exactly one row should be in THEME.yellow");
  assert.equal(cyanRows.length, board.length - 1, "all other rows should be in THEME.cyan");

  // The yellow row is the highlighted record (its initials + score appear).
  assert.ok(
    yellowRows[0].text.includes(highlighted.initials) &&
      yellowRows[0].text.includes(pad6(highlighted.score)),
    "the yellow row should be the highlighted record"
  );
});

// ---------------------------------------------------------------------------
// render() READY — leaderboard + reset affordance
// Req 7.1: the leaderboard renders on READY.
// Req 9.1: not pending -> reset option hint. Req 9.3: pending -> Y/N confirm.
// ---------------------------------------------------------------------------
test("render READY: draws the leaderboard and the reset-option hint when not pending", () => {
  const h = loadRender({ spyDrawLeaderboard: true });
  const board = [
    { initials: "AAA", score: 5000 },
    { initials: "BOB", score: 1200 }
  ];
  h.set("state", h.STATE.READY);
  h.set("leaderboard", board);
  h.set("resetPending", false);
  h.set("statusMessage", null);
  h.resetSpies();

  h.render();

  // Leaderboard rendered on READY with the current board.
  assert.equal(h.drawLeaderboardCalls.length, 1, "drawLeaderboard should be called once on READY");
  assert.equal(
    h.drawLeaderboardCalls[0].board,
    board,
    "drawLeaderboard should receive the current leaderboard"
  );

  // Reset_Option hint present; no Y/N confirmation.
  assert.ok(
    someGlowTextContains(h.glowCalls, "RESET"),
    "the reset-option hint should be drawn when no confirmation is pending"
  );
  assert.ok(
    !h.glowCalls.some((c) => /Y\s*=\s*YES/i.test(c.text || "")),
    "the Y/N confirmation must NOT appear when no confirmation is pending"
  );
});

test("render READY: draws the Y/N reset confirmation when a reset is pending", () => {
  const h = loadRender({ spyDrawLeaderboard: true });
  h.set("state", h.STATE.READY);
  h.set("leaderboard", [{ initials: "AAA", score: 5000 }]);
  h.set("resetPending", true);
  h.resetSpies();

  h.render();

  // Still renders the leaderboard on READY. (Req 7.1)
  assert.equal(h.drawLeaderboardCalls.length, 1, "drawLeaderboard should be called once on READY");

  // The confirmation states that confirming clears scores and shows Y / N. (Req 9.3)
  const confirmCall = h.glowCalls.find(
    (c) => /Y\s*=\s*YES/i.test(c.text || "") && /N\s*=\s*NO/i.test(c.text || "")
  );
  assert.ok(confirmCall, "a Y/N reset confirmation should be drawn when pending");
  assert.ok(
    /CLEAR ALL SCORES/i.test(confirmCall.text),
    "the confirmation should state that confirming clears all scores: " + confirmCall.text
  );
});

test("render READY: empty leaderboard still invokes drawLeaderboard (no-high-scores path)", () => {
  // Req 9.11 / 7.2: after reset / with no scores, the READY screen still asks
  // drawLeaderboard to render (which draws the no-high-scores message).
  const h = loadRender({ spyDrawLeaderboard: true });
  h.set("state", h.STATE.READY);
  h.set("leaderboard", []);
  h.set("resetPending", false);
  h.resetSpies();

  h.render();

  assert.equal(h.drawLeaderboardCalls.length, 1, "drawLeaderboard should be called on READY");
  const arg = h.drawLeaderboardCalls[0].board;
  assert.equal(arg.length, 0, "the empty board should be passed through to drawLeaderboard");
});

// ---------------------------------------------------------------------------
// render() OVER / WIN — leaderboard on end screens
// Req 8.1 (OVER) / 8.2 (WIN): the leaderboard renders beneath the result.
// ---------------------------------------------------------------------------
test("render OVER: draws the leaderboard beneath the game-over result", () => {
  const h = loadRender({ spyDrawLeaderboard: true });
  const board = [{ initials: "AAA", score: 5000 }];
  h.set("state", h.STATE.OVER);
  h.set("leaderboard", board);
  h.set("score", 5000);
  h.resetSpies();

  h.render();

  assert.equal(h.drawLeaderboardCalls.length, 1, "drawLeaderboard should be called once on OVER");
  assert.equal(h.drawLeaderboardCalls[0].board, board, "OVER should render the current leaderboard");
});

test("render WIN: draws the leaderboard beneath the win result", () => {
  const h = loadRender({ spyDrawLeaderboard: true });
  const board = [{ initials: "AAA", score: 5000 }];
  h.set("state", h.STATE.WIN);
  h.set("leaderboard", board);
  h.set("score", 5000);
  h.resetSpies();

  h.render();

  assert.equal(h.drawLeaderboardCalls.length, 1, "drawLeaderboard should be called once on WIN");
  assert.equal(h.drawLeaderboardCalls[0].board, board, "WIN should render the current leaderboard");
});

// ---------------------------------------------------------------------------
// render() ENTRY — score + cursor emphasis
// Req 4.2: show three slots and the Final_Score. Req 4.3: the Initial_Cursor
// slot is emphasized.
// ---------------------------------------------------------------------------
test("render ENTRY: draws the zero-padded score and emphasizes the cursor slot", () => {
  const h = loadRender({ spyDrawLeaderboard: true });
  h.set("state", h.STATE.ENTRY);
  h.set("score", 1234);
  h.set("entry", { chars: ["K", "I", "R"], cursor: 1 });
  h.resetSpies();

  h.render();

  // The Final_Score is drawn, zero-padded to 6 digits. (Req 4.2)
  assert.ok(
    someGlowTextContains(h.glowCalls, pad6(1234)),
    "ENTRY should draw the zero-padded Final_Score " + pad6(1234)
  );

  // Each of the three initial slots is drawn as its own glowText call. (Req 4.2)
  for (const ch of ["K", "I", "R"]) {
    assert.ok(
      h.glowCalls.some((c) => c.text === ch),
      "ENTRY should draw slot character '" + ch + "'"
    );
  }

  // The active slot (cursor = 1 -> "I") is emphasized in THEME.yellow, and the
  // other two slots are NOT yellow. (Req 4.3)
  const yellowSlots = h.glowCalls.filter(
    (c) => ["K", "I", "R"].includes(c.text) && c.color === h.THEME.yellow
  );
  assert.equal(yellowSlots.length, 1, "exactly one slot should be emphasized in THEME.yellow");
  assert.equal(yellowSlots[0].text, "I", "the emphasized slot should be the one at the cursor");

  // The cursor marker ("^") is drawn in THEME.yellow beneath the active slot. (Req 4.3)
  const marker = h.glowCalls.find((c) => c.text === "^");
  assert.ok(marker, "a cursor marker should be drawn under the active slot");
  assert.equal(marker.color, h.THEME.yellow, "the cursor marker should use THEME.yellow");
});
