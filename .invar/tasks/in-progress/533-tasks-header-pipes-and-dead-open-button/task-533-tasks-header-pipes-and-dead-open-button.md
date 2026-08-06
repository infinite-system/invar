# 533 — tasks header pipes and dead open button

Priority: user-directed
State: IN-PROGRESS
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## In plain words

Two user-reported regressions, both confirmed by driving. The tasks pane
header paints literal pipe characters that were only separators in the
user's sketch. The file-tree header's up-arrow Open button does nothing
when clicked and shows no tooltip.

## Evidence (conductor drives, 2026-08-06 ~10:05, fresh app on main)

- Tasks pane row: `| LIVE | ACTIVE | DONE | ▷` — pipes painted as cells;
  the #518 smoke asserts the literal string.
- Files header `↥ ⊙`: hover at the ↥ cell shows NO tooltip (declared
  'Open file' in FileTreePaneContent.ts:88); click changes nothing
  visible. Handler runs `commands.run('file.open')` at line 181.
