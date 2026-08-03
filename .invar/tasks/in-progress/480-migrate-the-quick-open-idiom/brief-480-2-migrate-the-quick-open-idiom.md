# Brief #480 round 1 — migrate the Quick Open idiom

## In plain words

The census found about 125 waits that are already true when issued, so they
return stale frames and flake under load. The graph now reaches the model
facts those waits should observe. Convert them, worst first.

## Read first

1. [task-480](task-480-migrate-the-quick-open-idiom.md)
2. [the census](../../completed/470-harness-wait-defect-census/census-470-harness-wait-defect-census.md) — the work list, per-site evidence
3. [the 471 report's migratable table](../../completed/471-graph-reaches-the-whole-app/report-471-graph-reaches-the-whole-app.md) — live paths per census fact
4. [the drive-pty skill](../../../../.claude/skills/drive-pty/SKILL.md) — the wait discipline

## Order of attack

1. The five Quick Open idiom files ONLY (the task file names them): the
   defect is one shape (a filename wait the tree already satisfies), the fix
   is one shape (wait on the quickOpen model before Enter). Convert all six
   sites, run each touched smoke, both arms where a control changes.
2. Do NOT touch shared machinery (tui-harness.sh, HarnessSmoke,
   PtyTestDriver, Drive.ts) — reserved for a separate round.
3. DECLARE every wait-count decrease in [project.coverage-deltas.md](../../../../project.coverage-deltas.md).
4. Sites the census marks "no model path" that #471 did NOT unlock: fix the
   pre-satisfaction on the screen (wait on what CHANGES), do not invent paths.

Run each touched smoke after converting it. If the full sweep is too large
for one round, STOP CLEANLY at a file boundary and report exactly which
files are done and which remain — a partial migration honestly stated beats
a rushed total.

## Invariants in scope

- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md)
- [Every wait names itself](../../../../scripts/harness/harness.invariants.md)
- [Async-published state is always awaited](../../../../scripts/harness/harness.invariants.md)
- [The composition graph reaches every installed contributor](../../../../src/modules/system/system.invariants.md) — new record, the paths you migrate onto
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, even when None observed.

## PTY usability — still tracked

Report the `## PTY usability` section: easy, confusing, missing.

## Verification

Every touched smoke run green; `bun test` FULL; `bunx tsc --noEmit`;
`bash scripts/conventions-gate.sh`; checker `--all` and `--refs`.
Do NOT run scripts/merge-gate.sh. Commit with SKIP_GATE=1.

## End state

A report file in this folder, number-first, opening with `## In plain words`,
with the files-done/files-remaining table, invariant verdicts, bycatch, and
PTY usability.
