# 186 — every edit that lengthens the widest line rescans the whole document

State: DONE
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

**THE REAL 500k BLOCKER.** Every edit that lengthened the widest line rescanned the entire document to
find the new maximum — **65–87 ms at 500k lines**, on a keystroke.

### Why the aggregate could not simply be dropped

An AST census named **four consumers that all need the TRUE maximum, not an upper bound**:

- `Workspace.tickScrollAnimations` and `EditorPane.scrollColumns` — the horizontal momentum clamp;
- `ScrollbarSync` — the bar's `scrollSize`, and therefore the thumb proportion;
- `DiffView` — exact pane content width.

A stale bound would leave scrollable blank columns and a lying thumb. So the exact aggregate was
preserved deliberately; what changed is how it is maintained.

### The contract left behind

A permanent **counting** control in `TextDocument.test.ts:138–156`: it counts width evaluations and
asserts **exactly 1** for growing the champion and **exactly 500** for the case that must rescan. A
count, not a millisecond threshold — a faster machine beats a threshold; nothing beats a count.

### The user's observation that localised the remaining cost

> *"the huge.ts without any folds for editing is now also slower"* … *"slow even not on the widest
> line"*

**That is the most useful line in the whole report.** The widest-line path is exactly what this task
fixed, and it only engages when the champion changes — so the observation RULES IT OUT and localises the
remaining edit cost to `syncWrapIndex` allocating four arrays per edit. That became #196.

## Sources

- `brief-186-1-max-width-rescan-at-500k.md`
- `report-186-max-width-rescan-at-500k.md`
- Detail above additionally recovered from the session transcript (`faf7e858-…jsonl`).
