"use strict";

// Unit tests for the reset flow (handleReadyKey on the READY screen).
// Feature: high-score-leaderboard, Task 7.3
// **Validates: Requirements 9.2, 9.4, 9.5, 9.6, 9.8, 9.9, 9.10, 9.11**
//
// handleReadyKey(e) is a stateful controller function inside the IIFE in
// index.html. It is not exported, it closes over module-level mutable bindings
// (resetPending, leaderboard, highlightedEntry, statusMessage), and it calls
// saveLeaderboard, which writes to localStorage. These example/edge-case tests
// exercise the REAL shipping source — extracted from index.html by the
// load-reset-flow helper — against those shared bindings and an injected fake
// localStorage we fully control. index.html stays the single source of truth;
// no controller logic is duplicated here.
//
// Coverage:
//   - R opens the confirmation and stays READY (resetPending true, board intact,
//     returns true)                                                      (Req 9.2, 9.4)
//   - Space is inert while pending (no PLAYING transition; stays pending; true) (Req 9.5)
//   - Y clears board + highlight + dismisses + saves                     (Req 9.6, 9.11)
//   - a failed save sets statusMessage ("RESET NOT SAVED") but keeps the
//     empty board                                                        (Req 9.8)
//   - N dismisses leaving the board intact                               (Req 9.9)
//   - other keys keep it pending, board unchanged                        (Req 9.10)

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadResetFlow } = require("./helpers/load-reset-flow.js");

const EXPECTED_STORE_KEY = "brickBuster.leaderboard.v1";

// In-memory fake localStorage. setItem can be forced to throw (throwOnSet) to
// simulate a failed save (quota/blocked). Each write is recorded so a test can
// assert what was (or was not) committed.
function makeFakeLocalStorage() {
  const store = new Map();
  return {
    store,
    throwOnSet: false,
    setCalls: [],
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      this.setCalls.push({ key, value });
      if (this.throwOnSet) throw new Error("setItem blocked (quota)");
      store.set(key, value);
    }
  };
}

// Values cross the vm realm boundary, so compare boards/arrays structurally by
// value rather than with deepStrictEqual (which rejects cross-realm prototypes:
// an array built in the vm context does not share the test realm's
// Array.prototype).
function assertBoardEquals(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

// A small ordered seed board used wherever a test needs to show the board was
// left intact (or wiped).
function seedBoard() {
  return [
    { initials: "AAA", score: 300 },
    { initials: "BBB", score: 200 },
    { initials: "CCC", score: 100 }
  ];
}

// ---- R opens the confirmation (Req 9.2, 9.4) ----

test.describe("R opens the confirmation and stays READY (Req 9.2, 9.4)", () => {
  for (const key of ["r", "R"]) {
    test(`"${key}" sets resetPending, returns true, and leaves the board untouched`, () => {
      const fake = makeFakeLocalStorage();
      const ctl = loadResetFlow(fake);

      ctl.set("leaderboard", seedBoard());
      // Not pending to start with.
      assert.equal(ctl.get("resetPending"), false);

      const handled = ctl.handleReadyKey({ key });

      // Req 9.2: pressing R opens the Reset_Confirmation.
      assert.equal(handled, true, "handleReadyKey signals it handled the key");
      assert.equal(ctl.get("resetPending"), true, "a confirmation is now pending");
      // Req 9.4: the game stays in READY — handleReadyKey never transitions
      // state; opening the prompt does not touch the leaderboard.
      assertBoardEquals(ctl.get("leaderboard"), seedBoard(), "board unchanged when the prompt opens");
      // No persistence happens merely from opening the confirmation.
      assert.equal(fake.setCalls.length, 0, "opening the prompt writes nothing");
      assert.equal(ctl.get("statusMessage"), null);
    });
  }
});

// ---- Space is inert while pending (Req 9.5) ----

test.describe("Space is inert while a confirmation is pending (Req 9.5)", () => {
  test('" " keeps the prompt pending, returns true (so Space-to-start is short-circuited), and leaves the board unchanged', () => {
    const fake = makeFakeLocalStorage();
    const ctl = loadResetFlow(fake);

    ctl.set("leaderboard", seedBoard());
    ctl.set("resetPending", true);

    const handled = ctl.handleReadyKey({ key: " " });

    // Returning true is exactly what prevents the main keydown handler from
    // falling through to the Space-to-start branch, so no PLAYING transition
    // can occur while the confirmation is up.
    assert.equal(handled, true, "handled -> main handler short-circuits before Space-to-start");
    assert.equal(ctl.get("resetPending"), true, "the confirmation stays pending");
    assertBoardEquals(ctl.get("leaderboard"), seedBoard(), "board left unchanged");
    assert.equal(fake.setCalls.length, 0, "nothing persisted");
    assert.equal(ctl.get("statusMessage"), null);
  });
});

// ---- Y confirms: clears board + highlight + dismisses + saves (Req 9.6, 9.11) ----

test.describe("Y confirms the reset (Req 9.6, 9.11)", () => {
  for (const key of ["y", "Y"]) {
    test(`"${key}" empties the board, clears the highlight, dismisses the prompt, and persists []`, () => {
      const fake = makeFakeLocalStorage();
      const ctl = loadResetFlow(fake);

      ctl.set("leaderboard", seedBoard());
      ctl.set("highlightedEntry", { initials: "AAA", score: 300 });
      ctl.set("resetPending", true);

      const handled = ctl.handleReadyKey({ key });

      assert.equal(handled, true);
      // Req 9.6 / 9.11: the in-memory leaderboard becomes the empty collection.
      assertBoardEquals(ctl.get("leaderboard"), [], "board is emptied");
      // Req 9.6: the Highlighted_Entry is cleared.
      assert.equal(ctl.get("highlightedEntry"), null, "highlight cleared");
      // Req 9.6: the confirmation is dismissed.
      assert.equal(ctl.get("resetPending"), false, "confirmation dismissed");
      // Req 9.7: the empty board is written to the Store under the single key.
      assert.equal(fake.setCalls.length, 1, "exactly one write on confirm");
      assert.equal(fake.setCalls[0].key, EXPECTED_STORE_KEY, "the single named key is used");
      assert.equal(fake.setCalls[0].value, JSON.stringify([]), "an empty leaderboard is persisted");
      assert.equal(fake.store.get(EXPECTED_STORE_KEY), JSON.stringify([]));
      // A successful save leaves no status message.
      assert.equal(ctl.get("statusMessage"), null, "no status message on a successful save");
    });
  }
});

// ---- Y with a failed save (Req 9.8) ----

test.describe("Y when the save fails (Req 9.8)", () => {
  test("sets statusMessage to RESET NOT SAVED but keeps the empty in-memory board and dismisses", () => {
    const fake = makeFakeLocalStorage();
    fake.throwOnSet = true; // simulate quota/blocked Store
    const ctl = loadResetFlow(fake);

    ctl.set("leaderboard", seedBoard());
    ctl.set("highlightedEntry", { initials: "AAA", score: 300 });
    ctl.set("resetPending", true);

    let handled;
    // A failed save must never let an exception escape the controller.
    assert.doesNotThrow(() => {
      handled = ctl.handleReadyKey({ key: "Y" });
    });

    assert.equal(handled, true);
    // Req 9.8: the empty board is retained in memory even though persistence
    // failed.
    assertBoardEquals(ctl.get("leaderboard"), [], "board still emptied in memory");
    assert.equal(ctl.get("highlightedEntry"), null, "highlight still cleared");
    // Req 9.8: the confirmation is dismissed.
    assert.equal(ctl.get("resetPending"), false, "confirmation dismissed");
    // Req 9.8: a user-visible indication is surfaced.
    assert.equal(ctl.get("statusMessage"), "RESET NOT SAVED");
    // The write was attempted but nothing was committed.
    assert.equal(fake.setCalls.length, 1, "a save was attempted");
    assert.equal(fake.store.has(EXPECTED_STORE_KEY), false, "nothing committed to the Store");
  });
});

// ---- N cancels, board intact (Req 9.9) ----

test.describe("N dismisses the confirmation leaving the board intact (Req 9.9)", () => {
  for (const key of ["n", "N"]) {
    test(`"${key}" dismisses the prompt and leaves the leaderboard unchanged`, () => {
      const fake = makeFakeLocalStorage();
      const ctl = loadResetFlow(fake);

      ctl.set("leaderboard", seedBoard());
      ctl.set("highlightedEntry", { initials: "AAA", score: 300 });
      ctl.set("resetPending", true);

      const handled = ctl.handleReadyKey({ key });

      assert.equal(handled, true);
      // Req 9.9: the confirmation is dismissed...
      assert.equal(ctl.get("resetPending"), false, "confirmation dismissed");
      // ...and the leaderboard is left unchanged.
      assertBoardEquals(ctl.get("leaderboard"), seedBoard(), "board unchanged on cancel");
      // Cancel neither clears the highlight nor persists anything.
      assert.equal(fake.setCalls.length, 0, "nothing persisted on cancel");
      assert.equal(ctl.get("statusMessage"), null);
    });
  }
});

// ---- Any other key keeps it pending (Req 9.10) ----

test.describe("Other keys keep the confirmation pending (Req 9.10)", () => {
  for (const key of ["x", "Enter", "ArrowUp", "1", "Escape"]) {
    test(`"${key}" leaves the prompt pending and the board unchanged, returning true`, () => {
      const fake = makeFakeLocalStorage();
      const ctl = loadResetFlow(fake);

      ctl.set("leaderboard", seedBoard());
      ctl.set("resetPending", true);

      const handled = ctl.handleReadyKey({ key });

      // Req 9.10: an unrecognized key during a pending confirmation is a no-op
      // that keeps the prompt up (returns true so the main handler still
      // short-circuits, keeping the game in READY).
      assert.equal(handled, true, "still handled -> stays in READY");
      assert.equal(ctl.get("resetPending"), true, "confirmation stays pending");
      assertBoardEquals(ctl.get("leaderboard"), seedBoard(), "board unchanged");
      assert.equal(fake.setCalls.length, 0, "nothing persisted");
      assert.equal(ctl.get("statusMessage"), null);
    });
  }
});
