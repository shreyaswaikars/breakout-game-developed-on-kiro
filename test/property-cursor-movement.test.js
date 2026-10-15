"use strict";

// Feature: high-score-leaderboard, Property 7: Cursor movement stays within bounds and never alters the letters
// Task 5.6 — Write property test for cursor movement bounds
// **Validates: Requirements 5.3, 5.4, 5.5, 5.6**
//
// Property 7 (design.md): For any entry state and any sequence of Left/Right
// cursor presses, the Initial_Cursor always remains within [0, 2] (Right is a
// no-op at index 2, Left is a no-op at index 0) and the three Initials
// characters are unchanged by cursor movement.
//
// The pure reducer `applyEntryKey` (plus its dependencies `cycleLetter` and
// `LETTERS`) lives inside the IIFE in index.html. It is not yet published via
// the shared pure-core export (Task 5.5), so it is loaded without a DOM via a
// dedicated extraction helper that keeps index.html as the single source of
// truth.

const test = require("node:test");
const assert = require("node:assert/strict");
const fc = require("fast-check");

const { applyEntryKey } = require("./helpers/load-entry-reducer.js");

// Arbitrary for a single uppercase A–Z letter.
const letterArb = fc
  .integer({ min: 0, max: 25 })
  .map((i) => String.fromCharCode(65 + i));

// Arbitrary for an initial entry state: exactly 3 A–Z letters and a cursor in
// [0, 2].
const entryStateArb = fc.record({
  chars: fc.tuple(letterArb, letterArb, letterArb),
  cursor: fc.integer({ min: 0, max: 2 }),
});

// Arbitrary for a sequence of Left/Right cursor presses, encoded as the key
// descriptors `applyEntryKey` consumes.
const moveArb = fc.constantFrom(
  { key: "ArrowLeft" },
  { key: "ArrowRight" }
);
const movesArb = fc.array(moveArb, { minLength: 0, maxLength: 50 });

test("Property 7: Left/Right sequences keep the cursor in [0,2] and never change the letters", () => {
  fc.assert(
    fc.property(entryStateArb, movesArb, (initial, moves) => {
      // chars arbitrary yields a tuple; make it a plain array the reducer copies.
      const start = { chars: initial.chars.slice(), cursor: initial.cursor };
      const originalChars = initial.chars.slice();

      let state = start;
      for (const move of moves) {
        state = applyEntryKey(state, move);

        // Cursor stays within bounds after every press.
        assert.ok(
          Number.isInteger(state.cursor) &&
            state.cursor >= 0 &&
            state.cursor <= 2,
          `cursor ${state.cursor} escaped [0,2] after ${move.key}`
        );

        // Letters are untouched by cursor movement — same three characters,
        // same order, same values as the original entry state.
        assert.deepEqual(state.chars, originalChars);
      }

      // Final state likewise respects both invariants.
      assert.ok(state.cursor >= 0 && state.cursor <= 2);
      assert.deepEqual(state.chars, originalChars);
    }),
    { numRuns: 200 }
  );
});

test("Property 7: ArrowRight is a no-op at index 2 and ArrowLeft is a no-op at index 0", () => {
  fc.assert(
    fc.property(entryStateArb, (initial) => {
      const chars = initial.chars.slice();

      // From index 2, Right cannot advance further.
      const atRightEdge = applyEntryKey({ chars: chars.slice(), cursor: 2 }, {
        key: "ArrowRight",
      });
      assert.equal(atRightEdge.cursor, 2);
      assert.deepEqual(atRightEdge.chars, chars);

      // From index 0, Left cannot retreat further.
      const atLeftEdge = applyEntryKey({ chars: chars.slice(), cursor: 0 }, {
        key: "ArrowLeft",
      });
      assert.equal(atLeftEdge.cursor, 0);
      assert.deepEqual(atLeftEdge.chars, chars);
    }),
    { numRuns: 200 }
  );
});
