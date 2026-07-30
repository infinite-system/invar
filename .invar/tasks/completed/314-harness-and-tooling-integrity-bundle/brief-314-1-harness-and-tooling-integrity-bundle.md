# Brief — BUNDLE: harness & tooling integrity (#314 + #292 + #297)

Three instrument-side tasks, zero product-UI overlap, one gate. Read
all three records first:

- [task-314-harness-drives-must-isolate-workspace-task-config.md](../../active/314-harness-drives-must-isolate-workspace-task-config/task-314-harness-drives-must-isolate-workspace-task-config.md)
  — conductor-diagnosed today with measured both-polarity evidence
  (.invar/tasks.json red/green logs referenced in the record).
- [task-292-drive-action-status-waits-for-paint.md](../../active/292-drive-action-status-waits-for-paint/task-292-drive-action-status-waits-for-paint.md)
  — USER-DIRECTED; #299's gate flake (stale "Parsing Markdown…" frame
  with markdownParsing=false already published) is this class observed
  in the wild; the evidence section quotes it.
- [task-297-dispatch-taskmd-links-break-from-root.md](../../active/297-dispatch-taskmd-links-break-from-root/task-297-dispatch-taskmd-links-break-from-root.md)
  — 4 counted instances of dispatch-planted task-brief link drift.

## Work discipline

- ONE COMMIT PER TASK NUMBER. Full gate through the enforcing hook on
  the final commit minimum; NO SKIP_GATE product commits.
- #314: audit which registered smokes open the REPO as workspace vs a
  fixture root; close the seam per the record; positive control = a
  planted folder-open tasks.json in the repo root must not launch in
  any registered smoke.
- #292: a drive "action complete" wait must be a CONDITION on the
  painted frame, not on published status alone (a-wait-must-be-a-
  condition doctrine); fix the wait seam once in the Drive layer, not
  per-test.
- #297: fix dispatch's injected task-brief link planting so worktree-root copies
  carry root-relative targets + anchors; self-test with a dispatch dry
  run (DRY_RUN=1).
- Every instrument change needs a positive control — a check that can
  only fail toward pass is not a check.

## Invariants in scope

harness records, Drive records, dispatch tooling self-tests, tasks
records (#314's seam), the flake-census records (#214 family — note
any census classes your #292 fix should retire, do not retire them
yourself).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report with per-task sections (evidence + commit hash each),
positive controls quoted red-then-green, final full gate GATE_EXIT=0
through the hook. The conductor gates at landing and completes all
three records.
