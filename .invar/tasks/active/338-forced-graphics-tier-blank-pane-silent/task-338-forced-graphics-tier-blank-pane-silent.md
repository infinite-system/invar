# #338 — a forced graphics tier the terminal cannot render paints a silently blank pane

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## The defect (user-reported as "3D demo shows nothing", conductor-reproduced)

The user's persisted settings carried `"graphicsTier": "kitty"`. His terminal
does not render kitty image escapes. Result: the media demo pane opens, the
heading "3D Demo · Cube" paints, and the image area is entirely blank. No
notice, no fallback. The user's report was "3d demo is simply missing
nothing shown". mediaMode=demo and frameIndex advance normally — the model
renders into a framebuffer nobody can see.

## Evidence (probes in this folder, run from repo root with bun)

- `probe-338-demo-default-and-halfblock.ts` — clean HOME, default and
  halfblock tiers: 940 non-blank cells in the bottom half, half-block glyphs
  visible. The demo itself is healthy.
- `probe-338-demo-kitty-setting-blank.ts` — same drive with
  `{"graphicsTier":"kitty"}` in the isolated settings: 391 non-blank cells
  (chrome only), every interior pane row empty, while status reports
  mediaMode=demo frameIndex=22.

## Open question (asked of the user, answer pending)

Does image preview (PNG) render in his terminal? If yes, his terminal DOES
kitty and the demo's kitty encoding path is separately broken — different
fix, same symptom. If no, the forced tier is the whole story.

## The design question for the fix

An explicit user setting deserves respect, but a setting that yields
invisible output with no signal violates the loud-over-silent instinct.
Candidate shapes (builder proposes, does not decide unilaterally):

1. Paint a visible notice in the pane when a graphics-tier image was emitted
   but the tier was forced (not negotiated) — "graphics tier 'kitty' is set;
   if this pane is blank your terminal may not support it (Settings >
   Graphics Tier)".
2. Detect kitty support at startup (query escape with reply timeout) and
   warn when the forced tier contradicts the probe.
3. At minimum: the settings panel entry documents the risk.

Check what image-preview already does for this case — the demo routes
through the existing image capability tier, so the answer may already exist
there (or the gap is shared and this task covers both).

## Invariants in scope (candidates at dispatch)

- src/modules/media/media.invariants.md — the loud-degradation family
  ("Missing ffmpeg is loud and harmless" is the model: absence is LOUD; an
  unrenderable tier is currently silent).
- src/modules/image contract if one exists — shared capability-tier rules.
