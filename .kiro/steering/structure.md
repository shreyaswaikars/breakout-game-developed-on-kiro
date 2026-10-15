# Project Structure

## Layout
```
arcade/
├── index.html        # The entire game: HTML, CSS, and JS
└── .kiro/
    └── steering/      # AI assistant guidance (product, tech, structure)
```

The project is intentionally a single file. All new game logic, styles, and markup go in `index.html` unless there is a strong reason to split.

## Organization Within index.html
The code is split into clearly commented sections inside one IIFE, in roughly this order:

1. **Setup** — canvas, context, dimensions (`W`, `H`)
2. **Game state** — `STATE` enum and the current `state`
3. **Entities** — `paddle`, `ball`, `BRICK` config / `bricks` grid, `particles`
4. **Score & lives** — `score`, `combo`, `lives`, `destroyed`
5. **Input** — `keys` object for keyboard state
6. **Audio** — `initAudio`, `playTone`, and `sfx*` helpers
7. **Game setup** — `buildBricks`, `newGame`, `resetBallOnPaddle`, `launchBall`, `startPlaying`
8. **Collision helpers** — `circleRectHit`, `setBallSpeed`
9. **Particles** — `spawnParticles`, `updateParticles`, `drawParticles`
10. **Update** — `update()` handles physics, collisions, and state transitions
11. **Draw** — `drawBricks`, `drawPaddle`, `drawBall`, `drawHUD`, overlays, `roundRect`, `render()`
12. **Main loop** — `loop()` using `requestAnimationFrame`
13. **Input handlers** — keydown/keyup and mouse listeners
14. **Boot** — `newGame()` then `loop()`

## Conventions
- Separate update (logic) from render (drawing); do not mutate game state inside draw functions.
- Game-state transitions are driven by the `STATE` enum; update it rather than tracking ad-hoc flags.
- Tunable gameplay values (sizes, speeds, counts, colors) are defined as named constants near the top (`BALL_BASE_SPEED`, `BRICK`, `ROW_COLORS`, `START_LIVES`); adjust those rather than hard-coding magic numbers inline.
- Keep configuration objects (`paddle`, `ball`, `BRICK`) as the single source of truth for dimensions and positions.
