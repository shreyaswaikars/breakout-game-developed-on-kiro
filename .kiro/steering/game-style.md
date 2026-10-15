---
inclusion: always
---

# Game code style

- Use a single requestAnimationFrame game loop; never setInterval for game logic
- Keep all tunable gameplay values (speeds, sizes, colors, probabilities) in a
  single CONFIG object at the top of the script
- Every new feature must handle all three game states: start screen, playing, game over
- Prefer small named functions over long anonymous ones; no function over ~40 lines
- All functions must be arrow functions (e.g. `const update = () => {...}`); do not use the `function` keyword