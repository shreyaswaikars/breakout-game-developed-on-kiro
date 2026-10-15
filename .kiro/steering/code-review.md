---
inclusion: manual
---

# Code review checklist

Review the current code against these criteria and report findings as a
prioritized list (issues first, then suggestions):

1. Correctness: game-state transitions, collision edge cases, off-canvas bugs
2. The CONFIG object: are there magic numbers that should move into it?
3. Function size and naming per the game style guide
4. Performance: any per-frame allocations or layout thrash in the game loop?
5. Input handling: keyboard AND mouse both fully supported?