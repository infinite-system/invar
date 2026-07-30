# Brief #343 round 3 — your gate red is fixed on main; merge and re-gate

Your GATE_EXIT=1 was the plugin-manifest deterministic red. That is fixed
on main (#337 landed: the smoke now walks to settings rows by label, so
the Reveal open file row no longer breaks it).

Do now, in order:
1. git merge main into your branch (resolve trivially if anything
   touches; your diff is tasks-dashboard + two smokes).
2. Commit through the hook — no SKIP_GATE. The gate should now pass; the
   known remaining flaky classes are #214 panel-chrome and #359
   panel-split (retry-passes are recorded flakes, fine; if one hard-reds
   repeatedly, say so and stop).
3. Append the real GATE_EXIT chain and commit hash to your report.
4. Confirm git status clean, then stop.

## Invariants in scope

Unchanged from round 1 (the dashboard idle-quiescence record, already
answered in your report). This round adds no code.

## Bycatch expected

Only anything new the merge or gate surfaces; your report's section
stands.
