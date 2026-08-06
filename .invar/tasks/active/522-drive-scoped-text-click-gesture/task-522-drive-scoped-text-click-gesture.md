# 522 — drive scoped text click gesture

Priority: architecture-hygiene
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: medium

## In plain words

When two identical glyphs are on screen, the drive layer's clickText always
clicks the first one. A probe that wants the second must hand-build a
rectangle. Give clickText a scope so probes can say which region they mean.

## Evidence (from #514 builder instrument feedback, 2026-08-06)

- `clickText('❯')` chose the editor history glyph before the identical
  status-bar glyph. The builder had to fall back to a last-row screen
  rectangle to address the visible status control.
- The raw snapshot already supports rectangles; only the fluent front door
  lacks the scoping.

## Outline

Add an optional scope to the fluent clickText (rectangle, named band such
as statusRow, or occurrence index). Keep the gesture real: move, hover,
click through cells. Document in drive-pty SKILL.md. Positive control: a
probe that clicks the SECOND of two identical glyphs and proves the right
one activated; negative arm: the unscoped call still resolves first-match.
