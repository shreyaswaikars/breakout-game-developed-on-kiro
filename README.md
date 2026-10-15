# Breakout — Neon Edition

A retro neon-styled Breakout game that runs entirely in the browser. Smash all
the bricks with a bouncing ball while keeping it in play with your paddle.

## How to Play

Open `index.html` in any modern browser. Press **Space** to start, then move the
paddle to bounce the ball upward and destroy every brick. You have 3 lives — lose
the ball below the paddle and you lose a life. Clear all bricks to win.

## Controls

| Action          | Input                 |
| --------------- | --------------------- |
| Move paddle     | ← / → arrows or mouse |
| Start / Restart | Space                 |
| Pause / Resume  | P                     |

## Features

- 5 rows × 10 columns of colored bricks (50 total)
- Combo scoring: chained brick hits without touching the paddle multiply points
- Ball speeds up for every 5 bricks destroyed
- 3 lives with heart-based life display
- Live HUD showing score, bricks remaining, and current combo multiplier
- Synthesized sound effects via the Web Audio API (no audio files)
- Particle burst effects on brick destruction
- Neon-on-dark theme with glow and CRT-style scanlines
- Ready, Playing, Paused, Game Over, and Win states

## Power-ups

None in the current version.

## Development & Testing

The game itself ships with **zero runtime dependencies** — `index.html` is fully
self-contained and never references any package. The tooling below is **dev-only**
and is used only to test the pure game logic.

Install dev dependencies once:

```sh
npm install
```

Run the test suite as a single run (not watch mode):

```sh
npm test        # runs: node --test "test/**/*.test.js"
```

Tests use Node's built-in test runner (`node:test`) together with
[fast-check](https://github.com/dubzzz/fast-check) for property-based tests.
Both are dev dependencies and must never be imported from `index.html`.
