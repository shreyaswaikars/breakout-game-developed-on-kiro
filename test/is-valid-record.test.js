"use strict";

// Unit tests for isValidRecord edge cases.
// Feature: high-score-leaderboard, Task 2.13
// _Requirements: 1.8, 2.5, 2.6_
//
// The pure logic (isValidRecord, MAX_SCORE = 999999999) lives inside the IIFE
// in index.html. Because the conditional `module.exports` guard is added by a
// later task (2.6) that has not run yet, these tests load the real pure source
// through test/helpers/load-pure-core.js, which extracts the self-contained
// declarations from index.html and evaluates them without a DOM.

const test = require("node:test");
const assert = require("node:assert/strict");

const { isValidRecord, MAX_SCORE } = require("./helpers/load-pure-core.js");

test("MAX_SCORE is 999999999", () => {
  assert.equal(MAX_SCORE, 999999999);
});

test("accepts a well-formed record", () => {
  assert.equal(isValidRecord({ initials: "ACE", score: 12345 }), true);
});

test.describe("rejects invalid initials", () => {
  test("non-string initials (number)", () => {
    assert.equal(isValidRecord({ initials: 123, score: 10 }), false);
  });

  test("non-string initials (null)", () => {
    assert.equal(isValidRecord({ initials: null, score: 10 }), false);
  });

  test("non-string initials (array)", () => {
    assert.equal(isValidRecord({ initials: ["A", "B", "C"], score: 10 }), false);
  });

  test("too short (2 letters)", () => {
    assert.equal(isValidRecord({ initials: "AB", score: 10 }), false);
  });

  test("empty string", () => {
    assert.equal(isValidRecord({ initials: "", score: 10 }), false);
  });

  test("too long (4 letters)", () => {
    assert.equal(isValidRecord({ initials: "ABCD", score: 10 }), false);
  });

  test("lowercase letters", () => {
    assert.equal(isValidRecord({ initials: "abc", score: 10 }), false);
  });

  test("mixed case", () => {
    assert.equal(isValidRecord({ initials: "AbC", score: 10 }), false);
  });

  test("non-alphabetic characters (digits)", () => {
    assert.equal(isValidRecord({ initials: "A1C", score: 10 }), false);
  });

  test("whitespace padding", () => {
    assert.equal(isValidRecord({ initials: "A B", score: 10 }), false);
  });
});

test.describe("rejects invalid scores", () => {
  test("negative score", () => {
    assert.equal(isValidRecord({ initials: "ACE", score: -1 }), false);
  });

  test("non-integer score", () => {
    assert.equal(isValidRecord({ initials: "ACE", score: 12.5 }), false);
  });

  test("NaN score", () => {
    assert.equal(isValidRecord({ initials: "ACE", score: NaN }), false);
  });

  test("Infinity score", () => {
    assert.equal(isValidRecord({ initials: "ACE", score: Infinity }), false);
  });

  test("string score", () => {
    assert.equal(isValidRecord({ initials: "ACE", score: "100" }), false);
  });

  test("score greater than MAX_SCORE", () => {
    assert.equal(isValidRecord({ initials: "ACE", score: MAX_SCORE + 1 }), false);
  });
});

test.describe("accepts score boundaries", () => {
  test("accepts the 0 lower boundary", () => {
    assert.equal(isValidRecord({ initials: "ACE", score: 0 }), true);
  });

  test("accepts the 999999999 upper boundary", () => {
    assert.equal(isValidRecord({ initials: "ACE", score: 999999999 }), true);
  });

  test("accepts MAX_SCORE constant as upper boundary", () => {
    assert.equal(isValidRecord({ initials: "ACE", score: MAX_SCORE }), true);
  });
});

test.describe("rejects malformed record shapes", () => {
  test("null record", () => {
    assert.equal(isValidRecord(null), false);
  });

  test("undefined record", () => {
    assert.equal(isValidRecord(undefined), false);
  });

  test("missing initials", () => {
    assert.equal(isValidRecord({ score: 10 }), false);
  });

  test("missing score", () => {
    assert.equal(isValidRecord({ initials: "ACE" }), false);
  });
});
