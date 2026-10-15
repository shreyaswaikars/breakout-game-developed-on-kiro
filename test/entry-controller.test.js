"use strict";

// Unit tests for entry init and confirm.
// Feature: high-score-leaderboard, Task 5.9
// **Validates: Requirements 4.4, 5.4, 5.6, 5.8, 6.1, 6.3, 6.6**
//
// beginEntry() and confirmEntry() are stateful controller functions inside the
// IIFE in index.html. They are not exported, they close over module-level
// mutable bindings (state, leaderboard, entry, endingReason, highlightedEntry,
// statusMessage, score, STATE), and confirmEntry() calls saveLeaderboard, which
// writes to localStorage. These example/edge-case tests exercise the REAL
// shipping source — extracted from index.html by the load-entry-controller
// helper — against those shared bindings and an injected fake localStorage we
// fully control. index.html stays the single source of truth; no controller
// logic is duplicated here.
//
// Coverage:
//   - beginEntry resets chars to ["A","A","A"], cursor to 0, enters ENTRY  (Req 4.4)
//   - confirmEntry builds the record from the final initials + score       (Req 6.1)
//   - confirmEntry adds the record to the leaderboard (ordered/trimmed)     (Req 6.2)
//   - confirmEntry marks highlightedEntry by reference identity            (Req 6.3)
//   - confirmEntry routes to OVER / WIN by endingReason                     (Req 6.6)
//   - a failed save sets statusMessage but retains the board               (Req 6.5)
//   - cursor no-ops at index 2 (Right) and index 0 (Left)             (Req 5.4, 5.6)
//   - letter stickiness at index 2 (letter sets char, cursor stays)        (Req 5.8)

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadEntryController } = require("./helpers/load-entry-controller.js");

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

// Same realm-agnostic comparison for a chars array returned from the vm context.
function assertCharsEqual(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

// ---- beginEntry ----

test.describe("beginEntry (Req 4.4)", () => {
  test("resets initials to [A,A,A], cursor to 0, and enters ENTRY", () => {
    const fake = makeFakeLocalStorage();
    const ctl = loadEntryController(fake);

    // Dirty the entry state and start somewhere other than ENTRY so the reset
    // is observable.
    ctl.set("entry", { chars: ["X", "Y", "Z"], cursor: 2 });
    ctl.set("state", ctl.STATE.OVER);

    ctl.beginEntry();

    const entry = ctl.get("entry");
    assertCharsEqual(entry.chars, ["A", "A", "A"]);
    assert.equal(entry.cursor, 0);
    assert.equal(ctl.get("state"), ctl.STATE.ENTRY);
  });
});

// ---- confirmEntry ----

test.describe("confirmEntry (Req 6.1, 6.2, 6.3, 6.6)", () => {
  test("builds the record from the final initials + score and adds it to the board", () => {
    const fake = makeFakeLocalStorage();
    const ctl = loadEntryController(fake);

    ctl.set("entry", { chars: ["A", "C", "E"], cursor: 2 });
    ctl.set("score", 4242);
    ctl.set("endingReason", "over");

    ctl.confirmEntry();

    // Req 6.1 / 6.2: the record is built from join("") of the final chars + the
    // current score, and inserted into the leaderboard.
    assertBoardEquals(ctl.get("leaderboard"), [{ initials: "ACE", score: 4242 }]);
  });

  test("marks highlightedEntry by reference identity (same object inside the board)", () => {
    const fake = makeFakeLocalStorage();
    const ctl = loadEntryController(fake);

    ctl.set("entry", { chars: ["B", "O", "B"], cursor: 2 });
    ctl.set("score", 100);
    ctl.set("endingReason", "win");

    ctl.confirmEntry();

    const board = ctl.get("leaderboard");
    const highlighted = ctl.get("highlightedEntry");

    // Req 6.3: the Highlighted_Entry is the exact record object that was added —
    // reference identity, not a structural copy — so a tied score still
    // emphasizes the right row.
    assert.ok(highlighted, "highlightedEntry should be set");
    assert.equal(highlighted.initials, "BOB");
    assert.equal(highlighted.score, 100);
    assert.equal(board.indexOf(highlighted) !== -1, true, "highlightedEntry must be the same object held in the board");
    assert.equal(board[0], highlighted);
  });

  test("preserves descending order and highlight identity when inserting among existing records", () => {
    const fake = makeFakeLocalStorage();
    const ctl = loadEntryController(fake);

    // Seed an existing ordered board; the new 250 slots between 300 and 100.
    const existing = [
      { initials: "AAA", score: 300 },
      { initials: "CCC", score: 100 }
    ];
    ctl.set("leaderboard", existing.slice());
    ctl.set("entry", { chars: ["M", "I", "D"], cursor: 2 });
    ctl.set("score", 250);
    ctl.set("endingReason", "over");

    ctl.confirmEntry();

    const board = ctl.get("leaderboard");
    assertBoardEquals(board, [
      { initials: "AAA", score: 300 },
      { initials: "MID", score: 250 },
      { initials: "CCC", score: 100 }
    ]);
    // The highlighted record is the inserted one, by identity, at rank 2.
    assert.equal(board[1], ctl.get("highlightedEntry"));
  });

  test("routes to OVER when endingReason is 'over'", () => {
    const fake = makeFakeLocalStorage();
    const ctl = loadEntryController(fake);

    ctl.set("entry", { chars: ["A", "A", "A"], cursor: 0 });
    ctl.set("score", 500);
    ctl.set("endingReason", "over");
    ctl.set("state", ctl.STATE.ENTRY);

    ctl.confirmEntry();

    assert.equal(ctl.get("state"), ctl.STATE.OVER); // Req 6.6
  });

  test("routes to WIN when endingReason is 'win'", () => {
    const fake = makeFakeLocalStorage();
    const ctl = loadEntryController(fake);

    ctl.set("entry", { chars: ["A", "A", "A"], cursor: 0 });
    ctl.set("score", 500);
    ctl.set("endingReason", "win");
    ctl.set("state", ctl.STATE.ENTRY);

    ctl.confirmEntry();

    assert.equal(ctl.get("state"), ctl.STATE.WIN); // Req 6.6
  });

  test("writes the updated board under the single STORE_KEY on a successful save", () => {
    const fake = makeFakeLocalStorage();
    const ctl = loadEntryController(fake);

    ctl.set("entry", { chars: ["Z", "Z", "Z"], cursor: 2 });
    ctl.set("score", 777);
    ctl.set("endingReason", "over");

    ctl.confirmEntry();

    assert.equal(fake.setCalls.length, 1);
    assert.equal(fake.setCalls[0].key, EXPECTED_STORE_KEY);
    assert.equal(ctl.get("statusMessage"), null, "no status message on a successful save");
    // Persisted contents match the in-memory board.
    assert.equal(fake.store.get(EXPECTED_STORE_KEY), JSON.stringify(ctl.get("leaderboard")));
  });
});

// ---- confirmEntry: failed save (Req 6.5) ----

test.describe("confirmEntry failed save (Req 6.5)", () => {
  test("a failed save sets statusMessage but retains the in-memory board and still routes", () => {
    const fake = makeFakeLocalStorage();
    fake.throwOnSet = true; // simulate quota/blocked Store
    const ctl = loadEntryController(fake);

    ctl.set("entry", { chars: ["F", "A", "I"], cursor: 2 });
    ctl.set("score", 321);
    ctl.set("endingReason", "win");
    ctl.set("state", ctl.STATE.ENTRY);

    assert.doesNotThrow(() => ctl.confirmEntry());

    // The record is still added in memory even though persistence failed.
    assertBoardEquals(ctl.get("leaderboard"), [{ initials: "FAI", score: 321 }]);
    // A user-visible indication is surfaced.
    assert.equal(ctl.get("statusMessage"), "SCORE NOT SAVED");
    // The highlight and terminal transition still happen.
    assert.equal(ctl.get("leaderboard")[0], ctl.get("highlightedEntry"));
    assert.equal(ctl.get("state"), ctl.STATE.WIN);
    // Nothing was committed to the Store.
    assert.equal(fake.store.has(EXPECTED_STORE_KEY), false);
  });
});

// ---- beginEntry -> confirmEntry round trip ----

test.describe("beginEntry then confirmEntry (Req 4.4, 6.1, 6.3, 6.6)", () => {
  test("default AAA entry confirms to a AAA record routed to OVER", () => {
    const fake = makeFakeLocalStorage();
    const ctl = loadEntryController(fake);

    ctl.set("score", 60);
    ctl.set("endingReason", "over");

    ctl.beginEntry(); // -> chars AAA, cursor 0, state ENTRY
    assert.equal(ctl.get("state"), ctl.STATE.ENTRY);

    ctl.confirmEntry();

    assertBoardEquals(ctl.get("leaderboard"), [{ initials: "AAA", score: 60 }]);
    assert.equal(ctl.get("leaderboard")[0], ctl.get("highlightedEntry"));
    assert.equal(ctl.get("state"), ctl.STATE.OVER);
  });
});

// ---- cursor no-ops and letter stickiness via applyEntryKey ----
//
// These drive the REAL pure reducer (extracted from index.html) that
// handleEntryKey layers over, so the controller's edit semantics are covered
// without a DOM.

test.describe("cursor bounds and letter stickiness via applyEntryKey (Req 5.4, 5.6, 5.8)", () => {
  test("Right arrow is a no-op at index 2 (Req 5.4)", () => {
    const fake = makeFakeLocalStorage();
    const ctl = loadEntryController(fake);

    const before = { chars: ["A", "B", "C"], cursor: 2 };
    const after = ctl.applyEntryKey(before, { key: "ArrowRight" });

    assert.equal(after.cursor, 2, "cursor stays at index 2");
    assertCharsEqual(after.chars, ["A", "B", "C"], "letters unchanged");
  });

  test("Left arrow is a no-op at index 0 (Req 5.6)", () => {
    const fake = makeFakeLocalStorage();
    const ctl = loadEntryController(fake);

    const before = { chars: ["A", "B", "C"], cursor: 0 };
    const after = ctl.applyEntryKey(before, { key: "ArrowLeft" });

    assert.equal(after.cursor, 0, "cursor stays at index 0");
    assertCharsEqual(after.chars, ["A", "B", "C"], "letters unchanged");
  });

  test("a letter at index 2 sets the char but leaves the cursor at index 2 (Req 5.8)", () => {
    const fake = makeFakeLocalStorage();
    const ctl = loadEntryController(fake);

    const before = { chars: ["A", "A", "A"], cursor: 2 };
    const after = ctl.applyEntryKey(before, { key: "q" });

    assert.equal(after.cursor, 2, "cursor is sticky at index 2");
    assertCharsEqual(after.chars, ["A", "A", "Q"], "the uppercased letter is set at the cursor");
  });

  test("a letter at index 0/1 advances the cursor (contrast with the sticky index-2 case)", () => {
    const fake = makeFakeLocalStorage();
    const ctl = loadEntryController(fake);

    const after0 = ctl.applyEntryKey({ chars: ["A", "A", "A"], cursor: 0 }, { key: "x" });
    assert.equal(after0.cursor, 1);
    assertCharsEqual(after0.chars, ["X", "A", "A"]);

    const after1 = ctl.applyEntryKey({ chars: ["X", "A", "A"], cursor: 1 }, { key: "y" });
    assert.equal(after1.cursor, 2);
    assertCharsEqual(after1.chars, ["X", "Y", "A"]);
  });
});
