# READY — folder-open task contract edits

## Status

READY at commit `27c1a31e` (`Refine folder-open task contracts (#435)`). The worktree is clean. I did not push or land the branch.

## Result

The three confirmed edits are in [tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md):

- `Folder open starts declared tasks` now states once-per-root launch behavior and restored-identifier reuse.
- `File sources report displaced built-ins` now names `TaskNoticePaneContent` and preserves discovery without hiding the first task group.
- `Unsupported tasks fail visibly` now states that issues retain label, severity, and message without a process runtime.

All three records have `Last refined: 2026-08-01`.

## Verification

`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` passed with 1,324 annotations, 263 lattice links, and 0 problems.

## Bycatch

- CONTRACT DRIFT: adjacent fields outside the confirmed clauses still use old terminal terms. `File sources report displaced built-ins` says `terminal list` in `Impossible if true`. `Unsupported tasks fail visibly` says `terminal cells` in `Evidence` and `running terminals` in `Impossible if true`. I left them unchanged because this round confirmed the proposed invariant paragraph and two mechanism edits only.
- RESOLVED: Commit `92abe073` replaces those three residual terminal terms with notice-pane wording.
