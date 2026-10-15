"use strict";

// Feature: high-score-leaderboard, Property 6: Letter cycling up and down are inverse and wrap within A–Z
// Task 2.12 — Write property test for letter cycling
// **Validates: Requirements 5.1, 5.2, 5.10**
//
// Property 6 (design.md): For any uppercase letter and any number of steps,
// cycling up by one with cycleLetter(ch, +1) always yields another single A–Z
// letter, wraps from "Z" to "A", and is the exact inverse of cycling down by
// one (cycleLetter(cycleLetter(ch, +1), -1) === ch), which wraps from "A" to
// "Z".
//
// The pure core (cycleLetter, LETTERS) lives inside the IIFE in index.html and
// is loaded without a DOM via the shared test helper.

const test = require("node:test");
const assert = require("node:assert/strict");
const fc = require("fast-check");

const { cycleLetter, LETTERS } = require("./helpers/load-pure-core.js");

// Arbitrary for a single uppercase A–Z letter.
const letterArb = fc
  .integer({ min: 0, max: 25 })
  .map((i) => String.fromCharCode(65 + i));

// Arbitrary for a step count (how many single +1/-1 shifts to apply).
const stepsArb = fc.integer({ min: 0, max: 1000 });

// A value is a single A–Z letter when it is a one-character string whose char
// code is in [65, 90] (equivalently, it is a member of LETTERS).
function isSingleAZLetter(value) {
  return (
    typeof value === "string" &&
    value.length === 1 &&
    LETTERS.indexOf(value) !== -1
  );
}

test("Property 6: cycling up always yields a single A–Z letter", () => {
  fc.assert(
    fc.property(letterArb, (ch) => {
      assert.ok(
        isSingleAZLetter(cycleLetter(ch, +1)),
        `cycleLetter(${ch}, +1) should be a single A–Z letter`
      );
      assert.ok(
        isSingleAZLetter(cycleLetter(ch, -1)),
        `cycleLetter(${ch}, -1) should be a single A–Z letter`
      );
    }),
    { numRuns: 200 }
  );
});

test("Property 6: up then down returns the original letter (exact inverse)", () => {
  fc.assert(
    fc.property(letterArb, (ch) => {
      assert.equal(cycleLetter(cycleLetter(ch, +1), -1), ch);
      // Down then up is likewise the inverse.
      assert.equal(cycleLetter(cycleLetter(ch, -1), +1), ch);
    }),
    { numRuns: 200 }
  );
});

test("Property 6: wrapping Z+1 === A and A-1 === Z", () => {
  assert.equal(cycleLetter("Z", +1), "A");
  assert.equal(cycleLetter("A", -1), "Z");
});

test("Property 6: cycling N steps up then N steps down returns the original", () => {
  fc.assert(
    fc.property(letterArb, stepsArb, (ch, steps) => {
      let up = ch;
      for (let i = 0; i < steps; i++) {
        up = cycleLetter(up, +1);
        // Every intermediate result stays a single A–Z letter.
        assert.ok(isSingleAZLetter(up));
      }
      let back = up;
      for (let i = 0; i < steps; i++) {
        back = cycleLetter(back, -1);
        assert.ok(isSingleAZLetter(back));
      }
      assert.equal(back, ch);
    }),
    { numRuns: 200 }
  );
});
