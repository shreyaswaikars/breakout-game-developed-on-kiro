# Tech Stack

## Overview
- **Language:** Vanilla JavaScript (ES5/ES6, no transpilation)
- **Rendering:** HTML5 Canvas 2D API (`<canvas id="game">`, 800x600)
- **Audio:** Web Audio API — all sound is synthesized at runtime via oscillators; there are no audio files
- **Styling:** Inline CSS in a `<style>` block
- **Build system:** None
- **Dependencies:** None (no npm, no package.json, no external libraries or CDNs)

## Project Shape
Everything lives in a single `index.html`: markup, CSS, and the game script. The script runs inside an IIFE in `"use strict"` mode to avoid polluting the global scope.

## Common Commands
There is no build, compile, or test tooling. To run the game:

- **Run:** Open `index.html` directly in a browser, or serve the folder, e.g.:
  ```bash
  python3 -m http.server 8000
  # then visit http://localhost:8000
  ```

Note: the Web Audio context must be unlocked by a user gesture (handled on the first Space press), so audio only starts after interaction.

## Conventions
- Keep the project dependency-free and buildless; prefer plain browser APIs over libraries.
- Use `const`/`let`, strict mode, and `requestAnimationFrame` for the main loop.
- Namespace all game code inside the existing IIFE; do not add globals.
- Synthesize any new sounds with the Web Audio API rather than adding asset files.

## Constraints

- Single-file architecture: all HTML, CSS, and JavaScript live in index.html
- No external libraries, frameworks, or build tools
- No external assets - graphics are canvas-drawn, sounds are Web Audio API
- Must run by opening the file directly in a browser