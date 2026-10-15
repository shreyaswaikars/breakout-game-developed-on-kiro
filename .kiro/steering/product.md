# Product

A browser-based **Breakout** arcade game. The player controls a paddle to bounce a ball and destroy a wall of bricks.

## Core Features
- Classic brick-breaking gameplay with a 5x10 grid of colored bricks
- Paddle control via keyboard (arrow keys) or mouse
- Lives system (3 lives, shown as hearts in the HUD)
- Scoring with a combo multiplier that grows while the ball stays off the paddle
- Progressive difficulty: ball speeds up every 5 bricks destroyed
- Game states: ready, playing, paused, game over, win
- Synthesized sound effects (Web Audio API, no audio files)
- Particle effects when bricks shatter

## Controls
- Move: Left/Right arrows or mouse
- Start / Restart: Space
- Pause / Resume: P

## Design Goals
- Zero dependencies, zero build step — runs by opening a single HTML file
- Self-contained and portable: all logic, styles, and assets live in one file

## Audience
- Built for casual play during a workshop; fun and visual polish beat realism.