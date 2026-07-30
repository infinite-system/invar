# Brief #339 round 1 — supersampled demo resolution on kitty/sixel tiers

Read [AGENTS.md](../../../../AGENTS.md) fully before any work. Load
[.claude/skills/ibr/IBR.md](../../../../.claude/skills/ibr/IBR.md). The task
file in this folder carries the design shape and constraints — it is part of
this brief.

Order of work:

1. MEASURE FIRST. Instrument `SoftwareScene.render` per-frame milliseconds at
   cell resolution and at 2x, 4x, 8x per-cell scales, per scene (cube,
   torus), at a realistic pane (about 100x24 cells). A table of numbers
   decides the default scale. A scale that cannot sustain the current demo
   frame rate is rejected for that scene, not tuned around.
2. Implement the tier-aware scale per the task file: supersampled
   `CellFramebuffer` (or a sibling) feeding the existing pixel-image path
   the PNG preview uses; half-block path byte-identical to today.
3. Verify by driving: extend
   [smoke-media-harness.ts](../../../../scripts/harness/smoke-media-harness.ts)
   kitty arm to assert the ENCODER INPUT dimensions equal cells x scale, and
   that the half-block arm still renders at cell resolution. Positive
   control: plant a wrong scale, quote the red, remove.
4. The working-set and memory-flatness assertions must pass with the new
   constant. If a record's stated constant changes, propose the refines in
   your report — do not edit the contract silently.
5. Final pass: media smoke + `bunx tsc --noEmit; echo TSC=$?` +
   `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`.

Do not run scripts/merge-gate.sh. Commit in your worktree; no push, merge,
or tag. Write your READY report as `report-339-<slug>.md` (this task's slug)
in this folder. END STATE: that report exists here with the measurement
table, the scale decision, and quoted positive controls.

## Invariants in scope

- [Animation reuses one fixed framebuffer working set](../../../../src/modules/media/media.invariants.md)
  — the supersampled buffer is a bigger FIXED set; no per-frame allocation.
- [Playback memory is independent of duration](../../../../src/modules/media/media.invariants.md)
  — unchanged; confirm at the new scale.
- [Animated media is a removable runtime plugin](../../../../src/modules/media/media.invariants.md)
  — removal build proof must stay green.
- The #324 no-capability-detection-in-media rule: tier arrives from the
  existing image capability seam only.
- Report record by record: upheld, violated, or needs refinement. Name any
  record this list MISSED.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy. Include
the section even when it reads "None observed".
