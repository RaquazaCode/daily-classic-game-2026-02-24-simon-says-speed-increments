# Implementation Plan: Simon Says (Speed Increments)

## Architecture (Section 1/2)
The MVP is a single-page Vite app that renders a four-pad Simon board to a single canvas. The game loop is deterministic and driven by a fixed-step update function, with `requestAnimationFrame` used only for display. A seeded RNG (`seed` query param with a date fallback) produces the sequence so the same seed always yields the same order. State is stored in a single `state` object containing the current mode (`intro`, `showing`, `input`, `paused`, `fail`), the sequence, the current input index, the lit pad, and round/score values. Rendering reads from this state and draws the pads, their glow state, and minimal HUD data.

User input routes through a single handler that validates against the expected sequence index. Correct inputs advance the index or complete the round. Incorrect inputs transition to the fail state and raise the result overlay. The twist is encoded as a tempo function that scales flash/gap durations based on the current round; the score system multiplies by tempo so higher speed is more valuable. Pause toggles should freeze updates (no timers advance), while restart resets the seed sequence, score, and round. Hooks are mandatory for automation: `window.advanceTime(ms)` steps the fixed loop without wall clock, and `window.render_game_to_text()` returns a compact JSON snapshot for Playwright checks.

Does this architecture look right so far?

## Systems + Verification (Section 2/2)
Game flow uses three timed sub-systems: sequence playback (`showing` with flash and gap timers), player input (`input`), and demo playback (`scripted_demo`) that auto-presses correct pads for deterministic capture. Playback timing derives from the tempo function (minimum flash/gap durations ensure clarity). Rendering uses pad metadata (positions, radii, colors) and draws a central hub plus best score text. The overlay is the only non-canvas UI, used for the intro, pause, and fail states.

Verification uses `pnpm test` to ensure hooks exist, `pnpm build` for bundling, and the Playwright client script to capture deterministic screenshots and text state. The Playwright action burst will start the game (or demo), step via `advanceTime`, and sample `render_game_to_text` to confirm round, score, sequence length, and tempo values increase. We also ensure pause/resume behavior and restart key reset the round and score. The build includes placeholder GIF captures in `assets/gifs` for README sections; these can be replaced by real captures later.

Ready to set up for implementation?
