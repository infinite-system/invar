# READY — #184 (stable failure-log provenance)

## Outcome

Implemented the real-symlink resolution in `scripts/merge-gate.sh`.

The gate now:

- creates a fresh PID-qualified failure directory without deleting any
  pre-existing PID-qualified evidence;
- preserves a wrong-type stable path by moving it to a unique
  `.displaced.<timestamp>.<pid>` path;
- publishes `/tmp/merge-gate-failures` as an actual symlink to the current
  PID-qualified directory;
- copies serial and pooled failure logs through one shared preservation seam;
- prints both this run's PID-qualified directory and the stable path's resolved
  target whenever the gate reports failures;
- runs an always-on, focused provenance self-test before the rest of the merge
  gate.

I chose the symlink resolution because the existing convenience is useful and
can be made trustworthy without sacrificing old evidence. Preserving the
wrong-type directory is safer than deleting it: the 188 nested links and one
direct stale log observed in the live directory remain recoverable when the
next real gate migrates that path.

The shared live `/tmp/merge-gate-failures` path was not mutated during this
task. The brief forbids running the full gate while #188 (harness wait
regression) is in flight, so all focused verification used an isolated `/tmp`
root. The next real gate invocation will perform the migration.

## Reproduction before the change

Observed on the shared path:

- `stat` reported `type=directory path=/tmp/merge-gate-failures`.
- `readlink /tmp/merge-gate-failures` printed nothing.
- The directory contained 188 child symlinks created by prior `ln -sfn`
  invocations and one direct stale log.
- PID-qualified targets such as `/tmp/merge-gate-failures.3227709` were not
  touched.

This directly reproduced the reported defect: `ln -sfn` treated the existing
directory as a destination directory and nested a new link inside it.

## Focused contract and positive control

The committed test mode runs two fake failing gates through the same
`initialize_failure_log_directory`, `preserve_failure_log`, and failure-report
paths used by the real gate. It is registered as the always-run
`failure-log provenance self-test` gate step.

I planted the original defect by disabling wrong-type displacement. The
self-test went red:

```text
failure-log provenance self-test: FAIL
  artifacts: /tmp/merge-gate-failure-log-provenance.AQPnPm
  first probe exit: 2
  first run: /tmp/merge-gate-failure-log-provenance.AQPnPm/merge-gate-failures
  second probe exit: 2
  second run: /tmp/merge-gate-failure-log-provenance.AQPnPm/merge-gate-failures
positive-control exit: 1
```

The defect plant was removed. The restored self-test exited `0`.

The final retained four-part drive is under
`/tmp/184-failure-log-provenance-final.i786kw`:

1. First fake failure exited `1` and wrote
   `/tmp/184-failure-log-provenance-final.i786kw/merge-gate-failures.13532/failure-log-provenance-probe.log`
   with `first-distinct-content`.
2. Second fake failure exited `1` and wrote
   `/tmp/184-failure-log-provenance-final.i786kw/merge-gate-failures.13547/failure-log-provenance-probe.log`
   with `second-distinct-content`.
3. The stable path is a symbolic link whose literal and resolved target are
   both
   `/tmp/184-failure-log-provenance-final.i786kw/merge-gate-failures.13547`.
4. The first run's log remained readable after the second run. The planted
   stale directory was replaced and preserved at
   `/tmp/184-failure-log-provenance-final.i786kw/merge-gate-failures.displaced.1785230687496003871.13532`;
   its `stale.log` still contains `planted-stale-directory`.

Both fake failure reports printed their PID-qualified path and the stable
path's resolved target.

## Verification

- `bun install` — exit `0`; 155 installs checked, no changes.
- `bash scripts/conventions-gate.sh` — exit `0`.
- `bunx tsc --noEmit` — exit `0`.
- `bun test` — exit `0`; 1,696 passed, 0 failed across 258 files.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit `0`; 924 annotations and 67 lattice links resolved, 0 problems.
- `bun scripts/check-coverage-ratchet.ts` — exit `0`; 319 files inspected,
  no undeclared decrease.
- `bash -n scripts/merge-gate.sh` — exit `0`.
- `git diff --check` and the staged equivalent — exit `0`.

Per the task, I did not run `scripts/merge-gate.sh` as a full verification
gate because main is red on the unrelated #188 (harness wait regression).
The app PTY and small/large fixture drive are not applicable to this
gate-metadata path; the task-prescribed isolated fake-failure drive exercised
the real publication and preservation seam instead. Nothing under
`scripts/harness/` was touched.

## Invariant review

The change strengthens `Completion is proven not declared`: the diagnostic
artifact used to investigate a red gate now proves its run identity, and the
enforcement point carries the corresponding annotation. No recorded
invariant was violated or stressed.

#90 (harness diagnostic provenance guard) shares the same higher-level rule
but not the same implementation generator. The gate publishes immutable
per-run directories through a replaceable symlink; the append-only
`artifacts/tui.log` channel needs a session/time provenance guard or
start-of-driver truncation inside the harness. I scoped this task to the gate
half as required.

Existing references to `/tmp/merge-gate-failures` remain correct, so no
documentation reference needed removal or rewriting.

## Bycatch

None observed. There are therefore no bycatch findings requiring merge-base
verification.

## Commit and worktree

- Commit: `361f891329496b9b383569a5febea37d10b045ed`
  (`Fix merge-gate failure-log provenance`)
- Worktree status after commit: clean.
- No push, merge, tag, branch deletion, or full merge gate was performed.
