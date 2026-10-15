"use strict";

// Feature: high-score-leaderboard, Property 8: Initials characters are always single A–Z letters
// Task 5.7 — Write property test for the initials A–Z invariant
// **Validates: Requirements 5.7, 5.8, 5.10**
//
// Property 8 (design.md): For any sequence of entry key events (arrows, A–Z
// letters, Space, and arbitrary other keys) applied from the initial entry
// state, each of the three Initials characters is always exactly one uppercase
// letter in A–Z.
//
// The pure reducer `applyEntryKey(entryState, keyEvent)` lives inside the IIFE
// in index.html. It is not yet published via module.exports and not part of the
// shared load-pure-core helper, so it is lifted out by name (together with its
// cycleLetter + LETTERS dependencies) via this task's own standalone helper.
// index.html remains the single source of truth.

const test = require("node:test");
const assert = require("node:assert/strict");
const fc = require("fast-check");

const {
  applyEntryKey,
  LETTERS
} = require("./helpers/load-entry-reducer-initials.js");

// The initial entry state (Req 4.4): three "A" initials, cursor on the first
// slot. applyEntryKey never mutates its input, so this constant is safe to fold
// from repeatedly.
const INITIAL_ENTRY = { chars: ["A", "A", "A"], cursor: 0 };

// A value is a single A–Z letter when it is a one-character string that is a
// member of LETTERS (char code in [65, 90]).
function isSingleAZLetter(value) {
  return (
    typeof value === "string" &&
    value.length === 1 &&
    LETTERS.indexOf(value) !== -1
  );
}

// Arbitrary for a single key event `{ key }`, drawn from a realistic mix:
//   - the four arrow keys
//   - uppercase and lowercase A–Z single letters (Req 5.7/5.8 setters)
//   - the confirm key, as both " " and "Space"
//   - arbitrary other strings (unknown keys / no-ops, Req 5.9), including
//     multi-char strings, digits, punctuation and the empty string
const uppercaseLetterArb = fc
  .integer({ min: 0, max: 25 })
  .map((i) => String.fromCharCode(65 + i));
const lowercaseLetterArb = fc
  .integer({ min: 0, max: 25 })
  .map((i) => String.fromCharCode(97 + i));

const keyEventArb = fc
  .oneof(
    fc.constantFrom("ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"),
    uppercaseLetterArb,
    lowercaseLetterArb,
    fc.constantFrom(" ", "Space"),
    fc.string() // arbitrary other keys, incl. "", digits, punctuation, words
  )
  .map((key) => ({ key }));

const keySequenceArb = fc.array(keyEventArb, { minLength: 0, maxLength: 50 });

test("Property 8: every initials char stays a single A–Z letter across any key sequence", () => {
  fc.assert(
    fc.property(keySequenceArb, (events) => {
      let state = INITIAL_ENTRY;

      // The initial state must already satisfy the invariant.
      assert.equal(state.chars.length, 3);
      for (const ch of state.chars) {
        assert.ok(isSingleAZLetter(ch));
      }

      for (const event of events) {
        const next = applyEntryKey(state, event);

        // After every step: exactly three chars, each a single A–Z letter.
        assert.equal(
          next.chars.length,
          3,
          "chars must always have exactly 3 entries"
        );
        for (const ch of next.chars) {
          assert.ok(
            isSingleAZLetter(ch),
            `initials char ${JSON.stringify(ch)} must be a single A–Z letter ` +
              `after key ${JSON.stringify(event.key)}`
          );
        }

        // A Space confirm reports to the caller but still returns a well-formed
        // (unchanged) set of initials; continue folding from it either way.
        state = next;
      }
    }),
    { numRuns: 200 }
  );
});
