# Requirements Document

## Introduction

This feature adds a high-score leaderboard to Brick Buster, a single-file HTML5 canvas Breakout clone. The leaderboard tracks the top 10 scores, each paired with 3-letter player initials in the arcade tradition. Scores persist across browser sessions using the browser's local storage. When a game ends (either game over or win) and the final score qualifies for the top 10, the game prompts the player to enter initials arcade-style on the canvas. The leaderboard is displayed on the start screen and on the end screens, with the player's newly added entry visually highlighted.

The feature must integrate with the existing architecture: a single IIFE in a `<script>` tag, vanilla JavaScript with no build tooling or frameworks, canvas-based rendering using the existing `drawCenterText`, `glowText`, and `THEME` helpers, a finite state machine (`STATE = { READY, PLAYING, PAUSED, OVER, WIN }`), and keyboard-driven input via a `keydown` handler.

## Glossary

- **Game**: The Brick Buster application running in the browser, including its state machine and render loop.
- **Leaderboard**: The ordered collection of up to 10 high-score records, sorted from highest score to lowest.
- **Score_Record**: A single leaderboard entry consisting of 3-letter initials and an integer score.
- **Initials**: A sequence of exactly 3 uppercase alphabetic characters (A–Z) identifying a player on a Score_Record.
- **Final_Score**: The integer `score` value held by the Game at the moment a round ends in the OVER or WIN state.
- **Qualifying_Score**: A Final_Score that earns a place in the Leaderboard, defined as a Final_Score greater than zero that is either higher than the lowest current Score_Record or placed while the Leaderboard holds fewer than 10 records.
- **Entry_State**: A new Game state active while the player enters Initials for a Qualifying_Score, in which gameplay is suspended and initial-entry input is accepted.
- **Store**: The browser `localStorage` facility used to persist the Leaderboard under a single named key.
- **Highlighted_Entry**: The Score_Record most recently added by the current player, rendered with distinct visual emphasis when the Leaderboard is displayed.
- **Initial_Cursor**: The index (0, 1, or 2) of the Initials character position currently selected for editing during Entry_State.
- **User-visible indication**: An on-canvas message rendered by the Game to inform the player of an outcome such as a failed save or a rejected Score_Record.
- **Reset_Option**: An on-canvas control shown in the READY state inviting the player to clear all Score_Records from the Leaderboard.
- **Reset_Confirmation**: A transient prompt shown in the READY state after the Reset_Option is triggered, requiring an explicit confirm or cancel decision from the player before any Score_Record is cleared.

## Requirements

### Requirement 1: Persist the Leaderboard across sessions

**User Story:** As a player, I want my high scores to be saved between visits, so that I can see how my past games compare over time.

#### Acceptance Criteria

1. WHEN the Game starts, THE Game SHALL load the Leaderboard from the Store within 2 seconds.
2. IF no Leaderboard exists in the Store when the Game starts, THEN THE Game SHALL initialize the Leaderboard as an empty collection containing 0 Score_Records.
3. IF the Leaderboard data read from the Store cannot be parsed as a valid Leaderboard, THEN THE Game SHALL initialize the Leaderboard as an empty collection containing 0 Score_Records.
4. WHEN a Score_Record is added to the Leaderboard, THE Game SHALL write the updated Leaderboard to the Store under a single named key.
5. IF a write to the Store fails, THEN THE Game SHALL retain the in-memory Leaderboard, continue accepting gameplay input, and present a user-visible indication that the Score_Record was not saved.
6. IF reading the Leaderboard from the Store fails due to the Store being inaccessible, THEN THE Game SHALL initialize the Leaderboard as an empty collection containing 0 Score_Records and continue accepting gameplay input.
7. WHEN a Score_Record is added to the Leaderboard, THE Game SHALL order all Score_Records by score in descending order and SHALL retain only the highest 10 Score_Records, discarding any beyond the 10th.
8. IF a Score_Record to be added does not consist of exactly 3 alphabetic Initials and an integer score in the range 0 to 999,999,999, THEN THE Game SHALL reject the Score_Record, SHALL leave the existing Leaderboard unchanged, and SHALL present a user-visible indication that the Score_Record was invalid.

### Requirement 2: Maintain the top 10 ordered scores

**User Story:** As a player, I want only the ten best scores kept in ranked order, so that the leaderboard shows the most impressive results.

#### Acceptance Criteria

1. THE Leaderboard SHALL hold at most 10 Score_Records.
2. THE Leaderboard SHALL order Score_Records in descending score order, with the highest score at rank 1 and the lowest retained score at rank 10.
3. WHEN a Score_Record is added and the Leaderboard holds more than 10 Score_Records, THE Game SHALL remove the lowest-ranked Score_Records one at a time until exactly 10 remain.
4. WHERE two or more Score_Records have equal scores, THE Game SHALL rank the earlier-added Score_Record ahead of the later-added Score_Record.
5. THE Game SHALL store each score in a Score_Record as an integer in the range 0 to 999,999,999 inclusive.
6. IF a Score_Record to be added has a score that is negative, non-integer, or greater than 999,999,999, THEN THE Game SHALL reject the Score_Record, leave the Leaderboard unchanged, and present a user-visible indication that the score was invalid.

### Requirement 3: Determine score qualification at round end

**User Story:** As a player, I want the game to recognize when I earn a top-ten score, so that I am invited to record my initials.

#### Acceptance Criteria

1. WHEN the Game enters the OVER state, THE Game SHALL evaluate whether the Final_Score is a Qualifying_Score.
2. WHEN the Game enters the WIN state, THE Game SHALL evaluate whether the Final_Score is a Qualifying_Score.
3. WHILE the Leaderboard holds fewer than 10 Score_Records, THE Game SHALL treat any Final_Score greater than zero as a Qualifying_Score.
4. WHILE the Leaderboard holds exactly 10 Score_Records, THE Game SHALL treat a Final_Score as a Qualifying_Score only when the Final_Score is strictly greater than the lowest Score_Record's score, and SHALL treat a Final_Score equal to or less than the lowest Score_Record's score as not qualifying.
5. IF the Final_Score is zero or negative, THEN THE Game SHALL treat the Final_Score as not qualifying.
6. WHEN a Final_Score is a Qualifying_Score, THE Game SHALL invite the player to record Initials for that Final_Score.
7. WHEN a Final_Score is not a Qualifying_Score, THE Game SHALL proceed without inviting the player to record Initials and without adding a Score_Record.

### Requirement 4: Prompt for initials on a qualifying score

**User Story:** As a player, I want to enter my initials arcade-style when I earn a high score, so that my result is attributed to me on the leaderboard.

#### Acceptance Criteria

1. WHEN a round ends with a Qualifying_Score, THE Game SHALL enter the Entry_State.
2. WHILE in the Entry_State, THE Game SHALL render an initials-entry prompt on the canvas showing three character slots and the Final_Score.
3. WHILE in the Entry_State, THE Game SHALL display the Initial_Cursor on the character slot whose index equals the current Initial_Cursor value.
4. WHEN the Game enters the Entry_State, THE Game SHALL set each of the three Initials characters to "A" and set the Initial_Cursor to the first slot (index 0).
5. WHILE in the Entry_State, THE Game SHALL suspend ball movement, paddle movement, and brick collisions.
6. IF a round ends without a Qualifying_Score, THEN THE Game SHALL enter the OVER or WIN state without entering the Entry_State.

### Requirement 5: Edit initials during entry

**User Story:** As a player, I want to pick each of my three letters, so that I can enter the initials I want.

#### Acceptance Criteria

1. WHILE in the Entry_State, WHEN the player presses the Up arrow key, THE Game SHALL advance the character at the Initial_Cursor to the next letter, wrapping from "Z" to "A", and SHALL leave the Initial_Cursor position unchanged.
2. WHILE in the Entry_State, WHEN the player presses the Down arrow key, THE Game SHALL change the character at the Initial_Cursor to the previous letter, wrapping from "A" to "Z", and SHALL leave the Initial_Cursor position unchanged.
3. WHILE in the Entry_State, WHEN the player presses the Right arrow key and the Initial_Cursor is at index 0 or 1, THE Game SHALL move the Initial_Cursor to the next slot.
4. WHILE in the Entry_State, IF the player presses the Right arrow key and the Initial_Cursor is at index 2, THEN THE Game SHALL leave the Initial_Cursor and all Initials characters unchanged.
5. WHILE in the Entry_State, WHEN the player presses the Left arrow key and the Initial_Cursor is at index 1 or 2, THE Game SHALL move the Initial_Cursor to the previous slot.
6. WHILE in the Entry_State, IF the player presses the Left arrow key and the Initial_Cursor is at index 0, THEN THE Game SHALL leave the Initial_Cursor and all Initials characters unchanged.
7. WHILE in the Entry_State, WHEN the player presses a letter key from A to Z and the Initial_Cursor is at index 0 or 1, THE Game SHALL set the character at the Initial_Cursor to that letter and move the Initial_Cursor to the next slot.
8. WHILE in the Entry_State, WHEN the player presses a letter key from A to Z and the Initial_Cursor is at index 2, THE Game SHALL set the character at the Initial_Cursor to that letter and leave the Initial_Cursor at index 2.
9. WHILE in the Entry_State, IF the player presses a key that is neither a letter from A to Z, an arrow key, nor the Space key, THEN THE Game SHALL leave the Initials characters and Initial_Cursor unchanged.
10. THE Game SHALL constrain each Initials character to a single uppercase letter from "A" to "Z".

### Requirement 6: Confirm and record the entry

**User Story:** As a player, I want to submit my chosen initials, so that my score is saved to the leaderboard.

#### Acceptance Criteria

1. WHILE in the Entry_State, WHEN the player presses the Space key, THE Game SHALL create a Score_Record containing the current three Initials characters and the Final_Score.
2. WHEN a Score_Record is created from the Entry_State, THE Game SHALL add the Score_Record to the Leaderboard, ordered by score from highest to lowest, retaining at most the top 10 Score_Records and discarding any Score_Record ranked below position 10.
3. WHEN a Score_Record is added from the Entry_State, THE Game SHALL mark that Score_Record as the Highlighted_Entry.
4. WHEN a Score_Record is added from the Entry_State, THE Game SHALL write the updated Leaderboard to the Store.
5. IF writing the updated Leaderboard to the Store fails, THEN THE Game SHALL retain the updated Leaderboard in memory for the current session and SHALL present a user-visible indication that the score could not be saved persistently.
6. WHEN a Score_Record is added from the Entry_State, THE Game SHALL transition to the OVER state if the round's recorded ending reason is game over, or to the WIN state if the round's recorded ending reason is a win.

### Requirement 7: Display the leaderboard on the start screen

**User Story:** As a player, I want to see the high scores on the start screen, so that I know the target to beat before I play.

#### Acceptance Criteria

1. WHILE in the READY state, THE Game SHALL render the Leaderboard on the canvas, showing up to 10 Score_Records in descending score order.
2. WHILE in the READY state AND the Leaderboard contains zero Score_Records, THE Game SHALL render a message indicating no high scores have been recorded.
3. WHEN the Game renders the Leaderboard, THE Game SHALL display each Score_Record with its rank position (1 through 10, rank 1 highest), Initials, and score.
4. THE Game SHALL render Leaderboard text using the existing neon-glow text styling (glowText) and THEME colors.
5. IF the Leaderboard cannot be read from the Store, THEN THE Game SHALL render the no-high-scores message in the READY state.

### Requirement 8: Display the leaderboard on end screens

**User Story:** As a player, I want to see the leaderboard after a game ends, so that I can see where my latest result ranks.

#### Acceptance Criteria

1. WHILE in the OVER state, THE Game SHALL render the Leaderboard on the canvas alongside the game-over result, displaying each Score_Record with its rank position, Initials, and score.
2. WHILE in the WIN state, THE Game SHALL render the Leaderboard on the canvas alongside the win result, displaying each Score_Record with its rank position, Initials, and score.
3. WHILE in the OVER or WIN state AND the Leaderboard is empty, THE Game SHALL render a message indicating no high scores have been recorded.
4. WHILE a Highlighted_Entry exists in the displayed Leaderboard, THE Game SHALL render the Highlighted_Entry using a THEME color distinct from the color applied to the other Score_Records, such that the Highlighted_Entry is the only Score_Record rendered in that color.
5. WHEN the Game transitions out of the OVER or WIN state into the PLAYING state, THE Game SHALL clear the Highlighted_Entry.
6. THE Game SHALL render end-screen Leaderboard text using the existing neon-glow text styling and THEME colors.

### Requirement 9: Reset the leaderboard from the start screen

**User Story:** As a player, I want to clear the high scores from the start screen behind a confirmation step, so that I can wipe the leaderboard deliberately without losing scores to an accidental key press.

#### Acceptance Criteria

1. WHILE in the READY state AND no Reset_Confirmation is pending, THE Game SHALL render the Reset_Option on the canvas using the existing neon-glow text styling (glowText) and THEME colors.
2. WHILE in the READY state AND no Reset_Confirmation is pending, WHEN the player presses the "R" key, THE Game SHALL display the Reset_Confirmation on the canvas using the existing neon-glow text styling (glowText) and THEME colors.
3. WHILE a Reset_Confirmation is pending, THE Game SHALL render the Reset_Confirmation stating that confirming clears all Score_Records and showing the key to confirm ("Y") and the key to cancel ("N").
4. WHILE a Reset_Confirmation is pending, THE Game SHALL remain in the READY state.
5. WHILE a Reset_Confirmation is pending, WHEN the player presses the Space key, THE Game SHALL leave the Reset_Confirmation pending, leave the Leaderboard unchanged, and SHALL NOT transition to the PLAYING state.
6. WHILE a Reset_Confirmation is pending, WHEN the player presses the "Y" key, THE Game SHALL clear the in-memory Leaderboard to an empty collection containing 0 Score_Records, SHALL clear the Highlighted_Entry, and SHALL dismiss the Reset_Confirmation.
7. WHEN the player confirms the Reset_Confirmation, THE Game SHALL write the empty Leaderboard to the Store under the single named key.
8. IF writing the empty Leaderboard to the Store fails when the player confirms the Reset_Confirmation, THEN THE Game SHALL retain the empty in-memory Leaderboard for the current session, SHALL dismiss the Reset_Confirmation, and SHALL present a user-visible indication that the Leaderboard was not cleared persistently.
9. WHILE a Reset_Confirmation is pending, WHEN the player presses the "N" key, THE Game SHALL dismiss the Reset_Confirmation and SHALL leave the Leaderboard unchanged.
10. WHILE a Reset_Confirmation is pending, IF the player presses a key that is neither "Y" nor "N", THEN THE Game SHALL leave the Reset_Confirmation pending and SHALL leave the Leaderboard unchanged.
11. WHEN the player confirms the Reset_Confirmation, THE Game SHALL render the no-high-scores message in the READY state, showing 0 Score_Records.
