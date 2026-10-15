"use strict";

// Feature: high-score-leaderboard, Property 10: Simulation does not advance outside the PLAYING state
// Task 6.3 — Write property test confirming the simulation does not advance outside PLAYING
// **Validates: Requirements 4.5**
//
// Property 10 (design.md): For any snapshot of ball, paddle, and brick values,
// calling update() while the state is ENTRY (or any non-PLAYING state) leaves
// those values unchanged. The reason: update() early-returns unless
// state === STATE.PLAYING.
//
// APPROACH (a blend of the suggested options):
//   update() is a large stateful function inside the IIFE in index.html that
//   references many module-level bindings and helper functions. Rather than
//   copy it (which would break index.html as the single source of truth), the
//   companion helper test/helpers/load-update.js slices the REAL `update`
//   function text out of index.html by name and evaluates it in a vm context
//   with injected mutable game state (ball, paddle, bricks, keys, …) and
//   working helper stubs.
//
//   The test then, for arbitrary non-PLAYING states and arbitrary
//   ball/paddle/brick snapshots:
//     (1) sets the injected state to a non-PLAYING value,
//     (2) deep-snapshots ball + paddle + bricks,
//     (3) calls the REAL update(),
//     (4) asserts ball + paddle + bricks are byte-for-byte unchanged.
//
//   OBSERVABILITY (critical): the generated ball always has non-zero velocity
//   (dx/dy) and the paddle has a speed with movement keys possibly set, so if
//   the PLAYING guard were absent update() WOULD move the ball/paddle and the
//   snapshot comparison would fail. A dedicated negative-control test proves
//   this by loading update() with the guard stripped and asserting it DOES
//   mutate the same inputs. That makes the positive property meaningful rather
//   than vacuous.

const test = require("node:test");
const assert = require("node:assert/strict");
const fc = require("fast-check");

const { loadUpdate } = require("./helpers/load-update.js");

// ---- Arbitraries -----------------------------------------------------------

// A non-PLAYING state value. Property 10 covers ENTRY specifically and "any
// non-PLAYING state" generally, so we draw from all of them.
const nonPlayingStateArb = fc.constantFrom(
  "ready",
  "paused",
  "entry",
  "over",
  "win"
);

// Ball with a position, radius, non-zero velocity, and speed. Non-zero dx/dy is
// deliberate: an un-guarded update() integrates position by dx/dy, so this is
// what makes a missing guard observable.
const ballArb = fc.record({
  x: fc.double({ min: 1, max: 799, noNaN: true }),
  y: fc.double({ min: 1, max: 599, noNaN: true }),
  r: fc.double({ min: 2, max: 12, noNaN: true }),
  dx: fc
    .double({ min: 1, max: 6, noNaN: true })
    .chain((m) => fc.constantFrom(m, -m)), // non-zero magnitude, either sign
  dy: fc
    .double({ min: 1, max: 6, noNaN: true })
    .chain((m) => fc.constantFrom(m, -m)),
  speed: fc.double({ min: 2, max: 8, noNaN: true }),
});

// Paddle with a position, size, and speed.
const paddleArb = fc.record({
  x: fc.double({ min: 0, max: 700, noNaN: true }),
  y: fc.double({ min: 500, max: 580, noNaN: true }),
  w: fc.double({ min: 60, max: 140, noNaN: true }),
  h: fc.double({ min: 8, max: 20, noNaN: true }),
  speed: fc.double({ min: 4, max: 10, noNaN: true }),
});

// A single brick.
const brickArb = fc.record({
  x: fc.double({ min: 0, max: 740, noNaN: true }),
  y: fc.double({ min: 40, max: 300, noNaN: true }),
  alive: fc.boolean(),
  color: fc.constantFrom("#ff2079", "#00e5ff", "#ffd23f", "#39ff14"),
});

// A grid of bricks (rows of bricks), as update() iterates bricks[r][c].
const bricksArb = fc.array(
  fc.array(brickArb, { minLength: 0, maxLength: 6 }),
  { minLength: 0, maxLength: 4 }
);

// Movement-key flags (so paddle motion is also observable without a guard).
const keysArb = fc.record({ left: fc.boolean(), right: fc.boolean() });

// ---- Helpers ---------------------------------------------------------------

// Count live bricks in a grid (used to size totalBricks so a win path is
// reachable in the negative control).
function countAlive(bricks) {
  let n = 0;
  for (const row of bricks) for (const b of row) if (b.alive) n++;
  return n;
}

// Deep structural snapshot for comparison. JSON is sufficient here because all
// values are finite numbers / booleans / strings.
function snapshot(value) {
  return JSON.stringify(value);
}

// ---- Property 10 (positive) ------------------------------------------------

test("Property 10: update() while non-PLAYING leaves ball/paddle/bricks unchanged", () => {
  fc.assert(
    fc.property(
      nonPlayingStateArb,
      ballArb,
      paddleArb,
      bricksArb,
      keysArb,
      (stateValue, ball, paddle, bricks, keys) => {
        // Fresh extraction per case keeps bindings isolated between runs.
        const env = loadUpdate();

        // Inject the generated world.
        env.set("ball", ball);
        env.set("paddle", paddle);
        env.set("bricks", bricks);
        env.set("keys", keys);
        env.set("totalBricks", countAlive(bricks));
        env.set("destroyed", 0);
        env.set("lives", 3);
        env.set("score", 0);
        env.set("combo", 0);
        // The state under test: anything that is NOT PLAYING.
        env.set("state", stateValue);

        // Snapshot the values Property 10 protects.
        const beforeBall = snapshot(env.get("ball"));
        const beforePaddle = snapshot(env.get("paddle"));
        const beforeBricks = snapshot(env.get("bricks"));

        // Call the REAL simulation step.
        env.update();

        // Nothing may have advanced.
        assert.equal(
          snapshot(env.get("ball")),
          beforeBall,
          "ball changed while state=" + stateValue
        );
        assert.equal(
          snapshot(env.get("paddle")),
          beforePaddle,
          "paddle changed while state=" + stateValue
        );
        assert.equal(
          snapshot(env.get("bricks")),
          beforeBricks,
          "bricks changed while state=" + stateValue
        );

        // State itself must not be flipped by a no-op update().
        assert.equal(env.get("state"), stateValue);
      }
    ),
    { numRuns: 300 }
  );
});

// ---- Negative control ------------------------------------------------------
// Proves the harness can actually OBSERVE a mutation. If update() is loaded with
// the PLAYING guard stripped, then running it over the SAME kind of inputs (a
// moving ball) under a non-PLAYING state DOES change the world — confirming the
// positive property above is non-vacuous (it is the guard, not the harness,
// that produces "unchanged").

test("Property 10 (negative control): without the guard, update() DOES advance the ball", () => {
  let sawMutation = false;

  fc.assert(
    fc.property(
      ballArb,
      paddleArb,
      bricksArb,
      (ball, paddle, bricks) => {
        const env = loadUpdate({ stripGuard: true });

        env.set("ball", ball);
        env.set("paddle", paddle);
        env.set("bricks", bricks);
        env.set("keys", { left: false, right: false });
        env.set("totalBricks", countAlive(bricks) + 1); // avoid instant win
        env.set("destroyed", 0);
        env.set("lives", 3);
        env.set("score", 0);
        env.set("combo", 0);
        // Still a non-PLAYING state — only the guard removal should matter.
        env.set("state", "entry");

        const beforeBall = snapshot(env.get("ball"));
        env.update();
        const afterBall = snapshot(env.get("ball"));

        if (afterBall !== beforeBall) sawMutation = true;
      }
    ),
    { numRuns: 50 }
  );

  // Across the generated cases, a guard-less update() must have moved the ball
  // at least once. (A ball with non-zero dx/dy integrates its position, so this
  // is guaranteed for essentially every input.)
  assert.ok(
    sawMutation,
    "negative control failed: a guard-less update() never changed the ball, " +
      "so the harness could not observe mutation — the positive property would be vacuous"
  );
});

// ---- Source-level guard check (Option A corroboration) ---------------------
// A focused assertion that the real update() begins with the early-return
// guard. loadUpdate() throws if the guard text is absent, so simply loading it
// confirms the single-source-of-truth guard still exists.

test("Property 10 (source guard): update() in index.html retains the non-PLAYING early-return guard", () => {
  const env = loadUpdate();
  assert.equal(env.guardPresent, true);
});
