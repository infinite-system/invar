# Brief #484 round 1 — the churn experiment

## In plain words

Every test scenario boots and destroys a 236MB app, and that churn is what
stops us from running more test workers at once. Try sharing one app per
test FILE with a verified reset between scenarios, in the five heaviest
files, and MEASURE whether the gate gets faster at higher worker counts.
This is an experiment: the numbers decide, and the rollout call is the
user's.

## Read first

1. [task-484](task-484-per-file-smoke-reuse-experiment.md) — the design IS
   the assignment: five heaviest files, one app per file, graph-fingerprint
   verified reset (mismatch -> recycle, never run dirty), paired
   measurements at 6 then 9 workers.
2. [the drive-pty skill](../../../../.claude/skills/drive-pty/SKILL.md).

## Invariants in scope

- [Harness app homes are complete and isolated](../../../../scripts/harness/harness.invariants.md) — isolation moves from per-scenario to per-file; say what that changes.
- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md) — the reset check is a condition.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, even when None observed.

## Instrument feedback — the standing loop

Report the `## Instrument feedback` section.

## Verification

Per the task file: both reset arms proven, the five files ALL-PASS solo and
under the gate, the paired measurement table (3 runs each: 6 workers
before, 6 after, 9 after). NO merge-gate as a verdict; you MAY run gate
timing passes as the measurement (say so plainly). Commit with SKIP_GATE=1.

## End state

A report file in this folder, number-first, opening with `## In plain
words`, ending with the measurement table and NO rollout — the numbers go
to the user.
