# Brief 433-2 — the smoke reads the host's live gate registry; isolate it

## What happened

Your fix (1000 rows + 1 when `tasksGateExitCode` is not null) passed in your
runs and failed in the conductor's landing gate. Same step, same timeout:
`the large fixture shows the same compact live projection`.

## The mechanism (conductor-verified)

`refreshGateGlance()` in `scripts/tasks/tasks-status.ts` reads the literal
path `/tmp/fleet-watch-gates`. That file is HOST-GLOBAL fleet state.

- In your runs the newest registered log carried `GATE_EXIT=1`. The glance
  reported a finished gate. Your predicate saw `tasksGateExitCode=1` and
  accepted 1001 rows.
- In the landing gate the newest registered log was the landing gate ITSELF,
  still running. The glance reported a RUNNING gate: a gate row exists, but
  `exitCode` is null. Your predicate then required exactly 1000 rows and saw
  1001. Timeout. The gate that judges this branch breaks this branch's smoke.

The predicate is not the defect. The coupling is. A smoke that reads host
fleet state cannot be deterministic on any machine that runs a fleet.

## The task

1. Make the gate registry path injectable: an environment override such as
   `INVAR_FLEET_GATE_REGISTRY`, falling back to `/tmp/fleet-watch-gates`.
   Keep the override in `tasks-status.ts` where the literal lives now.
2. The tasks-dashboard smoke sets the override to a fixture path in EVERY
   arm, so the host registry can never reach it. Drive these states:
   - no registry file → no gate row, `Gate: no fleet gate registry.`
   - registry naming a log WITHOUT `GATE_EXIT` → running gate row,
     `tasksGateExitCode` null, rows = tasks + 1
   - registry naming a log WITH `GATE_EXIT=0` → finished gate row, rows =
     tasks + 1
   Then restate the row predicate from the driven truth: a gate row exists
   whenever a glance exists, regardless of exit code. Your current
   non-null-exit condition is refuted by the running-gate state above.
3. Audit the rest of the harness for the same coupling: any other smoke or
   status read that touches `/tmp/fleet-watch-gates` or another host-global
   fleet artifact goes through the same override.
4. Both arms for the isolation itself: with the override set and the HOST
   registry populated with a running gate, the smoke result must not change.

## Reproduction

Populate `/tmp/fleet-watch-gates` with a log file that has no `GATE_EXIT`
line, then run `bun scripts/harness/smoke-tasks-dashboard-harness.ts`. It
must fail before your change (running-gate row, null exit) and pass after.
Failure log seen at the gate:
`/tmp/merge-gate-failures.af626c172a819d3f.2845122/behavioral-contracts-felt-invariants-.log`.

## Invariants in scope

- Dashboard motion exists only while observed — name: `tasks-dashboard.invariants`
  plus the `.md` extension, in `src/modules/tasks-dashboard/`. The glance
  refresh cadence must not change.
- Fleet paths derive from the workspace, never the bundle — same contract
  file. The registry override is the same family: fleet locations are
  injectable, never baked literals. Consider whether this record should be
  REFINED to cover the registry path, or a sibling record added: a harness
  run must be isolable from host fleet state. Propose the record.
- Task truth lives in the folders the CLI reads — same contract file. Not
  touched by this change; confirm.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy (runtime defects, invariant
violations, comment drift, distillation possibilities, generator drift,
nonsense). Carry a `## Bycatch` section even when it reads `None observed`.

## End state

A new report file in this folder, newer than this brief's filing stamp,
with the smoke green under BOTH host-registry states (empty, and populated
with a running gate). Do not run `scripts/merge-gate.sh`; the conductor
gates at landing.
