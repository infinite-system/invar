# 217 — split the fused Geometry-aggregates invariant into its two generators

State: ACTIVE
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: architecture-hygiene

## Outline

Refinement flagged by #122 and deliberately not acted on there (a contract change
needs its own task). *Geometry aggregates match their consumers* fuses two rules
with different generators:

- "Exact hard boundaries" is editor geometry (`TextDocument.maximumLineWidth`,
  `EditorWrap.totalVisualRows`) and belongs where it is.
- "Exact proportional inputs" is thumb quantization, which is generic:
  `SolidThumbScrollBar` serves `ScrollableTextViewport`, `DiffView`, and
  `RootView`. That half belongs in [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md).

Splitting reduces #122's census-1 residue honestly (the scrollbar citation stops
naming the editor record) and draws the seam at the actual generators. Per the
burden-of-proof rule: name predictions first, and the records must get shorter
or clearer, not merely rearranged. Run
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` to
zero problems, and repoint every citation root-relatively (bare filenames orphan
silently — three did during #122's move).

## Sources

- [report-122-editor-becomes-final-contributor.md](../../completed/122-editor-becomes-final-contributor/report-122-editor-becomes-final-contributor.md) in #122's folder, Hazard 1.
