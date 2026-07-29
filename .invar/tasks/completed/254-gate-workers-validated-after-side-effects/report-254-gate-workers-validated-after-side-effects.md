# READY - gate workers validated before side effects (#254)

Status: READY

Commit: `d45eaee37c3be06ed2569d2be3c20dbd72cfd1f9`

## Outcome

`scripts/merge-gate.sh` now validates `INVAR_GATE_WORKERS` during entry preflight.

The guard runs before PID publication, orphan reaping, and failure-log publication.
Its accepted values, refusal text, and exit code did not change.

The gate header now states the worker-count preflight fact.
It also states that an invalid count exits 2.

## Reproduction

I created the detached scratch worktree `/tmp/invar-254-before.5Pr9oR` at
`7bff1317`.

I redirected only the scratch gate's stable failure-log path into that tree.
I populated its `node_modules` with links to this worktree's installed dependencies.

I planted a harmless `sleep` process with this command-line shape:

```text
bun src/main.ts /tmp/tui-254-before-orphan
```

Its parent was PID 1, so it matched the gate's orphan rule.
Before the fix, `INVAR_GATE_WORKERS=banana` produced this result:

```text
BEFORE_EXIT_CODE=2
PID_FILE_AFTER=absent
ORPHAN_AFTER=absent
FAILURE_LOG_AFTER=present
merge-gate: reaped 1 orphaned app instance(s) before start (inotify hygiene)
merge-gate: starting with 0 test app instance(s) live
merge-gate: INVAR_GATE_WORKERS must be a positive integer (received 'banana')
```

The exit trap removed the PID file before the after-run check.
Source inspection confirmed that PID publication occurred before the refusal.

## Verification

I did not run the full merge gate.

`bash -n scripts/merge-gate.sh` exited 0:

```text
BASH_N_EXIT_CODE=0
```

`git diff --check` exited 0:

```text
DIFF_CHECK_EXIT_CODE=0
```

The final invalid arm tested three rejected forms.
Each run used a distinct, absent scratch failure-log path:

```text
INVALID_VALUE=banana EXIT_CODE=2 PID_FILE=absent REAP_OUTPUT=absent FAILURE_LOG=absent
merge-gate: INVAR_GATE_WORKERS must be a positive integer (received 'banana')
INVALID_VALUE=0 EXIT_CODE=2 PID_FILE=absent REAP_OUTPUT=absent FAILURE_LOG=absent
merge-gate: INVAR_GATE_WORKERS must be a positive integer (received '0')
INVALID_VALUE=-3 EXIT_CODE=2 PID_FILE=absent REAP_OUTPUT=absent FAILURE_LOG=absent
merge-gate: INVAR_GATE_WORKERS must be a positive integer (received '-3')
INVALID_ORPHAN_AFTER=live
```

The valid arm used `INVAR_GATE_WORKERS=2`.
It passed preflight without output and reached the first normal gate step.
The side-effect probes supplied the positive controls for the absence checks:

```text
VALID_VALUE=2 OBSERVED_NEXT_STEP=1 PID_FILE_DURING=present ORPHAN_AFTER=absent FAILURE_LOG_DURING=present
VALID_STOP_EXIT_CODE=143
merge-gate: reaped 1 orphaned app instance(s) before start (inotify hygiene)
merge-gate: starting with 1 test app instance(s) live
== merge-gate: failure-log provenance self-test ==
Terminated
```

Exit 143 is the deliberate stop at the first normal step.
It is not a gate verdict.

The direct command `bunx prettier --check scripts/merge-gate.sh` exited 2.
Prettier has no parser for an explicitly selected shell file.
The repository's prescribed whole-tree check passed:

```text
Checking formatting...
All matched files use Prettier code style!
PRETTIER_WHOLE_TREE_EXIT_CODE=0
```

The invariant checker exited 0:

```text
1027 annotation(s) resolved, 217 lattice link(s) resolved, 0 problem(s)
INVARIANTS_EXIT_CODE=0
```

## Bycatch

None observed.
I inspected the gate entry neighborhood and found no sibling guard after the setup side effects.

## Handoff

The branch is `fleet/254-gate-workers-validated-after-side-effects`.

The worktree is clean after commit.
I removed the detached scratch worktree after verification.

COMPACTION: none.

conventions @ `2e6c207555c2aeecd49d460e5d8ca3ed8ba030af`
