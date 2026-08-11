# 546 — diff view labels lie for commits

Priority: user-directed
State: IN-PROGRESS
Engine: claude
Environment: linux
Model: fable-5
Effort: low

## In plain words

Every comparison view titles its sides "Base (HEAD)" and "Current
(working)" even when it is showing a historical commit, where both
labels are wrong. The labels must say what the sides actually are.

## Evidence (from #543 bycatch, 2026-08-11, seen twice while driving)

- DiffView.ts:710/:715 hardcode `Base (HEAD)` / `Current (working)` for
  EVERY comparison. For a commit drill-down the base is `sha^` and the
  current side is the commit revision.

## Outline

The comparison's provenance (working-tree vs commit vs staged) supplies
the labels through one source; drive each comparison kind and assert
its true labels; ui-design copy rules apply.
