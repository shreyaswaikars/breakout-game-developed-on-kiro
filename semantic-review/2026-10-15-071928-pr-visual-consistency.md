# Visual consistency of Brick Buster against the retro neon-on-dark theme

Brick Buster is a single-file canvas Breakout game whose UI is driven by a `THEME` object plus a CSS block, both intended to encode the retro neon-on-dark look defined in `retro-theme.md`. The chrome (page background, title, HUD, and all six screen overlays) is largely faithful: monospace throughout, UPPERCASE headings and HUD labels, `glowText`/`shadowBlur` glow on text, and a `drawScanlines` CRT pass over the whole canvas. The gap is in the gameplay primitives and a handful of hardcoded literals: the brick palette, paddle, and ball use colors that appear nowhere in the four-color theme, several draw calls bypass `THEME` with literal hex/rgba, and the dark background exists in three slightly different shades. These are consistency defects, not functional bugs — the screens all render coherently — but they pull the field art away from the specified palette.

Watch for: brick row colors are entirely off-palette (confirmed); paddle and ball are off-palette with no glow (confirmed); `THEME.dim` `#5a6a8a` is a fifth color not in the spec (confirmed); the background exists as `#0a0a1a`, `#050510`, and `rgba(5,5,16)` across CSS, canvas, and overlays (confirmed).

**Verdict**: NEEDS_CHANGES

## High-level view

The theme palette has exactly four colors (bg `#0a0a1a`, pink `#ff2079`, cyan `#00f0ff`, yellow `#f5f543`). The text UI honors them through `THEME`, but the gameplay art does not: the five brick row colors, the paddle, and the ball are all drawn with literals that are not in the palette, and the paddle and ball carry no glow despite the "all UI elements get a subtle glow" rule. These are the most visible divergences because bricks fill the top third of the playfield on every PLAYING frame.

`THEME` is meant to be the single place the look is tuned, but several draw calls route around it with inline literals — the brick top-highlight `rgba(255,255,255,0.18)`, the unfilled-heart stroke `rgba(255,32,121,0.3)` (a hand-typed copy of pink), the paddle and ball fills, and the three overlay rectangles. Even where the literal happens to match a palette color, hardcoding it defeats the one-place-to-tune intent and invites drift.

The background color is specified once but implemented three ways: the page CSS uses `#0a0a1a`, the canvas CSS fill uses `#050510`, and the end/entry overlays use `rgba(5,5,16,…)`. The two darker shades are close enough to read as intentional vignetting, but they are not the specified value and are not sourced from `THEME`.

Typography and the glow/scanline treatment are consistent across READY, PLAYING, PAUSED, ENTRY, OVER, and WIN, and the leaderboard rows reuse `THEME.cyan`/`THEME.yellow` with `glowText`, so the new leaderboard/entry/reset UI matches the rest of the chrome well. The one new-UI color concern is the reliance on `THEME.dim` for hints and the empty-board message, which introduces a non-palette gray.

<details>
<summary>Issues (7)</summary>

1. **Off-palette brick colors (High)** — `ROW_COLORS` uses five colors (`#ff4d6d`, `#ff922b`, `#ffe066`, `#51cf66`, `#4dabf7`) none of which are in the theme palette; remap rows onto `THEME.pink`/`THEME.cyan`/`THEME.yellow` (and tints derived from them) so the playfield reads as neon-on-dark.
2. **Off-palette paddle and ball (High)** — paddle `#dfe8ff` and ball `#ffffff` are near-white and not in the palette; recolor to a palette accent (e.g. paddle `THEME.cyan`, ball `THEME.yellow`) sourced from `THEME`.
3. **Paddle and ball have no glow (Medium)** — the steering rule says all UI elements get a subtle glow, but `drawPaddle`/`drawBall` set only a flat `fillStyle`; wrap them in `shadowColor`/`shadowBlur` like `glowText` and the filled heart.
4. **`THEME.dim` is a fifth color (Medium)** — `#5a6a8a` is not in the four-color palette yet is used for hints, the bricks-remaining HUD, the reset hint, and the empty-board message; replace with a dimmed form of a palette color (e.g. low-alpha cyan) or document it as an intentional muted-UI extension.
5. **Draw calls bypass `THEME` (Medium)** — brick top-highlight `rgba(255,255,255,0.18)`, unfilled-heart stroke `rgba(255,32,121,0.3)`, paddle/ball fills, and the overlay rectangles use inline literals instead of `THEME`; move these into `THEME` so the look tunes in one place.
6. **Background has three values (Low)** — page CSS `#0a0a1a`, canvas CSS `#050510`, overlays `rgba(5,5,16,…)`; standardize on `THEME.bg` (or add named `THEME` entries for the darker field/overlay shades) so the specified `#0a0a1a` is the single source.
7. **Hardcoded pink in heart stroke (Low)** — `rgba(255,32,121,0.3)` duplicates `THEME.pink` by hand; derive it from `THEME.pink` to avoid drift if the pink is retuned.

</details>

<details>
<summary>Details</summary>

### Brick palette is entirely off-theme

`ROW_COLORS = ["#ff4d6d", "#ff922b", "#ffe066", "#51cf66", "#4dabf7"]` (confirmed) is the single largest divergence from the palette rule in `retro-theme.md`, which lists exactly four colors: bg `#0a0a1a`, pink `#ff2079`, cyan `#00f0ff`, yellow `#f5f543`. None of the five brick colors is any of those — they are a soft pastel rainbow (coral, orange, pale yellow, green, blue). Bricks occupy the top third of the canvas on every PLAYING frame and the particle bursts inherit `b.color`, so this off-palette set is the most prominent color on screen and the particles carry it across the field. The pale `#ffe066` yellow is also close enough to `THEME.yellow` to be mistaken for the HUD score color.

Fix: map the five rows onto the three accents and derived tints, e.g. `[THEME.pink, THEME.yellow, THEME.cyan, <pink tint>, <cyan tint>]`, keeping all brick colors inside the palette. If five visually distinct rows are required, derive the extra two as alpha/brightness variants of the three accents rather than introducing new hues.

### Paddle and ball are off-palette and unlit

`drawPaddle` fills `#dfe8ff` and `drawBall` fills `#ffffff` (confirmed) — both near-white, neither in the palette. They are the two primary moving objects, so their neutral white reads as flat against the neon field. Separately, this trips the glow rule ("all UI elements get a subtle glow"): `drawPaddle` and `drawBall` set a flat `fillStyle` with no `shadowBlur`, unlike `glowText` and the filled-heart path which both set `shadowColor`/`shadowBlur`. The brick top-highlight (`rgba(255,255,255,0.18)`) is likewise unlit, but as a 4px specular strip that is defensible; the paddle and ball are not.

Fix: recolor both to palette accents sourced from `THEME` (e.g. paddle `THEME.cyan`, ball `THEME.yellow`) and add a `shadowColor`/`shadowBlur` glow matching the fill, mirroring the filled-heart treatment.

### `THEME.dim` introduces a fifth color

`THEME.dim = "#5a6a8a"` (confirmed) is a muted slate-blue used for the keyboard hint line, the "BRICKS N" HUD counter, the READY reset hint, the ENTRY instructions, and the empty-board "NO HIGH SCORES YET" message. It is not in the four-color palette. A dedicated muted tone for secondary text is a reasonable UI need, but as written it is a new hue rather than a dimmed palette color, so it reads as a slightly different family from the cyan/pink/yellow around it. Because the leaderboard empty-state and several new-UI hints depend on it, this color choice directly affects the consistency of the new leaderboard/entry/reset UI with the rest of the look.

Fix: derive the muted tone from a palette color (e.g. low-alpha `THEME.cyan`) so secondary text stays within the palette family, or explicitly document `dim` in the steering as an intentional muted-UI extension.

### Draw calls that bypass THEME

`THEME` is described in-code as the one place the look is tuned, but several draw calls use inline literals instead (confirmed): the brick top-highlight `rgba(255,255,255,0.18)` in `drawBricks`, the unfilled-heart stroke `rgba(255,32,121,0.3)` in `drawHeart`, the paddle `#dfe8ff` and ball `#ffffff` fills, and the three overlay rectangles (`rgba(5,5,16,0.78)` in `drawCenterText` and the ENTRY overlay, `rgba(5,5,16,0.72)` in `drawPauseOverlay`). The unfilled-heart stroke is the sharpest case: `rgba(255,32,121,0.3)` is `THEME.pink` typed out by hand at 30% alpha, so if the pink is ever retuned the empty hearts silently fall out of sync. Routing these through `THEME` keeps the palette authoritative and prevents drift.

### Background exists in three shades

The dark background is specified once as `#0a0a1a` but implemented as three values (confirmed): the page `body` CSS uses `#0a0a1a` (matches, and `THEME.bg` also holds it), the `#game` canvas CSS fill uses `#050510`, and every full-screen overlay uses `rgba(5,5,16,…)`. The two darker shades give the canvas a vignette against the page, which looks intentional, but they are not the specified color and are not sourced from `THEME` (`THEME.bg` is defined but never actually used in a draw call — `clearRect` plus the CSS canvas background provide the field). This is low severity because the effect is coherent, but it means the specified `#0a0a1a` is not the single source of truth for "dark background."

Fix: either standardize the canvas/overlay darks on `THEME.bg`, or add explicit named entries (e.g. `THEME.field`, `THEME.overlay`) so the darker shades are deliberate palette members rather than scattered literals.

</details>

<details>
<summary>File map</summary>

- `index.html` — single-file game; review covers the `<style>` block (page/canvas/title/hint colors and typography) and the `<script>` draw code: `THEME`, `ROW_COLORS`, `drawBricks`, `drawPaddle`, `drawBall`, `drawHeart`, `drawHUD`, `drawCenterText`, `glowText`, `drawScanlines`, `drawPauseOverlay`, `drawLeaderboard`, and the per-state blocks in `render` (READY/PAUSED/ENTRY/OVER/WIN).

Full source read in place; no diff tooling used since this is a whole-file visual audit, not a PR delta.
</details>
