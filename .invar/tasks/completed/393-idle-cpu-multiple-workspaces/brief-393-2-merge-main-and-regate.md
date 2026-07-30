# Brief #393 round 2 — merge main forward and re-gate the combined tree

Main landed the theme-glyph OSC 66 emulator fix (task 386) and the panel
tab-bar redesign (task 346) after your branch base. Overlapping files:
the tasks-dashboard smoke (main changed the large-fixture wait AND added
exact glyph-cell arms), the workspace-tabs smoke, and Bootstrap. Your
READY-to-DEGRADED wait repair may collide with main's version of the same
wait — reconcile so BOTH intents hold (glyph arms + scroll-transition
rest + your held-row wait), and keep your cadence-timer projection in
Bootstrap alongside main's changes.

End state: main merged in, resolutions named per file, full gate green on
the combined tree (one-worker is acceptable if you name it), GATE_EXIT
read from the hook, new report with the merge hash. Worktree clean; no
push, no land.

## Invariants in scope

Same set as round 1; no new records expected from the merge — say so if
one appears.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; carry the section even when it reads None
observed. Your convention-drift item is filed as task 401 — do not fix it
here.
