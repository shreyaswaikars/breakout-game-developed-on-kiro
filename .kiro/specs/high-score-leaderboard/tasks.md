# Implementation Plan: High-Score Leaderboard

## Overview

The implementation extends the existing single-file IIFE in `index.html` (vanilla JS, no build tooling). Work proceeds inside-out: build and verify the **pure logic core** first (validation, insert/order/trim, qualification, serialization, letter cycling, pure entry-key reducer), then layer the side-effecting edges (persistence over `localStorage`), then wire the state machine (new `ENTRY` state, `endRound` interception, entry/reset controllers), and finally the canvas rendering. Each pure function is factored to be `require`-able in Node via a conditional `module.exports` guard so property-based tests exercise it without a DOM.

Testing tooling does not exist yet, so Task 1 stands up `node:test` + `fast-check` as dev-only dependencies (never shipped in `index.html`). Property tests target the pure core; example/edge-case tests cover persistence wiring, state routing, and rendering using a fake `localStorage` and render-helper spies. Property sub-tasks are placed immediately after the code they validate to catch errors early.

## Tasks

- [x] 1. Set up dev-only test tooling (no runtime impact on `index.html`)
  - Create `package.json` with a `test` script running Node's built-in test runner against `test/**/*.test.js`
  - Add `fast-check` as a dev dependency (property-based testing library); keep it out of `index.html` so the game ships with zero runtime dependencies
  - Create a `test/` directory and a `.gitignore` entry for `node_modules/`
  - Add a short note documenting that tests run with `node --test` (single run, not watch mode)
  - _Requirements: non-functional (supports Testing Strategy; enables property tests for Req 1, 2, 3, 5, 6, 9)_

- [x] 2. Implement the pure leaderboard logic core and expose it for tests
  - [x] 2.1 Add constants and record validation
    - In the IIFE, add `MAX_RECORDS = 10`, `MAX_SCORE = 999999999`, and `LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"`
    - Implement `isValidRecord(rec)`: true only when `rec.initials` matches `/^[A-Z]{3}$/` and `rec.score` is an integer in `[0, MAX_SCORE]`
    - _Requirements: 1.8, 2.5, 2.6_

  - [x] 2.2 Implement `addRecord(board, rec)` (non-mutating insert, stable order, trim)
    - Return `board.slice()` unchanged when `isValidRecord(rec)` is false (the "leave unchanged" guarantee)
    - Insert before the first existing record with a strictly smaller score (keeps equal scores in insertion order), then trim to `MAX_RECORDS`; never mutate the input array
    - _Requirements: 1.7, 2.1, 2.2, 2.3, 2.4, 6.2_

  - [x] 2.3 Implement `qualifies(board, finalScore)`
    - Return false for non-integer or `<= 0` scores; return true when `board.length < MAX_RECORDS`; otherwise true only when `finalScore` strictly exceeds the lowest record's score
    - _Requirements: 3.3, 3.4, 3.5_

  - [x] 2.4 Implement `serializeLeaderboard` / `deserializeLeaderboard`
    - `serializeLeaderboard(board)` returns `JSON.stringify(board)`
    - `deserializeLeaderboard(text)` wraps `JSON.parse` in try/catch, returns `[]` for non-array or unparseable input, filters through `isValidRecord`, then rebuilds via `addRecord` so the result always satisfies the order + length invariants
    - _Requirements: 1.2, 1.3, 1.4, 6.4_

  - [x] 2.5 Implement `cycleLetter(ch, dir)`
    - Shift within `A`–`Z` using `(LETTERS.indexOf(ch) + dir + 26) % 26`, wrapping `Z`→`A` for `+1` and `A`→`Z` for `-1`
    - _Requirements: 5.1, 5.2, 5.10_

  - [x] 2.6 Add the conditional `module.exports` guard at the end of the IIFE
    - Export `isValidRecord, addRecord, qualifies, serializeLeaderboard, deserializeLeaderboard, cycleLetter` (and `applyEntryKey` once it exists in Task 5) under `if (typeof module !== "undefined" && module.exports)` so Node can require the pure core while the browser ignores it
    - _Requirements: non-functional (single source of truth for tested logic; supports Req 1, 2, 3, 5, 6)_

  - [x] 2.7 Write property test for insert ordering and length bound
    - **Property 1: Insert preserves descending order and the length bound**
    - **Validates: Requirements 1.7, 2.1, 2.2, 2.3, 6.2**

  - [x] 2.8 Write property test for equal-score tiebreak
    - **Property 2: Equal scores keep insertion order**
    - **Validates: Requirements 2.4**

  - [x] 2.9 Write property test for the qualification predicate
    - **Property 3: Qualification predicate is correct across all branches** (include the full-board monotonicity check)
    - **Validates: Requirements 3.3, 3.4, 3.5**

  - [x] 2.10 Write property test for serialization round-trip
    - **Property 4: Persistence round-trips a valid leaderboard**
    - **Validates: Requirements 1.3, 1.4, 6.4**

  - [x] 2.11 Write property test for deserialization robustness
    - **Property 5: Deserialization of non-leaderboard input yields a valid board** (arbitrary strings, non-array JSON, arrays with malformed records)
    - **Validates: Requirements 1.2, 1.3**

  - [x] 2.12 Write property test for letter cycling
    - **Property 6: Letter cycling up and down are inverse and wrap within A–Z**
    - **Validates: Requirements 5.1, 5.2, 5.10**

  - [x] 2.13 Write unit tests for `isValidRecord` edge cases
    - Reject non-string/short/long/lowercase initials; reject negative, non-integer, and `> MAX_SCORE` scores; accept the `0` and `999999999` boundaries
    - _Requirements: 1.8, 2.5, 2.6_

- [x] 3. Checkpoint - pure logic core
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement the persistence module over `localStorage`
  - [x] 4.1 Implement `loadLeaderboard` and `saveLeaderboard`
    - Add `STORE_KEY = "brickBuster.leaderboard.v1"` (single named key)
    - `loadLeaderboard()`: try `getItem`; `null` → `{ board: [], ok: true }`; present raw → `{ board: deserializeLeaderboard(raw), ok: true }`; any throw → `{ board: [], ok: false }`
    - `saveLeaderboard(board)`: try `setItem(serializeLeaderboard(board))` returning `true`; on any throw return `false`
    - Ensure no exception can escape this module
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 6.4, 6.5, 7.5, 9.7, 9.8_

  - [x] 4.2 Write unit tests for persistence wiring with a fake `localStorage`
    - Use an in-memory fake that can be forced to throw; assert the single `STORE_KEY` is used, a missing key and a read-throw both yield `[]` (with `ok` reflecting access), corrupt data yields `[]`, a successful save returns `true`, and a write-throw returns `false` without discarding the passed board
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 6.4, 6.5, 7.5, 9.8_

- [x] 5. Implement the entry controller and pure entry-key reducer
  - [x] 5.1 Add entry/control module-level state and `beginEntry`
    - Add `let entry = { chars: ["A","A","A"], cursor: 0 }`, `let endingReason = null`, `let highlightedEntry = null`, `let statusMessage = null`
    - `beginEntry()` resets `entry.chars` to `["A","A","A"]`, `entry.cursor` to `0`, and sets `state = STATE.ENTRY`
    - _Requirements: 4.1, 4.4_

  - [x] 5.2 Implement the pure `applyEntryKey(entryState, keyEvent)` reducer
    - Given a `{ chars, cursor }` and a key descriptor, return the next `{ chars, cursor }` without touching the DOM: Up/Down cycle the letter at the cursor via `cycleLetter` (cursor fixed); Right advances the cursor (no-op at index 2); Left retreats the cursor (no-op at index 0); an A–Z letter sets the cursor char and advances (sticky at index 2); any other key is a no-op; a confirm signal (Space) is reported to the caller rather than mutating letters
    - Keep letters constrained to a single A–Z character on every path
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10_

  - [x] 5.3 Implement `handleEntryKey(e)` wiring over the pure reducer
    - Dispatch the DOM `keydown` into `applyEntryKey`, `preventDefault()` on recognized keys, and call `confirmEntry()` on Space
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 6.1_

  - [x] 5.4 Implement `confirmEntry()`
    - Build `{ initials: entry.chars.join(""), score }`; if valid, `leaderboard = addRecord(leaderboard, rec)`, set `highlightedEntry = rec` (reference identity), call `saveLeaderboard` and set `statusMessage = "SCORE NOT SAVED"` on failure; set `statusMessage = "INVALID ENTRY"` on the defensive invalid branch; then set `state` to `OVER` or `WIN` from `endingReason`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 5.5 Extend the `module.exports` guard with `applyEntryKey`
    - Add `applyEntryKey` to the exported pure functions so its properties can be tested in Node
    - _Requirements: non-functional (supports Req 5)_

  - [x] 5.6 Write property test for cursor movement bounds
    - **Property 7: Cursor movement stays within bounds and never alters the letters**
    - **Validates: Requirements 5.3, 5.4, 5.5, 5.6**

  - [x] 5.7 Write property test for the initials A–Z invariant
    - **Property 8: Initials characters are always single A–Z letters**
    - **Validates: Requirements 5.7, 5.8, 5.10**

  - [x] 5.8 Write property test for unrecognized-key no-op
    - **Property 9: Non-recognized entry keys leave entry state unchanged**
    - **Validates: Requirements 5.9**

  - [x] 5.9 Write unit tests for entry init and confirm
    - `beginEntry` yields `["A","A","A"]` + cursor 0 + `ENTRY`; `confirmEntry` builds the record, marks `highlightedEntry` by reference, adds it to the leaderboard, and routes to `OVER`/`WIN` by `endingReason`; a failed save sets `statusMessage` but retains the board; cursor no-ops at the ends and letter stickiness at index 2
    - _Requirements: 4.4, 5.4, 5.6, 5.8, 6.1, 6.3, 6.6_

- [x] 6. Add the ENTRY state and intercept end-of-round transitions
  - [x] 6.1 Add `ENTRY` to the `STATE` enum and clear transient state in `startPlaying`
    - Add `ENTRY: "entry"` to `STATE`; in `startPlaying()` set `highlightedEntry = null` and `statusMessage = null` before starting a new game
    - _Requirements: 4.1, 8.5_

  - [x] 6.2 Implement `endRound(reason)` and reroute the two `update()` end sites
    - `endRound(reason)` records `endingReason`, plays the existing game-over/win sound once, and either calls `beginEntry()` when `qualifies(leaderboard, score)` is true or sets `state` to `OVER`/`WIN` otherwise
    - Replace the inline `state = STATE.OVER` / `state = STATE.WIN` assignments (and their sound calls) in `update()` with `endRound("over")` / `endRound("win")`
    - _Requirements: 3.1, 3.2, 3.6, 3.7, 4.1, 4.6_

  - [x] 6.3 Write property test confirming the simulation does not advance outside PLAYING
    - **Property 10: Simulation does not advance outside the PLAYING state** (snapshot ball/paddle/brick values, call `update()` while `ENTRY`, assert unchanged)
    - **Validates: Requirements 4.5**

  - [x] 6.4 Write unit tests for end-of-round routing
    - Drive `endRound("over")`/`endRound("win")` with qualifying and non-qualifying scores; assert ENTRY vs OVER/WIN transitions and that `endingReason` restores the correct terminal state after `confirmEntry`
    - _Requirements: 3.1, 3.2, 3.6, 3.7, 4.1, 4.6, 6.6_

- [x] 7. Implement the reset controller for the READY screen
  - [x] 7.1 Add `resetPending` and implement `handleReadyKey(e)`
    - Add `let resetPending = false`; while pending, `Y` clears `leaderboard` to `[]`, clears `highlightedEntry`, dismisses the prompt, saves, and sets `statusMessage = "RESET NOT SAVED"` on save failure; `N` dismisses leaving the board intact; any other key (including Space) is inert and keeps the prompt pending; while not pending, `R` opens the confirmation
    - Return `true` whenever the key was handled here so the main handler short-circuits before the Space-to-start branch (keeps Space inert while pending)
    - _Requirements: 9.2, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11_

  - [x] 7.2 Write property test for reset emptying the board
    - **Property 11: Reset yields an empty leaderboard**
    - **Validates: Requirements 9.6, 9.11**

  - [x] 7.3 Write unit tests for the reset flow
    - `R` opens the confirmation and stays READY; Space is inert while pending (no PLAYING transition); `Y` clears board + highlight + dismisses + saves; a failed save sets `statusMessage` but keeps the empty board; `N` dismisses leaving the board intact; other keys keep it pending
    - _Requirements: 9.2, 9.4, 9.5, 9.6, 9.8, 9.9, 9.10, 9.11_

- [x] 8. Checkpoint - controllers and state machine
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Wire the single `keydown` handler to dispatch by state
  - [x] 9.1 Restructure the `keydown` listener for ENTRY and READY-reset dispatch
    - Guard paddle-arrow flags to only set during `PLAYING`; when `state === STATE.ENTRY`, route to `handleEntryKey(e)` and return; when `state === STATE.READY`, consult `handleReadyKey(e)` first and short-circuit (preventing Space-to-start) if it handled the key; preserve existing Space-to-start and `P` pause/resume behavior for the remaining states
    - _Requirements: 4.5, 5.1, 5.2, 5.3, 5.5, 5.7, 6.1, 9.2, 9.5_

- [x] 10. Implement leaderboard rendering
  - [x] 10.1 Implement `drawLeaderboard(board, x, topY, opts)`
    - Render the no-high-scores message in `THEME.dim` for an empty board; otherwise draw up to 10 left-aligned rows of rank (1-based) + initials + zero-padded score using `glowText` + `THEME`; render the record that is `=== highlightedEntry` in a distinct THEME color (`THEME.yellow`) with stronger glow while all others use `THEME.cyan`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 8.6_

  - [x] 10.2 Add the READY render branch (leaderboard + reset affordance + status)
    - In the READY branch of `render()`, draw the leaderboard beneath the existing title/prompt; when not `resetPending` show the Reset_Option hint via `glowText`; when `resetPending` show the Reset_Confirmation stating that confirming clears all scores with the `Y`/`N` keys; draw `statusMessage` near the bottom when set
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 9.1, 9.2, 9.3, 9.4, 9.11_

  - [x] 10.3 Add the ENTRY render branch
    - Dim the field (reuse the existing overlay), render "NEW HIGH SCORE!", the Final_Score, and the three initial slots via `glowText`; emphasize the slot at `entry.cursor` so the Initial_Cursor is visible; show the Up/Down/Left/Right/Space hint
    - _Requirements: 4.2, 4.3_

  - [x] 10.4 Add leaderboard to the OVER and WIN render branches
    - Keep the existing `drawCenterText` result lines and draw `drawLeaderboard` beneath them so the Highlighted_Entry is emphasized; render the no-high-scores message when empty; draw `statusMessage` when set
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6_

  - [x] 10.5 Write unit tests for rendering via render-helper spies
    - Spy on `glowText`/`drawLeaderboard`; assert the leaderboard renders on READY/OVER/WIN/ENTRY, the no-high-scores message shows on an empty board, each row carries rank + initials + score, THEME colors are used, and exactly one row (the Highlighted_Entry) is drawn in the distinct highlight color; assert the ENTRY branch draws the score and the cursor emphasis
    - _Requirements: 4.2, 4.3, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 8.6, 9.1, 9.3, 9.11_

- [x] 11. Wire the boot sequence
  - [x] 11.1 Load the leaderboard at boot before the loop starts
    - Call `loadLeaderboard()` once during boot, assign `leaderboard = loaded.board` (empty on missing/corrupt/inaccessible), then run the existing `newGame()`/`loop()` boot path
    - _Requirements: 1.1, 1.2, 1.3, 1.6_

- [x] 12. Final checkpoint - full feature
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Property tests (2.7–2.12, 5.6–5.8, 6.3, 7.2) each map to exactly one Correctness Property from the design, configured for at least 100 generated cases and tagged `// Feature: high-score-leaderboard, Property {n}: {text}`.
- `fast-check` + `node:test` are dev-only; they must never be referenced from `index.html`, which keeps shipping with zero runtime dependencies.
- The pure core is exported through a conditional `module.exports` guard so the identical source runs in the browser and is `require`-able in tests — a single source of truth for the tested logic.
- Each task references specific requirement sub-clauses for traceability; checkpoints provide incremental validation points.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.13"] },
    { "id": 3, "tasks": ["2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "4.1"] },
    { "id": 4, "tasks": ["4.2", "5.1", "5.2"] },
    { "id": 5, "tasks": ["5.3", "5.4", "5.6", "5.7", "5.8"] },
    { "id": 6, "tasks": ["5.5", "5.9", "6.1"] },
    { "id": 7, "tasks": ["6.2", "7.1"] },
    { "id": 8, "tasks": ["6.3", "6.4", "7.2", "7.3"] },
    { "id": 9, "tasks": ["9.1", "10.1"] },
    { "id": 10, "tasks": ["10.2", "10.3", "10.4"] },
    { "id": 11, "tasks": ["10.5", "11.1"] }
  ]
}
```
