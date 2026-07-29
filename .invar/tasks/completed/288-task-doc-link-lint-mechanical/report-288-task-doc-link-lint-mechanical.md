# READY — task document links are mechanical

State: READY. Branch `fleet/288-task-doc-link-lint-mechanical`.
Commit `002dcf6116b9ce2060215c9123e472df62e9fc39`. The worktree is clean.

## Outcome

`scripts/tasks/lint-task-links.ts` now checks one task record.
It rejects dead relative Markdown links and bare document references.
Each resolvable bare reference includes the relative Markdown link to use.
`--fix` changes only references with one safe target.
`--base-directory` checks an outside draft from its stored task-folder location.

`scripts/fleet/dispatch.sh` and `scripts/fleet/round-brief.sh` now refuse a
failing brief before either script writes task state.
`scripts/fleet/land.sh` reports the same findings as warnings and continues.
Legacy records therefore do not block a landing.

The convention now lives in [AGENTS.md](../../../../AGENTS.md) and the
[manage-tasks skill](../../../../.claude/skills/manage-tasks/SKILL.md).
Both records give the exact report-lint command.

This work supplies mechanical links for the walkable path built by
[#276 (task Markdown links are walkable)](../../completed/276-task-md-links-walkable/task-276-task-md-links-walkable.md).

## Linter controls

Command:

```text
bun scripts/tasks/lint-task-links.ts --self-test
```

The dead-link, bare-reference, and silent clean runs were:

```text
CONTROL dead-link exit=1
/tmp/task-link-lint-self-test-1u41qd/scratch/brief-288-dead.md:1: dead relative Markdown link 'report-288-missing.md'
PASS  a planted dead relative Markdown link exits 1
CONTROL bare-reference exit=1
/tmp/task-link-lint-self-test-1u41qd/scratch/brief-288-bare.md:1: bare document reference 'report-288-control.md'; use [report-288-control.md](report-288-control.md)
PASS  a planted bare document reference exits 1
CONTROL clean exit=0 stdout=0 stderr=0
PASS  a clean linked document reference is silent
PASS  --fix rewrites one unambiguous bare reference
task-link-lint self-test: ALL-PASS
SELF_TEST_EXIT=0
```

The clean control had zero output bytes from the linter.
The self-test printed only the control record around that silent run.

## Guard drives

Dispatch refused the known-bad brief before its dry-run boundary:

```text
dispatch: REFUSING — the brief has dead or bare document references.
DISPATCH_EXIT=2
```

Round briefing refused the same brief before filing:

```text
round-brief: REFUSING — the brief has dead or bare document references.
ROUND_BRIEF_EXIT=2
```

An isolated shared clone drove the landing warning.
A planted Bycatch item stopped the control after the warning and before merge:

```text
.invar/tasks/in-progress/999-land-link-warning-control/report-999-land-link-warning-control.md:3: dead relative Markdown link 'report-999-missing.md'
land: WARNING — the report has dead or bare document references.
  Landing continues because legacy task records can contain old references.
land: the report carries BYCATCH. Convert each item to a task, then re-run with BYCATCH_TRIAGED=1.
LAND_EXIT=3
```

The isolated clone was moved to trash after the control.

## Verification

The commit hook ran the full merge gate once.
It reported `merge-gate: ALL-PASS` and `GATE_EXIT=0`.
The gate included these green steps:

- TypeScript and conventions checks.
- Prettier format checks.
- Invariant structure and reference checks.
- Coverage and reactive-observation checks.
- `bun test`.
- All registered PTY and behavioral contracts.
- Input-byte first-frame ordering.

The gate skipped only the documented opt-in tmux audit tier.
The required report-link lint printed nothing and exited 0.

## Follow-up

Do not retro-sweep the existing task folders in this change.
File a follow-up named “sweep legacy task-record document links.”
Run the new linter with `--fix`, then resolve ambiguous and dead references by hand.

## Bycatch

- The `panel-chrome` PTY harness timed out once in the parallel gate pool.
  Its built-in quiet retry passed. The failure did not reproduce on the second run.
- Contract-layer gap: `scripts/fleet/` has no lifecycle invariant contract.
  The manage-tasks skill and shell comments hold its guard rules.
  The tasks-dashboard contract governs the folder consumer, not dispatch, steering, or landing.
