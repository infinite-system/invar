# Brief #485 round 1 — measure the reclaimable boot churn

## In plain words

Count every app start in every smoke, and for each one answer: does this
test NEED its own fresh app, or could it share? Add up the shareable ones.
No code changes to the smokes — the answer is a table.

## Read first

1. [task-485](task-485-measure-the-reclaimable-boot-churn.md) — the
   classification rules ARE the assignment.
2. [the #484 report](../../completed/484-per-file-smoke-reuse-experiment/report-484-per-file-smoke-reuse-experiment.md)
   and its two instruments beside it.
3. [the drive-pty skill](../../../../.claude/skills/drive-pty/SKILL.md).

## Invariants in scope

- [Harness app homes are complete and isolated](../../../../scripts/harness/harness.invariants.md) — isolation requirements are what make a boot SEMANTIC; cite this record in reasons.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, even when None observed.

## Instrument feedback — the standing loop

Report the `## Instrument feedback` section.

## Verification

Per the task file. Run smokes SOLO and sequentially (this is a counting
pass, not a contention test); if the full sweep is too long for one round,
stop at a file boundary with the table so far and exact coverage.

## End state

A report file in this folder, number-first, opening with `## In plain
words`, ending with the totals table.
