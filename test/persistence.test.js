"use strict";

// Task 4.2 — Write unit tests for persistence wiring with a fake `localStorage`.
// **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6, 6.4, 6.5, 7.5, 9.8**
//
// loadLeaderboard / saveLeaderboard are the only functions that touch
// `localStorage`. They live inside the IIFE in index.html and are NOT exported
// via module.exports (only the pure core is). These example/edge-case tests
// exercise the real shipping source — extracted from index.html by the
// load-persistence helper — against an in-memory fake Store we fully control
// and can force to throw on read and on write. index.html stays the single
// source of truth: no persistence logic is duplicated here.
//
// Coverage:
//   - the single STORE_KEY ("brickBuster.leaderboard.v1") is used (Req 1.1, 6.4, 9.8)
//   - a missing key yields []  with ok:true           (Req 1.2)
//   - present raw data is deserialized with ok:true    (Req 1.3)
//   - a read-throw yields []  with ok:false            (Req 1.6, 7.5)
//   - corrupt data yields []                            (Req 1.3)
//   - a successful save returns true                    (Req 1.4, 6.4)
//   - a write-throw returns false without discarding
//     the passed board                                 (Req 1.5, 6.5, 9.8)

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadPersistence } = require("./helpers/load-persistence.js");

const EXPECTED_STORE_KEY = "brickBuster.leaderboard.v1";

// loadLeaderboard / saveLeaderboard run inside a vm context, so the arrays and
// objects they return carry that context's Array/Object prototypes — not the
// test realm's. assert.deepStrictEqual (what node:assert/strict exposes as
// deepEqual) treats cross-realm values with "same structure but not
// reference-equal" prototypes as unequal. Compare structurally by value to stay
// realm-agnostic while still asserting the same contents and ordering.
function assertBoardEquals(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

// In-memory fake localStorage. `store` is a plain map of key -> string. Each of
// getItem / setItem can be forced to throw by setting throwOnGet / throwOnSet,
// simulating a disabled, blocked, or quota-exceeded Web Storage. Every call is
// recorded so tests can assert exactly which key was touched.
function makeFakeLocalStorage(initial) {
  const store = new Map();
  if (initial) {
    for (const k of Object.keys(initial)) store.set(k, initial[k]);
  }
  return {
    store,
    throwOnGet: false,
    throwOnSet: false,
    getCalls: [],
    setCalls: [],
    getItem(key) {
      this.getCalls.push(key);
      if (this.throwOnGet) throw new Error("getItem blocked");
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      this.setCalls.push({ key, value });
      if (this.throwOnSet) throw new Error("setItem blocked (quota)");
      store.set(key, value);
    }
  };
}

// Sanity check: the fake can actually be forced to throw on read and on write.
test("fake localStorage can be forced to throw on read and on write", () => {
  const fake = makeFakeLocalStorage();

  fake.throwOnGet = true;
  assert.throws(() => fake.getItem("k"), /getItem blocked/);

  fake.throwOnGet = false;
  fake.throwOnSet = true;
  assert.throws(() => fake.setItem("k", "v"), /setItem blocked/);

  // With both flags off it behaves like a normal in-memory Store.
  fake.throwOnSet = false;
  fake.setItem("k", "v");
  assert.equal(fake.getItem("k"), "v");
});

// Req 1.1, 6.4, 9.8: a single, well-known key is used for all reads and writes.
test("loadLeaderboard reads the single STORE_KEY", () => {
  const fake = makeFakeLocalStorage();
  const { STORE_KEY, loadLeaderboard } = loadPersistence(fake);

  assert.equal(STORE_KEY, EXPECTED_STORE_KEY);

  loadLeaderboard();

  assert.deepEqual(fake.getCalls, [EXPECTED_STORE_KEY]);
});

test("saveLeaderboard writes under the single STORE_KEY", () => {
  const fake = makeFakeLocalStorage();
  const { STORE_KEY, saveLeaderboard } = loadPersistence(fake);

  const board = [{ initials: "AAA", score: 100 }];
  saveLeaderboard(board);

  assert.equal(fake.setCalls.length, 1);
  assert.equal(fake.setCalls[0].key, EXPECTED_STORE_KEY);
  assert.equal(STORE_KEY, EXPECTED_STORE_KEY);
});

// Req 1.2: a missing key -> empty board, ok:true (not an error, just no data).
test("loadLeaderboard returns [] with ok:true when the key is missing", () => {
  const fake = makeFakeLocalStorage(); // nothing stored
  const { loadLeaderboard } = loadPersistence(fake);

  const result = loadLeaderboard();

  assertBoardEquals(result.board, []);
  assert.equal(result.ok, true);
});

// Req 1.3: present, well-formed data is parsed/validated into a board.
test("loadLeaderboard returns the stored board with ok:true for valid data", () => {
  const stored = [
    { initials: "AAA", score: 300 },
    { initials: "BBB", score: 200 },
    { initials: "CCC", score: 100 }
  ];
  const fake = makeFakeLocalStorage({ [EXPECTED_STORE_KEY]: JSON.stringify(stored) });
  const { loadLeaderboard } = loadPersistence(fake);

  const result = loadLeaderboard();

  assert.equal(result.ok, true);
  assertBoardEquals(result.board, stored);
});

// Req 1.6, 7.5: an inaccessible Store (getItem throws) -> empty board, ok:false.
// No exception escapes the module.
test("loadLeaderboard returns [] with ok:false when the Store read throws", () => {
  const fake = makeFakeLocalStorage();
  fake.throwOnGet = true;
  const { loadLeaderboard } = loadPersistence(fake);

  let result;
  assert.doesNotThrow(() => {
    result = loadLeaderboard();
  });

  assertBoardEquals(result.board, []);
  assert.equal(result.ok, false);
  // It did attempt the single key before failing.
  assert.deepEqual(fake.getCalls, [EXPECTED_STORE_KEY]);
});

// Req 1.3: corrupt / non-leaderboard data -> empty board, still ok:true
// (the Store was readable; the contents were simply unusable).
test("loadLeaderboard returns [] for corrupt (unparseable) data", () => {
  const fake = makeFakeLocalStorage({ [EXPECTED_STORE_KEY]: "{ this is not json" });
  const { loadLeaderboard } = loadPersistence(fake);

  const result = loadLeaderboard();

  assertBoardEquals(result.board, []);
  assert.equal(result.ok, true);
});

test("loadLeaderboard returns [] for valid JSON that is not a leaderboard array", () => {
  const fake = makeFakeLocalStorage({ [EXPECTED_STORE_KEY]: JSON.stringify({ nope: true }) });
  const { loadLeaderboard } = loadPersistence(fake);

  const result = loadLeaderboard();

  assertBoardEquals(result.board, []);
  assert.equal(result.ok, true);
});

// Req 1.4, 6.4: a successful save returns true and persists the serialized board
// under the single key, so a subsequent load round-trips it.
test("saveLeaderboard returns true and persists the board on success", () => {
  const fake = makeFakeLocalStorage();
  const { loadLeaderboard, saveLeaderboard } = loadPersistence(fake);

  const board = [
    { initials: "ZZZ", score: 500 },
    { initials: "YYY", score: 250 }
  ];

  const ok = saveLeaderboard(board);
  assert.equal(ok, true);

  // Persisted under the single key, exactly serialized.
  assert.equal(fake.store.get(EXPECTED_STORE_KEY), JSON.stringify(board));

  // And it round-trips through a fresh load.
  const reloaded = loadLeaderboard();
  assert.equal(reloaded.ok, true);
  assertBoardEquals(reloaded.board, board);
});

// Req 1.5, 6.5, 9.8: a write failure (setItem throws, e.g. quota/blocked)
// returns false and does NOT discard or mutate the passed-in board — the caller
// keeps the in-memory board and shows a "not saved" indication.
test("saveLeaderboard returns false on a write-throw without discarding the board", () => {
  const fake = makeFakeLocalStorage();
  fake.throwOnSet = true;
  const { saveLeaderboard } = loadPersistence(fake);

  const board = [
    { initials: "AAA", score: 42 },
    { initials: "BBB", score: 7 }
  ];
  const before = JSON.parse(JSON.stringify(board));

  let ok;
  assert.doesNotThrow(() => {
    ok = saveLeaderboard(board);
  });

  assert.equal(ok, false);
  // The passed board is untouched (same contents, same reference preserved).
  assert.deepEqual(board, before);
  // Nothing was committed to the Store.
  assert.equal(fake.store.has(EXPECTED_STORE_KEY), false);
  // It did attempt to write under the single key before failing.
  assert.equal(fake.setCalls.length, 1);
  assert.equal(fake.setCalls[0].key, EXPECTED_STORE_KEY);
});
